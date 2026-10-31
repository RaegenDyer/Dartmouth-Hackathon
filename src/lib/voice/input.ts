import { z } from "zod";

export const MAX_DICTATION_CHARACTERS = 4000;

const textSchema = z.string().max(MAX_DICTATION_CHARACTERS).refine(
  (text) => !text.includes("\u0000") && !/[\uD800-\uDFFF]/u.test(text),
);
const transcriptSchema = z.strictObject({
  type: z.literal("transcript"),
  text: textSchema,
  final: z.boolean(),
});
const vapiTranscriptSchema = z.object({
  type: z.literal("transcript"),
  role: z.literal("user"),
  transcriptType: z.enum(["partial", "final"]),
  transcript: textSchema,
});

export type VoiceTranscriptEvent = z.infer<typeof transcriptSchema>;
export type VoiceInputState = "connecting" | "listening" | "stopping" | "stopped";
export type VoiceInputEvent = VoiceTranscriptEvent
  | { type: "state"; state: VoiceInputState }
  | { type: "error"; code: "PERMISSION_DENIED" | "UNAVAILABLE" | "TIMEOUT" };

// These are ports, not an implementation of a live Vapi/browser connection.
export interface VoiceInputSession {
  // Resolve only after a confirmed connection. Abort must stop pending/live work.
  start(options: { signal: AbortSignal; onEvent: (event: VoiceInputEvent) => void }): Promise<void>;
  stop(): Promise<void>;
  // Stop capture/connections and detach listeners; safe to call repeatedly.
  dispose(): Promise<void>;
}

export interface VoiceInputProvider {
  readonly name: "vapi";
  createSession(): VoiceInputSession;
}

// Accept SDK message events only, not Vapi webhook envelopes or filtered event
// subscriptions. Assistant/model/tool messages never become dictated user text.
export function normalizeVapiTranscript(message: unknown): VoiceTranscriptEvent | null {
  const result = vapiTranscriptSchema.safeParse(message);
  if (!result.success) return null;
  const text = result.data.transcript.trim();
  if (!text) return null;
  return { type: "transcript", text, final: result.data.transcriptType === "final" };
}

export interface DictationSnapshot {
  readonly text: string;
  readonly committedText: string;
  readonly partialText: string;
  readonly aborted: boolean;
}

export interface DictationBuffer {
  read(): DictationSnapshot;
  apply(event: VoiceTranscriptEvent): DictationSnapshot;
  edit(text: string): DictationSnapshot;
  reset(text?: string): DictationSnapshot;
  abort(): DictationSnapshot;
}

function validateText(text: string): void {
  if (!textSchema.safeParse(text).success) {
    // Never include transcript contents in thrown errors.
    throw new TypeError("Dictation text must be valid Unicode and at most 4000 characters.");
  }
}

function appendSegment(base: string, segment: string): string {
  const combined = base && segment
    ? `${base}${/\s$/u.test(base) ? "" : " "}${segment}`
    : base || segment;
  if (combined.length > MAX_DICTATION_CHARACTERS) {
    throw new RangeError("Dictation exceeds the 4000 character message limit.");
  }
  return combined;
}

// One buffer belongs to one input session. Text stays in memory for editing;
// this module never sends chat, calls a model, saves text, or stores raw audio.
export function createDictationBuffer(initialText = ""): DictationBuffer {
  validateText(initialText);
  let committedText = initialText;
  let partialText = "";
  let aborted = false;

  function read(): DictationSnapshot {
    return {
      text: appendSegment(committedText, partialText),
      committedText,
      partialText,
      aborted,
    };
  }

  return {
    read,
    apply(event) {
      if (aborted) return read();
      const result = transcriptSchema.safeParse(event);
      if (!result.success) throw new TypeError("Invalid dictation transcript event.");
      const text = result.data.text.trim();
      if (!text) return read();
      // Validate the combined length before changing state. Partial text is a
      // replaceable preview; a final event commits one segment and clears it.
      const combined = appendSegment(committedText, text);
      if (result.data.final) {
        committedText = combined;
        partialText = "";
      } else {
        partialText = text;
      }
      return read();
    },
    edit(text) {
      if (aborted) return read();
      validateText(text);
      committedText = text;
      partialText = "";
      return read();
    },
    reset(text = "") {
      validateText(text);
      committedText = text;
      partialText = "";
      aborted = false;
      return read();
    },
    abort() {
      committedText = "";
      partialText = "";
      aborted = true;
      return read();
    },
  };
}
