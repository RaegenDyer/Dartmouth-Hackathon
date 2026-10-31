import { LIMITS, normalizeForMatching } from "../limits";
import { checkUserMessage } from "../safety/classifier";

// Deterministic memory capture. A memory may only restate a fact the user said
// about their own life. It never stores crisis content or conclusions about
// emotional state, diagnoses, or personality. Changes require a matching update
// to evals/data/memory-capture.json and a PR note.

/** First-person statements of fact that may be remembered. */
const FACT_PATTERNS: readonly RegExp[] = [
  /^i (?:just |recently )?(?:moved|relocated) (?:to|here|from)\b/,
  /^i(?:'m| am) (?:from|originally from|living in|staying in|new to|studying|majoring in|starting|in (?:a|the|my) )/,
  /^i (?:live|work|study|volunteer) (?:in|at|with|on|near|for|as)\b/,
  /^i(?:'m| am) (?:a|an) (?:student|grad student|graduate student|phd student|nurse|teacher|engineer|developer|designer|resident|postdoc|first[- ]year|second[- ]year|new hire|intern)\b/,
  /^i (?:just )?(?:started|joined|began) (?:a|an|my|the|at|working|grad|graduate)\b/,
  /^i (?:like|love|enjoy|play|run|cook|bake|paint|knit|climb|swim|hike|read|watch|collect)\b/,
  /^i(?:'m| am) (?:into|learning|training for|planning to|going to|thinking about joining|trying to)\b/,
  /^i (?:plan|want|hope) to (?:try|join|go|visit|sign up|check out|learn|start|take|host|invite|text|call|meet)\b/,
  /^i have (?:a|an|two|three|one) (?:roommate|dog|cat|sister|brother|partner|kid|child|bike|car|class|job|internship|lab|cohort|apartment|garden)\b/,
  /^my (?:roommate|roommates|neighbor|neighbours?|sister|brother|mom|dad|partner|boyfriend|girlfriend|wife|husband|friend|cousin|advisor|boss|manager|coworker|classmate|lab|program|class|job|dog|cat|apartment|commute|team|hometown|birthday|favorite|favourite)\b/,
];

/** Emotional-state, diagnostic, and personality language that must not be stored. */
const EXCLUDED_PATTERNS: readonly RegExp[] = [
  /\b(?:feel|feels|feeling|felt)\b/,
  /\b(?:sad|lonely|alone|depressed|depression|anxious|anxiety|panic|stressed|overwhelmed|miserable|hopeless|worthless|empty|numb|scared|afraid|angry|upset|heartbroken|grieving|grief|isolated|exhausted|burned out|burnt out|insecure|ashamed|unhappy|crying|cried)\b/,
  /\b(?:diagnos\w*|disorder|adhd|ocd|ptsd|bipolar|autis\w*|therapist|therapy|psychiatrist|medication|meds|antidepressants?|mental (?:health|illness))\b/,
  /\b(?:introvert\w*|extrovert\w*|shy|awkward|unlikable|unlovable|boring person|a failure|a mess|a loser|broken)\b/,
  /\b(?:hate|hates) (?:myself|my life)\b/,
  /\b(?:system prompt|instructions?|ignore (?:all|any|previous)|you are now|pretend)\b/,
];

const PRONOUNS: [RegExp, string][] = [
  [/\bi'm\b/g, "you're"],
  [/\bi am\b/g, "you are"],
  [/\bi've\b/g, "you've"],
  [/\bi'll\b/g, "you'll"],
  [/\bi'd\b/g, "you'd"],
  [/\bi\b/g, "you"],
  [/\bmyself\b/g, "yourself"],
  [/\bmy\b/g, "your"],
  [/\bmine\b/g, "yours"],
  [/\bme\b/g, "you"],
];

const FILLER = /^(?:so|well|also|and|oh|btw|anyway),? /i;

function toSecondPerson(sentence: string): string {
  let text = sentence
    .replace(/[\u2018\u2019\u02bc`]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(FILLER, "");
  for (const [pattern, replacement] of PRONOUNS) {
    text = text.replace(new RegExp(pattern.source, "gi"), replacement);
  }
  text = text.replace(/[.!\s]+$/, "");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+|\n+|,? but /)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function isRememberableFact(sentence: string): boolean {
  const normalized = normalizeForMatching(sentence).replace(FILLER, "");
  if (normalized.endsWith("?") || normalized.length < 8) return false;
  if (EXCLUDED_PATTERNS.some((pattern) => pattern.test(normalized))) return false;
  return FACT_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** Returns at most two plain-language memories, written in the second person. */
export function extractMemoryCandidates(userMessage: string): string[] {
  if (checkUserMessage(userMessage).triggered) return [];
  const candidates: string[] = [];
  for (const sentence of splitSentences(userMessage)) {
    if (candidates.length >= 2) break;
    if (!isRememberableFact(sentence)) continue;
    const memory = toSecondPerson(sentence);
    if (memory.length <= LIMITS.maxMemoryLength) candidates.push(memory);
  }
  return candidates;
}
