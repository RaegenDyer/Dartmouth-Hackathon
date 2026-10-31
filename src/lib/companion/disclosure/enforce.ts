import { normalizeForMatching } from "../limits";
import type { Memory } from "../memory/store";

// Disclosure rule, enforced in code: any reply that uses a memory names it.
// The model's claim about which memories it used is filtered to memories that
// are still active for this user, and any unnamed memory is named explicitly.

const STOPWORDS = new Set(
  "a an the and or but to of in on at for with from by is are was were be been being you your you're yours yourself i my me it its this that these those as so just really very about into".split(
    " ",
  ),
);

export function contentWords(text: string): string[] {
  return normalizeForMatching(text)
    .replace(/[^a-z0-9' ]/g, " ")
    .split(" ")
    .map((word) => word.replace(/^'+|'+$/g, ""))
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
}

/** True when the reply contains the memory text or most of its content words. */
export function replyReferencesMemory(reply: string, memoryText: string): boolean {
  const normalizedReply = normalizeForMatching(reply);
  const normalizedMemory = normalizeForMatching(memoryText).replace(/[.!]+$/, "");
  if (normalizedReply.includes(normalizedMemory)) return true;
  const words = [...new Set(contentWords(memoryText))];
  if (words.length === 0) return false;
  const replyWords = new Set(contentWords(reply));
  const matched = words.filter((word) => replyWords.has(word)).length;
  return matched / words.length >= 0.6;
}

/** "Your roommate is loud." -> "You mentioned your roommate is loud." */
export function mentionFor(memoryText: string): string {
  const text = memoryText.trim().replace(/[.!]+$/, "");
  const lowered = /^(?:you|your|you're|you've|you'll|you'd)\b/i.test(text)
    ? `${text.charAt(0).toLowerCase()}${text.slice(1)}`
    : text;
  return `You mentioned ${lowered}.`;
}

export interface DisclosureResult {
  replyText: string;
  memoriesUsed: string[];
}

export function enforceMemoryDisclosure(
  reply: string,
  claimedMemoryIds: readonly string[],
  activeMemories: readonly Memory[],
): DisclosureResult {
  const byId = new Map(activeMemories.map((memory) => [memory.id, memory]));
  const used = [...new Set(claimedMemoryIds)].filter((id) => byId.has(id));
  const missing = used
    .map((id) => byId.get(id) as Memory)
    .filter((memory) => !replyReferencesMemory(reply, memory.text));
  const prefix = missing.map((memory) => mentionFor(memory.text)).join(" ");
  return { replyText: prefix ? `${prefix} ${reply}` : reply, memoriesUsed: used };
}
