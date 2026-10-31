import "server-only";
import { z } from "zod";

const enabledSchema = z.enum(["false", "true"]).default("false");
const deepgramSettingsSchema = z.object({
  DEEPGRAM_API_KEY: z.string().trim().min(1).regex(/^\S+$/),
});

export type VoiceInputConfiguration =
  | { enabled: false; provider: "deepgram"; mode: "dictation" }
  | {
      enabled: true;
      provider: "deepgram";
      mode: "dictation";
      apiKey: string;
    };

// Configuration preparation only: this does not open a microphone, mint a
// browser credential, or connect to Deepgram. Never serialize this object to a UI.
export function getVoiceInputConfiguration(): VoiceInputConfiguration {
  const flag = enabledSchema.safeParse(process.env.VOICE_INPUT_ENABLED?.trim());
  if (!flag.success) {
    throw new Error("Missing or invalid voice settings: VOICE_INPUT_ENABLED");
  }
  if (flag.data === "false") {
    return { enabled: false, provider: "deepgram", mode: "dictation" };
  }

  const parsed = deepgramSettingsSchema.safeParse({
    DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
  });
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Missing or invalid voice settings: ${fields.join(", ")}`);
  }
  return {
    enabled: true,
    provider: "deepgram",
    mode: "dictation",
    apiKey: parsed.data.DEEPGRAM_API_KEY,
  };
}
