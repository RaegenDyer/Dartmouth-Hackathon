import { contentWords } from "../disclosure/enforce";
import { normalizeForMatching } from "../limits";
import type { LlmAdapter, LlmRequest } from "./adapter";

/**
 * Deterministic adapter for tests, CI, and local development without a key.
 * It claims memories that share a content word with the user message but does
 * not name them, so code-level disclosure enforcement is always exercised.
 */
export class MockLlmAdapter implements LlmAdapter {
  async generate(request: LlmRequest) {
    const message = normalizeForMatching(request.userMessage);
    const words = new Set(contentWords(request.userMessage));
    const used = request.memories
      .filter((memory) => contentWords(memory.text).some((word) => words.has(word)))
      .map((memory) => memory.id);
    return { text: this.reply(message, request.tone), memoriesUsed: used };
  }

  private reply(message: string, tone: string | null) {
    const opener = tone && /playful|fun|silly|casual/.test(tone) ? "Ooh, love that." : "Thanks for telling me.";
    if (/\b(?:day|today|morning|tonight|week)\b/.test(message)) {
      return `${opener} What was the best part of your day, even if it was small?`;
    }
    if (/\b(?:activit|things to do|bored|hobby|weekend|club|find)\w*/.test(message)) {
      return `${opener} A few ideas: a weekly trivia night, a drop-in run club, or a free museum evening. Which sounds closest to your kind of thing?`;
    }
    return `${opener} Tell me a bit more about that?`;
  }
}
