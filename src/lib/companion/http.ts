import "server-only";
import { apiError } from "@/lib/auth/server";
import { MemoryError, type Memory } from "./memory/store";

export function memoryErrorResponse(error: unknown): Response {
  if (error instanceof MemoryError) {
    if (error.code === "NOT_FOUND") return apiError(404, "NOT_FOUND", "This item is not available.");
    if (error.code === "LIMIT_REACHED") return apiError(409, "CONFLICT", error.message);
    return apiError(400, "INVALID_REQUEST", error.message);
  }
  return apiError(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
}

export const memoryDto = (memory: Memory) => ({
  id: memory.id,
  text: memory.text,
  createdAt: memory.createdAt.toISOString(),
  expiresAt: memory.expiresAt?.toISOString() ?? null,
});
