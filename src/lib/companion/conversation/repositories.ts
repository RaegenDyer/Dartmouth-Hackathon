import { randomUUID } from "node:crypto";

export interface ChatSession {
  id: string;
  userId: string;
  startedAt: Date;
  disclosed: boolean;
  /** Set when the safety path ends the normal conversation for this session. */
  endedBySafety: boolean;
  /** DB-3: set when the session length cap ends the conversation. */
  endedBySessionCap: boolean;
  /** IS-5: memories already referenced in this session. */
  memoriesReferenced: string[];
  /** DP-4: a kept thread is exempt from message retention. */
  kept: boolean;
  tone: string | null;
}

export interface StoredMessage {
  id: string;
  sessionId: string;
  userId: string;
  role: "user" | "assistant";
  text: string;
  createdAt: Date;
  safety: boolean;
}

export interface SessionRepository {
  create(userId: string, now: Date, tone?: string | null): Promise<ChatSession>;
  get(sessionId: string): Promise<ChatSession | null>;
  update(session: ChatSession): Promise<void>;
  listForUser(userId: string): Promise<ChatSession[]>;
  deleteAllForUser(userId: string): Promise<void>;
  /** IDs of threads the user chose to keep (DP-4). */
  keptIds(): Promise<Set<string>>;
}

export interface MessageRepository {
  append(message: Omit<StoredMessage, "id">): Promise<StoredMessage>;
  listForSession(sessionId: string): Promise<StoredMessage[]>;
  deleteAllForUser(userId: string): Promise<void>;
  /** DP-4 retention job: deletes messages created before cutoff, except kept threads. */
  deleteOlderThan(cutoff: Date, keptSessionIds: ReadonlySet<string>): Promise<number>;
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly rows = new Map<string, ChatSession>();

  async create(userId: string, now: Date, tone: string | null = null) {
    const session: ChatSession = {
      id: randomUUID(),
      userId,
      startedAt: new Date(now),
      disclosed: false,
      endedBySafety: false,
      endedBySessionCap: false,
      memoriesReferenced: [],
      kept: false,
      tone,
    };
    this.rows.set(session.id, session);
    return { ...session };
  }

  async get(sessionId: string) {
    const session = this.rows.get(sessionId);
    return session ? { ...session, memoriesReferenced: [...session.memoriesReferenced] } : null;
  }

  async update(session: ChatSession) {
    this.rows.set(session.id, { ...session, memoriesReferenced: [...session.memoriesReferenced] });
  }

  async listForUser(userId: string) {
    return [...this.rows.values()].filter((session) => session.userId === userId).map((session) => ({ ...session }));
  }

  async deleteAllForUser(userId: string) {
    for (const [id, session] of this.rows) if (session.userId === userId) this.rows.delete(id);
  }

  async keptIds() {
    return new Set([...this.rows.values()].filter((session) => session.kept).map((session) => session.id));
  }
}

export class InMemoryMessageRepository implements MessageRepository {
  private readonly rows: StoredMessage[] = [];

  async append(message: Omit<StoredMessage, "id">) {
    const stored = { ...message, id: randomUUID() };
    this.rows.push(stored);
    return { ...stored };
  }

  async listForSession(sessionId: string) {
    return this.rows.filter((message) => message.sessionId === sessionId).map((message) => ({ ...message }));
  }

  async deleteAllForUser(userId: string) {
    for (let index = this.rows.length - 1; index >= 0; index -= 1) {
      if (this.rows[index]?.userId === userId) this.rows.splice(index, 1);
    }
  }

  async deleteOlderThan(cutoff: Date, keptSessionIds: ReadonlySet<string>) {
    const before = this.rows.length;
    for (let index = this.rows.length - 1; index >= 0; index -= 1) {
      const message = this.rows[index];
      if (message && message.createdAt.getTime() < cutoff.getTime() && !keptSessionIds.has(message.sessionId)) {
        this.rows.splice(index, 1);
      }
    }
    return before - this.rows.length;
  }

  allForUser(userId: string) {
    return this.rows.filter((message) => message.userId === userId);
  }
}
