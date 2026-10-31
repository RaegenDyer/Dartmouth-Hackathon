import type { Scenario, SocialActionStatus } from "@/lib/contracts";

// Ports describe the service boundaries; repositories and orchestration are not
// implemented yet. Database snake_case is mapped to these DTOs server-side.
export interface Actor {
  userId: string;
}

export interface ApprovedMemory {
  id: string;
  content: string;
  expiresAt: string | null;
  version: number;
}

export interface ConversationContext {
  conversationId: string;
  scenario: Scenario;
  contextEpoch: number;
  memoryRevision: number;
  earliestMemoryExpiry: string | null;
  profile: {
    displayName: string;
    city: string;
    interests: string[];
    tone: string;
  };
  approvedMemories: ApprovedMemory[];
  socialActions: {
    id: string;
    title: string;
    status: SocialActionStatus;
    version: number;
  }[];
  messages: { role: "user" | "assistant"; content: string }[];
}

export interface ContextRepository {
  load(actor: Actor, conversationId: string): Promise<ConversationContext>;
  isCurrent(actor: Actor, context: ConversationContext): Promise<boolean>;
}

export interface ConversationModel {
  streamReply(input: {
    context: ConversationContext;
    userMessage: string;
    signal: AbortSignal;
  }): AsyncIterable<{ type: "delta"; text: string }>;
}

export interface BoundaryPolicy {
  // A product-routing decision, not a clinical assessment or diagnosis.
  evaluate(input: { actor: Actor; userMessage: string }): Promise<
    | { outcome: "continue" }
    | { outcome: "support_handoff"; resourceRegion: string | null }
  >;
}
