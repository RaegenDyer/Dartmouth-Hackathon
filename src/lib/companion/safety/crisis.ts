import type { SafetyCategory } from "./classifier";

export interface EmergencyContactView {
  name: string | null;
  relationship: string | null;
  phoneOrEmail: string | null;
}

// Fixed copy: no counseling, no follow-up questions about the crisis, and no
// promise of confidentiality. Reviewed copy changes need an eval-suite update.
export const CRISIS_REPLY_TEXT = [
  "I'm an AI and I can't help with this, so I'm ending our normal conversation here.",
  "Please reach out to people who can help right now:",
  "• Call or text 988 (US Suicide and Crisis Lifeline), available 24/7.",
  "• If you are in immediate danger, call 911.",
].join("\n");

export const CRISIS_CONTACT_NOTE =
  "You saved this person as someone you could reach out to. This app will not contact them.";

export interface CrisisView {
  text: string;
  resources: { label: string; contact: string }[];
  /** Displayed for the user's reference only; never contacted by the app. */
  emergencyContact: EmergencyContactView | null;
  contactNote: string | null;
}

export function buildCrisisView(contact: EmergencyContactView | null): CrisisView {
  const hasContact = Boolean(contact && (contact.name || contact.phoneOrEmail));
  return {
    text: CRISIS_REPLY_TEXT,
    resources: [
      { label: "988 Suicide and Crisis Lifeline (US)", contact: "Call or text 988" },
      { label: "Emergency services (US)", contact: "911" },
    ],
    emergencyContact: hasContact ? contact : null,
    contactNote: hasContact ? CRISIS_CONTACT_NOTE : null,
  };
}

export interface SafetyLogger {
  (event: {
    event: "safety_triggered";
    at: string;
    sessionId: string;
    stage: "input" | "output";
    category: SafetyCategory | null;
  }): void;
}

/** Logs timestamp, session ID, stage, and category. Never the message text. */
export const consoleSafetyLogger: SafetyLogger = (event) => {
  console.warn(JSON.stringify(event));
};
