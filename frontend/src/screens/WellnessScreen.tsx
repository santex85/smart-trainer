import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Calendar } from "react-native-calendars";
import { getWellness, createOrUpdateWellness, type WellnessDay } from "../api/client";

function getTodayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const CALENDAR_THEME = {
  backgroundColor: "transparent",
  calendarBackground: "transparent",
  textSectionTitleColor: "#94a3b8",
  selectedDayBackgroundColor: "#38bdf8",
  selectedDayTextColor: "#0f172a",
  todayTextColor: "#38bdf8",
  dayTextColor: "#e2e8f0",
  textDisabledColor: "#475569",
  dotColor: "#38bdf8",
  selectedDotColor: "#0f172a",
  arrowColor: "#38bdf8",
  monthTextColor: "#e2e8f0",
  textDayFontWeight: "500" as const,
  textMonthFontWeight: "700" as const,
};

export function WellnessScreen({ onClose }: { onClose: () => void }) {
  const today = getTodayLocal();
  const [selectedDay, setSelectedDay] = useState(today);
  const [sleepHours, setSleepHours] = useState("");
  const [rhr, setRhr] = useState("");
  const [hrv, setHrv] = useState("");
  const [loaded, setLoaded] = useState<WellnessDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadDay = useCallback(async (dateStr: string) => {
    setLoading(true);
    try {
      const list = await getWellness(dateStr, dateStr);
      const day = list?.length ? list[0] : null;
      setLoaded(day ?? null);
      setSleepHours(day?.sleep_hours != null ? String(day.sleep_hours) : "");
      setRhr(day?.rhr != null ? String(day.rhr) : "");
      setHrv(day?.hrv != null ? String(day.hrv) : "");
    } catch {
      setLoaded(null);
      setSleepHours("");
      setRhr("");
      setHrv("");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDay(selectedDay);
  }, [selectedDay, loadDay]);

  const handleSave = async () => {
    const sleep = sleepHours.trim() ? parseFloat(sleepHours) : undefined;
    const rhrVal = rhr.trim() ? parseFloat(rhr) : undefined;
    const hrvVal = hrv.trim() ? parseFloat(hrv) : undefined;
    if (sleep != null && (Number.isNaN(sleep) || sleep < 0 || sleep > 24)) {
      Alert.alert("Error", "Sleep hours must be between 0 and 24.");
      return;
    }
    if (rhrVal != null && (Number.isNaN(rhrVal) || rhrVal < 0 || rhrVal > 200)) {
      Alert.alert("Error", "RHR must be a valid number.");
      return;
    }
    if (hrvVal != null && (Number.isNaN(hrvVal) || hrvVal < 0)) {
      Alert.alert("Error", "HRV must be a non-negative number.");
      return;
    }
    setSaving(true);
    try {
      await createOrUpdateWellness({
        date: selectedDay,
        sleep_hours: sleep,
        rhr: rhrVal,
        hrv: hrvVal,
      });
      await loadDay(selectedDay);
      Alert.alert("Saved", "Wellness data saved.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Wellness</Text>
        <View style={styles.backBtn} />
      </View>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={80}
      >
        <Calendar
          current={selectedDay}
          onDayPress={(day) => setSelectedDay(day.dateString)}
          markedDates={{ [selectedDay]: { selected: true } }}
          theme={CALENDAR_THEME}
          style={styles.calendar}
        />
        <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>Data for {selectedDay}</Text>
          {loading ? (
            <ActivityIndicator size="small" color="#38bdf8" style={styles.loader} />
          ) : (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>Sleep (hours)</Text>
                <TextInput
                  style={styles.input}
                  value={sleepHours}
                  onChangeText={setSleepHours}
                  placeholder="e.g. 7.5"
                  placeholderTextColor="#64748b"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Resting heart rate (bpm)</Text>
                <TextInput
                  style={styles.input}
                  value={rhr}
                  onChangeText={setRhr}
                  placeholder="e.g. 52"
                  placeholderTextColor="#64748b"
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>HRV (ms)</Text>
                <TextInput
                  style={styles.input}
                  value={hrv}
                  onChangeText={setHrv}
                  placeholder="e.g. 45"
                  placeholderTextColor="#64748b"
                  keyboardType="number-pad"
                />
              </View>
              {loaded && (loaded.ctl != null || loaded.atl != null || loaded.tsb != null) ? (
                <View style={styles.readOnly}>
                  <Text style={styles.label}>Load (read-only)</Text>
                  <Text style={styles.hint}>
                    CTL: {loaded.ctl != null ? loaded.ctl.toFixed(0) : "—"} · ATL: {loaded.atl != null ? loaded.atl.toFixed(0) : "—"} · TSB: {loaded.tsb != null ? loaded.tsb.toFixed(0) : "—"}
                  </Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#0f172a" />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#1a1a2e" },
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  backBtn: { minWidth: 56 },
  backText: { fontSize: 16, color: "#38bdf8" },
  title: { fontSize: 18, fontWeight: "600", color: "#e2e8f0" },
  calendar: { marginBottom: 8 },
  formScroll: { flex: 1 },
  formContent: { padding: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#e2e8f0", marginBottom: 16 },
  loader: { marginVertical: 20 },
  field: { marginBottom: 16 },
  label: { fontSize: 14, color: "#94a3b8", marginBottom: 6 },
  input: {
    backgroundColor: "#0f172a",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#e2e8f0",
    borderWidth: 1,
    borderColor: "#334155",
  },
  readOnly: { marginBottom: 16 },
  hint: { fontSize: 14, color: "#94a3b8" },
  saveBtn: {
    backgroundColor: "#38bdf8",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { fontSize: 16, fontWeight: "600", color: "#0f172a" },
});
