"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

const MAX_MESSAGE = 4000;

type Status = "loading" | "unconfigured" | "signed-out" | "ready";

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
interface Proposal {
  id: string;
  text: string;
}
interface SavedMemory {
  id: string;
  text: string;
}

const jsonInit = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: body === undefined ? {} : { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

async function errorMessage(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

function greeting(hour: number) {
  if (hour < 12) return "Good morning.";
  if (hour < 18) return "Good afternoon.";
  return "Good evening.";
}

export function CompanionApp() {
  const [status, setStatus] = useState<Status>("loading");
  const [hello, setHello] = useState("Hello.");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [memories, setMemories] = useState<SavedMemory[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const startConversation = useCallback(async () => {
    const response = await fetch("/api/conversations", jsonInit("POST", { scenario: "check_in" }));
    if (!response.ok) throw new Error(await errorMessage(response, "Could not start a conversation."));
    const { conversationId: id } = (await response.json()) as { conversationId: string };
    setConversationId(id);
    setMessages([]);
    setEnded(false);
    return id;
  }, []);

  const loadSpace = useCallback(async () => {
    const [proposalResponse, memoryResponse] = await Promise.all([
      fetch("/api/memory-proposals"),
      fetch("/api/memories"),
    ]);
    if (proposalResponse.ok) setProposals(((await proposalResponse.json()) as { proposals: Proposal[] }).proposals);
    if (memoryResponse.ok) setMemories(((await memoryResponse.json()) as { memories: SavedMemory[] }).memories);
  }, []);

  const enterApp = useCallback(async () => {
    setError(null);
    try {
      await startConversation();
      await loadSpace();
      setStatus("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
      setStatus("signed-out");
    }
  }, [loadSpace, startConversation]);

  useEffect(() => {
    setHello(greeting(new Date().getHours()));
    void (async () => {
      const response = await fetch("/api/auth/session");
      if (response.status === 503) return setStatus("unconfigured");
      const body = (await response.json()) as { authenticated: boolean };
      if (body.authenticated) await enterApp();
      else setStatus("signed-out");
    })();
  }, [enterApp]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages]);

  async function startSession() {
    setError(null);
    const response = await fetch("/api/auth/anonymous", jsonInit("POST"));
    if (!response.ok) return setError(await errorMessage(response, "Could not start a session."));
    await enterApp();
  }

  async function signOut() {
    await fetch("/api/auth/sign-out", jsonInit("POST"));
    setConversationId(null);
    setMessages([]);
    setProposals([]);
    setMemories([]);
    setStatus("signed-out");
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || sending || !conversationId) return;
    setSending(true);
    setError(null);
    const clientRequestId = crypto.randomUUID();
    setMessages((current) => [...current, { id: clientRequestId, role: "user", text: content }]);
    setDraft("");

    const post = (id: string) =>
      fetch("/api/chat", jsonInit("POST", { conversationId: id, clientRequestId, content }));
    try {
      let response = await post(conversationId);
      // The local server keeps conversations in memory; after a restart, start a new one.
      if (response.status === 404) response = await post(await startConversation());
      if (!response.ok) throw new Error(await errorMessage(response, "Your message could not be sent."));
      const result = (await response.json()) as {
        reply: string;
        safetyTriggered: boolean;
        crisis: CrisisView | null;
        memoryProposals: Proposal[];
      };
      setMessages((current) => [
        ...current.filter((message) => message.id !== clientRequestId),
        { id: clientRequestId, role: "user", text: content },
        { id: `${clientRequestId}-reply`, role: "assistant", text: result.reply, crisis: result.crisis },
      ]);
      if (result.safetyTriggered) setEnded(true);
      if (result.memoryProposals.length) setProposals((current) => [...current, ...result.memoryProposals]);
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
      jsonInit("POST", { content, expiresAt: null }),
    );
    if (!response.ok) return setError(await errorMessage(response, "That memory could not be saved."));
    const { memory } = (await response.json()) as { memory: SavedMemory };
    setProposals((current) => current.filter((item) => item.id !== proposal.id));
    setMemories((current) => [memory, ...current]);
  }

  async function dismissProposal(proposal: Proposal) {
    const response = await fetch(`/api/memory-proposals/${proposal.id}/dismiss`, jsonInit("POST"));
    if (!response.ok && response.status !== 404) {
      return setError(await errorMessage(response, "That suggestion could not be dismissed."));
    }
    setProposals((current) => current.filter((item) => item.id !== proposal.id));
  }

  async function deleteMemory(memory: SavedMemory) {
    const response = await fetch(`/api/memories/${memory.id}`, jsonInit("DELETE"));
    if (!response.ok && response.status !== 404) {
      return setError(await errorMessage(response, "That memory could not be deleted."));
    }
    setMemories((current) => current.filter((item) => item.id !== memory.id));
  }

  if (status !== "ready") {
    return (
      <main className="welcome">
        <p className="brand">Companion</p>
        <h1>{hello} How was today?</h1>
        {status === "loading" && <p aria-live="polite">Loading…</p>}
        {status === "unconfigured" && (
          <div className="notice" role="status">
            <h2>Sign-in isn&apos;t set up on this computer yet</h2>
            <p>
              Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to{" "}
              <code>.env.local</code>, then restart the app.
            </p>
          </div>
        )}
        {status === "signed-out" && (
          <>
            <p className="lede">
              An AI companion for settling into a new place. You choose what it remembers, and it will never contact
              anyone for you.
            </p>
            <button type="button" className="primary" onClick={() => void startSession()}>
              Start a private session
            </button>
            <p className="fine-print">
              This starts an anonymous session in this browser. It ends if you sign out, clear cookies, or switch
              devices.
            </p>
          </>
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
        <p className="brand">Companion</p>
        <button type="button" className="quiet" onClick={() => void startConversation()}>
          New conversation
        </button>
        <button type="button" className="quiet sign-out" onClick={() => void signOut()}>
          Sign out
        </button>
      </aside>

      <main className="today">
        <header className="today-header">
          <h1>{hello}</h1>
          <p>How was today?</p>
        </header>

        <div className="today-grid">
          <section className="card chat" aria-label="Conversation">
            <div className="log" role="log" aria-live="polite" ref={logRef}>
              {messages.length === 0 && (
                <p className="empty">Share how your day went, or anything on your mind. I&apos;m an AI, not a person.</p>
              )}
              {messages.map((message) => (
                <div key={message.id} className={`bubble ${message.role}${message.crisis ? " crisis" : ""}`}>
                  <span className="sr-only">{message.role === "user" ? "You said:" : "Companion said:"}</span>
                  <p>{message.text}</p>
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
              {sending && <p className="typing">Companion is replying…</p>}
            </div>

            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}

            {ended ? (
              <div className="ended">
                <p>This conversation has ended.</p>
                <button type="button" className="primary" onClick={() => void startConversation()}>
                  Start a new conversation
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
                  placeholder="Write a message…"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={onComposerKey}
                  aria-describedby="message-hint"
                />
                <button type="submit" className="primary" disabled={sending || !draft.trim()}>
                  Send
                </button>
                <p id="message-hint" className="hint">
                  Enter to send, Shift+Enter for a new line.
                  {draft.length > MAX_MESSAGE - 200 && ` ${MAX_MESSAGE - draft.length} characters left.`}
                </p>
              </form>
            )}
          </section>

          <section className="card space" aria-labelledby="space-title">
            <h2 id="space-title">Your space</h2>

            <h3>Suggested to remember</h3>
            {proposals.length === 0 ? (
              <p className="empty">Nothing waiting. Facts you mention can appear here for you to keep or dismiss.</p>
            ) : (
              <ul className="items">
                {proposals.map((proposal) => (
                  <li key={proposal.id} className="proposal">
                    <label htmlFor={`proposal-${proposal.id}`} className="sr-only">
                      Suggested memory, editable
                    </label>
                    <input
                      id={`proposal-${proposal.id}`}
                      value={edits[proposal.id] ?? proposal.text}
                      maxLength={280}
                      onChange={(event) => setEdits((current) => ({ ...current, [proposal.id]: event.target.value }))}
                    />
                    <div className="actions">
                      <button type="button" className="primary small" onClick={() => void saveProposal(proposal)}>
                        Save
                      </button>
                      <button type="button" className="quiet small" onClick={() => void dismissProposal(proposal)}>
                        Dismiss
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <h3>What I remember</h3>
            {memories.length === 0 ? (
              <p className="empty">Nothing saved yet.</p>
            ) : (
              <ul className="items">
                {memories.map((memory) => (
                  <li key={memory.id} className="memory">
                    <span>{memory.text}</span>
                    <button
                      type="button"
                      className="quiet small"
                      onClick={() => void deleteMemory(memory)}
                      aria-label={`Delete memory: ${memory.text}`}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="fine-print">Test mode: everything here is cleared when the local server restarts.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
