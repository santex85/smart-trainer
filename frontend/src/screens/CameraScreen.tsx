import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import {
  uploadPhotoForAnalysis,
  type NutritionResult,
  type SleepExtractionResponse,
  type SleepExtractedData,
} from "../api/client";
import { devLog, getLogs, clearLogs, subscribe, isDevLogEnabled, type LogEntry } from "../utils/devLog";

function getErrorMessage(e: unknown): string {
  if (!(e instanceof Error)) return "Failed to analyze photo.";
  try {
    const parsed = JSON.parse(e.message) as { detail?: string };
    if (typeof parsed?.detail === "string") return parsed.detail;
  } catch {
    /* ignore */
  }
  return e.message || "Failed to analyze photo.";
}

function SleepDataLines({ data }: { data: SleepExtractedData }) {
  const lines: string[] = [];
  if (data.date != null) lines.push(`Date: ${data.date}`);
  if (data.sleep_periods?.length) {
    data.sleep_periods.forEach((p) => lines.push(`Period: ${p}`));
  }
  if (data.bedtime != null || data.wake_time != null) {
    lines.push([data.bedtime, data.wake_time].filter(Boolean).join(" → "));
  }
  if (data.sleep_hours != null) lines.push(`Sleep: ${data.sleep_hours}h`);
  if (data.actual_sleep_hours != null) lines.push(`Actual sleep: ${data.actual_sleep_hours}h`);
  if (data.sleep_minutes != null && data.sleep_hours == null) lines.push(`Sleep: ${data.sleep_minutes} min`);
  if (data.time_in_bed_min != null) lines.push(`Time in bed: ${data.time_in_bed_min} min`);
  if (data.quality_score != null) {
    const delta = data.score_delta != null ? ` (${data.score_delta >= 0 ? "+" : ""}${data.score_delta})` : "";
    lines.push(`Quality: ${data.quality_score}${delta}`);
  }
  if (data.efficiency_pct != null) lines.push(`Efficiency: ${data.efficiency_pct}%`);
  if (data.deep_sleep_min != null) lines.push(`Deep: ${data.deep_sleep_min} min`);
  if (data.rem_min != null) lines.push(`REM: ${data.rem_min} min`);
  if (data.light_sleep_min != null) lines.push(`Light: ${data.light_sleep_min} min`);
  if (data.awake_min != null) lines.push(`Awake: ${data.awake_min} min`);
  if (data.latency_min != null) lines.push(`Latency: ${data.latency_min} min`);
  if (data.awakenings != null) lines.push(`Awakenings: ${data.awakenings}`);
  if (data.rest_min != null) lines.push(`Rest: ${data.rest_min} min`);
  if (data.factor_ratings && Object.keys(data.factor_ratings).length > 0) {
    const factors = Object.entries(data.factor_ratings)
      .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
      .join(" · ");
    lines.push(`Factors: ${factors}`);
  }
  if (data.sleep_phases?.length) {
    lines.push(`Phases: ${data.sleep_phases.length} segments`);
    data.sleep_phases.slice(0, 8).forEach((seg, i) => {
      lines.push(`  ${seg.start}–${seg.end} ${seg.phase}`);
    });
    if (data.sleep_phases.length > 8) {
      lines.push(`  … +${data.sleep_phases.length - 8} more`);
    }
  }
  if (data.source_app != null) lines.push(`Source: ${data.source_app}`);
  if (data.raw_notes != null) lines.push(data.raw_notes);
  if (lines.length === 0) return <Text style={styles.hint}>No metrics extracted.</Text>;
  return (
    <View style={styles.sleepLines}>
      {lines.map((line, i) => (
        <Text key={i} style={styles.sleepLine}>
          {line}
        </Text>
      ))}
    </View>
  );
}

