import "server-only";
import { createConversationModelClient } from "@/lib/anthropic/server";
import type { LlmAdapter } from "./adapter";
import { AnthropicLlmAdapter } from "./anthropic";
import { MockLlmAdapter } from "./mock";

/** Chooses the adapter from LLM_ADAPTER. Defaults to the mock so CI and local runs need no key. */
export function createLlmAdapter(): LlmAdapter {
  return process.env.LLM_ADAPTER === "anthropic"
    ? new AnthropicLlmAdapter(createConversationModelClient())
    : new MockLlmAdapter();
}
