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
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getAthleteProfile,
  updateAthleteProfile,
  type AthleteProfileResponse,
} from "../api/client";

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

export function AthleteProfileScreen({ onClose }: { onClose: () => void }) {
  const [profile, setProfile] = useState<AthleteProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [ftp, setFtp] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await getAthleteProfile();
      setProfile(p);
      setWeight(p.weight_kg != null ? String(p.weight_kg) : "");
      setHeight(p.height_cm != null ? String(p.height_cm) : "");
      setBirthYear(p.birth_year != null ? String(p.birth_year) : "");
      setFtp(p.ftp != null ? String(p.ftp) : "");
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: { weight_kg?: number; height_cm?: number; birth_year?: number; ftp?: number } = {};
      if (weight.trim() !== "") {
        const v = parseFloat(weight);
        if (!Number.isNaN(v) && v > 0) payload.weight_kg = v;
      }
      if (height.trim() !== "") {
        const v = parseFloat(height);
        if (!Number.isNaN(v) && v > 0) payload.height_cm = v;
      }
      if (birthYear.trim() !== "") {
        const v = parseInt(birthYear, 10);
        if (!Number.isNaN(v) && v >= 1900 && v <= 2100) payload.birth_year = v;
      }
      if (ftp.trim() !== "") {
        const v = parseInt(ftp, 10);
        if (!Number.isNaN(v) && v > 0) payload.ftp = v;
      }
      const updated = await updateAthleteProfile(payload);
      setProfile(updated);
      setEditing(false);
    } catch (e) {
      Alert.alert("Ошибка", getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeText}>Закрыть</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Профиль атлета</Text>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#38bdf8" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.closeText}>Закрыть</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Профиль атлета</Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {profile?.strava_profile_url ? (
          <Image source={{ uri: profile.strava_profile_url }} style={styles.avatar} />
        ) : null}
        <Text style={styles.displayName}>{profile?.display_name ?? "—"}</Text>
        {profile?.strava_firstname || profile?.strava_lastname ? (
          <Text style={styles.hint}>Имя: {[profile.strava_firstname, profile.strava_lastname].filter(Boolean).join(" ")}</Text>
        ) : null}

        {editing ? (
          <>
            <Text style={styles.label}>Вес (кг)</Text>
            <TextInput
              style={styles.input}
              value={weight}
              onChangeText={setWeight}
              placeholder="e.g. 70"
              placeholderTextColor="#64748b"
              keyboardType="decimal-pad"
            />
            <Text style={styles.label}>Height (cm)</Text>
            <TextInput
              style={styles.input}
              value={height}
              onChangeText={setHeight}
              placeholder="e.g. 175"
              placeholderTextColor="#64748b"
              keyboardType="number-pad"
            />
            <Text style={styles.label}>Birth year</Text>
            <TextInput
              style={styles.input}
              value={birthYear}
              onChangeText={setBirthYear}
              placeholder="e.g. 1990"
              placeholderTextColor="#64748b"
              keyboardType="number-pad"
            />
            <Text style={styles.label}>FTP (watts)</Text>
            <TextInput
              style={styles.input}
              value={ftp}
              onChangeText={setFtp}
              placeholder="Используется для TSS по мощности"
              placeholderTextColor="#64748b"
              keyboardType="number-pad"
            />
            <Text style={styles.hint}>Введите вес, рост, год рождения и FTP. FTP используется для расчёта TSS по мощности.</Text>
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setEditing(false)}>
                <Text style={styles.btnSecondaryText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, saving && styles.btnDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? <ActivityIndicator size="small" color="#0f172a" /> : <Text style={styles.btnPrimaryText}>Сохранить</Text>}
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <View style={styles.row}>
              <Text style={styles.label}>Вес</Text>
              <Text style={styles.value}>{profile?.weight_kg != null ? `${profile.weight_kg} kg` : "—"}</Text>
              {profile?.weight_source ? <Text style={styles.source}>({profile.weight_source})</Text> : null}
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>FTP</Text>
              <Text style={styles.value}>{profile?.ftp != null ? `${profile.ftp} W` : "—"}</Text>
              {profile?.ftp_source ? <Text style={styles.source}>({profile.ftp_source})</Text> : null}
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Рост</Text>
              <Text style={styles.value}>{profile?.height_cm != null ? `${profile.height_cm} cm` : "—"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Birth year</Text>
              <Text style={styles.value}>{profile?.birth_year != null ? profile.birth_year : "—"}</Text>
            </View>
            <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
              <Text style={styles.editBtnText}>Редактировать профиль</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#1a1a2e" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  closeText: { fontSize: 16, color: "#38bdf8" },
  title: { fontSize: 18, fontWeight: "600", color: "#e2e8f0" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  avatar: { width: 80, height: 80, borderRadius: 40, alignSelf: "center", marginBottom: 12 },
  displayName: { fontSize: 20, fontWeight: "600", color: "#e2e8f0", textAlign: "center", marginBottom: 4 },
  hint: { fontSize: 12, color: "#64748b", marginTop: 4, marginBottom: 12 },
  label: { fontSize: 14, color: "#94a3b8", marginTop: 12 },
  value: { fontSize: 16, color: "#e2e8f0", fontWeight: "500" },
  source: { fontSize: 12, color: "#64748b", marginLeft: 6 },
  row: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", marginTop: 4 },
  input: {
    backgroundColor: "#16213e",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#e2e8f0",
    marginTop: 6,
  },
  editActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  btnPrimary: { flex: 1, backgroundColor: "#38bdf8", paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  btnPrimaryText: { fontSize: 16, color: "#0f172a", fontWeight: "600" },
  btnSecondary: { paddingVertical: 12, paddingHorizontal: 16 },
  btnSecondaryText: { fontSize: 16, color: "#94a3b8" },
  btnDisabled: { opacity: 0.7 },
  editBtn: { marginTop: 20, paddingVertical: 12, alignItems: "center" },
  editBtnText: { fontSize: 16, color: "#38bdf8" },
});
