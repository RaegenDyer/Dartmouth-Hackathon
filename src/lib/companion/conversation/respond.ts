import {
  AI_DISCLOSURE,
  DEPENDENCE_REPLY,
  OPENING_MESSAGE,
  ONLY_CONNECTION_REPLY,
  REVEAL_REFUSAL,
  adviceCategory,
  adviceReply,
  enforceAiStatus,
  isDependenceInvite,
  isHumanQuestion,
  isOnlyConnectionStatement,
  isRevealRequest,
  stripBoundaryClaims,
  stripLeakedContext,
  stripPermanencePromises,
} from "../boundary/rules";
import { enforceInteractionStyle } from "../boundary/style";
import { contentWords, enforceMemoryDisclosure, replyReferencesMemory } from "../disclosure/enforce";
import { DEFAULT_POLICY, LIMITS, type GuardrailPolicy } from "../limits";
import { LEAK_MARKERS, generateWithTimeout, type LlmAdapter } from "../llm/adapter";
import type { Logger } from "../log";
import { acceptableModelSuggestion, extractMemoryCandidates } from "../memory/capture";
import type { MemoryProposalRepository } from "../memory/proposals";
import { MemoryError, type Memory, type MemoryRepository } from "../memory/store";
import { patternClassifier, runSafetyCheck, type SafetyClassifier } from "../safety/classifier";
import type { EmergencyContactRepository } from "../safety/contact";
import { buildCrisisView, type CrisisView } from "../safety/crisis";
import { claimWeeklySuggestion, formatSuggestion, type SocialActionRepository } from "../scheduler/weekly";
import type { ChatSession, MessageRepository, SessionRepository } from "./repositories";

export interface ConversationDeps {
  sessions: SessionRepository;
  messages: MessageRepository;
  memories: MemoryRepository;
  proposals: MemoryProposalRepository;
  socialActions: SocialActionRepository;
  contacts: EmergencyContactRepository;
  llm: LlmAdapter;
  /** All logging goes through the scrubbed Logger (DP-3). */
  log: Logger;
  /** Defaults to the deterministic pattern classifier. */
  safety?: SafetyClassifier;
  policy?: GuardrailPolicy;
  /** DB-5 per-user redirect counts; pass a shared map to keep counts across service instances. */
  redirectCounts?: Map<string, number>;
  /** Conversations with a turn in progress; pass a shared set across service instances. */
  activeSessions?: Set<string>;
  now?: () => Date;
}

export type ReplyRoute =
  "normal" | "safety" | "session_cap" | "only_connection" | "dependence" | "advice_refused" | "reveal_refused";

export interface RespondResult {
  reply_text: string;
  memories_used: string[];
  safety_triggered: boolean;
  route: ReplyRoute;
  crisis: CrisisView | null;
  /** True when this session accepts no further normal turns (safety or session cap). */
  conversation_ended: boolean;
  social_action: string | null;
  /** Suggested memories awaiting the user's review. Nothing is saved until approved. */
  memory_proposals: { id: string; text: string }[];
}

export interface RespondOptions {
  /** ISO country code from the hosting platform when known (CS-5). */
  country?: string | null;
  /** Client turn ID, stored with both messages of the turn. */
  requestId?: string;
}

const TITLE_LENGTH = 60;

