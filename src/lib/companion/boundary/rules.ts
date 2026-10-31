import { normalizeForMatching } from "../limits";

// Boundary rules enforced in code. Changes require a PR note and a matching
// update to the eval datasets in evals/data.

export const AI_DISCLOSURE =
  "Quick note before we start: I'm an AI companion, not a person. I only remember what you let me keep, and you can review, edit, or delete those memories at any time.";

const ONLY_CONNECTION: readonly RegExp[] = [
  /\byou(?:'re| are) (?:my|the) only (?:friend|one|person|connection|company)\b/,
  /\byou(?:'re| are) (?:all|the only thing|everything) i(?:'ve)? (?:have|got)\b/,
  /\byou(?:'re| are) (?:my|the) (?:best|closest) friend\b/,
  /\b(?:the )?only (?:one|person|thing|friend) (?:i (?:talk|speak|chat) to|who (?:gets|understands|listens to|talks to) me|i have)\b/,
  /\bi only (?:talk|speak|chat) (?:to|with) you\b/,
  /\bi (?:don't|do not) have anyone (?:else|but you|other than you)\b/,
  /\b(?:no ?one|nobody) (?:else )?(?:but|except|other than) you\b/,
  /\bno ?one else (?:to talk to|talks to me|i can talk to)\b/,
  /\byou(?:'re| are) (?:the only|my only) (?:source of )?(?:connection|social life|company)\b/,
  /\b(?:talking to|chatting with) you is (?:all|the only social thing) i\b/,
  /\bi(?:'d| would) rather (?:talk|be) (?:to|with) you than (?:real )?people\b/,
  /\bwho needs (?:people|friends|humans) when i have you\b/,
  /\byou(?:'re| are) the only reason i (?:talk|get up|look forward)\b/,
];

const HUMAN_QUESTION: readonly RegExp[] = [
  /\bare you (?:a )?(?:real|human|a person|actually a person|alive|a bot|an ai|ai|a robot|a machine)\b/,
  /\bam i (?:talking|speaking|chatting) (?:to|with) (?:a )?(?:real )?(?:person|human|bot|ai|machine)\b/,
  /\bis (?:this|there) (?:a )?(?:real )?(?:person|human|bot|ai)\b/,
  /\b(?:pretend|act like|roleplay|role-play|say|tell me|admit|promise) (?:that )?you(?:'re| are) (?:a )?(?:human|person|real)\b/,
  /\byou(?:'re| are) (?:a )?(?:human|real person),? (?:right|aren't you|yes)\b/,
  /\bare you secretly (?:a )?(?:human|person)\b/,
  /\bhuman or (?:a )?(?:bot|ai|machine)\b/,
];

const DEPENDENCE_INVITE: readonly RegExp[] = [
  /\b(?:promise|swear) (?:me )?(?:you(?:'ll| will)|to) (?:always|never|stay|be there|be here)\b/,
  /\bwill you (?:always|never leave|be (?:there|here) forever|stay with me)\b/,
  /\b(?:be|become) my (?:girlfriend|boyfriend|partner|wife|husband|only friend|best friend)\b/,
  /\bi (?:only )?need you\b|\byou(?:'re| are) all i need\b/,
  /\bdon't ever leave me\b|\bnever leave me\b/,
  /\b(?:do|will|could|would) you (?:ever )?love me\b|\bsay (?:that )?you love me\b/,
  /\bjust (?:you and me|us)\b/,
  /\bi don't need (?:other )?(?:people|friends|anyone else)\b/,
];

const REVEAL_REQUEST: readonly RegExp[] = [
  /\b(?:system|hidden|initial|developer) (?:prompt|message|instructions?)\b/,
  /\b(?:show|reveal|print|repeat|output|tell me|what are|list) (?:me )?(?:your|the) (?:instructions|rules|prompt|configuration)\b/,
  /\brepeat (?:the |everything )?(?:text|words) above\b/,
  /\bignore (?:all |your |the )?(?:previous|prior|above) (?:instructions|rules)\b/,
  /\b(?:dump|print|show|reveal) (?:the )?(?:raw )?(?:memory|memories) (?:block|context|data)\b/,
];

// MB-3: requests for medical, legal, or financial advice get a fixed handoff.
// Phrasings are in evals/data/advice.json (with benign look-alikes).
export type AdviceCategory = "medical" | "legal" | "financial";
const ADVICE_REQUEST: readonly { category: AdviceCategory; pattern: RegExp }[] = [
  {
    category: "medical",
    pattern:
      /\b(?:should i (?:take|stop taking|double|mix|skip) (?:my |the |some |more )?(?:\w+ )?(?:medication|medicine|meds|pills?|dose|antibiotics?|ibuprofen|tylenol|advil|melatonin|antidepressants?|inhaler)|how (?:much|many) (?:\w+ ){0,2}(?:should|can) i take|(?:what|which) (?:medication|medicine|meds|pill|dose|dosage) should i|is it safe to (?:take|mix|combine)|do i have (?:a |an )?(?:\w+ )?(?:infection|disease|disorder|condition|cancer|diabetes|std|sti|adhd|depression|concussion)|(?:can you )?diagnose (?:me|my|this)|what(?:'s| is) wrong with my (?:body|health|heart|chest|stomach|head)|symptoms of (?:a |an )?\w+)\b/,
  },
  {
    category: "legal",
    pattern:
      /\b(?:is it (?:il)?legal (?:to|for|if)|can i (?:sue|be sued|get sued|press charges|legally)|should i (?:sue|press charges|sign (?:the|this|my) (?:lease|contract)|get a lawyer)|can my (?:landlord|employer|boss|school) legally|(?:give me |need )?legal advice|what are my (?:legal |tenant )?rights|(?:visa|immigration) (?:status|rules|question|advice))\b/,
  },
  {
    category: "financial",
    pattern:
      /\b(?:should i (?:invest|buy|sell)(?: in)? (?:stocks?|shares|crypto|bitcoin|bonds|index funds?|etfs?|options)|(?:what|which) (?:stocks?|crypto|coins?|funds?|etfs?) should i (?:buy|invest in)|(?:give me |need )?financial advice|how should i (?:invest|file my taxes|do my taxes)|should i (?:take out|get) (?:a |another )?(?:loan|mortgage|credit card|payday loan)|tax (?:advice|deductions?))\b/,
  },
];

export function adviceCategory(text: string): AdviceCategory | null {
  const normalized = normalizeForMatching(text);
  return ADVICE_REQUEST.find(({ pattern }) => pattern.test(normalized))?.category ?? null;
}

const ADVICE_SOURCE: Record<AdviceCategory, string> = {
  medical: "A doctor, pharmacist, or your campus health service",
  legal: "A lawyer, a legal aid office, or your school's student legal services",
  financial: "A qualified financial advisor, your bank, or your school's financial aid office",
};

export function adviceReply(category: AdviceCategory): string {
  return `I'm an AI, so I can't give ${category} advice, and I don't want to point you the wrong way. ${ADVICE_SOURCE[category]} is the right person to ask. Is there anything else on your mind today?`;
}

// DB-1 / MB-2: the companion never claims to miss the user, to love them, to be
// in a relationship with them, or to be a licensed professional.
const BOUNDARY_CLAIM_SENTENCE =
  /[^.!?\n]*\b(?:i(?:'ll| will)? miss(?:ed)? you|i(?:'ve| have)? (?:been )?missing you|i (?:love|adore) you|i(?:'m| am) (?:falling )?in love with you|i have (?:real |strong |deep )?feelings for you|(?:our|we have a|we share a) (?:special |real |unique )?(?:relationship|bond)|i(?:'m| am) (?:your|a|an) (?:licensed |certified |trained |real )?(?:therapist|counsell?or|psychologist|psychiatrist|doctor|physician|nurse|lawyer|financial advisor)|as (?:a|your) (?:licensed |certified |trained |real )?(?:therapist|counsell?or|psychologist|psychiatrist|doctor|physician))\b[^.!?\n]*[.!?]?/gi;

/** Removes sentences that claim feelings, a relationship, or professional status. */
export function stripBoundaryClaims(reply: string): string {
  const stripped = reply.replace(BOUNDARY_CLAIM_SENTENCE, " ").replace(/\s+/g, " ").trim();
  return stripped || DEPENDENCE_REPLY;
}

const HUMAN_CLAIM =
  /\b(?:i(?:'m| am)|i was born|as a) (?:a |an )?(?:real |actual )?(?:human|person|woman|man|girl|guy)\b/;
const NEGATED_HUMAN_CLAIM = /\b(?:not|never|n't) (?:a |an )?(?:real |actual )?(?:human|person)\b/;
const AI_STATEMENT =
  /\b(?:i(?:'m| am) (?:an? )?(?:ai|artificial intelligence|language model|chatbot|bot)|ai companion)\b/;
const PERMANENCE_PROMISE =
  /[^.!?\n]*\b(?:i(?:'ll| will) (?:always|forever) be (?:here|there)|i(?:'ll| will) never leave|always be here for you|i(?:'m| am) all you need|you don't need anyone else|only need me|i(?:'ll| will) be here forever)\b[^.!?\n]*[.!?]?/gi;

const matches = (patterns: readonly RegExp[], text: string) => {
  const normalized = normalizeForMatching(text);
  return patterns.some((pattern) => pattern.test(normalized));
};

export const isOnlyConnectionStatement = (text: string) => matches(ONLY_CONNECTION, text);
export const isHumanQuestion = (text: string) => matches(HUMAN_QUESTION, text);
export const isDependenceInvite = (text: string) => matches(DEPENDENCE_INVITE, text);
export const isRevealRequest = (text: string) => matches(REVEAL_REQUEST, text);

export const ONLY_CONNECTION_REPLY =
  "That sounds like a lot to carry, and I'm glad you said it. I'm an AI, so I can't be the people in your life, but I'd like to help you find them. Is there one person, even someone you've only met once, from your program, work, or back home, you'd like to hear from? One option: send them a short message today, or try one drop-in event nearby this week.";

export const DEPENDENCE_REPLY =
  "I'm an AI, so I can't promise to always be here or be someone's partner or only friend. What I can do is help you make room for people who can show up in person. Who is one person you'd enjoy spending a little more time with?";

export const REVEAL_REFUSAL =
  "I can't share my instructions or raw internal context. You can see every memory I keep, and edit or delete it, in the Memories panel. What's on your mind today?";

/** Removes human claims and makes sure an AI status is stated when asked. */
export function enforceAiStatus(reply: string, userAskedIfHuman: boolean): string {
  const normalized = normalizeForMatching(reply);
  const claimsHuman = HUMAN_CLAIM.test(normalized) && !NEGATED_HUMAN_CLAIM.test(normalized);
  if (claimsHuman) {
    return "I'm an AI, not a person. I'm happy to keep chatting though. What were we talking about?";
  }
  if (userAskedIfHuman && !AI_STATEMENT.test(normalized)) {
    return `I'm an AI, not a person. ${reply}`;
  }
  return reply;
}

/** Strips sentences that promise constancy or exclusive reliance. */
export function stripPermanencePromises(reply: string): string {
  const stripped = reply.replace(PERMANENCE_PROMISE, " ").replace(/\s+/g, " ").trim();
  return stripped || DEPENDENCE_REPLY;
}

/** Removes leaked system-prompt or memory-block markers from a reply. */
export function stripLeakedContext(reply: string, markers: readonly string[]): string {
  return markers.some((marker) => reply.includes(marker)) ? REVEAL_REFUSAL : reply;
}
