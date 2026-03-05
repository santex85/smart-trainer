/**
 * API locale state. Kept in a separate module to avoid circular dependency
 * between api/client and i18n/context.
 */

let apiLocale = "ru";

export function setApiLocale(locale: string): void {
  apiLocale = locale === "en" ? "en" : "ru";
}

export function getApiLocale(): string {
  return apiLocale;
}
