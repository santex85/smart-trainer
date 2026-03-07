/**
 * Extract user-friendly error message from API/auth errors.
 * Handles JSON detail, HTML error pages (502, 503), and raw messages.
 */
export function getAuthErrorMessage(e: unknown, t: (key: string) => string): string {
  if (!(e instanceof Error)) return t("auth.requestError");
  const msg = e.message || "";
  // HTML error pages (502, 503, etc.) — show user-friendly message
  if (msg.trim().startsWith("<") || msg.includes("<html") || msg.includes("502") || msg.includes("503")) {
    return t("auth.serverError");
  }
  try {
    const parsed = JSON.parse(msg) as { detail?: string };
    if (typeof parsed?.detail === "string") return parsed.detail;
  } catch {
    /* ignore */
  }
  return msg || t("auth.requestError");
}
