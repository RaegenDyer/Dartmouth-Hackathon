import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getServerEnvironment } from "@/lib/env/server";

export function createConversationModelClient() {
  const environment = getServerEnvironment();
  return {
    client: new Anthropic({
      apiKey: environment.ANTHROPIC_API_KEY,
      maxRetries: 0,
      timeout: 45_000,
    }),
    model: environment.ANTHROPIC_MODEL,
  };
}
