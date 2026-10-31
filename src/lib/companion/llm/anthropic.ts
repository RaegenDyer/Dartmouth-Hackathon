import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { SYSTEM_PROMPT, formatMemoryBlock, parseModelJson, type LlmAdapter, type LlmRequest } from "./adapter";

/**
 * The reply shape, enforced by the API's structured outputs. Asking for JSON in
 * the prompt alone was unreliable: about half of replies came back as plain text,
 * which silently dropped memory suggestions and the memories-used list.
 */
const ReplySchema = z.object({
  reply: z.string(),
  memories_used: z.array(z.string()),
  memory_suggestions: z.array(z.string()),
});

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
    const response = await this.config.client.messages.parse(
      {
        model: this.config.model,
        max_tokens: 1200,
        system,
        messages: [...request.history, { role: "user", content: request.userMessage }],
        output_config: { format: zodOutputFormat(ReplySchema) },
      },
      { signal },
    );
    // A declined request has no usable reply; the caller shows its safe fallback.
    if (response.stop_reason === "refusal") throw new Error("Model declined the request.");
    const parsed = response.parsed_output;
    if (parsed) {
      return {
        text: parsed.reply.trim(),
        memoriesUsed: parsed.memories_used,
        memorySuggestions: parsed.memory_suggestions.slice(0, 3),
      };
    }
    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();
    return parseModelJson(text);
  }
}
