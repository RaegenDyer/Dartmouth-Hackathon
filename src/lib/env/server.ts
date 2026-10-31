import "server-only";
import { z } from "zod";

const serverEnvironmentSchema = z.object({
  ANTHROPIC_API_KEY: z.string().trim().min(1).regex(/^\S+$/),
  ANTHROPIC_MODEL: z.string().trim().min(1).regex(/^\S+$/),
});

export function getServerEnvironment() {
  const parsed = serverEnvironmentSchema.safeParse({
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
  });
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join("."));
    // Report field names only. Never log configuration values or Zod input.
    throw new Error(`Missing or invalid server settings: ${fields.join(", ")}`);
  }
  return parsed.data;
}
