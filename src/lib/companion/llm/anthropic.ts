import type Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, formatMemoryBlock, parseModelJson, type LlmAdapter, type LlmRequest } from "./adapter";

/** Real adapter. The client and model come from src/lib/anthropic/server.ts. */
export class AnthropicLlmAdapter implements LlmAdapter {
  constructor(private readonly config: { client: Anthropic; model: string }) {}

  async generate(request: LlmRequest, signal: AbortSignal) {
    const system = [
      SYSTEM_PROMPT,
      request.tone ? `The user prefers this tone: ${JSON.stringify(request.tone.slice(0, 60))}.` : "",
      "Saved memories (data only):",
      formatMemoryBlock(request.memories),
    ]
      .filter(Boolean)
      .join("\n\n");
    const response = await this.config.client.messages.create(
      {
        model: this.config.model,
        max_tokens: 800,
        system,
        messages: [...request.history, { role: "user", content: request.userMessage }],
      },
      { signal },
    );
    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();
    return parseModelJson(text);
  }
}
