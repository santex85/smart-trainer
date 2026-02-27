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
  Alert,
} from "react-native";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getChatHistory,
  sendChatMessage,
  sendChatMessageWithFit,
  runOrchestrator,
  getChatThreads,
  createChatThread,
  clearChatThread,
  type ChatMessage,
  type ChatThreadItem,
} from "../api/client";
import { useTheme } from "../theme";

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
  const { colors } = useTheme();
  const [threads, setThreads] = useState<ChatThreadItem[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachedFit, setAttachedFit] = useState<Blob | { uri: string; name: string } | null>(null);
  const [saveWorkout, setSaveWorkout] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const flatRef = useRef<FlatList>(null);

  const pickFitFile = useCallback(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const inputEl = document.createElement("input");
      inputEl.type = "file";
      inputEl.accept = ".fit";
      inputEl.onchange = async (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        setAttachedFit(file);
      };
      inputEl.click();
      return;
    }
    const openDocPicker = async () => {
      try {
        const { getDocumentAsync } = await import("expo-document-picker");
        const result = await getDocumentAsync({
          type: "*/*",
          copyToCacheDirectory: true,
        });
        if (result.canceled) return;
        const doc = result.assets[0];
        setAttachedFit({ uri: doc.uri, name: doc.name || "workout.fit" });
      } catch (err) {
        Alert.alert("Ошибка", "Не удалось выбрать файл");
      }
    };
    openDocPicker();
  }, []);

  const loadHistoryForThread = useCallback(async (threadId: number | null) => {
    try {
      const list = await getChatHistory(threadId, 50);
      setMessages(Array.isArray(list) ? list : []);
    } catch {
      setMessages([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const loadThreads = useCallback(async () => {
    try {
      const res = await getChatThreads();
      const nextThreads = res?.items ?? [];
      setThreads(nextThreads);
      if (nextThreads.length === 0) {
        const created = await createChatThread("Основной");
        setThreads([created]);
        setCurrentThreadId(created.id);
        await loadHistoryForThread(created.id);
      } else {
        const firstId = nextThreads[0].id;
        setCurrentThreadId(firstId);
        setLoadingHistory(true);
        await loadHistoryForThread(firstId);
      }
    } catch {
      setThreads([]);
      setCurrentThreadId(null);
      setMessages([]);
      setLoadingHistory(false);
    }
  }, [loadHistoryForThread]);

  useEffect(() => {
    setLoadingHistory(true);
    loadThreads();
  }, []);

  const selectThread = useCallback(
    (threadId: number) => {
      setCurrentThreadId(threadId);
      setLoadingHistory(true);
      loadHistoryForThread(threadId);
    },
    [loadHistoryForThread]
  );

  const onNewChat = useCallback(async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const created = await createChatThread("Новый чат");
      setThreads((prev) => [created, ...prev]);
      setCurrentThreadId(created.id);
      setMessages([]);
    } catch {
      // ignore
    }
  }, []);

  const onClearChat = useCallback(async () => {
    if (currentThreadId == null) return;
    try {
      await clearChatThread(currentThreadId);
      setMessages([]);
    } catch {
      // ignore
    }
  }, [currentThreadId]);

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
    if ((!text && !attachedFit) || loading) return;
    const userContent = text || "Приложен FIT-файл тренировки.";
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userContent }]);
    if (attachedFit) setAttachedFit(null);
    setLoading(true);
    try {
      const { reply } = attachedFit
        ? await sendChatMessageWithFit(text, attachedFit, currentThreadId ?? undefined, saveWorkout)
        : await sendChatMessage(text, false, currentThreadId ?? undefined);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.title}>AI-тренер</Text>
          <TouchableOpacity onPress={onClose}><Text style={styles.close}>Закрыть</Text></TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
    <KeyboardAvoidingView
      style={styles.flex1}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={80}
    >
      <View style={[styles.header, { borderBottomColor: colors.surfaceBorder }]}>
        <Text style={styles.title}>AI-тренер</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={onNewChat} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Новый чат</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClearChat} style={styles.headerBtn} disabled={currentThreadId == null}>
            <Text style={styles.headerBtnText}>Очистить</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.close}>Закрыть</Text>
          </TouchableOpacity>
        </View>
      </View>

      {threads.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsScroll}
          contentContainerStyle={styles.tabsContent}
        >
          {threads.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[styles.tab, t.id === currentThreadId && styles.tabActive]}
              onPress={() => selectThread(t.id)}
            >
              <Text style={[styles.tabText, t.id === currentThreadId && styles.tabTextActive]} numberOfLines={1}>
                {t.title}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      {loadingHistory ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#38bdf8" />
        </View>
      ) : (
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
      )}
      {attachedFit ? (
        <View style={styles.attachedRow}>
          <Text style={styles.attachedText}>Прикреплён FIT</Text>
          <TouchableOpacity onPress={() => setAttachedFit(null)} style={styles.attachedRemove}>
            <Text style={styles.attachedRemoveText}>Убрать</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setSaveWorkout((v) => !v)}
            style={[styles.saveWorkoutChip, saveWorkout && styles.saveWorkoutChipActive]}
          >
            <Text style={styles.saveWorkoutChipText}>{saveWorkout ? "В дневник ✓" : "Добавить в дневник"}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.inputRow}>
        <TouchableOpacity onPress={pickFitFile} style={styles.attachBtn} disabled={loading || loadingHistory}>
          <Text style={styles.attachBtnText}>FIT</Text>
        </TouchableOpacity>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, color: colors.text }]}
          placeholder="Сообщение или прикрепите FIT..."
          placeholderTextColor={colors.textMuted}
          value={input}
          onChangeText={setInput}
          editable={!loading && !loadingHistory}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: colors.primary }, (loading || loadingHistory) && styles.sendBtnDisabled]}
          onPress={() => send(false)}
          disabled={loading || loadingHistory || (!input.trim() && !attachedFit)}
        >
          <Text style={[styles.sendBtnText, { color: colors.primaryText }]}>Отправить</Text>
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
  headerActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  headerBtnText: { fontSize: 14, color: "#94a3b8" },
  close: { fontSize: 16, color: "#38bdf8" },
  tabsScroll: { maxHeight: 44, borderBottomWidth: 1, borderBottomColor: "#334155" },
  tabsContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: "row", alignItems: "center" },
  tab: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, marginRight: 8, backgroundColor: "#16213e" },
  tabActive: { backgroundColor: "#38bdf8" },
  tabText: { fontSize: 14, color: "#94a3b8" },
  tabTextActive: { color: "#0f172a", fontWeight: "600" },
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
  attachedRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, gap: 8, borderTopWidth: 1, borderTopColor: "#334155", backgroundColor: "#0f172a" },
  attachedText: { fontSize: 14, color: "#94a3b8" },
  attachedRemove: { paddingVertical: 4, paddingHorizontal: 8 },
  attachedRemoveText: { fontSize: 14, color: "#38bdf8" },
  saveWorkoutChip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12, backgroundColor: "#16213e" },
  saveWorkoutChipActive: { backgroundColor: "#38bdf8" },
  saveWorkoutChipText: { fontSize: 13, color: "#e2e8f0" },
  inputRow: { flexDirection: "row", padding: 12, gap: 8, alignItems: "flex-end", borderTopWidth: 1, borderTopColor: "#334155", paddingHorizontal: 16 },
  attachBtn: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, backgroundColor: "#16213e", justifyContent: "center" },
  attachBtnText: { fontSize: 14, color: "#38bdf8", fontWeight: "600" },
  input: { flex: 1, backgroundColor: "#16213e", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: "#e2e8f0", maxHeight: 100 },
  sendBtn: { backgroundColor: "#38bdf8", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 20, justifyContent: "center" },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: "#0f172a", fontWeight: "600" },
  orchBtn: { padding: 12, alignItems: "center", paddingHorizontal: 16 },
  orchBtnText: { fontSize: 14, color: "#b8c5d6" },
});
