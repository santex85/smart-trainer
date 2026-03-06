/**
 * Escapes user-controlled text for safe display to prevent XSS when content
 * might be rendered in an HTML context (e.g. WebView or future rich text).
 * Replaces &, <, >, ", ' with HTML entities so that even if the string
 * is later used in innerHTML or similar, it will not execute script.
 */
export function escapeForDisplay(str: string): string {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
