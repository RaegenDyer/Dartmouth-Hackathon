// CSRF guard for cookie-authenticated mutations. Browsers send Sec-Fetch-Site
// on modern requests; Origin is the fallback. A request with neither is refused.
export function isSameOriginRequest(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite === "same-origin";

  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