function titleFrom(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > TITLE_LENGTH ? `${line.slice(0, TITLE_LENGTH - 1).trimEnd()}…` : line;
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

// DB-3. No question, so it never conflicts with IS-1/IS-2.
export const SESSION_CAP_REPLY =
  "We've been talking for a while, so I'm going to end this session here. This could be a good moment for a break, and maybe to message or see one person you know today. You can start a new conversation later.";

export function createConversationService(deps: ConversationDeps) {
  const now = deps.now ?? (() => new Date());
  const policy = deps.policy ?? DEFAULT_POLICY;
  const safety = deps.safety ?? patternClassifier;
  /** DB-5: redirect counts per user, logged without text. */
  const redirectCounts = deps.redirectCounts ?? new Map<string, number>();
  // Prevent overlapping turns per conversation. Persistent repositories still
  // need the durable turn claims described in docs/architecture.md.
  const activeSessions = deps.activeSessions ?? new Set<string>();

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

  async function crisisTurn(session: ChatSession, country: string | null, requestId?: string): Promise<RespondResult> {
    const at = now();
    // CS-7: timestamp and session ID only.
    deps.log({ event: "safety_triggered", at: at.toISOString(), sessionId: session.id });
    const crisis = buildCrisisView(await deps.contacts.getForCrisisView(session.userId), country);
    if (!(await deps.sessions.get(session.id))) throw new ConversationError("SESSION_NOT_FOUND", "Session not found.");
    // CS-6: the crisis message text is never persisted and never becomes a memory.
    await deps.messages.append({
      sessionId: session.id,
      userId: session.userId,
      role: "user",
      text: HIDDEN_CRISIS_MESSAGE,
      createdAt: at,
      safety: true,
      requestId,
    });
    await deps.messages.append({
      sessionId: session.id,
      userId: session.userId,
      role: "assistant",
      text: crisis.text,
      createdAt: at,
      safety: true,
      requestId,
    });
    await deps.sessions.update({ ...session, endedBySafety: true });
    return {
      reply_text: crisis.text,
      memories_used: [],
      safety_triggered: true,
      route: "safety",
      crisis,
      conversation_ended: true,
      social_action: null,
      memory_proposals: [],
    };
  }

  async function sessionCapTurn(session: ChatSession, text: string, requestId?: string): Promise<RespondResult> {
    const at = now();
    if (!session.endedBySessionCap) {
      deps.log({ event: "session_cap_reached", at: at.toISOString(), sessionId: session.id });
      await deps.sessions.update({ ...session, endedBySessionCap: true });
    }
    await deps.messages.append({
      sessionId: session.id,
      userId: session.userId,
      role: "user",
      text,
      createdAt: at,
      safety: false,
      requestId,
    });
    await deps.messages.append({
      sessionId: session.id,
      userId: session.userId,
      role: "assistant",
      text: SESSION_CAP_REPLY,
      createdAt: at,
      safety: false,
      requestId,
    });
    return {
      reply_text: SESSION_CAP_REPLY,
      memories_used: [],
      safety_triggered: false,
      route: "session_cap",
      crisis: null,
      conversation_ended: true,
      social_action: null,
      memory_proposals: [],
    };
  }

  function logRedirect(session: ChatSession, route: ReplyRoute, at: Date) {
    const count = (redirectCounts.get(session.userId) ?? 0) + 1;
    redirectCounts.set(session.userId, count);
    deps.log({ event: "boundary_redirect", at: at.toISOString(), userId: session.userId, route, countForUser: count });
  }

  /** Turns the model may see: this session, after the latest memory change or expiry. */
  async function contextHistory(session: ChatSession, memories: Memory[], at: Date) {
    const changedAt = await deps.memories.lastUserChangeAt(session.userId);
    const expiredAt = memories.map((memory) => memory.expiresAt?.getTime() ?? 0).filter((time) => time <= at.getTime());
    const cutoff = Math.max(changedAt?.getTime() ?? 0, ...expiredAt, 0);
    const turns = (await deps.messages.listForSession(session.id))
      .filter((message) => !message.safety && message.createdAt.getTime() > cutoff)
      .slice(-LIMITS.historyTurns);
    // The model's context starts with a user turn; the fixed opening message
    // (and any other leading assistant text) is display-only.
    while (turns[0]?.role === "assistant") turns.shift();
    return turns.map((message) => ({ role: message.role, content: message.text }));
  }

  /**
   * IS-5: the model only sees memories related to what the user just said
   * (no unprompted check-ins), and each memory at most once per session.
   */
  function eligibleMemories(active: Memory[], text: string, session: ChatSession) {
    const words = new Set(contentWords(text));
    const referenced = new Set(session.memoriesReferenced);
    return active.filter(
      (memory) => !referenced.has(memory.id) && contentWords(memory.text).some((word) => words.has(word)),
    );
  }

  async function respondTurn(sessionId: string, userMessage: string, options: RespondOptions): Promise<RespondResult> {
    const country = options.country ?? null;
    const session = await deps.sessions.get(sessionId);
    if (!session) throw new ConversationError("SESSION_NOT_FOUND", "Session not found.");
    const text = userMessage.trim();
    if (!text || text.length > LIMITS.maxMessageLength || text.includes("\u0000") || !text.isWellFormed()) {
      throw new ConversationError("INVALID_MESSAGE", `Messages must be 1-${LIMITS.maxMessageLength} characters.`);
    }

    // CS-1/CS-2/CS-4: the safety pre-check runs first on every message, including
    // the first of each session, before persistence. Errors and timeouts fail closed.
    const inputCheck = await runSafetyCheck(() => safety.checkUserMessage(text), LIMITS.safetyCheckTimeoutMs);
    if (inputCheck.failed) deps.log({ event: "safety_check_failed", at: now().toISOString(), sessionId: session.id });
    if (inputCheck.triggered || session.endedBySafety) return crisisTurn(session, country, options.requestId);

    // DB-3: session length cap.
    if (session.endedBySessionCap || now().getTime() - session.startedAt.getTime() >= policy.sessionCapMs) {
      return sessionCapTurn(session, text, options.requestId);
    }

    const at = now();
    // Read before loading either memories or history so even an edit-and-revert
    // during context loading/generation invalidates this turn.
    const revision = await deps.memories.contextRevision(session.userId);
    const allMemories = await deps.memories.list(session.userId);
    const active = allMemories.filter((memory) => !memory.expiresAt || memory.expiresAt.getTime() > at.getTime());
    const priorReplies = (await deps.messages.listForSession(session.id))
      .filter((message) => message.role === "assistant" && !message.safety)
      .map((message) => message.text);

    const askedIfHuman = isHumanQuestion(text);
    const advice = adviceCategory(text);
    let route: ReplyRoute = "normal";
    let reply: string;
    let memoriesUsed: string[] = [];
    let modelSuggestions: string[] = [];
    if (isRevealRequest(text)) {
      route = "reveal_refused";
      reply = REVEAL_REFUSAL;
    } else if (isOnlyConnectionStatement(text)) {
      route = "only_connection";
      reply = ONLY_CONNECTION_REPLY;
      logRedirect(session, route, at);
    } else if (isDependenceInvite(text)) {
      route = "dependence";
      reply = DEPENDENCE_REPLY;
      logRedirect(session, route, at);
    } else if (advice) {
      route = "advice_refused";
      reply = adviceReply(advice);
    } else {
      const eligible = eligibleMemories(active, text, session);
      const generated = await generateWithTimeout(deps.llm, {
        history: await contextHistory(session, allMemories, at),
        userMessage: text,
        memories: eligible.map(({ id, text: memoryText }) => ({ id, text: memoryText })),
        tone: session.tone,
      });
      // Reject context changes detected after generation, before scheduling/writing.
      await assertCurrentContext(session, revision, active);
      // CS-1/CS-2: post-check on the model reply, failing closed.
      const outputCheck = await runSafetyCheck(() => safety.checkReply(generated.text), LIMITS.safetyCheckTimeoutMs);
      if (outputCheck.failed)
        deps.log({ event: "safety_check_failed", at: now().toISOString(), sessionId: session.id });
      if (outputCheck.triggered) return crisisTurn(session, country, options.requestId);
      reply = stripLeakedContext(generated.text, LEAK_MARKERS);
      reply = stripPermanencePromises(reply);
      reply = stripBoundaryClaims(reply);
      reply = enforceAiStatus(reply, askedIfHuman);
      reply = enforceInteractionStyle(reply, { userMessage: text, priorReplies });
      const disclosed = enforceMemoryDisclosure(reply, generated.memoriesUsed, eligible);
      reply = disclosed.replyText;
      // IS-5: count memories the reply visibly references, even if the model did not list them.
      memoriesUsed = [
        ...new Set([
          ...disclosed.memoriesUsed,
          ...eligible.filter((memory) => replyReferencesMemory(reply, memory.text)).map((memory) => memory.id),
        ]),
      ];
      modelSuggestions = (generated.memorySuggestions ?? []).filter((item) => acceptableModelSuggestion(item, text));
    }
    if (route !== "normal") {
      await assertCurrentContext(session, revision, active);
      reply = enforceAiStatus(reply, askedIfHuman);
      // IS-1/IS-2 apply to fixed replies too, except DB-2's required question about one person.
      if (route !== "only_connection") reply = enforceInteractionStyle(reply, { userMessage: text, priorReplies });
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

    let updated: ChatSession = {
      ...session,
      memoriesReferenced: [...new Set([...session.memoriesReferenced, ...memoriesUsed])],
      title: session.title ?? titleFrom(text),
    };
    // CD-1: "I'm an AI" disclosure at session start.
    if (!session.disclosed) {
      reply = `${AI_DISCLOSURE}\n\n${reply}`;
      updated = { ...updated, disclosed: true };
    }
    await deps.sessions.update(updated);

    await deps.messages.append({
      sessionId,
      userId: session.userId,
      role: "user",
      text,
      createdAt: at,
      safety: false,
      requestId: options.requestId,
    });
    await deps.messages.append({
      sessionId,
      userId: session.userId,
      role: "assistant",
      text: reply,
      createdAt: at,
      safety: false,
      requestId: options.requestId,
    });

    const proposed: { id: string; text: string }[] = [];
    const pending = await deps.proposals.listPending(session.userId);
    const known = new Set([...allMemories, ...pending].map((item) => item.text.toLowerCase()));
    // Model suggestions first: they are usually single facts. Skip any candidate that
    // mostly repeats one already saved, pending, or proposed in this turn.
    const candidates = [...modelSuggestions, ...extractMemoryCandidates(text)].map((item) => {
      const trimmed = item.replace(/\s+/g, " ").trim();
      return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
    });
    const overlaps = (candidate: string) =>
      [...known].some(
        (existing) => replyReferencesMemory(existing, candidate) || replyReferencesMemory(candidate, existing),
      );
    for (const candidate of candidates) {
      if (proposed.length >= 2) break;
      if (known.has(candidate.toLowerCase()) || overlaps(candidate)) continue;
      known.add(candidate.toLowerCase());
      try {
        const proposal = await deps.proposals.create(session.userId, candidate, at, session.id);
        proposed.push({ id: proposal.id, text: proposal.text });
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
      conversation_ended: false,
      social_action: socialAction,
      memory_proposals: proposed,
    };
  }

  async function respond(sessionId: string, userMessage: string, options: RespondOptions = {}): Promise<RespondResult> {
    if (activeSessions.has(sessionId)) {
      throw new ConversationError("TURN_IN_PROGRESS", "A reply is already being generated for this conversation.");
    }
    activeSessions.add(sessionId);
    try {
      return await respondTurn(sessionId, userMessage, options);
    } finally {
      activeSessions.delete(sessionId);
    }
  }

  /** Creates a conversation in which Candid has already sent the opening message. */
  async function startConversation(userId: string): Promise<ChatSession> {
    const at = now();
    const session = await deps.sessions.create(userId, at);
    await deps.messages.append({
      sessionId: session.id,
      userId,
      role: "assistant",
      text: OPENING_MESSAGE,
      createdAt: at,
      safety: false,
    });
    const opened = { ...session, disclosed: true };
    await deps.sessions.update(opened);
    return opened;
  }

  return { respond, startConversation };
}

/** DP-5: deletes all of a user's messages, sessions, memories, proposals, social actions, and contact. */
export async function deleteAccountData(
  deps: Pick<ConversationDeps, "sessions" | "messages" | "memories" | "proposals" | "socialActions" | "contacts">,
  userId: string,
) {
  await Promise.all([
    deps.messages.deleteAllForUser(userId),
    deps.memories.deleteAllForUser(userId),
    deps.proposals.deleteAllForUser(userId),
    deps.socialActions.deleteAllForUser(userId),
    deps.contacts.deleteAllForUser(userId),
  ]);
  await deps.sessions.deleteAllForUser(userId);
}

/** MP-3 expiry job and DP-4 retention job. Safe to run repeatedly. */
export async function runRetention(
  deps: Pick<ConversationDeps, "sessions" | "messages" | "memories">,
  at: Date,
  policy: Pick<GuardrailPolicy, "messageRetentionMs"> = DEFAULT_POLICY,
) {
  const expiredMemories = await deps.memories.deleteExpired(at);
  if (!Number.isFinite(policy.messageRetentionMs)) return { expiredMemories, oldMessages: 0 };
  const oldMessages = await deps.messages.deleteOlderThan(
    new Date(at.getTime() - policy.messageRetentionMs),
    await deps.sessions.keptIds(),
  );
  return { expiredMemories, oldMessages };
}
