import { z } from "zod";

const id = z.uuid();
const version = z.number().int().positive();
const contextEpoch = z.number().int().nonnegative();
const timestamp = z.iso.datetime({ offset: true });
const memoryContent = z.string().trim().min(1).max(500);

export const scenarioSchema = z.enum(["check_in", "social_step"]);
export const socialActionStatusSchema = z.enum([
  "proposed", "accepted", "completed", "dismissed",
]);

// Identity and message history come from the verified session and database.
// Strict objects reject client-supplied userId, role, and fabricated history.
export const createConversationSchema = z.strictObject({
  scenario: scenarioSchema,
  title: z.string().trim().min(1).max(120).optional(),
});

export const sendMessageSchema = z.strictObject({
  conversationId: id,
  clientRequestId: id,
  content: z.string().trim().min(1).max(4000),
});

export const updateProfileSchema = z.strictObject({
  expectedVersion: version,
  displayName: z.string().trim().max(80),
  city: z.string().trim().max(120),
  interests: z.array(z.string().trim().min(1).max(60)).max(12),
  tone: z.string().trim().min(1).max(60),
});

export const approveMemorySchema = z.strictObject({
  expectedVersion: version,
  content: memoryContent,
  expiresAt: timestamp.nullable(),
});

export const updateMemorySchema = z.strictObject({
  expectedVersion: version,
  content: memoryContent,
  expiresAt: timestamp.nullable(),
});

export const dismissProposalSchema = z.strictObject({ expectedVersion: version });
export const deleteMemorySchema = z.strictObject({ expectedVersion: version });

export const updateSocialActionSchema = z.strictObject({
  expectedVersion: version,
  status: socialActionStatusSchema,
});

export const apiErrorCodeSchema = z.enum([
  "UNAUTHENTICATED", "INVALID_REQUEST", "NOT_FOUND", "CONFLICT",
  "RATE_LIMITED", "PROVIDER_UNAVAILABLE", "CONTEXT_CHANGED", "INTERNAL_ERROR",
]);

export const chatEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("start"), requestId: id, assistantMessageId: id }),
  z.strictObject({ type: z.literal("delta"), text: z.string() }),
  z.strictObject({
    type: z.literal("complete"),
    messageId: id,
    memoryProposalIds: z.array(id),
    socialActionIds: z.array(id),
    contextEpoch,
  }),
  z.strictObject({
    type: z.literal("error"),
    code: apiErrorCodeSchema,
    message: z.string(),
    retryable: z.boolean(),
  }),
]);

export type Scenario = z.infer<typeof scenarioSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ProfileUpdate = z.infer<typeof updateProfileSchema>;
export type ApprovedMemoryInput = z.infer<typeof approveMemorySchema>;
export type SocialActionStatus = z.infer<typeof socialActionStatusSchema>;
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ChatEvent = z.infer<typeof chatEventSchema>;
