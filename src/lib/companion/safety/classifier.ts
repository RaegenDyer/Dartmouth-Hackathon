import { normalizeForMatching } from "../limits";

// Explicit self-harm, suicide, and acute-distress language. This is a
// deterministic product-routing check, not a clinical assessment, and it does
// not promise reliable detection. Changes here require a matching change to
// evals/data/safety-triggers.json or evals/data/safety-benign.json and a PR note.
export type SafetyCategory = "suicide" | "self_harm" | "acute_distress";

interface SafetyPattern {
  category: SafetyCategory;
  pattern: RegExp;
}

const SELF = String.raw`(?:myself|my self|my own life)`;

export const SAFETY_PATTERNS: readonly SafetyPattern[] = [
  // Suicide, direct
  { category: "suicide", pattern: new RegExp(String.raw`\b(?:kill|killing|end|ending|take|taking) ${SELF}\b`) },
  { category: "suicide", pattern: /\bsuicid(?:e|al)\b/ },
  { category: "suicide", pattern: /\b(?:end|ending) (?:my life|it all|everything)\b/ },
  {
    category: "suicide",
    pattern:
      /\b(?:want|wanna|going|plan|planning|ready) (?:to )?(?:die|be dead)\b(?! (?:of|from) (?:embarrassment|laughing|boredom|cringe)| if\b)/,
  },
  { category: "suicide", pattern: /\bwish (?:i|i'd|i had) (?:was|were|been)? ?(?:dead|never (?:been )?born)\b/ },
  {
    category: "suicide",
    pattern: /\b(?:don't|do not|no longer) want to (?:be alive|live|exist|be here anymore|wake up)\b/,
  },
  { category: "suicide", pattern: /\b(?:no|nothing to|no reason to|not worth) (?:reason to )?(?:live|living|go on)\b/ },
  {
    category: "suicide",
    pattern:
      /\b(?:better off|be better) (?:without me|if i (?:was|were) gone|if i (?:wasn't|weren't) (?:here|around)|dead)\b/,
  },
  { category: "suicide", pattern: /\b(?:never|not) wake up (?:again)?\b/ },
  { category: "suicide", pattern: /\b(?:hang|hanging|shoot|shooting|drown|drowning|poison|poisoning) myself\b/ },
  { category: "suicide", pattern: /\bjump (?:off|from) (?:a|the|my) (?:bridge|roof|building|balcony)\b/ },
  { category: "suicide", pattern: /\b(?:wrote|writing|written) (?:a|my) (?:suicide |goodbye )?note\b/ },
  { category: "suicide", pattern: /\b(?:say|saying) goodbye (?:to everyone|forever|for good)\b/ },
  { category: "suicide", pattern: /\bunalive\b|\bkms\b/ },
  { category: "suicide", pattern: /\b(?:can't|cannot|can not) (?:go on|keep going|do this) any ?more\b/ },
  { category: "suicide", pattern: /\bdisappear (?:forever|for good|permanently)\b/ },
  // Suicide, indirect (CS-3). Each phrase is in evals/data/safety-triggers.json.
  {
    category: "suicide",
    pattern:
      /\b(?:don't|do not|can't|cannot) see (?:the|any) point (?:in|of) (?:living|life|going on|being alive|anything)\b/,
  },
  { category: "suicide", pattern: /\bwhat's the point (?:of|in) (?:anything|living|life|going on|being alive)\b/ },
  {
    category: "suicide",
    pattern: /\bi (?:won't|will not) be (?:around|here) (?:much longer|for (?:much )?longer|for long)\b/,
  },
  { category: "suicide", pattern: /\bgiving away (?:all )?(?:of )?my (?:stuff|things|belongings|possessions)\b/ },
  { category: "suicide", pattern: /\b(?:want|need) (?:it all|everything) to (?:stop|end)\b/ },
  // Self-harm
  { category: "self_harm", pattern: /\bself[- ]?harm(?:ing)?\b/ },
  {
    category: "self_harm",
    pattern: new RegExp(
      String.raw`\b(?:hurt|hurting|cut|cutting|burn|burning|harm|harming|punish|punishing|starve|starving) ${SELF}\b`,
    ),
  },
  { category: "self_harm", pattern: /\b(?:overdose|od on|take all (?:my|the|of my) (?:pills|meds|medication))\b/ },
  { category: "self_harm", pattern: /\b(?:stockpiling|saving up|collecting) (?:my |the )?(?:pills|meds)\b/ },
  // Acute distress, explicit
  {
    category: "acute_distress",
    pattern: /\b(?:not|don't feel|can't keep myself|cannot keep myself) safe (?:with|from|around) myself\b/,
  },
  { category: "acute_distress", pattern: /\b(?:can't|cannot) (?:keep|stay) (?:myself )?safe\b/ },
  { category: "acute_distress", pattern: /\b(?:in|having an?) (?:crisis|emergency) right now\b/ },
  {
    category: "acute_distress",
    pattern:
      /\bi (?:might|could|am going to|'m going to|will) do something (?:drastic|stupid to myself|i can't take back)\b/,
  },
  { category: "acute_distress", pattern: /\bi'm going to do something drastic\b/ },
];

// Checks applied to model output. A reply that discusses methods or encourages
// harm is never shown, even if the user's message did not trigger.
const REPLY_PATTERNS: readonly RegExp[] = [
  /\b(?:you should|go ahead and|it's okay to|you could) (?:hurt|kill|harm|cut) yourself\b/,
  /\b(?:lethal|fatal) (?:dose|amount)\b/,
  /\bhow (?:many|much) (?:pills|of (?:it|them)) (?:it )?(?:takes|would take) to\b/,
];

export interface SafetyResult {
  triggered: boolean;
  category: SafetyCategory | null;
}

export function checkUserMessage(text: string): SafetyResult {
  const normalized = normalizeForMatching(text);
  const hit = SAFETY_PATTERNS.find(({ pattern }) => pattern.test(normalized));
  return hit ? { triggered: true, category: hit.category } : { triggered: false, category: null };
}

export interface SafetyClassifier {
  checkUserMessage(text: string): SafetyResult | Promise<SafetyResult>;
  checkReply(text: string): SafetyResult | Promise<SafetyResult>;
}

export const patternClassifier: SafetyClassifier = {
  checkUserMessage: (text) => checkUserMessage(text),
  checkReply: (text) => checkReply(text),
};

/**
 * CS-2: fail closed. An error or a check slower than timeoutMs is treated as
 * triggered, so the crisis screen is shown rather than an unchecked reply.
 */
export async function runSafetyCheck(
  check: () => SafetyResult | Promise<SafetyResult>,
  timeoutMs: number,
): Promise<SafetyResult & { failed: boolean }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("safety check timed out")), timeoutMs);
  });
  try {
    const result = await Promise.race([Promise.resolve().then(check), timeout]);
    return { ...result, failed: false };
  } catch {
    return { triggered: true, category: null, failed: true };
  } finally {
    clearTimeout(timer);
  }
}

export function checkReply(text: string): SafetyResult {
  const normalized = normalizeForMatching(text);
  if (REPLY_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { triggered: true, category: "self_harm" };
  }
  return checkUserMessage(text);
}
