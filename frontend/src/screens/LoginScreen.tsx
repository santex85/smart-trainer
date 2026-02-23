import React, { useState } from "react";
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
import { login, type AuthUser } from "../api/client";
import { setAccessToken } from "../storage/authStorage";

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

export function LoginScreen({
  onSuccess,
  onGoToRegister,
}: {
  onSuccess: (user: AuthUser) => void;
  onGoToRegister: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const e = email.trim().toLowerCase();
    if (!e || !password) {
      setError("Enter email and password");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await login(e, password);
      await setAccessToken(res.access_token);
      onSuccess(res.user);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={20}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.title}>Sign in</Text>
            <Text style={styles.hint}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!loading}
            />
            <Text style={styles.hint}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#64748b"
              secureTextEntry
              editable={!loading}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity
              style={[styles.buttonPrimary, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#0f172a" />
              ) : (
                <Text style={styles.buttonPrimaryText}>Sign in</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.link} onPress={onGoToRegister} disabled={loading}>
              <Text style={styles.linkText}>Create an account</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a2e", padding: 20 },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingTop: 40, paddingBottom: 24 },
  card: { backgroundColor: "#16213e", borderRadius: 12, padding: 16 },
  title: { fontSize: 22, fontWeight: "700", color: "#eee", marginBottom: 20 },
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
  buttonPrimary: {
    backgroundColor: "#38bdf8",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 4,
  },
  buttonPrimaryText: { fontSize: 16, color: "#0f172a", fontWeight: "600" },
  buttonDisabled: { opacity: 0.7 },
  link: { alignItems: "center", marginTop: 20 },
  linkText: { fontSize: 14, color: "#38bdf8" },
});
