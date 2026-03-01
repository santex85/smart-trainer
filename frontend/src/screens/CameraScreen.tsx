import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
  TextInput,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import {
  uploadPhotoForAnalysis,
  createNutritionEntry,
  saveSleepFromPreview,
  createOrUpdateWellness,
  type NutritionResult,
  type SleepExtractionResponse,
  type SleepExtractedData,
  type WellnessPhotoResult,
} from "../api/client";
import { t } from "../i18n";
import { devLog, getLogs, clearLogs, subscribe, isDevLogEnabled, type LogEntry } from "../utils/devLog";
import { PremiumGateModal } from "../components/PremiumGateModal";

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
  onWellnessSaved,
  onOpenPricing,
}: {
  onClose: () => void;
  onSaved?: (result: NutritionResult) => void;
  onSleepSaved?: (result: SleepExtractionResponse) => void;
  onWellnessSaved?: () => void;
  onOpenPricing?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedPhotoUri, setSelectedPhotoUri] = useState<string | null>(null);
  const [photoResult, setPhotoResult] = useState<
    | { type: "food"; food: NutritionResult }
    | { type: "sleep"; sleep: SleepExtractionResponse }
    | { type: "wellness"; wellness: WellnessPhotoResult }
    | null
  >(null);
  const [selectedMealType, setSelectedMealType] = useState<string>("other");
  const [editedFood, setEditedFood] = useState<{
    name: string;
    portion_grams: number;
    calories: number;
    protein_g: number;
    fat_g: number;
    carbs_g: number;
  } | null>(null);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [premiumGateVisible, setPremiumGateVisible] = useState(false);

  const isPreview = (): boolean => {
    if (!photoResult) return false;
    if (photoResult.type === "food") return (photoResult.food.id ?? 0) === 0;
    if (photoResult.type === "wellness") return true;
    return (photoResult.sleep.id ?? 0) === 0;
  };

  useEffect(() => {
    setLogEntries(getLogs());
    const unsub = subscribe(() => setLogEntries(getLogs()));
    return unsub;
  }, []);

  const pickImage = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Нужен доступ", "Разрешите доступ к фото для учёта питания.");
      return;
    }
    const isNativeApp = Platform.OS !== "web";
    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: isNativeApp,
      aspect: isNativeApp ? [1, 1] as [number, number] : undefined,
      quality: 0.8,
    });
    if (pickerResult.canceled) return;
    const asset = pickerResult.assets[0];
    if (!asset?.uri) {
      devLog("pickImage: no asset uri", "warn");
      Alert.alert("Ошибка", "Не удалось получить фото. Попробуйте ещё раз.");
      return;
    }
    devLog("pickImage: selected, starting upload (preview)");
    setLoading(true);
    setPhotoResult(null);
    setSelectedPhotoUri(asset.uri);
    try {
      const res = await uploadPhotoForAnalysis(
        { uri: asset.uri, name: "meal.jpg", type: "image/jpeg" },
        undefined,
        false
      );
      devLog("pickImage: upload success");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setPhotoResult(res);
      if (res?.type === "food") {
        setSelectedMealType("other");
        setEditedFood({
          name: res.food.name,
          portion_grams: res.food.portion_grams,
          calories: res.food.calories,
          protein_g: res.food.protein_g,
          fat_g: res.food.fat_g,
          carbs_g: res.food.carbs_g,
        });
      } else {
        setEditedFood(null);
      }
    } catch (e) {
      devLog(`pickImage: error ${e instanceof Error ? e.message : String(e)}`, "error");
      const msg = e instanceof Error ? e.message : "";
      if ((msg.includes("429") || msg.includes("limit") || msg.includes("Daily limit")) && onOpenPricing) {
        setPremiumGateVisible(true);
      } else {
        Alert.alert("Ошибка", getErrorMessage(e));
      }
    } finally {
      setLoading(false);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Нужен доступ", "Разрешите доступ к камере для фото еды.");
      return;
    }
    const isNativeApp = Platform.OS !== "web";
    const pickerResult = await ImagePicker.launchCameraAsync({
      allowsEditing: isNativeApp,
      aspect: isNativeApp ? [1, 1] as [number, number] : undefined,
      quality: 0.8,
    });
    if (pickerResult.canceled) return;
    const asset = pickerResult.assets[0];
    if (!asset?.uri) {
      devLog("takePhoto: no asset uri", "warn");
      Alert.alert("Ошибка", "Не удалось получить фото. Попробуйте ещё раз.");
      return;
    }
    devLog("takePhoto: captured, starting upload (preview)");
    setLoading(true);
    setPhotoResult(null);
    setSelectedPhotoUri(asset.uri);
    try {
      const res = await uploadPhotoForAnalysis(
        { uri: asset.uri, name: "meal.jpg", type: "image/jpeg" },
        undefined,
        false
      );
      devLog("takePhoto: upload success");
      setPhotoResult(res);
      if (res?.type === "food") {
        setSelectedMealType("other");
        setEditedFood({
          name: res.food.name,
          portion_grams: res.food.portion_grams,
          calories: res.food.calories,
          protein_g: res.food.protein_g,
          fat_g: res.food.fat_g,
          carbs_g: res.food.carbs_g,
        });
      } else {
        setEditedFood(null);
      }
    } catch (e) {
      devLog(`takePhoto: error ${e instanceof Error ? e.message : String(e)}`, "error");
      const msg = e instanceof Error ? e.message : "";
      if ((msg.includes("429") || msg.includes("limit") || msg.includes("Daily limit")) && onOpenPricing) {
        setPremiumGateVisible(true);
      } else {
        Alert.alert("Ошибка", getErrorMessage(e));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!photoResult) return;
    setSaving(true);
    try {
      if (photoResult.type === "food") {
        const today = new Date().toISOString().slice(0, 10);
        const payload = editedFood ?? {
          name: photoResult.food.name,
          portion_grams: photoResult.food.portion_grams,
          calories: photoResult.food.calories,
          protein_g: photoResult.food.protein_g,
          fat_g: photoResult.food.fat_g,
          carbs_g: photoResult.food.carbs_g,
        };
        await createNutritionEntry({
          ...payload,
          meal_type: selectedMealType,
          date: today,
        });
        onSaved?.({ ...photoResult.food, ...payload });
      } else if (photoResult.type === "wellness") {
        const today = new Date().toISOString().slice(0, 10);
        await createOrUpdateWellness({
          date: today,
          rhr: photoResult.wellness.rhr ?? undefined,
          hrv: photoResult.wellness.hrv ?? undefined,
        });
        onWellnessSaved?.();
      } else {
        const saved = await saveSleepFromPreview(photoResult.sleep.extracted_data);
        onSleepSaved?.(saved);
      }
      setPhotoResult(null);
      setSelectedPhotoUri(null);
      onClose();
    } catch (e) {
      devLog(`handleSave: error ${e instanceof Error ? e.message : String(e)}`, "error");
      Alert.alert("Ошибка", getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setPhotoResult(null);
    setSelectedPhotoUri(null);
    setEditedFood(null);
  };

  const MEAL_TYPES = [
    { value: "breakfast", label: "Завтрак" },
    { value: "lunch", label: "Обед" },
    { value: "dinner", label: "Ужин" },
    { value: "snack", label: "Перекус" },
    { value: "other", label: "Другое" },
  ] as const;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Фото</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.close}>Закрыть</Text>
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
            <Text style={styles.hint}>Анализ с помощью ИИ…</Text>
          </View>
        )}

        {photoResult?.type === "food" && !loading && (
          <View style={[styles.result, Platform.OS === "web" && { backdropFilter: "blur(20px)" }]}>
            {selectedPhotoUri ? (
              <Image source={{ uri: selectedPhotoUri }} style={styles.photoThumbnail} resizeMode="cover" />
            ) : null}
            {isPreview() && editedFood ? (
              <>
                <Text style={styles.editLabel}>Название</Text>
                <TextInput
                  style={styles.editInput}
                  value={editedFood.name}
                  onChangeText={(t) => setEditedFood((p) => (p ? { ...p, name: t } : null))}
                  placeholder="Блюдо"
                  placeholderTextColor="#64748b"
                />
                <View style={styles.editRow}>
                  <View style={styles.editHalf}>
                    <Text style={styles.editLabel}>Ккал</Text>
                    <TextInput
                      style={styles.editInput}
                      value={String(editedFood.calories)}
                      onChangeText={(t) => setEditedFood((p) => (p ? { ...p, calories: Number(t) || 0 } : null))}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor="#64748b"
                    />
                  </View>
                  <View style={styles.editHalf}>
                    <Text style={styles.editLabel}>Порция (г)</Text>
                    <TextInput
                      style={styles.editInput}
                      value={String(editedFood.portion_grams)}
                      onChangeText={(t) => setEditedFood((p) => (p ? { ...p, portion_grams: Number(t) || 0 } : null))}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor="#64748b"
                    />
                  </View>
                </View>
                <View style={styles.editRow}>
                  <View style={styles.editThird}><Text style={styles.editLabel}>Б</Text><TextInput style={styles.editInput} value={String(editedFood.protein_g)} onChangeText={(t) => setEditedFood((p) => (p ? { ...p, protein_g: Number(t) || 0 } : null))} keyboardType="numeric" placeholder="0" placeholderTextColor="#64748b" /></View>
                  <View style={styles.editThird}><Text style={styles.editLabel}>Ж</Text><TextInput style={styles.editInput} value={String(editedFood.fat_g)} onChangeText={(t) => setEditedFood((p) => (p ? { ...p, fat_g: Number(t) || 0 } : null))} keyboardType="numeric" placeholder="0" placeholderTextColor="#64748b" /></View>
                  <View style={styles.editThird}><Text style={styles.editLabel}>У</Text><TextInput style={styles.editInput} value={String(editedFood.carbs_g)} onChangeText={(t) => setEditedFood((p) => (p ? { ...p, carbs_g: Number(t) || 0 } : null))} keyboardType="numeric" placeholder="0" placeholderTextColor="#64748b" /></View>
                </View>
                <Text style={styles.editLabel}>Приём пищи</Text>
                <View style={styles.mealTypeRow}>
                  {MEAL_TYPES.map(({ value, label }) => (
                    <TouchableOpacity
                      key={value}
                      style={[styles.mealTypeBtn, selectedMealType === value && styles.mealTypeBtnActive]}
                      onPress={() => setSelectedMealType(value)}
                    >
                      <Text style={[styles.mealTypeBtnText, selectedMealType === value && styles.mealTypeBtnTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : (
              <>
                <Text style={styles.resultName}>{photoResult.food.name}</Text>
                <Text style={styles.resultMacros}>
                  {photoResult.food.calories} {t("nutrition.kcal")} · {t("nutrition.proteinShort")} {photoResult.food.protein_g}{t("nutrition.grams")} · {t("nutrition.fatShort")} {photoResult.food.fat_g}{t("nutrition.grams")} · {t("nutrition.carbsShort")} {photoResult.food.carbs_g}{t("nutrition.grams")}
                </Text>
                <Text style={styles.hint}>Порция: {photoResult.food.portion_grams}г</Text>
              </>
            )}
            {photoResult.food.extended_nutrients && Object.keys(photoResult.food.extended_nutrients).length > 0 ? (
              <>
                <Text style={styles.editLabel}>{t("nutrition.micronutrients")}</Text>
                <View style={styles.micronutrientsBlock}>
                  {Object.entries(photoResult.food.extended_nutrients).map(([key, value]) => {
                    const labelKey = `nutrition.micronutrientLabels.${key}`;
                    const label = t(labelKey) !== labelKey ? t(labelKey) : key;
                    return (
                      <View key={key} style={styles.microRow}>
                        <Text style={styles.microLabel}>{label}</Text>
                        <Text style={styles.microValue}>{typeof value === "number" ? Math.round(value * 10) / 10 : value}</Text>
                      </View>
                    );
                  })}
                </View>
              </>
            ) : null}
            <Text style={styles.resultWhere}>
              {isPreview() ? "Проверьте данные и нажмите Сохранить." : "Сохранено. Закройте, чтобы вернуться."}
            </Text>
            {isPreview() ? (
              <View style={styles.previewActions}>
                <TouchableOpacity
                  style={[styles.doneBtn, styles.saveBtn]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  <Text style={styles.doneBtnText}>{saving ? "…" : "Сохранить"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} disabled={saving}>
                  <Text style={styles.cancelBtnText}>Отмена</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
                <Text style={styles.doneBtnText}>Готово</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {photoResult?.type === "sleep" && !loading && (
          <View style={[styles.result, Platform.OS === "web" && { backdropFilter: "blur(20px)" }]}>
            {selectedPhotoUri ? (
              <Image source={{ uri: selectedPhotoUri }} style={styles.photoThumbnail} resizeMode="cover" />
            ) : null}
            <Text style={styles.resultName}>Распознаны данные сна</Text>
            <SleepDataLines data={photoResult.sleep.extracted_data} />
            <Text style={styles.resultWhere}>
              {isPreview() ? "Проверьте данные и нажмите Сохранить." : "Сохранено. Закройте, чтобы вернуться."}
            </Text>
            {isPreview() ? (
              <View style={styles.previewActions}>
                <TouchableOpacity
                  style={[styles.doneBtn, styles.saveBtn]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  <Text style={styles.doneBtnText}>{saving ? "…" : "Сохранить"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} disabled={saving}>
                  <Text style={styles.cancelBtnText}>Отмена</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
                <Text style={styles.doneBtnText}>Готово</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {photoResult?.type === "wellness" && !loading && (
          <View style={[styles.result, Platform.OS === "web" && { backdropFilter: "blur(20px)" }]}>
            {selectedPhotoUri ? (
              <Image source={{ uri: selectedPhotoUri }} style={styles.photoThumbnail} resizeMode="cover" />
            ) : null}
            <Text style={styles.resultName}>Распознаны пульс и HRV</Text>
            <View style={styles.sleepLines}>
              {photoResult.wellness.rhr != null && (
                <Text style={styles.sleepLine}>Пульс в покое (RHR): {photoResult.wellness.rhr} уд/мин</Text>
              )}
              {photoResult.wellness.hrv != null && (
                <Text style={styles.sleepLine}>HRV: {photoResult.wellness.hrv}</Text>
              )}
              {photoResult.wellness.rhr == null && photoResult.wellness.hrv == null && (
                <Text style={styles.hint}>Не удалось извлечь RHR или HRV.</Text>
              )}
            </View>
            <Text style={styles.resultWhere}>Проверьте данные и нажмите Сохранить.</Text>
            <View style={styles.previewActions}>
              <TouchableOpacity
                style={[styles.doneBtn, styles.saveBtn]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={styles.doneBtnText}>{saving ? "…" : "Сохранить"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} disabled={saving}>
                <Text style={styles.cancelBtnText}>Отмена</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {!photoResult && !loading && (
          <>
            <Text style={styles.flowHint}>
              Выберите фото — мы определим: еда, сон или пульс/HRV, и обработаем.
            </Text>
            <View style={styles.actions}>
              <TouchableOpacity style={[styles.button, Platform.OS === "web" && { backdropFilter: "blur(20px)" }]} onPress={takePhoto}>
                <Text style={styles.buttonIcon}>📷</Text>
                <Text style={styles.buttonText}>Сделать фото</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, Platform.OS === "web" && { backdropFilter: "blur(20px)" }]} onPress={pickImage}>
                <Text style={styles.buttonIcon}>🖼️</Text>
                <Text style={styles.buttonText}>Выбрать из галереи</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      <PremiumGateModal
        visible={premiumGateVisible}
        onClose={() => setPremiumGateVisible(false)}
        onUpgrade={() => { setPremiumGateVisible(false); onOpenPricing?.(); }}
        limitReached
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D0D0D", padding: 20 },
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
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
  },
  buttonIcon: { fontSize: 40, marginBottom: 8 },
  buttonText: { fontSize: 18, color: "#e2e8f0", fontWeight: "600" },
  result: { backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 24, padding: 20 },
  photoThumbnail: { width: "100%", height: 180, borderRadius: 8, marginBottom: 12 },
  resultName: { fontSize: 20, color: "#e2e8f0", fontWeight: "600", marginBottom: 8 },
  resultMacros: { fontSize: 16, color: "#94a3b8", marginBottom: 4 },
  resultWhere: { fontSize: 12, color: "#64748b", marginTop: 8 },
  sleepLines: { marginVertical: 8, gap: 4 },
  sleepLine: { fontSize: 14, color: "#94a3b8" },
  doneBtn: { marginTop: 20, backgroundColor: "#38bdf8", paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  doneBtnText: { fontSize: 16, color: "#0f172a", fontWeight: "600" },
  saveBtn: { marginTop: 12 },
  previewActions: { marginTop: 16, gap: 10 },
  cancelBtn: { paddingVertical: 14, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: "#64748b" },
  cancelBtnText: { fontSize: 16, color: "#94a3b8", fontWeight: "600" },
  editLabel: { fontSize: 12, color: "#94a3b8", marginTop: 8, marginBottom: 4 },
  editInput: { backgroundColor: "#1a1a2e", borderRadius: 8, padding: 10, fontSize: 16, color: "#e2e8f0", marginBottom: 4 },
  editRow: { flexDirection: "row", gap: 8 },
  editHalf: { flex: 1 },
  editThird: { flex: 1 },
  mealTypeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4, marginBottom: 8 },
  mealTypeBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: "#1a1a2e" },
  mealTypeBtnActive: { backgroundColor: "#38bdf8" },
  mealTypeBtnText: { fontSize: 12, color: "#94a3b8" },
  mealTypeBtnTextActive: { fontSize: 12, color: "#0f172a", fontWeight: "600" },
  micronutrientsBlock: { marginTop: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  microRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  microLabel: { fontSize: 12, color: "#94a3b8" },
  microValue: { fontSize: 12, color: "#e2e8f0" },
  logPanel: { marginBottom: 12, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12, maxHeight: 180, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  logHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#334155" },
  logTitle: { fontSize: 12, fontWeight: "600", color: "#94a3b8" },
  logClear: { fontSize: 12, color: "#38bdf8" },
  logScroll: { maxHeight: 140 },
  logScrollContent: { padding: 12 },
  logLine: { fontSize: 11, fontFamily: "monospace", color: "#94a3b8", marginBottom: 2 },
  logLineWarn: { color: "#fbbf24" },
  logLineError: { color: "#f87171" },
});