export function CameraScreen({
  onClose,
  onSaved,
  onSleepSaved,
}: {
  onClose: () => void;
  onSaved?: (result: NutritionResult) => void;
  onSleepSaved?: (result: SleepExtractionResponse) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [photoResult, setPhotoResult] = useState<
    { type: "food"; food: NutritionResult } | { type: "sleep"; sleep: SleepExtractionResponse } | null
  >(null);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);

  useEffect(() => {
    setLogEntries(getLogs());
    const unsub = subscribe(() => setLogEntries(getLogs()));
    return unsub;
  }, []);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow access to photos to log meals.");
      return;
    }
    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (pickerResult.canceled) return;
    const asset = pickerResult.assets[0];
    if (!asset?.uri) {
      devLog("pickImage: no asset uri", "warn");
      return;
    }
    devLog("pickImage: selected, starting upload");
    setLoading(true);
    setPhotoResult(null);
    try {
      const res = await uploadPhotoForAnalysis({
        uri: asset.uri,
        name: "meal.jpg",
        type: "image/jpeg",
      });
      devLog("pickImage: upload success");
      setPhotoResult(res);
      if (res.type === "food") onSaved?.(res.food);
      else if (res.type === "sleep") onSleepSaved?.(res.sleep);
    } catch (e) {
      devLog(`pickImage: error ${e instanceof Error ? e.message : String(e)}`, "error");
      Alert.alert("Error", getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow camera to photo meals.");
      return;
    }
    const pickerResult = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (pickerResult.canceled) return;
    const asset = pickerResult.assets[0];
    if (!asset?.uri) {
      devLog("takePhoto: no asset uri", "warn");
      return;
    }
    devLog("takePhoto: captured, starting upload");
    setLoading(true);
    setPhotoResult(null);
    try {
      const res = await uploadPhotoForAnalysis({
        uri: asset.uri,
        name: "meal.jpg",
        type: "image/jpeg",
      });
      devLog("takePhoto: upload success");
      setPhotoResult(res);
      if (res.type === "food") onSaved?.(res.food);
      else if (res.type === "sleep") onSleepSaved?.(res.sleep);
    } catch (e) {
      devLog(`takePhoto: error ${e instanceof Error ? e.message : String(e)}`, "error");
      Alert.alert("Error", getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Photo</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.close}>Close</Text>
        </TouchableOpacity>
      </View>

      {isDevLogEnabled() && (
        <View style={styles.logPanel}>
          <View style={styles.logHeader}>
            <Text style={styles.logTitle}>Dev log (request/response)</Text>
            <TouchableOpacity onPress={() => { clearLogs(); setLogEntries([]); }}>
              <Text style={styles.logClear}>Clear</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.logScroll} contentContainerStyle={styles.logScrollContent}>
            {logEntries.length === 0 ? (
              <Text style={styles.logLine}>No logs yet. Choose or take a photo to see request/response.</Text>
            ) : (
              logEntries.map((entry, i) => (
                <Text key={i} style={[styles.logLine, entry.level === "error" && styles.logLineError, entry.level === "warn" && styles.logLineWarn]}>
                  [{entry.ts}] {entry.msg}
                </Text>
              ))
            )}
          </ScrollView>
        </View>
      )}

      <ScrollView style={styles.mainScroll} contentContainerStyle={styles.mainScrollContent}>
        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#38bdf8" />
            <Text style={styles.hint}>Analyzing with AI…</Text>
          </View>
        )}

        {photoResult?.type === "food" && !loading && (
          <View style={styles.result}>
            <Text style={styles.resultName}>{photoResult.food.name}</Text>
            <Text style={styles.resultMacros}>
              {photoResult.food.calories} kcal · P {photoResult.food.protein_g}g · F {photoResult.food.fat_g}g · C{" "}
              {photoResult.food.carbs_g}g
            </Text>
            <Text style={styles.hint}>Portion: {photoResult.food.portion_grams}g</Text>
            <Text style={styles.resultWhere}>Saved to your day. Close to return to dashboard.</Text>
            <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        {photoResult?.type === "sleep" && !loading && (
          <View style={styles.result}>
            <Text style={styles.resultName}>Sleep data recognized</Text>
            <SleepDataLines data={photoResult.sleep.extracted_data} />
            <Text style={styles.resultWhere}>Saved. Close to return to dashboard.</Text>
            <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        {!photoResult && !loading && (
          <>
            <Text style={styles.flowHint}>
              Choose any photo — we'll detect if it's food or sleep data and process it.
            </Text>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.button} onPress={takePhoto}>
                <Text style={styles.buttonIcon}>📷</Text>
                <Text style={styles.buttonText}>Take photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.button} onPress={pickImage}>
                <Text style={styles.buttonIcon}>🖼️</Text>
                <Text style={styles.buttonText}>Choose from gallery</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a2e", padding: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { fontSize: 22, fontWeight: "700", color: "#eee" },
  close: { fontSize: 16, color: "#38bdf8" },
  mainScroll: { flex: 1 },
  mainScrollContent: { paddingBottom: 24 },
  centered: { paddingVertical: 40, alignItems: "center", gap: 12 },
  hint: { fontSize: 14, color: "#94a3b8" },
  flowHint: { fontSize: 13, color: "#64748b", marginBottom: 16 },
  actions: { gap: 16 },
  button: {
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
  },
  buttonIcon: { fontSize: 40, marginBottom: 8 },
  buttonText: { fontSize: 18, color: "#e2e8f0", fontWeight: "600" },
  result: { backgroundColor: "#16213e", borderRadius: 12, padding: 20 },
  resultName: { fontSize: 20, color: "#e2e8f0", fontWeight: "600", marginBottom: 8 },
  resultMacros: { fontSize: 16, color: "#94a3b8", marginBottom: 4 },
  resultWhere: { fontSize: 12, color: "#64748b", marginTop: 8 },
  sleepLines: { marginVertical: 8, gap: 4 },
  sleepLine: { fontSize: 14, color: "#94a3b8" },
  doneBtn: { marginTop: 20, backgroundColor: "#38bdf8", paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  doneBtnText: { fontSize: 16, color: "#0f172a", fontWeight: "600" },
  logPanel: { marginBottom: 12, backgroundColor: "#0f172a", borderRadius: 8, maxHeight: 180, borderWidth: 1, borderColor: "#334155" },
  logHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#334155" },
  logTitle: { fontSize: 12, fontWeight: "600", color: "#94a3b8" },
  logClear: { fontSize: 12, color: "#38bdf8" },
  logScroll: { maxHeight: 140 },
  logScrollContent: { padding: 12 },
  logLine: { fontSize: 11, fontFamily: "monospace", color: "#94a3b8", marginBottom: 2 },
  logLineWarn: { color: "#fbbf24" },
  logLineError: { color: "#f87171" },
});
