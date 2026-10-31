import {
  AI_DISCLOSURE,
  DEPENDENCE_REPLY,
  ONLY_CONNECTION_REPLY,
  REVEAL_REFUSAL,
  enforceAiStatus,
  isDependenceInvite,
  isHumanQuestion,
  isOnlyConnectionStatement,
  isRevealRequest,
  stripLeakedContext,
  stripPermanencePromises,
} from "../boundary/rules";
import { enforceMemoryDisclosure } from "../disclosure/enforce";
import { LIMITS } from "../limits";
import { LEAK_MARKERS, generateWithTimeout, type LlmAdapter } from "../llm/adapter";
import { extractMemoryCandidates } from "../memory/capture";
import { MemoryError, type Memory, type MemoryRepository } from "../memory/store";
import { checkReply, checkUserMessage, type SafetyCategory } from "../safety/classifier";
import type { EmergencyContactRepository } from "../safety/contact";
import { buildCrisisView, type CrisisView, type SafetyLogger } from "../safety/crisis";
import { claimWeeklySuggestion, formatSuggestion, type SocialActionRepository } from "../scheduler/weekly";
import type { ChatSession, MessageRepository, SessionRepository } from "./repositories";

export interface ConversationDeps {
  sessions: SessionRepository;
  messages: MessageRepository;
  memories: MemoryRepository;
  socialActions: SocialActionRepository;
  contacts: EmergencyContactRepository;
  llm: LlmAdapter;
  logSafety: SafetyLogger;
  now?: () => Date;
}

export type ReplyRoute = "normal" | "safety" | "only_connection" | "dependence" | "reveal_refused";

export interface RespondResult {
  reply_text: string;
  memories_used: string[];
  safety_triggered: boolean;
  route: ReplyRoute;
  crisis: CrisisView | null;
  social_action: string | null;
  memories_created: string[];
}

export class ConversationError extends Error {
  constructor(
    readonly code: "SESSION_NOT_FOUND" | "INVALID_MESSAGE" | "CONTEXT_CHANGED" | "TURN_IN_PROGRESS",
    message: string,
  ) {
    super(message);
  }
}

const HIDDEN_CRISIS_MESSAGE = "[Message hidden: safety resources were shown]";

