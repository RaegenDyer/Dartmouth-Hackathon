import { randomUUID } from "node:crypto";
import { MemoryError, validateMemoryText, type Memory, type MemoryRepository } from "./store";

// A remembered fact starts as a proposal. Nothing enters model context until the
// user reviews the exact text and approves it; dismissed proposals are discarded.

export interface MemoryProposal {
  id: string;
  userId: string;
  text: string;
  createdAt: Date;
}

export const MAX_PENDING_PROPOSALS = 20;

export interface MemoryProposalRepository {
  /** Pending proposals, oldest first. */
  listPending(userId: string): Promise<MemoryProposal[]>;
  create(userId: string, text: string, now: Date): Promise<MemoryProposal>;
  get(userId: string, id: string): Promise<MemoryProposal | null>;
  remove(userId: string, id: string): Promise<void>;
  deleteAllForUser(userId: string): Promise<void>;
}

export class InMemoryMemoryProposalRepository implements MemoryProposalRepository {
  private readonly rows = new Map<string, MemoryProposal>();

  async listPending(userId: string) {
    return [...this.rows.values()]
      .filter((proposal) => proposal.userId === userId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((proposal) => ({ ...proposal, createdAt: new Date(proposal.createdAt) }));
  }

  async create(userId: string, text: string, now: Date) {
    if ((await this.listPending(userId)).length >= MAX_PENDING_PROPOSALS) {
      throw new MemoryError("LIMIT_REACHED", `At most ${MAX_PENDING_PROPOSALS} suggestions can wait for review.`);
    }
    const proposal = { id: randomUUID(), userId, text: validateMemoryText(text), createdAt: new Date(now) };
    this.rows.set(proposal.id, proposal);
    return { ...proposal };
  }

  async get(userId: string, id: string) {
    const proposal = this.rows.get(id);
    return proposal && proposal.userId === userId ? { ...proposal } : null;
  }

  async remove(userId: string, id: string) {
    if (this.rows.get(id)?.userId === userId) this.rows.delete(id);
  }

  async deleteAllForUser(userId: string) {
    for (const [id, proposal] of this.rows) if (proposal.userId === userId) this.rows.delete(id);
  }
}

/** Saves the user's reviewed (possibly edited) text as a memory, then clears the proposal. */
export async function approveProposal(
  deps: { proposals: MemoryProposalRepository; memories: MemoryRepository },
  userId: string,
  proposalId: string,
  input: { text: string; expiresAt: Date | null },
  now: Date,
): Promise<Memory> {
  const proposal = await deps.proposals.get(userId, proposalId);
  if (!proposal) throw new MemoryError("NOT_FOUND", "Suggestion not found.");
  const text = validateMemoryText(input.text);
  if (input.expiresAt && input.expiresAt.getTime() <= now.getTime()) {
    throw new MemoryError("INVALID_EXPIRY", "Expiry must be in the future, or cleared.");
  }
  let memory = await deps.memories.create(userId, text, now);
  if (input.expiresAt) memory = await deps.memories.setExpiry(userId, memory.id, input.expiresAt, now);
  await deps.proposals.remove(userId, proposalId);
  return memory;
}

export async function dismissProposal(
  deps: { proposals: MemoryProposalRepository },
  userId: string,
  proposalId: string,
): Promise<void> {
  if (!(await deps.proposals.get(userId, proposalId))) throw new MemoryError("NOT_FOUND", "Suggestion not found.");
  await deps.proposals.remove(userId, proposalId);
}
