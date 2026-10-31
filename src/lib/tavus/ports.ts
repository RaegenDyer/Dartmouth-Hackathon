import type { Actor } from "@/lib/domain/ports";
import type { TavusAudioSession, buildTavusTextEcho } from "./contracts";

type TavusTextEcho = ReturnType<typeof buildTavusTextEcho>;

// Ports only: no REST/RTC implementation, session ownership store, or browser
// capture is supplied here. Enable only after the activation checks in docs.
export interface TavusAudioSessionProvider {
  readonly name: "tavus";
  // Verify the actor and enforce budgets before creating a provider session.
  create(input: { actor: Actor; signal: AbortSignal }): Promise<TavusAudioSession>;
  // Resolve ownership through our stored actor/session mapping, never an ID alone.
  end(input: { actor: Actor; conversationId: string; signal: AbortSignal }): Promise<void>;
}

export interface TavusAudioPlayback {
  // Receive audio only: never acquire camera/microphone or send user audio to
  // Tavus. The future RTC adapter must enforce those media settings explicitly.
  join(input: { session: TavusAudioSession; signal: AbortSignal }): Promise<void>;
  // Supply only the current backend-approved reply; no separate Tavus model turn.
  speak(input: { message: TavusTextEcho; signal: AbortSignal }): Promise<void>;
  interrupt(): Promise<void>;
  // Stop playback, detach listeners, and leave RTC; safe to call repeatedly.
  dispose(): Promise<void>;
}
