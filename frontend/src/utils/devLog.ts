/**
 * Dev logger: messages are stored and can be shown on screen.
 * Enabled when __DEV__ or EXPO_PUBLIC_DEV_LOG=1 (e.g. Docker build).
 */

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  ts: string;
  level: LogLevel;
  msg: string;
}

const MAX_ENTRIES = 100;
const entries: LogEntry[] = [];
const listeners: Set<() => void> = new Set();

function isLogEnabled(): boolean {
  if (typeof __DEV__ !== "undefined" && __DEV__) return true;
  const env = typeof process !== "undefined" && process?.env?.EXPO_PUBLIC_DEV_LOG;
  if (env === "1" || env === "true") return true;
  // On web at localhost, always show logs so you can debug without rebuilding
  if (typeof window !== "undefined") {
    const h = window.location?.hostname;
    if (h === "localhost" || h === "127.0.0.1") return true;
  }
  return false;
}

function emit() {
  listeners.forEach((cb) => cb());
}

function now(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 8) + "." + String(d.getMilliseconds()).padStart(3, "0");
}

export function devLog(msg: string, level: LogLevel = "info") {
  if (!isLogEnabled()) return;
  entries.push({ ts: now(), level, msg });
  if (entries.length > MAX_ENTRIES) entries.shift();
  emit();
  if (level === "error") console.error("[devLog]", msg);
  else console.log("[devLog]", msg);
}

export function getLogs(): LogEntry[] {
  return [...entries];
}

export function clearLogs() {
  entries.length = 0;
  emit();
}

export function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function isDevLogEnabled(): boolean {
  return isLogEnabled();
}
