import { randomUUID } from "node:crypto";
import { LIMITS } from "../limits";

export interface Memory {
  id: string;
  userId: string;
  text: string;
  createdAt: Date;
  expiresAt: Date | null;
  editedByUser: boolean;
}

export interface MemoryUpdate {
  text?: string;
  expiresAt?: Date | null;
}

export class MemoryError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "LIMIT_REACHED" | "INVALID_TEXT" | "INVALID_EXPIRY",
    message: string,
  ) {
    super(message);
  }
}

/**
 * Repository boundary for memories. Every call is scoped by userId, so a caller
 * cannot read or change another user's memory by guessing an ID.
 */
export interface MemoryRepository {
  /** All of the user's memories, including expired ones, newest first. */
  list(userId: string): Promise<Memory[]>;
  /** Unexpired memories only. This is the only source of model context. */
  listActive(userId: string, now: Date): Promise<Memory[]>;
  create(userId: string, text: string, now: Date, expiresAt?: Date | null): Promise<Memory>;
  /** Validates and applies the supplied fields together, advancing context once. */
  update(userId: string, id: string, changes: MemoryUpdate, now: Date): Promise<Memory>;
  updateText(userId: string, id: string, text: string): Promise<Memory>;
  setExpiry(userId: string, id: string, expiresAt: Date | null, now: Date): Promise<Memory>;
  delete(userId: string, id: string): Promise<void>;
  deleteAllForUser(userId: string): Promise<void>;
  /** MP-3 expiry job: removes every expired memory. Returns how many were removed. */
  deleteExpired(now: Date): Promise<number>;
  /**
   * When the user last edited, expired, or deleted a memory. Conversation
   * history before this point is not sent to the model, so a deleted fact
   * cannot be rediscovered from older turns.
   */
  lastUserChangeAt(userId: string): Promise<Date | null>;
  /** Monotonic mutation revision, including changes that restore identical text. */
  contextRevision(userId: string): Promise<number>;
}

export function validateMemoryText(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > LIMITS.maxMemoryLength || trimmed.includes("\u0000") || !trimmed.isWellFormed()) {
    throw new MemoryError("INVALID_TEXT", `Memory text must be 1-${LIMITS.maxMemoryLength} characters.`);
  }
  return trimmed;
}

export function validateMemoryUpdate(input: MemoryUpdate, now: Date): MemoryUpdate {
  const changes: MemoryUpdate = {};
  if (input.text !== undefined) changes.text = validateMemoryText(input.text);
  if (input.expiresAt !== undefined) {
    if (
      input.expiresAt !== null &&
      (!Number.isFinite(input.expiresAt.getTime()) || input.expiresAt.getTime() <= now.getTime())
    ) {
      throw new MemoryError("INVALID_EXPIRY", "Expiry must be in the future, or cleared.");
    }
    changes.expiresAt = input.expiresAt === null ? null : new Date(input.expiresAt);
  }
  if (changes.text === undefined && changes.expiresAt === undefined) {
    throw new MemoryError("INVALID_TEXT", "Nothing to change.");
  }
  return changes;
}

export function isExpired(memory: Pick<Memory, "expiresAt">, now: Date): boolean {
  return memory.expiresAt !== null && memory.expiresAt.getTime() <= now.getTime();
}

const clone = (memory: Memory): Memory => ({
  ...memory,
  createdAt: new Date(memory.createdAt),
  expiresAt: memory.expiresAt ? new Date(memory.expiresAt) : null,
});

/** In-memory implementation for tests, evals, and the mocked local mode. */
export class InMemoryMemoryRepository implements MemoryRepository {
  private readonly rows = new Map<string, Memory>();
  private readonly changes = new Map<string, Date>();
  private readonly revisions = new Map<string, number>();

  constructor(private readonly clock: () => Date = () => new Date()) {}

  async lastUserChangeAt(userId: string) {
    const changedAt = this.changes.get(userId);
    return changedAt ? new Date(changedAt) : null;
  }

  async contextRevision(userId: string) {
    return this.revisions.get(userId) ?? 0;
  }

  private advanceRevision(userId: string) {
    this.revisions.set(userId, (this.revisions.get(userId) ?? 0) + 1);
  }

  async list(userId: string) {
    return [...this.rows.values()]
      .filter((memory) => memory.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(clone);
  }

  async listActive(userId: string, now: Date) {
    return (await this.list(userId)).filter((memory) => !isExpired(memory, now));
  }

  async create(userId: string, text: string, now: Date, expiresAt: Date | null = null) {
    // Keep count-and-insert synchronous: awaiting a list lets concurrent creates
    // all see the same free slot. Counting also avoids sorting/cloning every row.
    let count = 0;
    for (const memory of this.rows.values()) if (memory.userId === userId) count += 1;
    if (count >= LIMITS.maxMemoriesPerUser) {
      throw new MemoryError("LIMIT_REACHED", `A user can keep at most ${LIMITS.maxMemoriesPerUser} memories.`);
    }
    const memory: Memory = {
      id: randomUUID(),
      userId,
      text: validateMemoryText(text),
      createdAt: new Date(now),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      editedByUser: false,
    };
    this.rows.set(memory.id, memory);
    this.advanceRevision(userId);
    return clone(memory);
  }

  async update(userId: string, id: string, input: MemoryUpdate, now: Date) {
    const changes = validateMemoryUpdate(input, now);
    const memory = this.owned(userId, id);
    if (changes.text !== undefined) memory.text = changes.text;
    if (changes.expiresAt !== undefined) memory.expiresAt = changes.expiresAt;
    memory.editedByUser = true;
    this.changes.set(userId, new Date(now));
    this.advanceRevision(userId);
    return clone(memory);
  }

  async updateText(userId: string, id: string, text: string) {
    return this.update(userId, id, { text }, this.clock());
  }

  async setExpiry(userId: string, id: string, expiresAt: Date | null, now: Date) {
    return this.update(userId, id, { expiresAt }, now);
  }

  async delete(userId: string, id: string) {
    this.owned(userId, id);
    this.rows.delete(id);
    this.changes.set(userId, new Date(this.clock()));
    this.advanceRevision(userId);
  }

  async deleteAllForUser(userId: string) {
    for (const [id, memory] of this.rows) {
      if (memory.userId === userId) this.rows.delete(id);
    }
    // Keep invalidation monotonic for turns that are already in flight. Clearing
    // the memories must also prevent old transcript facts from entering context.
    this.changes.set(userId, new Date(this.clock()));
    this.advanceRevision(userId);
  }

  async deleteExpired(now: Date) {
    let removed = 0;
    for (const [id, memory] of this.rows) {
      if (isExpired(memory, now)) {
        this.rows.delete(id);
        this.advanceRevision(memory.userId);
        removed += 1;
      }
    }
    return removed;
  }

  private owned(userId: string, id: string): Memory {
    const memory = this.rows.get(id);
    if (!memory || memory.userId !== userId) {
      throw new MemoryError("NOT_FOUND", "Memory not found.");
    }
    return memory;
  }
}
