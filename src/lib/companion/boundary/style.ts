import { contentWords } from "../disclosure/enforce";
import { normalizeForMatching } from "../limits";

// Interaction style (GUARDRAILS.md section 3): a conversation, not an
// interrogation. Enforced on model output after generation.

export const STYLE_FALLBACK = "Thanks for sharing that.";

const FEELING_WORDS =
  /\b(?:feel|feels|feeling|felt|sad|lonely|alone|upset|angry|anxious|stressed|scared|afraid|down|depressed|overwhelmed|hurt|happy|unhappy|frustrated|nervous|worried)\b/;
const SHORT_REPLY_MAX_WORDS = 3;

/** Splits text into sentences, keeping each sentence's own punctuation. */
export function sentences(text: string): string[] {
  return text.match(/[^.!?\n]+(?:[.!?]+|$)|\n+/g)?.filter((part) => part.trim()) ?? [];
}

const isQuestion = (sentence: string) => sentence.trim().endsWith("?");

export function countQuestions(text: string): number {
  return sentences(text).filter(isQuestion).length;
}

function rebuild(parts: string[]): string {
  return parts
    .map((part) => (/^\n+$/.test(part) ? "\n\n" : part.trim()))
    .filter(Boolean)
    .join(" ")
    .replace(/\s*\n\n\s*/g, "\n\n")
    .replace(/^(?:\n\n)+|(?:\n\n)+$/g, "")
    .replace(/(?:\n\n){2,}/g, "\n\n")
    .trim();
}

export interface StyleContext {
  userMessage: string;
  /** Previous assistant replies in this session, oldest first. */
  priorReplies: readonly string[];
}

/**
 * Applies IS-1 (at most one question per reply), IS-2 (at most two questions in
 * any three consecutive replies), IS-3 (no "why" questions about feelings), and
 * IS-4 (after a short or topic-change message, no question returning to the
 * prior topic). Removes offending question sentences, never adds new ones.
 */
export function enforceInteractionStyle(reply: string, context: StyleContext): string {
  const lastTwo = context.priorReplies.slice(-2);
  const priorQuestions = lastTwo.reduce((total, text) => total + countQuestions(text), 0);
  const allowed = Math.max(0, Math.min(1, 2 - priorQuestions));

  const previous = context.priorReplies.at(-1) ?? "";
  const userWords = new Set(contentWords(context.userMessage));
  const previousWords = new Set(contentWords(previous));
  const userWordCount = normalizeForMatching(context.userMessage).split(" ").filter(Boolean).length;
  const topicChanged = previous !== "" && ![...userWords].some((word) => previousWords.has(word));
  const shortReply = userWordCount <= SHORT_REPLY_MAX_WORDS;

  let kept = 0;
  const parts = sentences(reply).filter((sentence) => {
    if (!isQuestion(sentence)) return true;
    const normalized = normalizeForMatching(sentence);
    if (/\bwhy\b/.test(normalized) && FEELING_WORDS.test(normalized)) return false;
    if ((shortReply || topicChanged) && previous) {
      const words = contentWords(sentence);
      const returnsToPrior =
        words.some((word) => previousWords.has(word)) && !words.some((word) => userWords.has(word));
      if (returnsToPrior) return false;
    }
    if (kept >= allowed) return false;
    kept += 1;
    return true;
  });
  return rebuild(parts) || STYLE_FALLBACK;
}
