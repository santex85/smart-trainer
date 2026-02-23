import { Platform } from "react-native";
import { getAccessToken, removeAccessToken } from "../storage/authStorage";
import { devLog } from "../utils/devLog";

// When EXPO_PUBLIC_API_URL is explicitly "" (Docker build), use same origin so nginx can proxy /api
const API_BASE =
  process.env.EXPO_PUBLIC_API_URL === "" ? "" : (process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000");

let onUnauthorized: (() => void) | null = null;
export function setOnUnauthorized(cb: (() => void) | null) {
  onUnauthorized = cb;
}

export async function api<T>(
  path: string,
  options: RequestInit & { body?: unknown } = {}
): Promise<T> {
  const { body, ...rest } = options;
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(rest.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers,
    body: body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
  if (res.status === 401) {
    await removeAccessToken();
    onUnauthorized?.();
    const err = await res.text();
    throw new Error(err || "Unauthorized");
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

function isWeb(): boolean {
  return Platform.OS === "web";
}

export async function uploadPhoto(file: { uri: string; name?: string; type?: string }, mealType?: string): Promise<NutritionResult> {
  devLog(`uploadPhoto: start uri=${file.uri?.slice(0, 60)}… platform=${Platform.OS}`);
  const form = new FormData();
  if (isWeb()) {
    devLog("uploadPhoto: web path, fetching blob from uri");
    try {
      const blob = await fetch(file.uri).then((r) => r.blob());
      devLog(`uploadPhoto: blob size=${blob.size} type=${blob.type}`);
      form.append("file", blob, file.name || "meal.jpg");
    } catch (e) {
      devLog(`uploadPhoto: blob fetch failed: ${e instanceof Error ? e.message : String(e)}`, "error");
      throw e;
    }
  } else {
    devLog("uploadPhoto: native path, appending file object");
    form.append("file", file as unknown as Blob);
  }
  if (mealType) form.append("meal_type", mealType);
  const url = `${API_BASE}/api/v1/nutrition/analyze`;
  devLog(`uploadPhoto: POST ${url}`);
  const token = await getAccessToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, {
    method: "POST",
    body: form,
    headers,
  });
  const text = await res.text();
  devLog(`uploadPhoto: response status=${res.status} body=${text.slice(0, 120)}${text.length > 120 ? "…" : ""}`);
  if (res.status === 401) {
    await removeAccessToken();
    onUnauthorized?.();
    devLog(`uploadPhoto: 401 Unauthorized`, "error");
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    devLog(`uploadPhoto: error ${res.status}`, "error");
    throw new Error(text || `HTTP ${res.status}`);
  }
  try {
    const data = JSON.parse(text) as NutritionResult;
    devLog(`uploadPhoto: success name=${data.name} kcal=${data.calories}`);
    return data;
  } catch (e) {
    devLog(`uploadPhoto: JSON parse failed: ${e instanceof Error ? e.message : text}`, "error");
    throw new Error(text || "Invalid response");
  }
}

export async function uploadPhotoForAnalysis(
  file: { uri: string; name?: string; type?: string },
  mealType?: string
): Promise<PhotoAnalyzeResponse> {
  devLog(`uploadPhotoForAnalysis: start uri=${file.uri?.slice(0, 60)}… platform=${Platform.OS}`);
  const form = new FormData();
  if (isWeb()) {
    try {
      const blob = await fetch(file.uri).then((r) => r.blob());
      form.append("file", blob, file.name || "photo.jpg");
    } catch (e) {
      devLog(`uploadPhotoForAnalysis: blob fetch failed: ${e instanceof Error ? e.message : String(e)}`, "error");
      throw e;
    }
  } else {
    form.append("file", file as unknown as Blob);
  }
  if (mealType) form.append("meal_type", mealType);
  const url = `${API_BASE}/api/v1/photo/analyze`;
  const token = await getAccessToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { method: "POST", body: form, headers });
  const text = await res.text();
  devLog(`uploadPhotoForAnalysis: status=${res.status} body=${text.slice(0, 150)}…`);
  if (res.status === 401) {
    await removeAccessToken();
    onUnauthorized?.();
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  try {
    return JSON.parse(text) as PhotoAnalyzeResponse;
  } catch (e) {
    throw new Error(text || "Invalid response");
  }
}

export interface NutritionResult {
  id?: number;
  name: string;
  portion_grams: number;
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

export interface SleepPhaseSegment {
  start: string;
  end: string;
  phase: string;
}

export interface SleepExtractedData {
  date?: string | null;
  sleep_hours?: number | null;
  sleep_minutes?: number | null;
  actual_sleep_hours?: number | null;
  actual_sleep_minutes?: number | null;
  time_in_bed_min?: number | null;
  quality_score?: number | null;
  score_delta?: number | null;
  efficiency_pct?: number | null;
  rest_min?: number | null;
  deep_sleep_min?: number | null;
  rem_min?: number | null;
  light_sleep_min?: number | null;
  awake_min?: number | null;
  factor_ratings?: Record<string, string> | null;
  sleep_phases?: SleepPhaseSegment[] | null;
  sleep_periods?: string[] | null;
  latency_min?: number | null;
  awakenings?: number | null;
  bedtime?: string | null;
  wake_time?: string | null;
  source_app?: string | null;
  raw_notes?: string | null;
}

export interface SleepExtractionResponse {
  id: number;
  extracted_data: SleepExtractedData;
  created_at: string;
}

export type PhotoAnalyzeResponse =
  | { type: "food"; food: NutritionResult }
  | { type: "sleep"; sleep: SleepExtractionResponse };

export interface NutritionDayEntry {
  id: number;
  name: string;
  portion_grams: number;
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  meal_type: string;
  timestamp: string;
}

export interface NutritionDayTotals {
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

export interface NutritionDayResponse {
  date: string;
  entries: NutritionDayEntry[];
  totals: NutritionDayTotals;
}

export interface WellnessDay {
  date: string;
  sleep_hours?: number;
  rhr?: number;
  hrv?: number;
  ctl?: number;
  atl?: number;
  tsb?: number;
}

export interface EventItem {
  id: string;
  title?: string;
  start_date?: string;
  end_date?: string;
  type?: string;
}

export interface ActivityItem {
  id: string;
  name?: string;
  start_date?: string;
  duration_sec?: number;
  distance_km?: number;
  tss?: number;
  type?: string;
}

export interface ChatMessage {
  role: string;
  content: string;
  timestamp?: string;
}

export async function getNutritionDay(dateStr: string): Promise<NutritionDayResponse> {
  const params = new URLSearchParams({ date: dateStr });
  return api<NutritionDayResponse>(`/api/v1/nutrition/day?${params}`);
}

export type NutritionEntryUpdatePayload = {
  name?: string;
  portion_grams?: number;
  calories?: number;
  protein_g?: number;
  fat_g?: number;
  carbs_g?: number;
  meal_type?: string;
};

export async function updateNutritionEntry(
  entryId: number,
  payload: NutritionEntryUpdatePayload
): Promise<NutritionDayEntry> {
  return api<NutritionDayEntry>(`/api/v1/nutrition/entries/${entryId}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function deleteNutritionEntry(entryId: number): Promise<{ status: string }> {
  return api<{ status: string }>(`/api/v1/nutrition/entries/${entryId}`, { method: "DELETE" });
}

export async function getWellness(fromDate?: string, toDate?: string): Promise<WellnessDay[]> {
  const params = new URLSearchParams();
  if (fromDate) params.set("from_date", fromDate);
  if (toDate) params.set("to_date", toDate);
  return api<WellnessDay[]>(`/api/v1/wellness?${params}`);
}

export type WellnessUpsertPayload = {
  date: string;
  sleep_hours?: number;
  rhr?: number;
  hrv?: number;
};

export async function createOrUpdateWellness(payload: WellnessUpsertPayload): Promise<WellnessDay> {
  return api<WellnessDay>("/api/v1/wellness", { method: "PUT", body: payload });
}

export async function getEvents(fromDate?: string, toDate?: string): Promise<EventItem[]> {
  const params = new URLSearchParams();
  if (fromDate) params.set("from_date", fromDate);
  if (toDate) params.set("to_date", toDate);
  return api<EventItem[]>(`/api/v1/intervals/events?${params}`);
}

export async function getActivities(fromDate?: string, toDate?: string): Promise<ActivityItem[]> {
  const params = new URLSearchParams();
  if (fromDate) params.set("from_date", fromDate);
  if (toDate) params.set("to_date", toDate);
  return api<ActivityItem[]>(`/api/v1/intervals/activities?${params}`);
}

export async function getIntervalsStatus(): Promise<{ linked: boolean; athlete_id?: string }> {
  return api<{ linked: boolean; athlete_id?: string }>("/api/v1/intervals/status");
}

export async function linkIntervals(athleteId: string, apiKey: string): Promise<{ status: string; athlete_id: string }> {
  return api<{ status: string; athlete_id: string }>("/api/v1/intervals/link", {
    method: "POST",
    body: { athlete_id: athleteId, api_key: apiKey },
  });
}

export async function unlinkIntervals(): Promise<{ status: string }> {
  return api<{ status: string }>("/api/v1/intervals/unlink", { method: "POST" });
}

export async function syncIntervals(): Promise<{ status: string; user_id?: number }> {
  return api<{ status: string; user_id?: number }>("/api/v1/intervals/sync", { method: "POST" });
}

export async function getStravaStatus(): Promise<{ linked: boolean; athlete_id?: string | null }> {
  return api<{ linked: boolean; athlete_id?: string | null }>("/api/v1/strava/status");
}

export async function getStravaAuthorizeUrl(): Promise<{ url: string }> {
  return api<{ url: string }>("/api/v1/strava/authorize-url");
}

export async function getStravaActivities(fromDate?: string, toDate?: string): Promise<ActivityItem[]> {
  const params = new URLSearchParams();
  if (fromDate) params.set("from_date", fromDate);
  if (toDate) params.set("to_date", toDate);
  return api<ActivityItem[]>(`/api/v1/strava/activities?${params}`);
}

export async function unlinkStrava(): Promise<{ status: string }> {
  return api<{ status: string }>("/api/v1/strava/unlink", { method: "POST" });
}

export async function syncStrava(): Promise<{ status: string; message?: string }> {
  return api<{ status: string; message?: string }>("/api/v1/strava/sync", { method: "POST" });
}

export interface StravaFitness {
  ctl: number;
  atl: number;
  tsb: number;
  date: string;
}

export async function getStravaFitness(): Promise<StravaFitness | null> {
  return api<StravaFitness | null>("/api/v1/strava/fitness");
}

export async function getChatHistory(limit = 50): Promise<ChatMessage[]> {
  return api<ChatMessage[]>(`/api/v1/chat/history?limit=${limit}`);
}

export async function sendChatMessage(message: string, runOrchestrator = false): Promise<{ reply: string }> {
  return api<{ reply: string }>("/api/v1/chat/send", {
    method: "POST",
    body: { message, run_orchestrator: runOrchestrator },
  });
}

export async function runOrchestrator(): Promise<{ decision: string; reason: string; modified_plan?: unknown; suggestions_next_days?: string }> {
  return api("/api/v1/chat/orchestrator/run", { method: "POST" });
}

// Auth (no token required for login/register)
export interface AuthUser {
  id: number;
  email: string;
}
export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return api<AuthResponse>("/api/v1/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export async function register(email: string, password: string): Promise<AuthResponse> {
  return api<AuthResponse>("/api/v1/auth/register", {
    method: "POST",
    body: { email, password },
  });
}

export async function getMe(): Promise<AuthUser> {
  return api<AuthUser>("/api/v1/auth/me");
}
