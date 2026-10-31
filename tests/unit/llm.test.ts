import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FALLBACK_REPLY,
  generateWithTimeout,
  type LlmAdapter,
  type LlmReply,
  type LlmRequest,
} from "@/lib/companion/llm/adapter";
import { LIMITS } from "@/lib/companion/limits";

const request: LlmRequest = { history: [], userMessage: "Hello", memories: [], tone: null };
const fallback = { text: FALLBACK_REPLY, memoriesUsed: [] };

afterEach(() => vi.useRealTimers());

describe("model timeout boundary", () => {
  it("returns the fallback on deadline even when an adapter ignores cancellation", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const adapter: LlmAdapter = {
      generate: (_request, currentSignal) => {
        signal = currentSignal;
        return new Promise(() => {});
      },
    };
    let reply: LlmReply | undefined;
    void generateWithTimeout(adapter, request).then((result) => {
      reply = result;
    });

    await vi.advanceTimersByTimeAsync(LIMITS.llmTimeoutMs - 1);
    expect(reply).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);
    expect(reply).toEqual(fallback);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the deadline after a successful reply", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const reply = { text: "Hello back", memoriesUsed: ["m1"] };
    const adapter: LlmAdapter = {
      generate: async (_request, currentSignal) => {
        signal = currentSignal;
        return reply;
      },
    };
    await expect(generateWithTimeout(adapter, request)).resolves.toEqual(reply);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(LIMITS.llmTimeoutMs);
    expect(signal?.aborted).toBe(false);
  });

  it.each(["throw", "reject"])("returns a fallback and clears the timer on adapter %s", async (failure) => {
    vi.useFakeTimers();
    const adapter: LlmAdapter = {
      generate: () => {
        if (failure === "throw") throw new Error("dummy provider failure");
        return Promise.reject(new Error("dummy provider failure"));
      },
    };
    await expect(generateWithTimeout(adapter, request)).resolves.toEqual(fallback);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("handles an adapter rejecting after the deadline without changing the returned fallback", async () => {
    vi.useFakeTimers();
    let reject: (error: Error) => void = () => {};
    const adapter: LlmAdapter = {
      generate: () =>
        new Promise((_resolve, rejectResult) => {
          reject = rejectResult;
        }),
    };
    let reply: LlmReply | undefined;
    void generateWithTimeout(adapter, request).then((result) => {
      reply = result;
    });
    await vi.advanceTimersByTimeAsync(LIMITS.llmTimeoutMs);
    expect(reply).toEqual(fallback);
    reject(new Error("dummy late provider failure"));
    await vi.advanceTimersByTimeAsync(0);
    expect(reply).toEqual(fallback);
  });
});
