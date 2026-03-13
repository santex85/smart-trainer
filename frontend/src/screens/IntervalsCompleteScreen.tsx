import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { completeIntervalsAuth, getIntervalsPending, type AuthUser } from "../api/client";
import { IntervalsIcon } from "../components/IntervalsIcon";
import { useTranslation } from "../i18n";
import { setAccessToken, setRefreshToken } from "../storage/authStorage";
import { useTheme, contentWrap } from "../theme";
import { getAuthErrorMessage } from "../utils/authError";

const EMAIL_FORMAT_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export function IntervalsCompleteScreen({
  pendingKey,
  onSuccess,
  onError,
}: {
  pendingKey: string;
  onSuccess: (user: AuthUser) => void;
  onError?: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingData, setPendingData] = useState<{
    athlete_id: string;
    athlete_name: string;
    has_user: boolean;
  } | null>(null);

  useEffect(() => {
    getIntervalsPending(pendingKey)
      .then(setPendingData)
      .catch(() => {
        setError(t("auth.requestError"));
        onError?.();
      })
      .finally(() => setPendingLoading(false));
  }, [pendingKey, t, onError]);

  const handleComplete = async () => {
    if (!pendingData) return;
    if (!pendingData.has_user && !email.trim()) {
      setError(t("auth.emailRequired"));
      return;
    }
    if (!pendingData.has_user && !EMAIL_FORMAT_RE.test(email.trim().toLowerCase())) {
      setError(t("auth.invalidEmailFormat"));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await completeIntervalsAuth(
        pendingKey,
        pendingData.has_user ? undefined : email.trim().toLowerCase()
      );
      await setAccessToken(res.access_token);
      await setRefreshToken(res.refresh_token);
      onSuccess(res.user);
    } catch (err) {
      setError(getAuthErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  };

  if (pendingLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
        <View style={[styles.flex, styles.centered]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>{t("app.loading")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!pendingData) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
        <View style={[styles.flex, styles.centered]}>
          <Text style={[styles.errorText, { color: colors.text }]}>{error || t("auth.requestError")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={20}
      >
        <View style={[styles.flex, contentWrap]}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.cardWrapper}>
              <View
                style={[
                  styles.cardBase,
                  styles.cardForm,
                  {
                    backgroundColor: colors.glassBg,
                    borderColor: colors.glassBorder,
                    borderWidth: 1,
                    borderRadius: colors.borderRadiusLg,
                    padding: 20,
                  },
                  Platform.OS === "web" && { backdropFilter: "blur(20px)" as any },
                ]}
              >
                <View style={styles.headerRow}>
                  <IntervalsIcon size={32} />
                  <Text style={[styles.title, { color: colors.text }]}>{t("auth.intervalsCompleteTitle")}</Text>
                </View>
                {pendingData.athlete_name ? (
                  <Text style={[styles.hint, { color: colors.textMuted }]}>
                    {pendingData.athlete_name}
                  </Text>
                ) : null}
                {pendingData.has_user ? (
                  <Text style={[styles.hint, { color: colors.textMuted, marginBottom: 16 }]}>
                    {t("auth.intervalsCompleteExistingHint")}
                  </Text>
                ) : (
                  <>
                    <Text style={[styles.hint, { color: colors.textMuted }]}>{t("auth.email")}</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]}
                      value={email}
                      onChangeText={setEmail}
                      placeholder="you@example.com"
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      editable={!loading}
                    />
                  </>
                )}
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t("auth.intervalsCompleteCta")}
                  style={[styles.buttonPrimary, { backgroundColor: colors.primary }, loading && styles.buttonDisabled]}
                  onPress={handleComplete}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={colors.primaryText} />
                  ) : (
                    <Text style={[styles.buttonPrimaryText, { color: colors.primaryText }]}>
                      {t("auth.intervalsCompleteCta")}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a2e", padding: 20 },
  flex: { flex: 1 },
  centered: { justifyContent: "center", alignItems: "center" },
  scrollContent: { flexGrow: 1, paddingTop: 40, paddingBottom: 24 },
  cardWrapper: { width: "100%", alignItems: "center" },
  cardBase: { borderRadius: 24, marginBottom: 24 },
  cardForm: { maxWidth: 400, width: "100%" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "700", flex: 1 },
  hint: { fontSize: 14, color: "#94a3b8", marginBottom: 6 },
  input: {
    backgroundColor: "#1a1a2e",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#e2e8f0",
    marginBottom: 16,
  },
  error: { fontSize: 14, color: "#f87171", marginBottom: 12 },
  loadingText: { marginTop: 12, fontSize: 14 },
  errorText: { fontSize: 16, textAlign: "center" },
  buttonPrimary: {
    backgroundColor: "#38bdf8",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 4,
  },
  buttonPrimaryText: { fontSize: 16, color: "#0f172a", fontWeight: "600" },
  buttonDisabled: { opacity: 0.7 },
});
