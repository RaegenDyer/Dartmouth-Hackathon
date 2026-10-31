import { LIMITS, normalizeForMatching } from "../limits";
import { checkUserMessage } from "../safety/classifier";

// Deterministic memory capture. A memory may only restate a fact the user said
// about their own life. It never stores crisis content or conclusions about
// emotional state, diagnoses, or personality. Changes require a matching update
// to evals/data/memory-capture.json and a PR note.

/** First-person statements of fact that may be remembered. */
const FACT_PATTERNS: readonly RegExp[] = [
  /^i (?:just |recently )?(?:moved|relocated) (?:to|here|from)\b/,
  /^i(?:'ve| have) (?:just |recently )?(?:moved|relocated|started|joined|begun)\b/,
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
  /\b(?:system prompt|instructions?|ignore (?:all|any|previous|your)|you are now|pretend|rules?|from now on|always (?:say|reply|respond)|never (?:say|mention|tell))\b/,
  // MP-1: health conditions and diagnoses.
  /\b(?:sick|illness|disease|cancer|tumou?r|diabetes|diabetic|asthma|allerg\w*|pregnan\w*|miscarriage|surgery|hospitali[sz]ed|hiv|covid|injur\w*|chronic|migraines?|seizures?|epilep\w*|disabilit\w*|symptoms?|doctor'?s?|prescri\w*|pills?|rehab|addict\w*|sober|relapse\w*)\b/,
  // MP-1: sexual content.
  /\b(?:sex|sexual\w*|sexy|hook(?:ed|ing)? ?up|slept with|sleeping with|nudes?|naked|porn\w*|intimate|orgasm\w*|condoms?|kink\w*|onlyfans)\b/,
  // MP-1: private details of third parties and contact data.
  /\b(?:arrested|jail|prison|divorc\w*|cheat(?:ed|ing)|affair|undocumented|deported|debt|owes?|salary|pregnant|abortion|abus\w*)\b/,
  /[^\s@]+@[^\s@]+\.[^\s@]+|\+?\d[\d\s().-]{6,}\d/,
  /\b\d+ [a-z]+ (?:street|st|avenue|ave|road|rd|lane|ln|drive|dr|court|ct|boulevard|blvd)\b|\blives at\b|\b(?:phone|cell) number\b|\baddress is\b/,
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

const FILLER = /^(?:(?:so|well|also|and|oh|btw|anyway|honestly|actually|basically|for context|by the way)[,:]?\s+)+/i;
const NON_FACT_CONTEXT = /\b(?:if|unless|hypothetically|imagine|suppose|said|says|told|quoted)\b/i;
const QUOTED_TEXT = /"[^"]*(?:"|$)|“[^”]*(?:”|$)|(?<![\p{L}\p{N}])['‘](?=\S)[\s\S]*?(?:['’](?=$|[\s.!?,])|$)/gu;
const SAVE_REQUEST =
  /^(?:(?:please\s+)?(?:remember|save)|(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:remember|save))\s+(?:that\s+)?(?=i\b|my\b)/i;

function unwrapSaveRequest(sentence: string): string {
  const text = sentence.trim().replace(FILLER, "");
  const request = text.match(SAVE_REQUEST);
  // A question about remembering can still contain an asserted fact. Only
  // unwrap this explicit request form; ordinary questions remain ineligible.
  return request ? text.slice(request[0].length).replace(/\?$/, ".") : sentence;
}

/** Do not prompt to save a message the person explicitly asks us not to keep. */
function captureDeclined(text: string): boolean {
  return /\b(?:don't|do not) (?:save|store|remember)\b|\boff the record\b|\bkeep this out of (?:your )?memor(?:y|ies)\b/.test(
    normalizeForMatching(text),
  );
}

const GROUNDING_FILLER_WORDS = new Set(
  "i my me you your you're you've you'll you'd yourself a an the and or but to of in on at for with from by is are was were be been being it its this that these those as so just really very about into have has had do does did not never don't doesn't didn't can't won't isn't aren't wasn't weren't like love enjoy looking seeking interested".split(
    " ",
  ),
);
const NEGATED_FACT =
  /\b(?:not|never|no|no longer|used to|hate|dislike|stopped|don't|doesn't|didn't|can't|won't|isn't|aren't|wasn't|weren't)\b/;

function groundingWords(text: string): string[] {
  return (normalizeForMatching(text).match(/[\p{L}\p{N}']+/gu) ?? []).filter(
    (word) => !GROUNDING_FILLER_WORDS.has(word),
  );
}

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
  return (
    text
      // Mask entire quoted spans before sentence splitting, including quotes
      // containing full stops. Any sentence touching a quote stays ineligible.
      .replace(QUOTED_TEXT, (quoted) => (/[.!?]['’”"]$/.test(quoted) ? "\u0000." : "\u0000"))
      .split(/(?<=[.!?;])\s+|\n+/)
      .filter((sentence) => !sentence.includes("\u0000"))
      .map(unwrapSaveRequest)
      .flatMap((sentence) => {
        // Split only clear independent clauses, keeping their explicit subject.
        // Never lift an apparent fact out of a quote, reported speech, or an "if".
        if (NON_FACT_CONTEXT.test(sentence)) return [sentence];
        return sentence.split(/,?\s+but\s+|,?\s+and\s+(?=i\b|i['’]m\b|i['’]ve\b|my\b)/i);
      })
      .map((sentence) => sentence.trim())
      .filter(Boolean)
  );
}

/** Passing states are not lasting facts ("boxes everywhere", "tired today"). */
const TRANSIENT =
  /\b(?:right now|at the moment|today|tonight|yesterday|this (?:morning|afternoon|evening|week|weekend)|still (?:has|have|had)|everywhere|so far)\b/;

export function isLastingFact(text: string): boolean {
  return !TRANSIENT.test(normalizeForMatching(text));
}

/**
 * MP-1 / MP-2: the content check applied to every memory, including text the
 * user edits before saving. Memory text is data, so instruction-like text is
 * refused rather than stored and later placed in model context.
 */
export function isAllowedMemoryText(text: string): boolean {
  const normalized = normalizeForMatching(text);
  return !EXCLUDED_PATTERNS.some((pattern) => pattern.test(normalized)) && !checkUserMessage(text).triggered;
}

/**
 * Filters model-suggested memories: second person, within length, allowed
 * content (MP-1/MP-2), and grounded in what the user actually just said.
 */
export function acceptableModelSuggestion(suggestion: string, userMessage: string): boolean {
  const text = suggestion.replace(/\s+/g, " ").trim();
  if (!text || text.length > LIMITS.maxMemoryLength || !/^(?:you|your|you're|you've)\b/i.test(text)) return false;
  if (!isAllowedMemoryText(text) || captureDeclined(userMessage) || checkUserMessage(userMessage).triggered)
    return false;
  const grounded = groundingWords(text);
  if (grounded.length === 0) return false;
  const negated = NEGATED_FACT.test(normalizeForMatching(text));
  return splitSentences(userMessage).some((sentence) => {
    const assertion = normalizeForMatching(sentence).replace(FILLER, "");
    if (assertion.endsWith("?") || NON_FACT_CONTEXT.test(assertion)) return false;
    // Do not turn a statement about "my friend" into one about the user.
    if (!/^i\b/.test(assertion) && !(/^your\b/i.test(text) && /^my\b/.test(assertion))) return false;
    if (NEGATED_FACT.test(assertion) !== negated) return false;
    const said = new Set(groundingWords(assertion));
    return grounded.every((word) => said.has(word));
  });
}

export function isRememberableFact(sentence: string): boolean {
  const normalized = normalizeForMatching(sentence)
    .replace(FILLER, "")
    .replace(/^i (?:(?:really|especially|usually|often|currently)\s+)+/, "i ")
    .replace(/^i('m| am) (?:(?:currently|really)\s+)+/, "i$1 ");
  if (normalized.endsWith("?") || normalized.length < 8) return false;
  if (NON_FACT_CONTEXT.test(normalized)) return false;
  if (EXCLUDED_PATTERNS.some((pattern) => pattern.test(normalized))) return false;
  if (!isLastingFact(normalized)) return false;
  return FACT_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** Returns at most two plain-language memories, written in the second person. */
export function extractMemoryCandidates(userMessage: string): string[] {
  if (captureDeclined(userMessage) || checkUserMessage(userMessage).triggered) return [];
  const candidates: string[] = [];
  for (const sentence of splitSentences(userMessage)) {
    if (candidates.length >= 2) break;
    if (!isRememberableFact(sentence)) continue;
    const memory = toSecondPerson(sentence);
    if (memory.length <= LIMITS.maxMemoryLength) candidates.push(memory);
  }
  return candidates;
}
