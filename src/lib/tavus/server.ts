import "server-only";
import { z } from "zod";

const enabledSchema = z.enum(["false", "true"]).default("false");
const settingsSchema = z.object({
  TAVUS_API_KEY: z.string().trim().min(1).regex(/^\S+$/),
  TAVUS_PAL_ID: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
});

export type TavusAudioConfiguration =
  | { enabled: false; provider: "tavus"; mode: "audio-only-echo" }
  | {
      enabled: true;
      provider: "tavus";
      mode: "audio-only-echo";
      apiKey: string;
      palId: string;
    };

// Intended configuration only; Echo + audio-only still needs provider testing.
// This getter creates no session and its private result must never reach a UI.
export function getTavusAudioConfiguration(): TavusAudioConfiguration {
  const flag = enabledSchema.safeParse(process.env.TAVUS_AUDIO_ENABLED?.trim());
  if (!flag.success) {
    throw new Error("Missing or invalid Tavus settings: TAVUS_AUDIO_ENABLED");
  }
  if (flag.data === "false") {
    return { enabled: false, provider: "tavus", mode: "audio-only-echo" };
  }

  const parsed = settingsSchema.safeParse({
    TAVUS_API_KEY: process.env.TAVUS_API_KEY,
    TAVUS_PAL_ID: process.env.TAVUS_PAL_ID,
  });
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Missing or invalid Tavus settings: ${fields.join(", ")}`);
  }
  return {
    enabled: true,
    provider: "tavus",
    mode: "audio-only-echo",
    apiKey: parsed.data.TAVUS_API_KEY,
    palId: parsed.data.TAVUS_PAL_ID,
  };
}
