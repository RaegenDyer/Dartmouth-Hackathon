import { z } from "zod";

// Application bounds, not claims about the provider's maximum allowed values.
export const MAX_TAVUS_SESSION_SECONDS = 300;
export const MAX_TAVUS_ECHO_CHARACTERS = 4000;

export const tavusIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

const createSessionSchema = z.strictObject({
  palId: tavusIdentifierSchema,
  maxDurationSeconds: z.number().int().min(1).max(MAX_TAVUS_SESSION_SECONDS).default(MAX_TAVUS_SESSION_SECONDS),
});

export type TavusAudioSessionRequest = z.input<typeof createSessionSchema>;

// Preparation only. This payload requires a preconfigured Echo PAL. The
// audio-only/Echo combination still needs account-level integration validation.
export function buildTavusAudioSessionRequest(input: TavusAudioSessionRequest) {
  const result = createSessionSchema.safeParse(input);
  if (!result.success) throw new TypeError("Invalid Tavus audio session settings.");
  return {
    pal_id: result.data.palId,
    audio_only: true as const,
    require_auth: true as const,
    max_participants: 2,
    participant_tags: [],
    dynamic_greeting: false,
    properties: {
      max_call_duration: result.data.maxDurationSeconds,
      participant_left_timeout: 0,
      participant_absent_timeout: 30,
      enable_recording: false,
      auto_start_recording: false,
    },
  };
}

const conversationUrlSchema = z.url({ protocol: /^https$/ }).refine((value) => {
  const url = new URL(value);
  return (
    !url.username &&
    !url.password &&
    !url.port &&
    !url.search &&
    !url.hash &&
    /^[a-z0-9-]+\.daily\.co$/i.test(url.hostname) &&
    /^\/[A-Za-z0-9_-]+$/.test(url.pathname)
  );
});
const sessionResponseSchema = z.object({
  conversation_id: tavusIdentifierSchema,
  conversation_url: conversationUrlSchema,
  status: z.literal("active"),
  meeting_token: z.string().min(1).max(16384).regex(/^\S+$/),
});

export interface TavusAudioSession {
  readonly conversationId: string;
  readonly conversationUrl: string;
  readonly meetingToken: string;
}

// Returned credentials belong only to the verified owner of the future session.
// No JWT signature/expiry verification is claimed by this shape parser.
export function parseTavusAudioSessionResponse(response: unknown): TavusAudioSession {
  const result = sessionResponseSchema.safeParse(response);
  if (!result.success) throw new TypeError("Invalid Tavus audio session response.");
  return {
    conversationId: result.data.conversation_id,
    conversationUrl: result.data.conversation_url,
    meetingToken: result.data.meeting_token,
  };
}

const echoInputSchema = z.strictObject({
  conversationId: tavusIdentifierSchema,
  inferenceId: z.uuid(),
  text: z
    .string()
    .trim()
    .min(1)
    .max(MAX_TAVUS_ECHO_CHARACTERS)
    .refine((value) => !value.includes("\u0000") && !/[\uD800-\uDFFF]/u.test(value)),
});

export type TavusTextEchoInput = z.infer<typeof echoInputSchema>;

// Send through an authenticated room's transport in the future, not a Tavus
// REST speech endpoint. A stable inference ID is not a billing idempotency key.
export function buildTavusTextEcho(input: TavusTextEchoInput) {
  const result = echoInputSchema.safeParse(input);
  if (!result.success) throw new TypeError("Invalid Tavus speech request.");
  return {
    message_type: "conversation" as const,
    event_type: "conversation.echo" as const,
    conversation_id: result.data.conversationId,
    properties: {
      modality: "text" as const,
      text: result.data.text,
      inference_id: result.data.inferenceId,
      done: true as const,
    },
  };
}
