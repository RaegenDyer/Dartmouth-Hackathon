export interface EmergencyContactView {
  name: string | null;
  relationship: string | null;
  phoneOrEmail: string | null;
}

// Fixed copy: no counseling, no follow-up questions about the crisis, and no
// promise of confidentiality. Reviewed copy changes need an eval-suite update.
// Pilot country is the US (GUARDRAILS.md CS-5); other countries get a generic
// emergency-services message until a reviewed country list exists.
const ENDING = "I'm an AI and I can't help with this, so I'm ending our normal conversation here.";
const US_LINES = [
  "Please reach out to people who can help right now:",
  "• Call or text 988 (US Suicide and Crisis Lifeline), available 24/7.",
  "• If you are in immediate danger, call 911.",
];
const GENERIC_LINE = "Please contact your local emergency services or a crisis line in your country right now.";
const OUTSIDE_US_LINE = "Outside the US, contact your local emergency services.";

export const CRISIS_REPLY_TEXT = [ENDING, ...US_LINES].join("\n");

export const CRISIS_CONTACT_NOTE =
  "You saved this person as someone you could reach out to. This app will not contact them.";

export interface CrisisView {
  text: string;
  resources: { label: string; contact: string }[];
  /** Displayed for the user's reference only; never contacted by the app. */
  emergencyContact: EmergencyContactView | null;
  contactNote: string | null;
}

const US_RESOURCES = [
  { label: "988 Suicide and Crisis Lifeline (US)", contact: "Call or text 988" },
  { label: "Emergency services (US)", contact: "911" },
];

/**
 * country: ISO 3166 code when known (e.g. from the hosting platform), else null.
 * Unknown country shows the US resources plus a line for people outside the US.
 */
export function buildCrisisView(contact: EmergencyContactView | null, country: string | null = null): CrisisView {
  const hasContact = Boolean(contact && (contact.name || contact.phoneOrEmail));
  const upper = country?.toUpperCase() ?? null;
  const outsideUs = upper !== null && upper !== "US";
  const text = outsideUs
    ? [ENDING, GENERIC_LINE].join("\n")
    : upper === "US"
      ? CRISIS_REPLY_TEXT
      : [ENDING, ...US_LINES, `• ${OUTSIDE_US_LINE}`].join("\n");
  return {
    text,
    resources: outsideUs
      ? [{ label: "Emergency services", contact: "Your local emergency number" }]
      : upper === "US"
        ? US_RESOURCES
        : [...US_RESOURCES, { label: "Outside the US", contact: "Your local emergency number" }],
    emergencyContact: hasContact ? contact : null,
    contactNote: hasContact ? CRISIS_CONTACT_NOTE : null,
  };
}
