import { randomUUID } from "node:crypto";
import { DEFAULT_POLICY, LIMITS, type GuardrailPolicy } from "../limits";
import { isAllowedMemoryText } from "./capture";
import { MemoryError, validateMemoryText, type Memory, type MemoryRepository } from "./store";

// A remembered fact starts as a proposal. Nothing enters model context until the
// user reviews the exact text and approves it; dismissed proposals are discarded.

export interface MemoryProposal {
  id: string;
  userId: string;
  /** The conversation the suggestion came from; deleting it removes the suggestion. */
  sessionId: string | null;
  text: string;
  createdAt: Date;
}

export const MAX_PENDING_PROPOSALS = 20;

export interface MemoryProposalRepository {
  /** Pending, unexpired proposals, oldest first. */
  listPending(userId: string): Promise<MemoryProposal[]>;
  create(userId: string, text: string, now: Date, sessionId: string | null): Promise<MemoryProposal>;
  get(userId: string, id: string): Promise<MemoryProposal | null>;
  /** Atomically saves the reviewed text as a memory and resolves the proposal. */
  accept(userId: string, id: string, text: string, expiresAt: Date | null, now: Date): Promise<Memory>;
  /** Resolves the proposal without saving anything. */
  reject(userId: string, id: string): Promise<void>;
  deleteAllForUser(userId: string): Promise<void>;
}

export class InMemoryMemoryProposalRepository implements MemoryProposalRepository {
  private readonly rows = new Map<string, MemoryProposal>();

  constructor(private readonly memories: MemoryRepository) {}

  async listPending(userId: string) {
    return [...this.rows.values()]
      .filter((proposal) => proposal.userId === userId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((proposal) => ({ ...proposal, createdAt: new Date(proposal.createdAt) }));
  }

  async create(userId: string, text: string, now: Date, sessionId: string | null) {
    if ((await this.listPending(userId)).length >= MAX_PENDING_PROPOSALS) {
      throw new MemoryError("LIMIT_REACHED", `At most ${MAX_PENDING_PROPOSALS} suggestions can wait for review.`);
    }
    const proposal = { id: randomUUID(), userId, sessionId, text: validateMemoryText(text), createdAt: new Date(now) };
    this.rows.set(proposal.id, proposal);
    return { ...proposal };
  }

  async get(userId: string, id: string) {
    const proposal = this.rows.get(id);
    return proposal && proposal.userId === userId ? { ...proposal } : null;
  }

  async accept(userId: string, id: string, text: string, expiresAt: Date | null, now: Date) {
    if (!(await this.get(userId, id))) throw new MemoryError("NOT_FOUND", "Suggestion not found.");
    const memory = await this.memories.create(userId, text, now, expiresAt);
    this.rows.delete(id);
    return memory;
  }

  async reject(userId: string, id: string) {
    if (this.rows.get(id)?.userId === userId) this.rows.delete(id);
  }

  /** Drops suggestions from a deleted conversation. */
  deleteForSession(sessionId: string) {
    for (const [id, proposal] of this.rows) if (proposal.sessionId === sessionId) this.rows.delete(id);
  }

  async deleteAllForUser(userId: string) {
    for (const [id, proposal] of this.rows) if (proposal.userId === userId) this.rows.delete(id);
  }
}

export const DISALLOWED_MEMORY_MESSAGE =
  "That can't be saved. Memories hold everyday facts only: no health, intimate, or contact details, private details about other people, or instructions.";

/**
 * Saves the user's reviewed (possibly edited) text as a memory, then clears the
 * proposal. MP-3: the memory expires after the policy period unless the user
 * chooses to keep it. MP-1/MP-2: edited text gets the same content check.
 */
export async function approveProposal(
  deps: { proposals: MemoryProposalRepository; memories: MemoryRepository },
  userId: string,
  proposalId: string,
  input: { text: string; keep: boolean },
  now: Date,
  policy: Pick<GuardrailPolicy, "memoryExpiryMs"> = DEFAULT_POLICY,
): Promise<Memory> {
  const proposal = await deps.proposals.get(userId, proposalId);
  if (!proposal) throw new MemoryError("NOT_FOUND", "Suggestion not found.");
  const text = validateMemoryText(input.text);
  if (!isAllowedMemoryText(text)) throw new MemoryError("INVALID_TEXT", DISALLOWED_MEMORY_MESSAGE);
  if ((await deps.memories.list(userId)).length >= LIMITS.maxMemoriesPerUser) {
    throw new MemoryError("LIMIT_REACHED", `You can keep at most ${LIMITS.maxMemoriesPerUser} memories.`);
  }
  const expiresAt = input.keep ? null : new Date(now.getTime() + policy.memoryExpiryMs);
  return deps.proposals.accept(userId, proposalId, text, expiresAt, now);
}

export async function dismissProposal(
  deps: { proposals: MemoryProposalRepository },
  userId: string,
  proposalId: string,
): Promise<void> {
  if (!(await deps.proposals.get(userId, proposalId))) throw new MemoryError("NOT_FOUND", "Suggestion not found.");
  await deps.proposals.reject(userId, proposalId);
}

/** Longest custom expiry a user can pick; "keep" (null) stays available. */
export const MAX_CUSTOM_EXPIRY_MS = 366 * 24 * 60 * 60 * 1000;

/**
 * The user edits a saved memory's text and/or expiry. Edited text gets the same
 * content check as suggestions (MP-1/MP-2); expiry must be in the future and
 * within a year, or null to keep it until deleted (MP-3).
 */
export async function editMemory(
  deps: { memories: MemoryRepository },
  userId: string,
  memoryId: string,
  input: { text?: string; expiresAt?: Date | null },
  now: Date,
): Promise<Memory> {
  const changes: { text?: string; expiresAt?: Date | null } = {};
  if (input.text !== undefined) {
    const text = validateMemoryText(input.text);
    if (!isAllowedMemoryText(text)) throw new MemoryError("INVALID_TEXT", DISALLOWED_MEMORY_MESSAGE);
    changes.text = text;
  }
  if (input.expiresAt !== undefined) {
    const expiresAt = input.expiresAt;
    if (
      expiresAt !== null &&
      (!Number.isFinite(expiresAt.getTime()) ||
        expiresAt.getTime() <= now.getTime() ||
        expiresAt.getTime() - now.getTime() > MAX_CUSTOM_EXPIRY_MS)
    ) {
      throw new MemoryError("INVALID_EXPIRY", "Choose a date within the next year, or keep it until you delete it.");
    }
    changes.expiresAt = expiresAt;
  }
  // A rejected expiry must not leave the text saved, and a valid combined edit
  // is one database statement so a second write cannot fail halfway through.
  return deps.memories.update(userId, memoryId, changes, now);
}
