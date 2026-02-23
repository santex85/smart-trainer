import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getIntervalsStatus, linkIntervals, syncIntervals, unlinkIntervals } from "../api/client";

function getErrorMessage(e: unknown): string {
  if (!(e instanceof Error)) return "Request failed.";
  try {
    const parsed = JSON.parse(e.message) as { detail?: string };
    if (typeof parsed?.detail === "string") return parsed.detail;
  } catch {
    /* ignore */
  }
  return e.message || "Request failed.";
}

export function IntervalsLinkScreen({ onClose }: { onClose: () => void }) {
  const [statusLoading, setStatusLoading] = useState(true);
  const [linked, setLinked] = useState(false);
  const [athleteId, setAthleteId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [linkedAthleteId, setLinkedAthleteId] = useState<string | null>(null);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  const [unlinkLoading, setUnlinkLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const s = await getIntervalsStatus();
      setLinked(s.linked);
      setLinkedAthleteId(s.athlete_id ?? null);
      setShowForm(false);
    } catch {
      setLinked(false);
      setLinkedAthleteId(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleLink = async () => {
    const aid = athleteId.trim();
    const key = apiKey.trim();
    if (!aid || !key) {
      Alert.alert("Error", "Enter Athlete ID and API Key.");
      return;
    }
    setSubmitLoading(true);
    try {
      await linkIntervals(aid, key);
      setAthleteId("");
      setApiKey("");
      await loadStatus();
      Alert.alert("Done", "Intervals.icu connected.");
    } catch (e) {
      Alert.alert("Error", getErrorMessage(e));
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncLoading(true);
    try {
      await syncIntervals();
      Alert.alert("Done", "Data synced from Intervals.icu. Close and check the dashboard.");
    } catch (e) {
      Alert.alert("Sync failed", getErrorMessage(e));
    } finally {
      setSyncLoading(false);
    }
  };

  const handleUnlinkConfirm = async () => {
    setUnlinkLoading(true);
    try {
      await unlinkIntervals();
      setShowUnlinkConfirm(false);
      await loadStatus();
      onClose();
    } catch (e) {
      Alert.alert("Error", getErrorMessage(e));
    } finally {
      setUnlinkLoading(false);
    }
  };

  const openIntervalsSettings = () => {
    Linking.openURL("https://www.intervals.icu").catch(() => {});
  };

  if (statusLoading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.title}>Intervals.icu</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.close}>Close</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#38bdf8" />
          <Text style={styles.hint}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Intervals.icu</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.close}>Close</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {linked && !showForm ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Connected</Text>
            <Text style={styles.value}>Athlete ID: {linkedAthleteId ?? "—"}</Text>
            <TouchableOpacity
              style={[styles.buttonPrimary, syncLoading && styles.buttonDisabled]}
              onPress={handleSync}
              disabled={syncLoading}
            >
              {syncLoading ? (
                <ActivityIndicator size="small" color="#0f172a" />
              ) : (
                <Text style={styles.buttonPrimaryText}>Sync now</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.buttonSecondary} onPress={() => setShowForm(true)}>
              <Text style={styles.buttonSecondaryText}>Update API key</Text>
            </TouchableOpacity>
            {showUnlinkConfirm ? (
              <View style={styles.confirmBlock}>
                <Text style={styles.confirmText}>Disconnect Intervals.icu? Recovery and workouts will no longer appear.</Text>
                <View style={styles.confirmRow}>
                  <TouchableOpacity
                    style={styles.buttonDanger}
                    onPress={handleUnlinkConfirm}
                    disabled={unlinkLoading}
                  >
                    {unlinkLoading ? (
                      <ActivityIndicator size="small" color="#f87171" />
                    ) : (
                      <Text style={styles.buttonDangerText}>Disconnect</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.buttonSecondary}
                    onPress={() => setShowUnlinkConfirm(false)}
                    disabled={unlinkLoading}
                  >
                    <Text style={styles.buttonSecondaryText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.buttonDanger} onPress={() => setShowUnlinkConfirm(true)}>
                <Text style={styles.buttonDangerText}>Disconnect</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {(showForm || !linked) && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{linked ? "Update API key" : "Connect Intervals.icu"}</Text>
            <Text style={styles.label}>Athlete ID</Text>
            <TextInput
              style={styles.input}
              value={athleteId}
              onChangeText={setAthleteId}
              placeholder="e.g. a1b2c3d4"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitLoading}
            />
            <Text style={styles.label}>API Key</Text>
            <TextInput
              style={styles.input}
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="Your API key"
              placeholderTextColor="#64748b"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitLoading}
            />
            <TouchableOpacity
              style={[styles.buttonPrimary, submitLoading && styles.buttonDisabled]}
              onPress={handleLink}
              disabled={submitLoading}
            >
              {submitLoading ? (
                <ActivityIndicator size="small" color="#0f172a" />
              ) : (
                <Text style={styles.buttonPrimaryText}>{linked ? "Save" : "Connect"}</Text>
              )}
            </TouchableOpacity>
            {linked && showForm && (
              <TouchableOpacity style={styles.buttonSecondary} onPress={() => { setShowForm(false); setAthleteId(""); setApiKey(""); }}>
                <Text style={styles.buttonSecondaryText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.hintCard}>
          <Text style={styles.hintText}>
            Athlete ID and API Key are in Intervals.icu: open intervals.icu in a browser, go to Settings → API (or your profile). Copy both values here.
          </Text>
          <TouchableOpacity onPress={openIntervalsSettings}>
            <Text style={styles.link}>Open intervals.icu</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a2e", padding: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  title: { fontSize: 22, fontWeight: "700", color: "#eee" },
  close: { fontSize: 16, color: "#38bdf8" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  hint: { fontSize: 14, color: "#94a3b8" },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  card: { backgroundColor: "#16213e", borderRadius: 12, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 14, color: "#94a3b8", marginBottom: 12 },
  value: { fontSize: 16, color: "#e2e8f0", marginBottom: 12 },
  label: { fontSize: 12, color: "#94a3b8", marginBottom: 4 },
  input: {
    backgroundColor: "#0f172a",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#e2e8f0",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  buttonPrimary: {
    backgroundColor: "#38bdf8",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 4,
  },
  buttonPrimaryText: { fontSize: 16, color: "#0f172a", fontWeight: "600" },
  buttonSecondary: { paddingVertical: 12, alignItems: "center", marginTop: 8 },
  buttonSecondaryText: { fontSize: 14, color: "#38bdf8" },
  buttonDanger: { paddingVertical: 12, alignItems: "center", marginTop: 4 },
  buttonDangerText: { fontSize: 14, color: "#f87171" },
  buttonDisabled: { opacity: 0.7 },
  confirmBlock: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#334155" },
  confirmText: { fontSize: 14, color: "#94a3b8", marginBottom: 12 },
  confirmRow: { flexDirection: "row", gap: 12, justifyContent: "flex-end" },
  hintCard: { backgroundColor: "#16213e", borderRadius: 12, padding: 16 },
  hintText: { fontSize: 13, color: "#94a3b8", marginBottom: 8 },
  link: { fontSize: 14, color: "#38bdf8" },
});
