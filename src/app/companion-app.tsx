"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { OPENING_MESSAGE } from "@/lib/companion/boundary/rules";
import { greeting } from "@/lib/ui/greeting";
import { MessageText } from "./message-text";

/** MB-6. The server enforces the same limit. */
const MAX_MESSAGE = 1000;

type Status = "loading" | "chat-disabled" | "unconfigured" | "age-gate" | "under-18" | "ready";

interface CrisisView {
  resources: { label: string; contact: string }[];
  emergencyContact: { name: string | null; relationship: string | null; phoneOrEmail: string | null } | null;
  contactNote: string | null;
}
interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  crisis?: CrisisView | null;
}
/** Candid speaks first; the server saves the same text when the conversation starts. */
const OPENING: Message = { id: "opening", role: "assistant", text: OPENING_MESSAGE };

interface Proposal {
  id: string;
  text: string;
}
interface SavedMemory {
  id: string;
  text: string;
  expiresAt: string | null;
}
interface ConversationSummary {
  id: string;
  title: string | null;
  startedAt: string;
  ended: boolean;
}
interface ApiErrorBody {
  error?: { message?: string };
  ageRequired?: boolean;
  sessionExpired?: boolean;
  chatDisabled?: boolean;
}

const jsonInit = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: body === undefined ? {} : { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

async function readError(response: Response): Promise<ApiErrorBody> {
  try {
    return (await response.json()) as ApiErrorBody;
  } catch {
    return {};
  }
}

const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" });

function Wordmark() {
  return (
    <p className="brand">
      candid<span aria-hidden="true">.</span>
    </p>
  );
}

/** OP-1: static notice shown when chat is switched off. */
function ChatDisabledNotice() {
  return (
    <main className="welcome">
      <Wordmark />
      <h1>
        Chat is turned off right now.<span className="subline">please reach a person instead.</span>
      </h1>
      <div className="notice crisis-notice" role="alert">
        <h2 className="label">If you need help now</h2>
        <ul>
          <li>
            <strong>988 Suicide and Crisis Lifeline (US):</strong> call or text 988
          </li>
          <li>
            <strong>Emergency services (US):</strong> 911
          </li>
          <li>
            <strong>Outside the US:</strong> contact your local emergency services
          </li>
        </ul>
      </div>
    </main>
  );
}

export function CompanionApp() {
  const [status, setStatus] = useState<Status>("loading");
  const [hello, setHello] = useState("hello.");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [keepChoices, setKeepChoices] = useState<Record<string, boolean>>({});
  const [memories, setMemories] = useState<SavedMemory[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [ended, setEnded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [confirmDeleteConversation, setConfirmDeleteConversation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const resetChat = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setProposals([]);
    setMemories([]);
    setEnded(false);
    setConfirmDelete(false);
    setConversations([]);
    setConfirmDeleteConversation(null);
  }, []);

  /** Moves the UI to the right screen for auth/kill-switch errors. Returns true if handled. */
  const handleGateError = useCallback(
    (body: ApiErrorBody) => {
      if (body.chatDisabled) setStatus("chat-disabled");
      else if (body.ageRequired) setStatus("age-gate");
      else if (body.sessionExpired) {
        resetChat();
        setStatus("age-gate");
        setError(body.error?.message ?? "Your session ended.");
      } else return false;
      return true;
    },
    [resetChat],
  );

  const startConversation = useCallback(async () => {
    const response = await fetch("/api/conversations", jsonInit("POST", { scenario: "check_in" }));
    if (!response.ok) {
      const body = await readError(response);
      if (handleGateError(body)) return null;
      throw new Error(body.error?.message ?? "Could not start a conversation.");
    }
    const { conversationId: id } = (await response.json()) as { conversationId: string };
    setConversationId(id);
    setEnded(false);
    return id;
  }, [handleGateError]);

  const loadSpace = useCallback(async () => {
    const [proposalResponse, memoryResponse] = await Promise.all([
      fetch("/api/memory-proposals"),
      fetch("/api/memories"),
    ]);
    if (proposalResponse.ok) setProposals(((await proposalResponse.json()) as { proposals: Proposal[] }).proposals);
    if (memoryResponse.ok) setMemories(((await memoryResponse.json()) as { memories: SavedMemory[] }).memories);
  }, []);

  /** Saved conversations, newest first. Returns false if a gate (age, kill switch) took over. */
  const loadConversations = useCallback(async () => {
    const response = await fetch("/api/conversations");
    if (!response.ok) {
      const body = await readError(response);
      if (handleGateError(body)) return false;
      throw new Error(body.error?.message ?? "Could not load your conversations.");
    }
    setConversations(((await response.json()) as { conversations: ConversationSummary[] }).conversations);
    return true;
  }, [handleGateError]);

  const enterApp = useCallback(async () => {
    setError(null);
    try {
      if (!(await loadConversations())) return;
      await loadSpace();
      // A conversation is created when the first message is sent, so empty chats are not saved.
      setConversationId(null);
      setMessages([OPENING]);
      setEnded(false);
      setStatus("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
      setStatus("age-gate");
    }
  }, [loadConversations, loadSpace]);

  function newConversation() {
    setConversationId(null);
    setMessages([OPENING]);
    setEnded(false);
    setError(null);
  }

  async function openConversation(id: string) {
    setError(null);
    const response = await fetch(`/api/conversations/${id}`);
    if (!response.ok) {
      const body = await readError(response);
      if (handleGateError(body)) return;
      if (response.status === 404) await loadConversations();
      return setError(body.error?.message ?? "That conversation could not be opened.");
    }
    const body = (await response.json()) as {
      conversation: ConversationSummary;
      messages: { id: string; role: "user" | "assistant"; text: string }[];
    };
    setConversationId(id);
    setMessages(body.messages);
    setEnded(body.conversation.ended);
  }

  async function deleteConversation(id: string) {
    const response = await fetch(`/api/conversations/${id}`, jsonInit("DELETE"));
    setConfirmDeleteConversation(null);
    if (!response.ok && response.status !== 404) {
      return setError((await readError(response)).error?.message ?? "That conversation could not be deleted.");
    }
    setConversations((current) => current.filter((item) => item.id !== id));
    if (id === conversationId) newConversation();
    await loadSpace();
  }

  useEffect(() => {
    setHello(greeting(new Date().getHours()));
    void (async () => {
      const state = (await (await fetch("/api/companion/status")).json()) as { chatEnabled: boolean };
      if (!state.chatEnabled) return setStatus("chat-disabled");
      const response = await fetch("/api/auth/session");
      if (response.status === 503) return setStatus("unconfigured");
      const body = (await response.json()) as { authenticated: boolean; ageConfirmed?: boolean };
      if (body.authenticated && body.ageConfirmed) await enterApp();
      else setStatus("age-gate");
    })();
  }, [enterApp]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages]);

  async function startSession() {
    setError(null);
    const response = await fetch("/api/auth/anonymous", jsonInit("POST", { ageConfirmed: true }));
    if (!response.ok) return setError((await readError(response)).error?.message ?? "Could not start a session.");
    await enterApp();
  }

  async function signOut() {
    await fetch("/api/auth/sign-out", jsonInit("POST"));
    resetChat();
    setStatus("age-gate");
  }

  async function deleteMyData() {
    const response = await fetch("/api/account", jsonInit("DELETE"));
    if (!response.ok) {
      setConfirmDelete(false);
      return setError((await readError(response)).error?.message ?? "Your data could not be deleted.");
    }
    resetChat();
    setStatus("age-gate");
    setError("Your conversations, memories, and suggestions were deleted.");
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || sending || content.length > MAX_MESSAGE) return;
    setSending(true);
    setError(null);
    let activeId = conversationId;
    if (!activeId) {
      try {
        activeId = await startConversation();
      } catch (caught) {
        setSending(false);
        return setError(caught instanceof Error ? caught.message : "Could not start a conversation.");
      }
      if (!activeId) return setSending(false);
    }
    const clientRequestId = crypto.randomUUID();
    setMessages((current) => [...current, { id: clientRequestId, role: "user", text: content }]);
    setDraft("");

    const post = (id: string) => fetch("/api/chat", jsonInit("POST", { conversationId: id, clientRequestId, content }));
    try {
      let response = await post(activeId);
      // The local server keeps conversations in memory; after a restart, start a new one.
      if (response.status === 404) {
        const fresh = await startConversation();
        if (fresh) response = await post(fresh);
      }
      if (!response.ok) {
        const body = await readError(response);
        if (handleGateError(body)) return;
        throw new Error(body.error?.message ?? "Your message could not be sent.");
      }
      const result = (await response.json()) as {
        reply: string;
        conversationEnded: boolean;
        crisis: CrisisView | null;
        memoryProposals: Proposal[];
      };
      setMessages((current) => [
        ...current.filter((message) => message.id !== clientRequestId),
        { id: clientRequestId, role: "user", text: content },
        { id: `${clientRequestId}-reply`, role: "assistant", text: result.reply, crisis: result.crisis },
      ]);
      if (result.conversationEnded) setEnded(true);
      if (result.memoryProposals.length) setProposals((current) => [...current, ...result.memoryProposals]);
      void loadConversations().catch(() => undefined);
    } catch (caught) {
      setMessages((current) => current.filter((message) => message.id !== clientRequestId));
      setDraft(content);
      setError(caught instanceof Error ? caught.message : "Your message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  function onComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  async function saveProposal(proposal: Proposal) {
    const content = (edits[proposal.id] ?? proposal.text).trim();
    const response = await fetch(
      `/api/memory-proposals/${proposal.id}/accept`,
      jsonInit("POST", { content, keep: keepChoices[proposal.id] ?? false }),
    );
    if (!response.ok) {
      return setError((await readError(response)).error?.message ?? "That memory could not be saved.");
    }
    const { memory } = (await response.json()) as { memory: SavedMemory };
    setProposals((current) => current.filter((item) => item.id !== proposal.id));
    setMemories((current) => [memory, ...current]);
  }

  async function dismissProposal(proposal: Proposal) {
    const response = await fetch(`/api/memory-proposals/${proposal.id}/dismiss`, jsonInit("POST"));
    if (!response.ok && response.status !== 404) {
      return setError((await readError(response)).error?.message ?? "That suggestion could not be dismissed.");
    }
    setProposals((current) => current.filter((item) => item.id !== proposal.id));
  }

  async function keepMemory(memory: SavedMemory) {
    const response = await fetch(`/api/memories/${memory.id}/keep`, jsonInit("POST"));
    if (!response.ok) return setError((await readError(response)).error?.message ?? "That memory could not be kept.");
    const { memory: kept } = (await response.json()) as { memory: SavedMemory };
    setMemories((current) => current.map((item) => (item.id === kept.id ? kept : item)));
  }

  async function deleteMemory(memory: SavedMemory) {
    const response = await fetch(`/api/memories/${memory.id}`, jsonInit("DELETE"));
    if (!response.ok && response.status !== 404) {
      return setError((await readError(response)).error?.message ?? "That memory could not be deleted.");
    }
    setMemories((current) => current.filter((item) => item.id !== memory.id));
  }

  if (status === "chat-disabled") return <ChatDisabledNotice />;

  if (status !== "ready") {
    return (
      <main className="welcome">
        <Wordmark />
        <span className="eyebrow label">
          proof of concept · <b>for adults 18+</b>
        </span>
        <h1>
          {hello}
          <span className="subline">how was today?</span>
        </h1>
        {status === "loading" && <p aria-live="polite">Loading…</p>}
        {status === "unconfigured" && (
          <div className="notice" role="status">
            <h2>sign-in isn&apos;t set up on this computer yet</h2>
            <p>
              Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to{" "}
              <code>.env.local</code>, then restart the app.
            </p>
          </div>
        )}
        {status === "age-gate" && (
          <>
            <p className="lede">
              Candid is an AI companion for settling into a new place. You choose what it remembers, and it will not
              contact anyone for you. This is a proof of concept.
            </p>
            {/* AA-1: placeholder wording, pending team and legal review. */}
            <fieldset className="age-gate">
              <legend className="label">This proof of concept is for adults. Are you 18 or older?</legend>
              <div className="actions">
                <button type="button" className="primary" onClick={() => void startSession()}>
                  yes, I&apos;m 18 or older
                </button>
                <button type="button" className="quiet" onClick={() => setStatus("under-18")}>
                  no, I&apos;m under 18
                </button>
              </div>
            </fieldset>
            <p className="fine-print">
              Starting creates an anonymous session in this browser. It ends if you sign out, clear cookies, or switch
              devices.
            </p>
          </>
        )}
        {status === "under-18" && (
          <div className="notice" role="status">
            <h2>sorry, this proof of concept is only for adults</h2>
            <p>If you need someone to talk to right now, you can call or text 988 in the US.</p>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </main>
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <Wordmark />
        <button type="button" className="primary" onClick={newConversation}>
          new conversation
        </button>
        <nav className="history" aria-labelledby="history-title">
          <h2 id="history-title" className="label">
            Your conversations
          </h2>
          <p className="fine-print" id="history-note">
            Conversations are saved so you can come back to them. You can delete any conversation, or all your data, at
            any time.
          </p>
          {conversations.length === 0 ? (
            <p className="empty">Your conversations will appear here after you send a message.</p>
          ) : (
            <ul>
              {conversations.map((item) => {
                const label = item.title ?? "Conversation";
                const when = dateFormat.format(new Date(item.startedAt));
                return (
                  <li key={item.id} className={item.id === conversationId ? "current" : undefined}>
                    {confirmDeleteConversation === item.id ? (
                      <div className="confirm" role="group" aria-label={`Confirm deleting ${label}`}>
                        <p>Delete this conversation? This can&apos;t be undone.</p>
                        <button type="button" className="danger small" onClick={() => void deleteConversation(item.id)}>
                          delete
                        </button>
                        <button
                          type="button"
                          className="quiet small"
                          onClick={() => setConfirmDeleteConversation(null)}
                        >
                          cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="history-open"
                          aria-current={item.id === conversationId ? "true" : undefined}
                          onClick={() => void openConversation(item.id)}
                        >
                          <span className="history-title">{label}</span>
                          <span className="history-date">{when}</span>
                        </button>
                        <button
                          type="button"
                          className="quiet small"
                          aria-label={`Delete conversation: ${label}`}
                          onClick={() => setConfirmDeleteConversation(item.id)}
                        >
                          delete
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </nav>
        <div className="sidebar-end">
          {confirmDelete ? (
            <div className="confirm" role="group" aria-label="Confirm data deletion">
              <p>Delete all your conversations, memories, and suggestions? This can&apos;t be undone.</p>
              <button type="button" className="danger small" onClick={() => void deleteMyData()}>
                delete everything
              </button>
              <button type="button" className="quiet small" onClick={() => setConfirmDelete(false)}>
                cancel
              </button>
            </div>
          ) : (
            <button type="button" className="link" onClick={() => setConfirmDelete(true)}>
              delete my data
            </button>
          )}
          <button type="button" className="link" onClick={() => void signOut()}>
            sign out
          </button>
        </div>
      </aside>

      <main className="today">
        {/* CD-2 */}
        <p className="poc-notice" role="note">
          <span className="pill label">proof of concept</span>
          Candid is an AI companion, not a person or a clinical service. Replies can be wrong.
        </p>
        <header className="today-header">
          <span className="label">{dayFormat.format(new Date())}</span>
          <h1>
            {hello}
            <span className="subline">how was today?</span>
          </h1>
        </header>

        <div className="today-grid">
          <section className="card chat" aria-label="Conversation">
            <div className="log" role="log" aria-live="polite" ref={logRef}>
              {messages.length === 0 && (
                <p className="empty">
                  Share how your day went, or anything on your mind. I&apos;m an AI, not a person.
                </p>
              )}
              {messages.map((message) => (
                <div key={message.id} className={`bubble ${message.role}${message.crisis ? " crisis" : ""}`}>
                  <span className="sr-only">{message.role === "user" ? "You said:" : "Candid said:"}</span>
                  {message.role === "assistant" && (
                    <span className="label who" aria-hidden="true">
                      candid
                    </span>
                  )}
                  <MessageText text={message.text} />
                  {message.crisis && (
                    <div className="crisis-detail">
                      <ul>
                        {message.crisis.resources.map((resource) => (
                          <li key={resource.label}>
                            <strong>{resource.label}:</strong> {resource.contact}
                          </li>
                        ))}
                      </ul>
                      {message.crisis.emergencyContact && (
                        <p>
                          {[
                            message.crisis.emergencyContact.name,
                            message.crisis.emergencyContact.relationship,
                            message.crisis.emergencyContact.phoneOrEmail,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                          <br />
                          {message.crisis.contactNote}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {sending && <p className="typing">Candid is replying…</p>}
            </div>

            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}

            {ended ? (
              <div className="ended">
                <p>This conversation has ended.</p>
                <button type="button" className="primary" onClick={newConversation}>
                  start a new conversation
                </button>
              </div>
            ) : (
              <form className="composer" onSubmit={(event) => void send(event)}>
                <label htmlFor="message" className="sr-only">
                  Write a message
                </label>
                <textarea
                  id="message"
                  rows={2}
                  maxLength={MAX_MESSAGE}
                  placeholder="write a message…"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={onComposerKey}
                  aria-describedby="message-hint"
                />
                <button type="submit" className="primary" disabled={sending || !draft.trim()}>
                  send
                </button>
                <p id="message-hint" className="hint label">
                  Enter to send, Shift+Enter for a new line.
                  {draft.length > MAX_MESSAGE - 100 && ` ${MAX_MESSAGE - draft.length} characters left.`}
                </p>
              </form>
            )}
          </section>

          <section className="card space" aria-labelledby="space-title">
            <h2 id="space-title" className="label">
              Your space
            </h2>

            <h3>suggested to remember</h3>
            {proposals.length === 0 ? (
              <p className="empty">
                Nothing waiting. When you mention everyday facts, like where you live or what you enjoy, suggestions
                appear here. Nothing is remembered until you choose Save.
              </p>
            ) : (
              <ul className="items">
                {proposals.map((proposal) => (
                  <li key={proposal.id} className="proposal">
                    <span className="label">suggested · from what you said</span>
                    <label htmlFor={`proposal-${proposal.id}`} className="sr-only">
                      Suggested memory, editable
                    </label>
                    <textarea
                      id={`proposal-${proposal.id}`}
                      rows={2}
                      value={edits[proposal.id] ?? proposal.text}
                      maxLength={280}
                      onChange={(event) => setEdits((current) => ({ ...current, [proposal.id]: event.target.value }))}
                    />
                    <label className="keep">
                      <input
                        type="checkbox"
                        checked={keepChoices[proposal.id] ?? false}
                        onChange={(event) =>
                          setKeepChoices((current) => ({ ...current, [proposal.id]: event.target.checked }))
                        }
                      />{" "}
                      Keep until I delete it (otherwise it expires automatically)
                    </label>
                    <div className="actions">
                      <button type="button" className="primary small" onClick={() => void saveProposal(proposal)}>
                        save
                      </button>
                      <button type="button" className="quiet small" onClick={() => void dismissProposal(proposal)}>
                        dismiss
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <h3>what I remember</h3>
            {memories.length === 0 ? (
              <p className="empty">Nothing saved yet.</p>
            ) : (
              <ul className="items">
                {memories.map((memory) => (
                  <li key={memory.id} className="memory">
                    <div>
                      <span>{memory.text}</span>
                      <span className="expiry label">
                        {memory.expiresAt
                          ? `Expires ${dateFormat.format(new Date(memory.expiresAt))}`
                          : "Kept until you delete it"}
                      </span>
                    </div>
                    <div className="actions">
                      {memory.expiresAt && (
                        <button
                          type="button"
                          className="quiet small"
                          onClick={() => void keepMemory(memory)}
                          aria-label={`Keep memory: ${memory.text}`}
                        >
                          keep
                        </button>
                      )}
                      <button
                        type="button"
                        className="quiet small"
                        onClick={() => void deleteMemory(memory)}
                        aria-label={`Delete memory: ${memory.text}`}
                      >
                        delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="fine-print">Saved memories stay until they expire or you delete them.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
