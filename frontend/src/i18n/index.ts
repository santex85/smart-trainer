import { ru } from "./translations";

const messages: Record<string, unknown> = { ru };

function get(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const p of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[p];
  }
  return typeof current === "string" ? current : undefined;
}

/**
 * Translate by key. Uses Russian locale. Example: t("app.loading") => "Загрузка…"
 */
export function t(key: string): string {
  return get(messages.ru as Record<string, unknown>, key) ?? key;
}
