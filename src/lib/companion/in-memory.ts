import { randomBytes } from "node:crypto";
import { InMemoryMessageRepository, InMemorySessionRepository } from "./conversation/repositories";
import { createConversationService, type ConversationDeps } from "./conversation/respond";
import type { LlmAdapter } from "./llm/adapter";
import { MockLlmAdapter } from "./llm/mock";
import { InMemoryMemoryProposalRepository } from "./memory/proposals";
import { InMemoryMemoryRepository } from "./memory/store";
import { InMemoryEmergencyContactRepository } from "./safety/contact";
import type { SafetyLogger } from "./safety/crisis";
import { InMemorySocialActionRepository } from "./scheduler/weekly";

/** Wires in-memory repositories for tests, evals, and the mocked local mode. */
export function createInMemoryCompanion(
  options: { llm?: LlmAdapter; now?: () => Date; logSafety?: SafetyLogger; contactKey?: Buffer } = {},
) {
  const now = options.now ?? (() => new Date());
  const safetyEvents: Parameters<SafetyLogger>[0][] = [];
  const deps = {
    sessions: new InMemorySessionRepository(),
    messages: new InMemoryMessageRepository(),
    memories: new InMemoryMemoryRepository(now),
    proposals: new InMemoryMemoryProposalRepository(),
    socialActions: new InMemorySocialActionRepository(),
    contacts: new InMemoryEmergencyContactRepository(options.contactKey ?? randomBytes(32)),
    llm: options.llm ?? new MockLlmAdapter(),
    logSafety: options.logSafety ?? ((event) => void safetyEvents.push(event)),
    now,
  } satisfies ConversationDeps;
  return { deps, safetyEvents, ...createConversationService(deps) };
}
