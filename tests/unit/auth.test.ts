import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sessionFromVerifiedClaims } from "@/lib/auth/actor";
import { isSameOriginRequest } from "@/lib/auth/origin";

vi.mock("server-only", () => ({}));

const auth = { getClaims: vi.fn(), signOut: vi.fn() };
vi.mock("@/lib/supabase/server", () => ({
  createRouteSupabaseClient: async () => ({ auth }),
}));

const userId = "0b5e3c1e-7d2a-4c1b-9f3e-2a6d8c4b1e7f";

describe("verified claims", () => {
  it("maps an authenticated subject to an actor", () => {
    expect(sessionFromVerifiedClaims({ sub: userId, role: "authenticated", is_anonymous: true })).toEqual({
      actor: { userId },
      isAnonymous: true,
    });
  });

  it("rejects missing, malformed, or non-user claims", () => {
    expect(sessionFromVerifiedClaims(null)).toBeNull();
    expect(sessionFromVerifiedClaims({ sub: "not-a-uuid", role: "authenticated" })).toBeNull();
    expect(sessionFromVerifiedClaims({ sub: userId, role: "anon" })).toBeNull();
    expect(sessionFromVerifiedClaims({ sub: userId, role: "service_role" })).toBeNull();
  });
});

describe("same-origin check", () => {
  const url = "https://app.example.com/api/auth/sign-out";
  const request = (headers: Record<string, string>) => new Request(url, { method: "POST", headers });

  it("accepts same-origin requests", () => {
    expect(isSameOriginRequest(request({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOriginRequest(request({ origin: "https://app.example.com" }))).toBe(true);
  });

  it("refuses cross-site or unlabelled requests", () => {
    expect(isSameOriginRequest(request({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOriginRequest(request({ "sec-fetch-site": "same-site" }))).toBe(false);
    expect(isSameOriginRequest(request({ origin: "https://evil.example" }))).toBe(false);
    expect(isSameOriginRequest(request({ origin: "null" }))).toBe(false);
    expect(isSameOriginRequest(request({}))).toBe(false);
  });
});

describe("auth routes", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test-only");
    auth.getClaims.mockReset();
    auth.signOut.mockReset().mockResolvedValue({ error: null });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("reports a verified session without caching", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: userId, role: "authenticated" } }, error: null });
    const { GET } = await import("@/app/api/auth/session/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ authenticated: true, userId, isAnonymous: false });
  });

  it("treats a failed verification as signed out", async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: new Error("invalid JWT") });
    const { GET } = await import("@/app/api/auth/session/route");
    expect(await (await GET()).json()).toEqual({ authenticated: false });
  });

  it("returns 503 when sign-in is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const { GET } = await import("@/app/api/auth/session/route");
    const response = await GET();
    expect(response.status).toBe(503);
    expect(auth.getClaims).not.toHaveBeenCalled();
  });

  it("requireSession returns 401 for signed-out callers", async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: null });
    const { requireSession } = await import("@/lib/auth/server");
    const result = await requireSession();
    expect("response" in result && result.response.status).toBe(401);
  });

  it("signs out same-origin requests and refuses cross-site ones", async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: null });
    const { POST } = await import("@/app/api/auth/sign-out/route");
    const url = "https://app.example.com/api/auth/sign-out";

    const blocked = await POST(new Request(url, { method: "POST", headers: { "sec-fetch-site": "cross-site" } }));
    expect(blocked.status).toBe(403);
    expect(auth.signOut).not.toHaveBeenCalled();

    const ok = await POST(new Request(url, { method: "POST", headers: { origin: "https://app.example.com" } }));
    expect(ok.status).toBe(204);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
