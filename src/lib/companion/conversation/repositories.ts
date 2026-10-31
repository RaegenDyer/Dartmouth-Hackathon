import { randomUUID } from "node:crypto";

export interface ChatSession {
  id: string;
  userId: string;
  startedAt: Date;
  disclosed: boolean;
  /** Set when the safety path ends the normal conversation for this session. */
  endedBySafety: boolean;
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
}

export interface MessageRepository {
  append(message: Omit<StoredMessage, "id">): Promise<StoredMessage>;
  listForSession(sessionId: string): Promise<StoredMessage[]>;
  deleteAllForUser(userId: string): Promise<void>;
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
      tone,
    };
    this.rows.set(session.id, session);
    return { ...session };
  }

  async get(sessionId: string) {
    const session = this.rows.get(sessionId);
    return session ? { ...session } : null;
  }

  async update(session: ChatSession) {
    this.rows.set(session.id, { ...session });
  }

  async listForUser(userId: string) {
    return [...this.rows.values()].filter((session) => session.userId === userId).map((session) => ({ ...session }));
  }

  async deleteAllForUser(userId: string) {
    for (const [id, session] of this.rows) if (session.userId === userId) this.rows.delete(id);
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

  allForUser(userId: string) {
    return this.rows.filter((message) => message.userId === userId);
  }
}
