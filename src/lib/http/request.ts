import "server-only";
import type { z } from "zod";
import { apiError } from "@/lib/auth/server";

export const MAX_JSON_BODY_BYTES = 16 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string) => uuid.test(value);

/** Reads a bounded JSON body and validates it. Returns the data or an error response. */
export async function readJson<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { response: Response }> {
  const invalid = () => ({ response: apiError(400, "INVALID_REQUEST", "This request could not be read.") });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_JSON_BODY_BYTES) return invalid();
  if (!request.body) return invalid();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_JSON_BODY_BYTES) {
      await reader.cancel();
      return invalid();
    }
    chunks.push(value);
  }
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
  } catch {
    return invalid();
  }
  const parsed = schema.safeParse(json);
  return parsed.success ? { data: parsed.data } : invalid();
}

/** Best-effort client address for the per-IP rate limit. */
export function clientAddress(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
