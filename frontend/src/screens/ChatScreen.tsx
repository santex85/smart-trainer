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
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getChatHistory, sendChatMessage, runOrchestrator, type ChatMessage } from "../api/client";

function formatChatTime(isoOrTimestamp: string): string {
  try {
    const d = new Date(isoOrTimestamp);
    if (Number.isNaN(d.getTime())) return "";
    const today = new Date();
    const isToday = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    if (isToday) {
      return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function ChatScreen({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const flatRef = useRef<FlatList>(null);

  const loadHistory = useCallback(async () => {
    try {
      const list = await getChatHistory(50);
      const messages = Array.isArray(list) ? list : [];
      // #region agent log
      const contents = messages.map((m) => `${m.role}:${(m.content || "").slice(0, 40)}`);
      const seen = new Set<string>();
      let duplicateContentCount = 0;
      contents.forEach((c) => {
        if (seen.has(c)) duplicateContentCount++;
        else seen.add(c);
      });
      fetch("http://127.0.0.1:7473/ingest/fed664d4-b533-42b4-b1b4-63de2b9a9c42", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "5aeb89" },
        body: JSON.stringify({
          sessionId: "5aeb89",
          location: "ChatScreen.tsx:loadHistory",
          message: "chat history loaded",
          data: {
            messageCount: messages.length,
            duplicateContentCount,
            firstThree: contents.slice(0, 3),
          },
          timestamp: Date.now(),
          hypothesisId: "H4",
        }),
      }).catch(() => {});
      // #endregion
      setMessages(messages);
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
      setMessages((prev) => [...prev, { role: "user", content: "Какое решение на сегодня?" }]);
      setLoading(true);
      try {
        const orch = await runOrchestrator();
        const reply = `Решение: ${orch.decision}. ${orch.reason}${orch.suggestions_next_days ? "\n\n" + orch.suggestions_next_days : ""}`;
        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
      } catch (e) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Ошибка: " + (e instanceof Error ? e.message : "Запрос не удался") },
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
        { role: "assistant", content: "Ошибка: " + (e instanceof Error ? e.message : "Запрос не удался") },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (loadingHistory) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.title}>AI-тренер</Text>
          <TouchableOpacity onPress={onClose}><Text style={styles.close}>Закрыть</Text></TouchableOpacity>
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
        <Text style={styles.title}>AI-тренер</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.close}>Закрыть</Text>
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
            {item.timestamp ? (
              <Text style={styles.bubbleTime}>{formatChatTime(item.timestamp)}</Text>
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.placeholder}>Напишите сообщение или запросите решение на сегодня.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickPrompts} contentContainerStyle={styles.quickPromptsContent}>
              {["Как прошла моя неделя?", "Что съесть перед тренировкой?", "Нужен ли мне отдых?"].map((prompt) => (
                <TouchableOpacity
                  key={prompt}
                  style={styles.quickPromptChip}
                  onPress={() => setInput(prompt)}
                >
                  <Text style={styles.quickPromptText}>{prompt}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        }
      />
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Сообщение..."
          placeholderTextColor="#94a3b8"
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
          <Text style={styles.sendBtnText}>Отправить</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={[styles.orchBtn, loading && styles.sendBtnDisabled]}
        onPress={() => send(true)}
        disabled={loading}
      >
        <Text style={styles.orchBtnText}>Решение на сегодня</Text>
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
  bubbleTime: { fontSize: 11, color: "#94a3b8", marginTop: 4 },
  emptyWrap: { paddingHorizontal: 16 },
  placeholder: { color: "#94a3b8", textAlign: "center", marginTop: 24 },
  quickPrompts: { marginTop: 16 },
  quickPromptsContent: { gap: 8, paddingBottom: 8, paddingHorizontal: 16 },
  quickPromptChip: { backgroundColor: "#16213e", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, marginRight: 8 },
  quickPromptText: { fontSize: 14, color: "#e2e8f0" },
  inputRow: { flexDirection: "row", padding: 12, gap: 8, alignItems: "flex-end", borderTopWidth: 1, borderTopColor: "#334155", paddingHorizontal: 16 },
  input: { flex: 1, backgroundColor: "#16213e", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: "#e2e8f0", maxHeight: 100 },
  sendBtn: { backgroundColor: "#38bdf8", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 20, justifyContent: "center" },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: "#0f172a", fontWeight: "600" },
  orchBtn: { padding: 12, alignItems: "center", paddingHorizontal: 16 },
  orchBtnText: { fontSize: 14, color: "#b8c5d6" },
});
