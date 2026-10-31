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
