import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getChatHistory, sendChatMessage, runOrchestrator, type ChatMessage } from "../api/client";

export function ChatScreen({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const flatRef = useRef<FlatList>(null);

  const loadHistory = useCallback(async () => {
    try {
      const list = await getChatHistory(50);
      setMessages(Array.isArray(list) ? list : []);
    } catch {
      setMessages([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const send = async (runOrch = false) => {
    if (runOrch) {
      if (loading) return;
      setMessages((prev) => [...prev, { role: "user", content: "What's today's decision?" }]);
      setLoading(true);
      try {
        const orch = await runOrchestrator();
        const reply = `Decision: ${orch.decision}. ${orch.reason}${orch.suggestions_next_days ? "\n\n" + orch.suggestions_next_days : ""}`;
        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
      } catch (e) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Error: " + (e instanceof Error ? e.message : "Request failed") },
        ]);
      } finally {
        setLoading(false);
      }
      return;
    }
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);
    try {
      const { reply } = await sendChatMessage(text, false);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error: " + (e instanceof Error ? e.message : "Request failed") },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (loadingHistory) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.title}>AI Coach</Text>
          <TouchableOpacity onPress={onClose}><Text style={styles.close}>Close</Text></TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#38bdf8" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
    <KeyboardAvoidingView
      style={styles.flex1}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={80}
    >
      <View style={styles.header}>
        <Text style={styles.title}>AI Coach</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.close}>Close</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatRef}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.assistantBubble]}>
            <Text style={styles.bubbleText}>{item.content}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.placeholder}>Send a message or ask for today's decision.</Text>}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Message..."
          placeholderTextColor="#64748b"
          value={input}
          onChangeText={setInput}
          editable={!loading}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          style={[styles.sendBtn, loading && styles.sendBtnDisabled]}
          onPress={() => send(false)}
          disabled={loading || !input.trim()}
        >
          <Text style={styles.sendBtnText}>Send</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={[styles.orchBtn, loading && styles.sendBtnDisabled]}
        onPress={() => send(true)}
        disabled={loading}
      >
        <Text style={styles.orchBtnText}>Get today's decision (Go/Modify/Skip)</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a2e" },
  flex1: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "#334155" },
  title: { fontSize: 20, fontWeight: "700", color: "#eee" },
  close: { fontSize: 16, color: "#38bdf8" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  listContent: { padding: 16, paddingBottom: 24 },
  bubble: { maxWidth: "85%", padding: 12, borderRadius: 16, marginBottom: 8 },
  userBubble: { alignSelf: "flex-end", backgroundColor: "#38bdf8" },
  assistantBubble: { alignSelf: "flex-start", backgroundColor: "#16213e" },
  bubbleText: { fontSize: 15, color: "#e2e8f0" },
  placeholder: { color: "#64748b", textAlign: "center", marginTop: 24 },
  inputRow: { flexDirection: "row", padding: 12, gap: 8, alignItems: "flex-end", borderTopWidth: 1, borderTopColor: "#334155" },
  input: { flex: 1, backgroundColor: "#16213e", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: "#e2e8f0", maxHeight: 100 },
  sendBtn: { backgroundColor: "#38bdf8", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 20, justifyContent: "center" },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: "#0f172a", fontWeight: "600" },
  orchBtn: { padding: 12, alignItems: "center" },
  orchBtnText: { fontSize: 14, color: "#94a3b8" },
});
