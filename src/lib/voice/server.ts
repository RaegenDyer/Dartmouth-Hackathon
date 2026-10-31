import "server-only";
import { z } from "zod";

const enabledSchema = z.enum(["false", "true"]).default("false");
const vapiSettingsSchema = z.object({
  VAPI_PRIVATE_KEY: z.string().trim().min(1).regex(/^\S+$/),
  VAPI_ASSISTANT_ID: z.uuid(),
});

export type VoiceInputConfiguration =
  | { enabled: false; provider: "vapi"; mode: "dictation" }
  | {
      enabled: true;
      provider: "vapi";
      mode: "dictation";
      privateKey: string;
      assistantId: string;
    };

// Configuration preparation only: this does not open a microphone, mint a
// browser credential, or start a Vapi call. Never serialize this object to a UI.
export function getVoiceInputConfiguration(): VoiceInputConfiguration {
  const flag = enabledSchema.safeParse(process.env.VOICE_INPUT_ENABLED?.trim());
  if (!flag.success) {
    throw new Error("Missing or invalid voice settings: VOICE_INPUT_ENABLED");
  }
  if (flag.data === "false") {
    return { enabled: false, provider: "vapi", mode: "dictation" };
  }

  const parsed = vapiSettingsSchema.safeParse({
    VAPI_PRIVATE_KEY: process.env.VAPI_PRIVATE_KEY,
    VAPI_ASSISTANT_ID: process.env.VAPI_ASSISTANT_ID?.trim(),
  });
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Missing or invalid voice settings: ${fields.join(", ")}`);
  }
  return {
    enabled: true,
    provider: "vapi",
    mode: "dictation",
    privateKey: parsed.data.VAPI_PRIVATE_KEY,
    assistantId: parsed.data.VAPI_ASSISTANT_ID,
  };
}
