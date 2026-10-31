// The server appends the weekly small step to a reply using formatSuggestion()
// (src/lib/companion/scheduler/weekly.ts). The UI shows it as its own card.
const PREFIX = "One small idea for this week, only if it sounds good: ";
const SUFFIX = ". No pressure either way.";

export function splitStep(text: string): { body: string; step: string | null } {
  const start = text.lastIndexOf(`\n\n${PREFIX}`);
  if (start < 0 || !text.endsWith(SUFFIX)) return { body: text, step: null };
  const step = text.slice(start + 2 + PREFIX.length, text.length - SUFFIX.length).trim();
  return step ? { body: text.slice(0, start).trimEnd(), step } : { body: text, step: null };
}
