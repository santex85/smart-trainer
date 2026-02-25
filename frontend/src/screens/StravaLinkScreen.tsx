import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Linking,
  AppState,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getStravaStatus, getStravaAuthorizeUrl, unlinkStrava, syncStrava } from "../api/client";

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

export function StravaLinkScreen({
  onClose,
  onViewAllActivity,
}: {
  onClose: () => void;
  onViewAllActivity?: () => void;
}) {
  const [statusLoading, setStatusLoading] = useState(true);
  const [linked, setLinked] = useState(false);
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  const [unlinkLoading, setUnlinkLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const s = await getStravaStatus();
      setLinked(s.linked);
      setAthleteId(s.athlete_id ?? null);
    } catch {
      setLinked(false);
      setAthleteId(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        loadStatus();
      }
    });
    return () => sub.remove();
  }, [loadStatus]);

  const handleConnect = async () => {
    try {
      const { url } = await getStravaAuthorizeUrl();
      await Linking.openURL(url);
      Alert.alert(
        "Авторизация в браузере",
        "После авторизации в Strava вернитесь в приложение и нажмите «Проверить подключение» или закройте и снова откройте этот экран.",
        [{ text: "OK" }]
      );
    } catch (e) {
      Alert.alert("Ошибка", getErrorMessage(e));
    }
  };

  const handleSync = async () => {
    setSyncLoading(true);
    try {
      const res = await syncStrava();
      if (res.status === "queued") {
        Alert.alert("В очереди", res.message ?? "Синхронизация запустится, когда позволит лимит.");
      } else {
        Alert.alert("Готово", "Синхронизация запущена. Закройте и проверьте дашборд.");
      }
      await loadStatus();
    } catch (e) {
      Alert.alert("Ошибка синхронизации", getErrorMessage(e));
    } finally {
      setSyncLoading(false);
    }
  };

  const handleUnlinkConfirm = async () => {
    setUnlinkLoading(true);
    try {
      await unlinkStrava();
      setShowUnlinkConfirm(false);
      await loadStatus();
      onClose();
    } catch (e) {
      Alert.alert("Ошибка", getErrorMessage(e));
    } finally {
      setUnlinkLoading(false);
    }
  };

  if (statusLoading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.title}>Strava</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.close}>Закрыть</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#38bdf8" />
          <Text style={styles.hint}>Загрузка…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Strava</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.close}>Закрыть</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {linked ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Подключено</Text>
            {athleteId ? <Text style={styles.value}>ID атлета: {athleteId}</Text> : null}
            <TouchableOpacity
              style={[styles.buttonSecondary, syncLoading && styles.buttonDisabled]}
              onPress={loadStatus}
              disabled={syncLoading}
            >
              <Text style={styles.buttonSecondaryText}>Проверить подключение</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.buttonPrimary, syncLoading && styles.buttonDisabled]}
              onPress={handleSync}
              disabled={syncLoading}
            >
              {syncLoading ? (
                <ActivityIndicator size="small" color="#0f172a" />
              ) : (
                <Text style={styles.buttonPrimaryText}>Синхронизировать</Text>
              )}
            </TouchableOpacity>
            {onViewAllActivity ? (
              <TouchableOpacity style={styles.buttonSecondary} onPress={onViewAllActivity}>
                <Text style={styles.buttonSecondaryText}>Все тренировки</Text>
              </TouchableOpacity>
            ) : null}
            {showUnlinkConfirm ? (
              <View style={styles.confirmBlock}>
                <Text style={styles.confirmText}>Отключить Strava? Тренировки из Strava больше не будут отображаться.</Text>
                <View style={styles.confirmRow}>
                  <TouchableOpacity
                    style={styles.buttonDanger}
                    onPress={handleUnlinkConfirm}
                    disabled={unlinkLoading}
                  >
                    {unlinkLoading ? (
                      <ActivityIndicator size="small" color="#f87171" />
                    ) : (
                      <Text style={styles.buttonDangerText}>Отключить</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.buttonSecondary}
                    onPress={() => setShowUnlinkConfirm(false)}
                    disabled={unlinkLoading}
                  >
                    <Text style={styles.buttonSecondaryText}>Отмена</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.buttonDanger} onPress={() => setShowUnlinkConfirm(true)}>
                <Text style={styles.buttonDangerText}>Отключить</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Подключить Strava</Text>
            <Text style={styles.hintText}>
              Подключите аккаунт Strava, чтобы импортировать тренировки. Откроется браузер для авторизации.
            </Text>
            <Text style={styles.warningHint}>
              Важно: на странице Strava должен отображаться ваш аккаунт. Если видите чужое имя — выйдите из Strava (или откройте режим инкогнито), войдите в свой аккаунт и повторите.
            </Text>
            <TouchableOpacity style={styles.buttonPrimary} onPress={handleConnect}>
              <Text style={styles.buttonPrimaryText}>Подключить Strava</Text>
            </TouchableOpacity>
          </View>
        )}
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
  hintText: { fontSize: 14, color: "#94a3b8", marginBottom: 16 },
  warningHint: { fontSize: 13, color: "#fbbf24", marginBottom: 16 },
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
});
