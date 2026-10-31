import { randomBytes } from "node:crypto";
import { InMemoryMessageRepository, InMemorySessionRepository } from "./conversation/repositories";
import { createConversationService, type ConversationDeps } from "./conversation/respond";
import type { GuardrailPolicy } from "./limits";
import type { LlmAdapter } from "./llm/adapter";
import { MockLlmAdapter } from "./llm/mock";
import type { LogEvent, Logger } from "./log";
import { InMemoryMemoryProposalRepository } from "./memory/proposals";
import { InMemoryMemoryRepository } from "./memory/store";
import type { SafetyClassifier } from "./safety/classifier";
import { InMemoryEmergencyContactRepository } from "./safety/contact";
import { InMemorySocialActionRepository } from "./scheduler/weekly";

/** Wires in-memory repositories for tests, evals, and the local test server. */
export function createInMemoryCompanion(
  options: {
    llm?: LlmAdapter;
    now?: () => Date;
    log?: Logger;
    contactKey?: Buffer;
    safety?: SafetyClassifier;
    policy?: GuardrailPolicy;
  } = {},
) {
  const now = options.now ?? (() => new Date());
  const logEvents: LogEvent[] = [];
  const memories = new InMemoryMemoryRepository(now);
  const messages = new InMemoryMessageRepository();
  const proposals = new InMemoryMemoryProposalRepository(memories);
  const sessions = new InMemorySessionRepository();
  sessions.onDelete = (sessionId) => {
    messages.deleteForSession(sessionId);
    proposals.deleteForSession(sessionId);
  };
  const deps = {
    sessions,
    messages,
    memories,
    proposals,
    socialActions: new InMemorySocialActionRepository(),
    contacts: new InMemoryEmergencyContactRepository(options.contactKey ?? randomBytes(32)),
    llm: (options.llm ?? new MockLlmAdapter()) as LlmAdapter,
    log: options.log ?? ((event: LogEvent) => void logEvents.push(event)),
    safety: options.safety,
    policy: options.policy,
    now,
  } satisfies ConversationDeps;
  return { deps, logEvents, ...createConversationService(deps) };
}