export function createConversationService(deps: ConversationDeps) {
  const now = deps.now ?? (() => new Date());
  // Prevent overlapping turns in this service instance. Production repositories
  // still need the durable turn claims described in docs/architecture.md.
  const activeSessions = new Set<string>();

  async function assertCurrentContext(session: ChatSession, revision: number, active: readonly Memory[]) {
    const [currentSession, currentRevision] = await Promise.all([
      deps.sessions.get(session.id),
      deps.memories.contextRevision(session.userId),
    ]);
    if (!currentSession) throw new ConversationError("SESSION_NOT_FOUND", "Session not found.");
    const checkedAt = now().getTime();
    if (
      currentSession.endedBySafety ||
      currentSession.tone !== session.tone ||
      currentRevision !== revision ||
      active.some((memory) => memory.expiresAt && memory.expiresAt.getTime() <= checkedAt)
    ) {
      throw new ConversationError("CONTEXT_CHANGED", "Your conversation context changed. Please try again.");
    }
  }

  async function crisisTurn(
    session: ChatSession,
    stage: "input" | "output",
    category: SafetyCategory | null,
  ): Promise<RespondResult> {
    const at = now();
    deps.logSafety({ event: "safety_triggered", at: at.toISOString(), sessionId: session.id, stage, category });
    const crisis = buildCrisisView(await deps.contacts.getForCrisisView(session.userId));
    if (!(await deps.sessions.get(session.id))) throw new ConversationError("SESSION_NOT_FOUND", "Session not found.");
    // The crisis message text is never persisted and never becomes a memory.
    await deps.messages.append({
      sessionId: session.id,
      userId: session.userId,
      role: "user",
      text: HIDDEN_CRISIS_MESSAGE,
      createdAt: at,
      safety: true,
    });
    await deps.messages.append({
      sessionId: session.id,
      userId: session.userId,
      role: "assistant",
      text: crisis.text,
      createdAt: at,
      safety: true,
    });
    await deps.sessions.update({ ...session, endedBySafety: true });
    return {
      reply_text: crisis.text,
      memories_used: [],
      safety_triggered: true,
      route: "safety",
      crisis,
      social_action: null,
      memories_created: [],
    };
  }

  /** Turns the model may see: this session, after the latest memory change or expiry. */
  async function contextHistory(session: ChatSession, memories: Memory[], at: Date) {
    const changedAt = await deps.memories.lastUserChangeAt(session.userId);
    const expiredAt = memories.map((memory) => memory.expiresAt?.getTime() ?? 0).filter((time) => time <= at.getTime());
    const cutoff = Math.max(changedAt?.getTime() ?? 0, ...expiredAt, 0);
    return (await deps.messages.listForSession(session.id))
      .filter((message) => !message.safety && message.createdAt.getTime() > cutoff)
      .slice(-LIMITS.historyTurns)
      .map((message) => ({ role: message.role, content: message.text }));
  }

  async function respondTurn(sessionId: string, userMessage: string): Promise<RespondResult> {
    const session = await deps.sessions.get(sessionId);
    if (!session) throw new ConversationError("SESSION_NOT_FOUND", "Session not found.");
    const text = userMessage.trim();
    if (!text || text.length > LIMITS.maxMessageLength || text.includes("\u0000") || !text.isWellFormed()) {
      throw new ConversationError("INVALID_MESSAGE", `Messages must be 1-${LIMITS.maxMessageLength} characters.`);
    }

    // Safety pre-check runs before anything else, including persistence.
    const inputCheck = checkUserMessage(text);
    if (inputCheck.triggered) return crisisTurn(session, "input", inputCheck.category);
    if (session.endedBySafety) return crisisTurn(session, "input", null);

    const at = now();
    // Read before loading either memories or history so even an edit-and-revert
    // during context loading/generation invalidates this turn.
    const revision = await deps.memories.contextRevision(session.userId);
    const allMemories = await deps.memories.list(session.userId);
    const active = allMemories.filter((memory) => !memory.expiresAt || memory.expiresAt.getTime() > at.getTime());

    const askedIfHuman = isHumanQuestion(text);
    let route: ReplyRoute = "normal";
    let reply: string;
    let memoriesUsed: string[] = [];
    if (isRevealRequest(text)) {
      route = "reveal_refused";
      reply = REVEAL_REFUSAL;
    } else if (isOnlyConnectionStatement(text)) {
      route = "only_connection";
      reply = ONLY_CONNECTION_REPLY;
    } else if (isDependenceInvite(text)) {
      route = "dependence";
      reply = DEPENDENCE_REPLY;
    } else {
      const generated = await generateWithTimeout(deps.llm, {
        history: await contextHistory(session, allMemories, at),
        userMessage: text,
        memories: active.map(({ id, text: memoryText }) => ({ id, text: memoryText })),
        tone: session.tone,
      });
      // Reject changes detected after generation, before scheduling/writing.
      // Persistent repositories still need an atomic commit with version checks.
      await assertCurrentContext(session, revision, active);
      const outputCheck = checkReply(generated.text);
      if (outputCheck.triggered) return crisisTurn(session, "output", outputCheck.category);
      reply = stripLeakedContext(generated.text, LEAK_MARKERS);
      reply = stripPermanencePromises(reply);
      reply = enforceAiStatus(reply, askedIfHuman);
      const disclosed = enforceMemoryDisclosure(reply, generated.memoriesUsed, active);
      reply = disclosed.replyText;
      memoriesUsed = disclosed.memoriesUsed;
    }
    if (route !== "normal") {
      await assertCurrentContext(session, revision, active);
      reply = enforceAiStatus(reply, askedIfHuman);
    }

    let socialAction: string | null = null;
    if (route === "normal") {
      const suggestion = await claimWeeklySuggestion(
        deps.socialActions,
        session.userId,
        at,
        active.map((memory) => memory.text),
      );
      if (suggestion) {
        socialAction = suggestion.action;
        reply = `${reply}\n\n${formatSuggestion(suggestion.action)}`;
      }
    }

    if (!session.disclosed) {
      reply = `${AI_DISCLOSURE}\n\n${reply}`;
      await deps.sessions.update({ ...session, disclosed: true });
    }

    await deps.messages.append({ sessionId, userId: session.userId, role: "user", text, createdAt: at, safety: false });
    await deps.messages.append({
      sessionId,
      userId: session.userId,
      role: "assistant",
      text: reply,
      createdAt: at,
      safety: false,
    });

    const created: string[] = [];
    const existing = new Set(allMemories.map((memory) => memory.text.toLowerCase()));
    for (const candidate of extractMemoryCandidates(text)) {
      if (existing.has(candidate.toLowerCase())) continue;
      try {
        created.push((await deps.memories.create(session.userId, candidate, at)).id);
      } catch (error) {
        if (!(error instanceof MemoryError && error.code === "LIMIT_REACHED")) throw error;
      }
    }

    return {
      reply_text: reply,
      memories_used: memoriesUsed,
      safety_triggered: false,
      route,
      crisis: null,
      social_action: socialAction,
      memories_created: created,
    };
  }

  async function respond(sessionId: string, userMessage: string): Promise<RespondResult> {
    if (activeSessions.has(sessionId)) {
      throw new ConversationError("TURN_IN_PROGRESS", "A reply is already being generated for this conversation.");
    }
    activeSessions.add(sessionId);
    try {
      return await respondTurn(sessionId, userMessage);
    } finally {
      activeSessions.delete(sessionId);
    }
  }

  return { respond };
}

/** Deletes all of a user's messages, sessions, memories, social actions, and contact. */
export async function deleteAccountData(
  deps: Pick<ConversationDeps, "sessions" | "messages" | "memories" | "socialActions" | "contacts">,
  userId: string,
) {
  await Promise.all([
    deps.messages.deleteAllForUser(userId),
    deps.memories.deleteAllForUser(userId),
    deps.socialActions.deleteAllForUser(userId),
    deps.contacts.deleteAllForUser(userId),
  ]);
  await deps.sessions.deleteAllForUser(userId);
}
