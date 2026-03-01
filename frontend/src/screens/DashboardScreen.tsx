import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Pressable,
  Platform,
  LayoutAnimation,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Swipeable } from "react-native-gesture-handler";
import {
  getNutritionDay,
  createNutritionEntry,
  updateNutritionEntry,
  deleteNutritionEntry,
  reanalyzeNutritionEntry,
  runOrchestrator,
  getWellness,
  createOrUpdateWellness,
  getSleepExtractions,
  reanalyzeSleepExtraction,
  getAthleteProfile,
  updateAthleteProfile,
  getWorkouts,
  getWorkoutFitness,
  createWorkout,
  uploadFitWorkout,
  previewFitWorkout,
  deleteWorkout,
  type AthleteProfileResponse,
  type NutritionDayResponse,
  type NutritionDayEntry,
  type AuthUser,
  type WellnessDay,
  type WorkoutItem,
  type WorkoutPreviewItem,
  type WorkoutFitness,
  type SleepExtractionSummary,
} from "../api/client";
import { useTheme } from "../theme";
import { t } from "../i18n";

const CALORIE_GOAL = 2200;
const CARBS_GOAL = 250;
const PROTEIN_GOAL = 120;
const FAT_GOAL = 80;

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "other"] as const;

function getTodayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatEventDate(isoDate: string | undefined): string {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const day = weekdays[d.getDay()];
  const date = d.getDate();
  const month = d.toLocaleString("default", { month: "short" });
  return `${day} ${date} ${month}`;
}

function formatDuration(sec: number | undefined): string {
  if (sec == null || sec <= 0) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const NutritionProgressBar = React.memo(function NutritionProgressBar({
  current,
  goal,
  label,
  color,
}: {
  current: number;
  goal: number;
  label: string;
  color: string;
}) {
  const percent = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
  return (
    <View style={progressBarStyles.container}>
      <View style={progressBarStyles.labelRow}>
        <Text style={progressBarStyles.label}>{label}</Text>
        <Text style={progressBarStyles.value}>
          {Math.round(current)} / {Math.round(goal)}
        </Text>
      </View>
      <View style={progressBarStyles.track}>
        <View style={[progressBarStyles.fill, { width: `${percent}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
});

const progressBarStyles = StyleSheet.create({
  container: { marginTop: 8 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  label: { fontSize: 12, color: "#b8c5d6" },
  value: { fontSize: 12, color: "#e2e8f0" },
  track: { height: 6, backgroundColor: "#334155", borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
});

const EditFoodEntryModal = React.memo(function EditFoodEntryModal({
  entry,
  copyTargetDate,
  onClose,
  onSaved,
  onDeleted,
}: {
  entry: NutritionDayEntry;
  copyTargetDate: string;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(entry.name);
  const [portionGrams, setPortionGrams] = useState(String(entry.portion_grams));
  const [calories, setCalories] = useState(String(entry.calories));
  const [proteinG, setProteinG] = useState(String(entry.protein_g));
  const [fatG, setFatG] = useState(String(entry.fat_g));
  const [carbsG, setCarbsG] = useState(String(entry.carbs_g));
  const [mealType, setMealType] = useState(entry.meal_type);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copying, setCopying] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);

  const handleSave = async () => {
    const p = Number(portionGrams);
    const c = Number(calories);
    const pr = Number(proteinG);
    const f = Number(fatG);
    const ca = Number(carbsG);
    if (Number.isNaN(p) || Number.isNaN(c) || Number.isNaN(pr) || Number.isNaN(f) || Number.isNaN(ca)) {
      Alert.alert("Ошибка", "Введите корректные числа.");
      return;
    }
    setSaving(true);
    try {
      await updateNutritionEntry(entry.id, {
        name: name.trim() || undefined,
        portion_grams: p,
        calories: c,
        protein_g: pr,
        fat_g: f,
        carbs_g: ca,
        meal_type: mealType,
      });
      onSaved();
    } catch (e) {
      Alert.alert("Ошибка", e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const showDeleteConfirm = () => setConfirmDeleteVisible(true);
  const hideDeleteConfirm = () => setConfirmDeleteVisible(false);

  const runDelete = async () => {
    setDeleting(true);
    hideDeleteConfirm();
    try {
      await deleteNutritionEntry(entry.id);
      onDeleted();
    } catch (e) {
      Alert.alert("Ошибка", e instanceof Error ? e.message : "Не удалось удалить");
    } finally {
      setDeleting(false);
    }
  };

  const handleReanalyze = async () => {
    const p = Number(portionGrams);
    if (Number.isNaN(p) || p < 0) {
      Alert.alert("Ошибка", "Укажите корректную порцию (г).");
      return;
    }
    setReanalyzing(true);
    try {
      await reanalyzeNutritionEntry(entry.id, {
        name: name.trim() || undefined,
        portion_grams: p,
      });
      onSaved();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не удалось выполнить пересчёт";
      Alert.alert("Ошибка", msg);
    } finally {
      setReanalyzing(false);
    }
  };

  const handleCopy = async () => {
    const p = Number(portionGrams);
    const c = Number(calories);
    const pr = Number(proteinG);
    const f = Number(fatG);
    const ca = Number(carbsG);
    if (Number.isNaN(p) || Number.isNaN(c) || Number.isNaN(pr) || Number.isNaN(f) || Number.isNaN(ca)) {
      Alert.alert("Ошибка", "Введите корректные числа.");
      return;
    }
    setCopying(true);
    try {
      await createNutritionEntry({
        name: name.trim() || entry.name,
        portion_grams: p,
        calories: c,
        protein_g: pr,
        fat_g: f,
        carbs_g: ca,
        meal_type: mealType,
        date: copyTargetDate,
      });
      onSaved();
    } catch (e) {
      Alert.alert("Ошибка", e instanceof Error ? e.message : "Не удалось скопировать");
    } finally {
      setCopying(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade">
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>Edit entry</Text>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.modalScroll}>
            <Text style={styles.modalLabel}>Name</Text>
            <TextInput
              style={styles.modalInput}
              value={name}
              onChangeText={setName}
              placeholder="Dish name"
              placeholderTextColor="#64748b"
            />
            <Text style={styles.modalLabel}>Portion (g)</Text>
            <TextInput
              style={styles.modalInput}
              value={portionGrams}
              onChangeText={setPortionGrams}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#64748b"
            />
            <Text style={styles.modalLabel}>Calories</Text>
            <TextInput
              style={styles.modalInput}
              value={calories}
              onChangeText={setCalories}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#64748b"
            />
            <Text style={styles.modalLabel}>Protein (g)</Text>
            <TextInput
              style={styles.modalInput}
              value={proteinG}
              onChangeText={setProteinG}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#64748b"
            />
            <Text style={styles.modalLabel}>Fat (g)</Text>
            <TextInput
              style={styles.modalInput}
              value={fatG}
              onChangeText={setFatG}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#64748b"
            />
            <Text style={styles.modalLabel}>Carbs (g)</Text>
            <TextInput
              style={styles.modalInput}
              value={carbsG}
              onChangeText={setCarbsG}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#64748b"
            />
            <Text style={styles.modalLabel}>Meal type</Text>
            <View style={styles.mealTypeRow}>
              {MEAL_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setMealType(t)}
                  style={[styles.mealTypeBtn, mealType === t && styles.mealTypeBtnActive]}
                >
                  <Text style={[styles.mealTypeBtnText, mealType === t && styles.mealTypeBtnTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {entry.extended_nutrients && Object.keys(entry.extended_nutrients).length > 0 ? (
              <>
                <Text style={[styles.modalLabel, { marginTop: 16 }]}>{t("nutrition.micronutrients")}</Text>
                <View style={styles.micronutrientsBlock}>
                  {Object.entries(entry.extended_nutrients).map(([key, value]) => {
                    const labelKey = `nutrition.micronutrientLabels.${key}`;
                    const label = t(labelKey) !== labelKey ? t(labelKey) : key;
                    return (
                      <View key={key} style={styles.micronutrientRow}>
                        <Text style={styles.micronutrientLabel}>{label}</Text>
                        <Text style={styles.micronutrientValue}>{typeof value === "number" ? Math.round(value * 10) / 10 : value}</Text>
                      </View>
                    );
                  })}
                </View>
              </>
            ) : null}
            {entry.can_reanalyze ? (
              <View style={{ marginTop: 16 }}>
                <TouchableOpacity
                  style={[styles.modalBtnSave, { backgroundColor: "#0ea5e9" }]}
                  onPress={handleReanalyze}
                  disabled={saving || deleting || copying || reanalyzing}
                >
                  {reanalyzing ? (
                    <ActivityIndicator size="small" color="#0f172a" />
                  ) : (
                    <Text style={styles.modalBtnSaveText}>Пересчитать</Text>
                  )}
                </TouchableOpacity>
                <Text style={[styles.modalLabel, { marginTop: 6, fontSize: 12, opacity: 0.8 }]}>
                  Пересчёт макросов по текущему названию и порции
                </Text>
              </View>
            ) : null}
          </ScrollView>
          {confirmDeleteVisible ? (
            <View style={styles.deleteConfirmBox}>
              <Text style={styles.deleteConfirmTitle}>Удалить запись?</Text>
              <Text style={styles.deleteConfirmMessage}>«{entry.name}» будет удалена.</Text>
              <View style={styles.deleteConfirmActions}>
                <TouchableOpacity style={styles.modalBtnCancel} onPress={hideDeleteConfirm}>
                  <Text style={styles.modalBtnCancelText}>Отмена</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtnDelete} onPress={runDelete} disabled={deleting}>
                  {deleting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalBtnDeleteText}>Удалить</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={onClose}>
                <Text style={styles.modalBtnCancelText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnDelete, (saving || deleting || copying || reanalyzing) && styles.modalBtnDisabled]}
                onPress={showDeleteConfirm}
                disabled={saving || deleting || copying || reanalyzing}
              >
                <Text style={styles.modalBtnDeleteText}>Удалить</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnCopy, (saving || deleting || copying || reanalyzing) && styles.modalBtnDisabled]}
                onPress={handleCopy}
                disabled={saving || deleting || copying || reanalyzing}
              >
                {copying ? <ActivityIndicator size="small" color="#0f172a" /> : <Text style={styles.modalBtnCopyText}>{t("nutrition.copy")}</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnSave, (saving || deleting || copying || reanalyzing) && styles.modalBtnDisabled]}
                onPress={handleSave}
                disabled={saving || deleting || copying || reanalyzing}
              >
                {saving ? <ActivityIndicator size="small" color="#0f172a" /> : <Text style={styles.modalBtnSaveText}>Сохранить</Text>}
              </TouchableOpacity>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const EditWellnessModal = React.memo(function EditWellnessModal({
  date,
  initialWellness,
  initialWeight,
  onClose,
  onSaved,
}: {
  date: string;
  initialWellness: WellnessDay | null;
  initialWeight: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [sleepHours, setSleepHours] = useState(
    initialWellness?.sleep_hours != null ? String(initialWellness.sleep_hours) : ""
  );
  const [rhr, setRhr] = useState(initialWellness?.rhr != null ? String(initialWellness.rhr) : "");
  const [hrv, setHrv] = useState(initialWellness?.hrv != null ? String(initialWellness.hrv) : "");
  const [weightKg, setWeightKg] = useState(initialWeight != null ? String(initialWeight) : "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const sh = sleepHours.trim() ? parseFloat(sleepHours) : undefined;
    const r = rhr.trim() ? parseFloat(rhr) : undefined;
    const h = hrv.trim() ? parseFloat(hrv) : undefined;
    const w = weightKg.trim() ? parseFloat(weightKg) : undefined;
    if (sh !== undefined && (Number.isNaN(sh) || sh < 0 || sh > 24)) {
      Alert.alert("Ошибка", "Сон: введите число от 0 до 24.");
      return;
    }
    if (r !== undefined && (Number.isNaN(r) || r < 0 || r > 200)) {
      Alert.alert("Ошибка", "RHR: введите число от 0 до 200.");
      return;
    }
    if (h !== undefined && (Number.isNaN(h) || h < 0)) {
      Alert.alert("Ошибка", "HRV: введите положительное число.");
      return;
    }
    if (w !== undefined && (Number.isNaN(w) || w < 20 || w > 300)) {
      Alert.alert("Ошибка", "Вес: введите число от 20 до 300 кг.");
      return;
    }
    setSaving(true);
    try {
      await createOrUpdateWellness({ date, sleep_hours: sh, rhr: r, hrv: h, weight_kg: w });
      if (w !== undefined) await updateAthleteProfile({ weight_kg: w });
      onSaved();
      onClose();
    } catch (e) {
      Alert.alert("Ошибка", e instanceof Error ? e.message : "Не удалось сохранить.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade">
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.cardTitle}>Сон и здоровье ({date})</Text>
          <Text style={styles.hint}>Данные учитываются ИИ при анализе и в чате.</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Сон (часы)"
            placeholderTextColor="#64748b"
            value={sleepHours}
            onChangeText={setSleepHours}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={styles.modalInput}
            placeholder="RHR (уд/мин)"
            placeholderTextColor="#64748b"
            value={rhr}
            onChangeText={setRhr}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={styles.modalInput}
            placeholder="HRV (мс)"
            placeholderTextColor="#64748b"
            value={hrv}
            onChangeText={setHrv}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={styles.modalInput}
            placeholder="Вес (кг)"
            placeholderTextColor="#64748b"
            value={weightKg}
            onChangeText={setWeightKg}
            keyboardType="decimal-pad"
          />
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalBtnCancel} onPress={onClose}>
              <Text style={styles.modalBtnCancelText}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalBtnSave} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#0f172a" /> : <Text style={styles.modalBtnSaveText}>Сохранить</Text>}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const AddWorkoutModal = React.memo(function AddWorkoutModal({
  defaultDate,
  onClose,
  onSaved,
}: {
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [dateStr, setDateStr] = useState(defaultDate);
  const [name, setName] = useState("");
  const [type, setType] = useState("Run");
  const [durationMin, setDurationMin] = useState("");
  const [distanceKm, setDistanceKm] = useState("");
  const [tss, setTss] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const durationSec = durationMin.trim() ? parseInt(durationMin, 10) * 60 : undefined;
    const distanceM = distanceKm.trim() ? parseFloat(distanceKm) * 1000 : undefined;
    const tssVal = tss.trim() ? parseFloat(tss) : undefined;
    if (durationSec !== undefined && (Number.isNaN(durationSec) || durationSec < 0)) {
      Alert.alert("Ошибка", "Длительность: введите число минут.");
      return;
    }
    setSaving(true);
    try {
      await createWorkout({
        start_date: `${dateStr}T12:00:00.000Z`,
        name: name.trim() || undefined,
        type: type || undefined,
        duration_sec: durationSec ?? undefined,
        distance_m: distanceM ?? undefined,
        tss: tssVal ?? undefined,
        notes: notes.trim() || undefined,
      });
      onSaved();
      onClose();
    } catch (e) {
      Alert.alert("Ошибка", e instanceof Error ? e.message : "Не удалось сохранить.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade">
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.cardTitle}>Добавить тренировку</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Дата (YYYY-MM-DD)"
            placeholderTextColor="#64748b"
            value={dateStr}
            onChangeText={setDateStr}
          />
          <TextInput
            style={styles.modalInput}
            placeholder="Название"
            placeholderTextColor="#64748b"
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.modalInput}
            placeholder="Тип (Run, Ride, Swim...)"
            placeholderTextColor="#64748b"
            value={type}
            onChangeText={setType}
          />
          <TextInput
            style={styles.modalInput}
            placeholder="Длительность (мин)"
            placeholderTextColor="#64748b"
            value={durationMin}
            onChangeText={setDurationMin}
            keyboardType="numeric"
          />
          <TextInput
            style={styles.modalInput}
            placeholder="Дистанция (км)"
            placeholderTextColor="#64748b"
            value={distanceKm}
            onChangeText={setDistanceKm}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={styles.modalInput}
            placeholder="TSS"
            placeholderTextColor="#64748b"
            value={tss}
            onChangeText={setTss}
            keyboardType="numeric"
          />
          <TextInput
            style={styles.modalInput}
            placeholder="Заметки"
            placeholderTextColor="#64748b"
            value={notes}
            onChangeText={setNotes}
          />
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalBtnCancel} onPress={onClose}>
              <Text style={styles.modalBtnCancelText}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalBtnSave} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#0f172a" /> : <Text style={styles.modalBtnSaveText}>Сохранить</Text>}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const WorkoutPreviewModal = React.memo(function WorkoutPreviewModal({
  file,
  preview,
  onClose,
  onSave,
}: {
  file: Blob;
  preview: WorkoutPreviewItem;
  onClose: () => void;
  onSave: (file: Blob) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const raw = preview.raw as Record<string, unknown> | undefined;
  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(file);
      onClose();
    } catch (e) {
      Alert.alert("Ошибка", e instanceof Error ? e.message : "Не удалось сохранить.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal visible transparent animationType="fade">
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.cardTitle}>Превью FIT-тренировки</Text>
          <Text style={styles.modalLabel}>Название / тип</Text>
          <Text style={styles.value}>{preview.name ?? preview.type ?? "—"}</Text>
          <Text style={styles.modalLabel}>Дата и время</Text>
          <Text style={styles.value}>{preview.start_date ? new Date(preview.start_date).toLocaleString() : "—"}</Text>
          <Text style={styles.modalLabel}>Длительность</Text>
          <Text style={styles.value}>{formatDuration(preview.duration_sec ?? undefined) || "—"}</Text>
          {preview.distance_m != null && (
            <>
              <Text style={styles.modalLabel}>Дистанция</Text>
              <Text style={styles.value}>{(preview.distance_m / 1000).toFixed(2)} km</Text>
            </>
          )}
          {preview.tss != null && (
            <>
              <Text style={styles.modalLabel}>TSS</Text>
              <Text style={styles.value}>{Math.round(preview.tss)}</Text>
            </>
          )}
          {raw && (
            <>
              <Text style={[styles.modalLabel, { marginTop: 8 }]}>Из файла (ЧСС, мощность, калории)</Text>
              <View style={{ gap: 2 }}>
                {raw.avg_heart_rate != null && <Text style={styles.hint}>ЧСС ср.: {String(raw.avg_heart_rate)}</Text>}
                {raw.max_heart_rate != null && <Text style={styles.hint}>ЧСС макс.: {String(raw.max_heart_rate)}</Text>}
                {raw.avg_power != null && <Text style={styles.hint}>Мощность ср.: {String(raw.avg_power)} W</Text>}
                {raw.normalized_power != null && <Text style={styles.hint}>NP: {String(raw.normalized_power)} W</Text>}
                {raw.total_calories != null && <Text style={styles.hint}>Калории: {String(raw.total_calories)}</Text>}
              </View>
            </>
          )}
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalBtnCancel} onPress={onClose}>
              <Text style={styles.modalBtnCancelText}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalBtnSave} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#0f172a" /> : <Text style={styles.modalBtnSaveText}>Сохранить</Text>}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const WorkoutDetailModal = React.memo(function WorkoutDetailModal({
  workout,
  onClose,
  onDeleted,
}: {
  workout: WorkoutItem | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  if (!workout) return null;
  const raw = workout.raw as Record<string, unknown> | undefined;
  const sourceLabel = workout.source === "fit" ? "FIT-файл" : workout.source === "intervals" ? "Intervals.icu" : "Ручной ввод";

  const performDelete = async () => {
    setDeleting(true);
    try {
      await deleteWorkout(workout.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onDeleted();
      onClose();
    } catch (e) {
      Alert.alert("Ошибка", e instanceof Error ? e.message : "Не удалось удалить.");
    } finally {
      setDeleting(false);
    }
  };

  const handleDelete = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      if (window.confirm("Удалить тренировку? Тренировка будет удалена без возможности восстановления.")) {
        performDelete();
      }
      return;
    }
    Alert.alert("Удалить тренировку?", "Тренировка будет удалена без возможности восстановления.", [
      { text: "Отмена", style: "cancel" },
      { text: "Удалить", style: "destructive", onPress: performDelete },
    ]);
  };

  return (
    <Modal visible transparent animationType="fade">
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.cardTitle}>Тренировка</Text>
          <Text style={styles.modalLabel}>Название / тип</Text>
          <Text style={styles.value}>{workout.name ?? workout.type ?? "—"}</Text>
          <Text style={styles.modalLabel}>Дата и время</Text>
          <Text style={styles.value}>{workout.start_date ? new Date(workout.start_date).toLocaleString() : "—"}</Text>
          <Text style={styles.modalLabel}>Источник</Text>
          <Text style={styles.value}>{sourceLabel}</Text>
          <Text style={styles.modalLabel}>Длительность</Text>
          <Text style={styles.value}>{formatDuration(workout.duration_sec ?? undefined) || "—"}</Text>
          {workout.distance_m != null && (
            <>
              <Text style={styles.modalLabel}>Дистанция</Text>
              <Text style={styles.value}>{(workout.distance_m / 1000).toFixed(2)} km</Text>
            </>
          )}
          {workout.tss != null && (
            <>
              <Text style={styles.modalLabel}>TSS</Text>
              <Text style={styles.value}>{Math.round(workout.tss)}</Text>
            </>
          )}
          {workout.notes && (
            <>
              <Text style={styles.modalLabel}>Заметки</Text>
              <Text style={styles.hint}>{workout.notes}</Text>
            </>
          )}
          {raw && (workout.source === "fit") && (
            <>
              <Text style={[styles.modalLabel, { marginTop: 8 }]}>Из FIT (ЧСС, мощность, калории)</Text>
              <View style={{ gap: 2 }}>
                {raw.avg_heart_rate != null && <Text style={styles.hint}>ЧСС ср.: {String(raw.avg_heart_rate)}</Text>}
                {raw.max_heart_rate != null && <Text style={styles.hint}>ЧСС макс.: {String(raw.max_heart_rate)}</Text>}
                {raw.avg_power != null && <Text style={styles.hint}>Мощность ср.: {String(raw.avg_power)} W</Text>}
                {raw.normalized_power != null && <Text style={styles.hint}>NP: {String(raw.normalized_power)} W</Text>}
                {raw.total_calories != null && <Text style={styles.hint}>Калории: {String(raw.total_calories)}</Text>}
              </View>
            </>
          )}
          <View style={[styles.modalActions, styles.deleteConfirmBox]}>
            <TouchableOpacity style={styles.modalBtnCancel} onPress={onClose}>
              <Text style={styles.modalBtnCancelText}>Закрыть</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalBtnDelete} onPress={handleDelete} disabled={deleting}>
              {deleting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalBtnDeleteText}>Удалить</Text>}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

export function DashboardScreen({
  user,
  onLogout,
  onOpenCamera,
  onOpenChat,
  onOpenAthleteProfile,
  onOpenIntervals,
  onSyncIntervals,
  refreshNutritionTrigger = 0,
  refreshSleepTrigger = 0,
  refreshWellnessTrigger = 0,
}: {
  user?: AuthUser | null;
  onLogout?: () => void;
  onOpenCamera: () => void;
  onOpenChat: () => void;
  onOpenAthleteProfile?: () => void;
  onOpenIntervals?: () => void;
  onSyncIntervals?: () => Promise<{ activities_synced?: number; wellness_days_synced?: number } | void>;
  refreshNutritionTrigger?: number;
  refreshSleepTrigger?: number;
  refreshWellnessTrigger?: number;
}) {
  const [workouts, setWorkouts] = useState<WorkoutItem[]>([]);
  const [workoutFitness, setWorkoutFitness] = useState<WorkoutFitness | null>(null);
  const [nutritionDay, setNutritionDay] = useState<NutritionDayResponse | null>(null);
  const [nutritionLoadError, setNutritionLoadError] = useState(false);
  const [nutritionDate, setNutritionDate] = useState(getTodayLocal);
  const [entryToEdit, setEntryToEdit] = useState<NutritionDayEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [wellnessToday, setWellnessToday] = useState<WellnessDay | null>(null);
  const [wellnessWeek, setWellnessWeek] = useState<WellnessDay[]>([]);
  const [athleteProfile, setAthleteProfile] = useState<AthleteProfileResponse | null>(null);
  const [wellnessEditVisible, setWellnessEditVisible] = useState(false);
  const [workoutAddVisible, setWorkoutAddVisible] = useState(false);
  const [fitUploading, setFitUploading] = useState(false);
  const [fitPreviewData, setFitPreviewData] = useState<{ file: Blob; preview: WorkoutPreviewItem } | null>(null);
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutItem | null>(null);
  const [lastAnalysisResult, setLastAnalysisResult] = useState<{
    decision: string;
    reason: string;
    suggestions_next_days?: string;
  } | null>(null);
  const [intervalsSyncLoading, setIntervalsSyncLoading] = useState(false);
  const [sleepExtractions, setSleepExtractions] = useState<SleepExtractionSummary[]>([]);
  const [sleepReanalyzingId, setSleepReanalyzingId] = useState<number | null>(null);
  const [sleepReanalyzeExtId, setSleepReanalyzeExtId] = useState<number | null>(null);
  const [sleepReanalyzeCorrection, setSleepReanalyzeCorrection] = useState("");
  const [menuVisible, setMenuVisible] = useState(false);
  const { colors, toggleTheme } = useTheme();

  const today = getTodayLocal();

  const loadNutritionForDate = useCallback(async (dateStr: string) => {
    setNutritionLoadError(false);
    try {
      const n = await getNutritionDay(dateStr);
      setNutritionDay(n);
    } catch {
      setNutritionDay(null);
      setNutritionLoadError(true);
    }
  }, []);

  const load = useCallback(async () => {
    setNutritionLoadError(false);
    try {
      const activitiesStart = addDays(today, -14);
      const [nResult, wellnessResult, profile, workoutsList, fitness, sleepList] = await Promise.all([
        getNutritionDay(nutritionDate).then((n) => ({ ok: true as const, data: n })).catch(() => ({ ok: false as const, data: null })),
        getWellness(addDays(today, -13), addDays(today, 1)).then((res) => {
          const w = res?.items ?? [];
          setWellnessWeek(w);
          if (!w.length) return { week: w, today: null };
          const todayNorm = today.slice(0, 10);
          const forToday = w.find((d) => String(d?.date ?? "").slice(0, 10) === todayNorm);
          return { week: w, today: forToday ?? null };
        }).catch(() => {
          setWellnessWeek([]);
          return { week: [], today: null };
        }),
        getAthleteProfile().catch(() => null),
        getWorkouts(activitiesStart, today).then((r) => r.items).catch(() => []),
        getWorkoutFitness().catch(() => null),
        getSleepExtractions(addDays(today, -14), today).catch(() => []),
      ]);
      setNutritionDay(nResult.ok ? nResult.data : null);
      setNutritionLoadError(!nResult.ok);
      setWellnessToday(wellnessResult?.today ?? null);
      setAthleteProfile(profile);
      setWorkouts(workoutsList ?? []);
      setWorkoutFitness(fitness ?? null);
      setSleepExtractions(sleepList ?? []);
    } catch {
      setNutritionDay(null);
      setNutritionLoadError(true);
      setWellnessToday(null);
      setWellnessWeek([]);
      setAthleteProfile(null);
      setWorkouts([]);
      setWorkoutFitness(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [today, nutritionDate]);

  useEffect(() => {
    load();
  }, [load, refreshNutritionTrigger, refreshSleepTrigger, refreshWellnessTrigger]);

  const setNutritionDateAndLoad = useCallback(
    (dateStr: string) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setNutritionDate(dateStr);
      loadNutritionForDate(dateStr);
    },
    [loadNutritionForDate]
  );

  const nutritionGoals = useMemo(
    () => ({
      calorieGoal: athleteProfile?.nutrition_goals?.calorie_goal ?? CALORIE_GOAL,
      proteinGoal: athleteProfile?.nutrition_goals?.protein_goal ?? PROTEIN_GOAL,
      fatGoal: athleteProfile?.nutrition_goals?.fat_goal ?? FAT_GOAL,
      carbsGoal: athleteProfile?.nutrition_goals?.carbs_goal ?? CARBS_GOAL,
    }),
    [
      athleteProfile?.nutrition_goals?.calorie_goal,
      athleteProfile?.nutrition_goals?.protein_goal,
      athleteProfile?.nutrition_goals?.fat_goal,
      athleteProfile?.nutrition_goals?.carbs_goal,
    ]
  );
  const { calorieGoal, proteinGoal, fatGoal, carbsGoal } = nutritionGoals;

  const WEEKLY_SLEEP_NORM_HOURS = 7 * 7;

  type SleepHistoryEntry = { date: string; hours: number; source: "photo" | "manual"; extraction?: SleepExtractionSummary };

  const combinedSleepHistory = useMemo(() => {
    const byDate = new Map<string, SleepHistoryEntry>();
    wellnessWeek.forEach((d) => {
      const h = d?.sleep_hours ?? 0;
      if (h <= 0) return;
      const dateKey = String(d?.date ?? "").slice(0, 10);
      if (!dateKey) return;
      byDate.set(dateKey, { date: dateKey, hours: h, source: "manual" });
    });
    sleepExtractions.forEach((ext) => {
      const dateKey = (ext.sleep_date ?? ext.created_at?.slice(0, 10) ?? "").slice(0, 10);
      if (!dateKey) return;
      const hours = ext.actual_sleep_hours ?? ext.sleep_hours ?? 0;
      byDate.set(dateKey, { date: dateKey, hours, source: "photo", extraction: ext });
    });
    return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [wellnessWeek, sleepExtractions]);

  const { weeklySleepTotal, weeklySleepDeficit } = useMemo(() => {
    const last7 = combinedSleepHistory.slice(0, 7);
    const total = last7.reduce((sum, e) => sum + e.hours, 0);
    const deficit = Math.max(0, WEEKLY_SLEEP_NORM_HOURS - total);
    return { weeklySleepTotal: total, weeklySleepDeficit: deficit };
  }, [combinedSleepHistory]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleQuickDelete = (entry: NutritionDayEntry) => {
    Alert.alert("Удалить запись?", `«${entry.name}» будет удалена.`, [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteNutritionEntry(entry.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            loadNutritionForDate(nutritionDate);
          } catch (e) {
            Alert.alert("Ошибка", e instanceof Error ? e.message : "Не удалось удалить");
          }
        },
      },
    ]);
  };

  const onSelectFitFile = useCallback(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      Alert.alert("FIT", t("fit.webOnly"));
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".fit";
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setFitUploading(true);
      try {
        const preview = await previewFitWorkout(file);
        setFitPreviewData({ file, preview });
      } catch (err) {
        Alert.alert("Ошибка", err instanceof Error ? err.message : "Не удалось разобрать FIT.");
      } finally {
        setFitUploading(false);
      }
    };
    input.click();
  }, []);

  const onSaveFitFromPreview = useCallback(
    async (file: Blob) => {
      await uploadFitWorkout(file);
      setFitPreviewData(null);
      load();
    },
    [load]
  );

  const onRunAnalysisNow = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setAnalysisLoading(true);
    setLastAnalysisResult(null);
    try {
      const result = await runOrchestrator();
      setLastAnalysisResult(result);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Request failed";
      Alert.alert("Ошибка", msg);
    } finally {
      setAnalysisLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)}>
          <Pressable style={[styles.menuBox, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.menuHeader}>
              {user?.email ? <Text style={styles.menuEmail} numberOfLines={1}>{user.email}</Text> : <View />}
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setMenuVisible(false); }}
                style={styles.menuCloseBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel={t("common.close")}
              >
                <Text style={styles.menuCloseIcon}>✕</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); toggleTheme(); setMenuVisible(false); }}
            >
              <Text style={styles.menuItemText}>Тема</Text>
            </TouchableOpacity>
            {onLogout ? (
              <TouchableOpacity style={styles.menuItem} onPress={() => { onLogout(); setMenuVisible(false); }}>
                <Text style={styles.menuItemText}>{t("app.logout")}</Text>
              </TouchableOpacity>
            ) : null}
            {onOpenAthleteProfile ? (
              <TouchableOpacity style={styles.menuItem} onPress={() => { onOpenAthleteProfile(); setMenuVisible(false); }}>
                <Text style={styles.menuItemText}>Профиль атлета →</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.menuItem} onPress={() => { onOpenChat(); setMenuVisible(false); }}>
              <Text style={styles.menuItemText}>Открыть чат AI-тренера →</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
      <View style={styles.contentWrap}>
      <View style={styles.topBar}>
        <Text style={styles.brandTitle}>Smart Trainer</Text>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setMenuVisible(true);
          }}
          style={styles.menuIconBtn}
          accessibilityLabel="Меню"
        >
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.title}>{t("today")}</Text>

      {loading ? (
        <View style={styles.skeletonWrap}>
          <View style={styles.skeletonCard}>
            <View style={styles.skeletonTitle} />
            <View style={styles.skeletonLine} />
            <View style={styles.skeletonLine} />
            <View style={styles.skeletonLineShort} />
          </View>
          <View style={styles.skeletonCard}>
            <View style={styles.skeletonTitle} />
            <View style={styles.skeletonLine} />
          </View>
          <View style={styles.skeletonCard}>
            <View style={styles.skeletonTitle} />
            <View style={styles.skeletonLine} />
          </View>
          <View style={styles.skeletonCard}>
            <View style={styles.skeletonTitle} />
            <View style={styles.skeletonLine} />
            <View style={styles.skeletonLine} />
          </View>
        </View>
      ) : (
        <>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>{t("nutrition.title")}</Text>
              <View style={styles.cardTitleActions}>
                <TouchableOpacity
                  onPress={() => setNutritionDateAndLoad(addDays(nutritionDate, -1))}
                  style={styles.dateNavBtn}
                >
                  <Text style={styles.dateNavText}>{t("yesterday")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setNutritionDateAndLoad(today)}
                  style={[styles.dateNavBtn, nutritionDate === today && styles.dateNavBtnActive]}
                >
                  <Text style={[styles.dateNavText, nutritionDate === today && styles.dateNavTextActive]}>{t("today")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setNutritionDateAndLoad(addDays(nutritionDate, 1))}
                  style={styles.dateNavBtn}
                >
                  <Text style={styles.dateNavText}>{t("tomorrow")}</Text>
                </TouchableOpacity>
              </View>
            </View>
            {nutritionLoadError && (
              <Text style={styles.errorHint}>{t("nutrition.loadError")}</Text>
            )}
            {!nutritionLoadError && nutritionDay && nutritionDay.entries.length > 0 ? (
              <>
                <Text style={styles.cardValue}>
                  {t("nutrition.eaten")}: {Math.round(nutritionDay.totals.calories)} {t("nutrition.kcal")} · {t("nutrition.proteinShort")} {Math.round(nutritionDay.totals.protein_g)}{t("nutrition.grams")} · {t("nutrition.fatShort")}{" "}
                  {Math.round(nutritionDay.totals.fat_g)}{t("nutrition.grams")} · {t("nutrition.carbsShort")} {Math.round(nutritionDay.totals.carbs_g)}{t("nutrition.grams")}
                </Text>
                <Text style={styles.hintRemaining}>
                  {t("nutrition.left")}: {Math.round(Math.max(0, calorieGoal - nutritionDay.totals.calories))} {t("nutrition.kcal")} · {t("nutrition.proteinShort")}{" "}
                  {Math.round(Math.max(0, proteinGoal - nutritionDay.totals.protein_g))}{t("nutrition.grams")} · {t("nutrition.fatShort")}{" "}
                  {Math.round(Math.max(0, fatGoal - nutritionDay.totals.fat_g))}{t("nutrition.grams")} · {t("nutrition.carbsShort")}{" "}
                  {Math.round(Math.max(0, carbsGoal - nutritionDay.totals.carbs_g))}{t("nutrition.grams")}
                </Text>
                <NutritionProgressBar
                  current={nutritionDay.totals.calories}
                  goal={calorieGoal}
                  label={t("nutrition.caloriesLabel")}
                  color="#38bdf8"
                />
                <NutritionProgressBar
                  current={nutritionDay.totals.protein_g}
                  goal={proteinGoal}
                  label={t("nutrition.proteinLabel")}
                  color="#22c55e"
                />
                <NutritionProgressBar
                  current={nutritionDay.totals.fat_g}
                  goal={fatGoal}
                  label={t("nutrition.fatLabel")}
                  color="#f59e0b"
                />
                <NutritionProgressBar
                  current={nutritionDay.totals.carbs_g}
                  goal={carbsGoal}
                  label={t("nutrition.carbsLabel")}
                  color="#8b5cf6"
                />
                {nutritionDay.entries.map((entry) => (
                  <Swipeable
                    key={entry.id}
                    renderRightActions={() => (
                      <TouchableOpacity style={styles.deleteAction} onPress={() => handleQuickDelete(entry)}>
                        <Text style={styles.deleteActionText}>Удалить</Text>
                      </TouchableOpacity>
                    )}
                  >
                    <TouchableOpacity
                      onPress={() => setEntryToEdit(entry)}
                      style={styles.mealRow}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.mealLine}>
                        {entry.name}: {Math.round(entry.calories)} kcal
                      </Text>
                    </TouchableOpacity>
                  </Swipeable>
                ))}
              </>
            ) : !nutritionLoadError && nutritionDay ? (
              <>
                <Text style={styles.placeholder}>{t("nutrition.placeholder")}</Text>
                <Text style={styles.hint}>{t("nutrition.goal")}: {calorieGoal} {t("nutrition.kcal")} · {t("nutrition.carbsShort")}: {carbsGoal}{t("nutrition.grams")} · {t("nutrition.proteinShort")}: {proteinGoal}{t("nutrition.grams")} · {t("nutrition.fatShort")}: {fatGoal}{t("nutrition.grams")}</Text>
                <NutritionProgressBar current={nutritionDay.totals.calories} goal={calorieGoal} label={t("nutrition.caloriesLabel")} color="#38bdf8" />
                <NutritionProgressBar current={nutritionDay.totals.protein_g} goal={proteinGoal} label={t("nutrition.proteinLabel")} color="#22c55e" />
                <NutritionProgressBar current={nutritionDay.totals.fat_g} goal={fatGoal} label={t("nutrition.fatLabel")} color="#f59e0b" />
                <NutritionProgressBar current={nutritionDay.totals.carbs_g} goal={carbsGoal} label={t("nutrition.carbsLabel")} color="#8b5cf6" />
              </>
            ) : !nutritionLoadError ? (
              <>
                <Text style={styles.placeholder}>{t("nutrition.placeholder")}</Text>
                <Text style={styles.hint}>{t("nutrition.goal")}: {calorieGoal} {t("nutrition.kcal")} · {t("nutrition.carbsShort")}: {carbsGoal}{t("nutrition.grams")} · {t("nutrition.proteinShort")}: {proteinGoal}{t("nutrition.grams")} · {t("nutrition.fatShort")}: {fatGoal}{t("nutrition.grams")}</Text>
              </>
            ) : null}
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>{t("wellness.title")}</Text>
              <TouchableOpacity onPress={() => setWellnessEditVisible(true)}>
                <Text style={styles.intervalsLinkText}>{t("wellness.edit")}</Text>
              </TouchableOpacity>
            </View>
            {wellnessToday?.sleep_hours == null ? (
              <View style={[styles.sleepReminderBanner, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
                <Text style={styles.sleepReminderText}>{t("wellness.sleepReminder")}</Text>
                <View style={styles.sleepReminderButtons}>
                  <TouchableOpacity style={styles.sleepReminderBtn} onPress={() => setWellnessEditVisible(true)}>
                    <Text style={styles.sleepReminderBtnText}>{t("wellness.enterManually")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.sleepReminderBtn} onPress={onOpenCamera}>
                    <Text style={styles.sleepReminderBtnText}>{t("wellness.uploadScreenshot")}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.hint}>{t("wellness.todayLabel")}</Text>
              <Text style={[styles.hint, styles.disclaimer]}>{t("wellness.disclaimer")}</Text>
              {(wellnessToday || athleteProfile?.weight_kg != null || wellnessToday?.weight_kg != null) ? (
                <>
                  <Text style={[styles.cardValue, { marginTop: 8 }]}>
                    {wellnessToday?.sleep_hours != null ? `Сон ${wellnessToday.sleep_hours} ч` : "Сон —"}
                    {wellnessToday?.rhr != null ? ` · RHR ${wellnessToday.rhr}` : " · RHR —"}
                    {wellnessToday?.hrv != null ? ` · HRV ${wellnessToday.hrv}` : " · HRV —"}
                    {(wellnessToday?.weight_kg ?? athleteProfile?.weight_kg) != null
                      ? ` · Вес ${wellnessToday?.weight_kg ?? athleteProfile?.weight_kg} кг`
                      : " · Вес —"}
                  </Text>
                  {wellnessToday?.sleep_hours == null && (
                    <Text style={styles.hint}>{t("wellness.manualHint")}</Text>
                  )}
                </>
              ) : (
                <Text style={[styles.placeholder, { marginTop: 8 }]}>{t("wellness.placeholder")}</Text>
              )}
            </View>
            {combinedSleepHistory.length > 0 ? (
              <View style={{ marginTop: 4, marginBottom: 12 }}>
                {combinedSleepHistory.length >= 7 ? (
                  <Text style={styles.weeklySleepLine}>
                    {t("wellness.weeklySleep")}: {Math.round(weeklySleepTotal * 10) / 10} {t("wellness.sleepHours")}
                    {weeklySleepDeficit > 0 ? ` · ${t("wellness.deficit")} ${Math.round(weeklySleepDeficit * 10) / 10} ${t("wellness.sleepHours")}` : null}
                    {" "}
                    <Text style={[styles.hint, { marginTop: 0 }]}>({t("wellness.normPerNight")})</Text>
                  </Text>
                ) : (
                  <Text style={[styles.hint, { marginTop: 8 }]}>{t("wellness.insufficientData")}</Text>
                )}
              </View>
            ) : null}
            <View style={{ marginTop: 4 }}>
              <View style={styles.cardTitleRow}>
                <Text style={[styles.modalLabel, { marginBottom: 0 }]}>{t("wellness.history")}</Text>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    onOpenCamera();
                  }}
                >
                  <Text style={styles.intervalsLinkText}>{t("wellness.addByPhoto")}</Text>
                </TouchableOpacity>
              </View>
              {combinedSleepHistory.length === 0 ? (
                <Text style={[styles.hint, { marginTop: 4 }]}>{t("wellness.uploadSleepPhotoHint")}</Text>
              ) : null}
            </View>
            {combinedSleepHistory.length > 0 ? (
              <View style={{ marginTop: 6 }}>
                {combinedSleepHistory.slice(0, 7).map((entry) => (
                  <View key={entry.source === "photo" && entry.extraction ? `photo-${entry.extraction.id}` : `wellness-${entry.date}`}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 }}>
                      <Text style={styles.hint}>
                        {entry.date.slice(8, 10)}/{entry.date.slice(5, 7)} · {entry.hours} ч
                        {entry.source === "manual" ? ` (${t("wellness.historyManual")})` : ""}
                      </Text>
                      {entry.source === "photo" && entry.extraction?.can_reanalyze && sleepReanalyzeExtId !== entry.extraction.id ? (
                        <TouchableOpacity
                          style={[styles.modalBtnSave, { paddingHorizontal: 10, paddingVertical: 6 }]}
                          onPress={() => { setSleepReanalyzeExtId(entry.extraction!.id); setSleepReanalyzeCorrection(""); }}
                          disabled={sleepReanalyzingId != null}
                        >
                          <Text style={styles.modalBtnSaveText}>Повторный анализ</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    {entry.source === "photo" && entry.extraction && sleepReanalyzeExtId === entry.extraction.id ? (
                      <View style={{ marginTop: 6, marginBottom: 8 }}>
                        <TextInput
                          style={styles.modalInput}
                          value={sleepReanalyzeCorrection}
                          onChangeText={setSleepReanalyzeCorrection}
                          placeholder="Например: actual sleep was 7.5 hours"
                          placeholderTextColor="#64748b"
                          editable={sleepReanalyzingId === null}
                        />
                        <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                          <TouchableOpacity
                            style={styles.modalBtnCancel}
                            onPress={() => { setSleepReanalyzeExtId(null); setSleepReanalyzeCorrection(""); }}
                            disabled={sleepReanalyzingId !== null}
                          >
                            <Text style={styles.modalBtnCancelText}>Отмена</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.modalBtnSave, (sleepReanalyzingId !== null || !sleepReanalyzeCorrection.trim()) && styles.modalBtnDisabled]}
                            onPress={async () => {
                              const correction = sleepReanalyzeCorrection.trim();
                              if (!correction || !entry.extraction) return;
                              setSleepReanalyzingId(entry.extraction.id);
                              try {
                                await reanalyzeSleepExtraction(entry.extraction.id, correction);
                                setSleepReanalyzeExtId(null);
                                setSleepReanalyzeCorrection("");
                                load();
                                const fresh = await getSleepExtractions(addDays(today, -14), today).catch(() => []);
                                setSleepExtractions(fresh ?? []);
                              } catch (e) {
                                Alert.alert("Ошибка", e instanceof Error ? e.message : "Не удалось выполнить повторный анализ");
                              } finally {
                                setSleepReanalyzingId(null);
                              }
                            }}
                            disabled={sleepReanalyzingId !== null || !sleepReanalyzeCorrection.trim()}
                          >
                            {sleepReanalyzingId === entry.extraction.id ? (
                              <ActivityIndicator size="small" color="#0f172a" />
                            ) : (
                              <Text style={styles.modalBtnSaveText}>Отправить на анализ</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.fitnessHeaderRow}>
              <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>{t("fitness.title")}</Text>
              <View style={styles.fitnessActionsRow}>
                {onOpenIntervals ? (
                  <TouchableOpacity onPress={onOpenIntervals} style={styles.fitnessActionLink}>
                    <Text style={[styles.fitnessActionPrimary, { color: colors.primary }]}>Intervals.icu</Text>
                  </TouchableOpacity>
                ) : null}
                {onSyncIntervals ? (
                  <TouchableOpacity
                    onPress={async () => {
                      setIntervalsSyncLoading(true);
                      try {
                        const result = await onSyncIntervals();
                        const activities = result?.activities_synced ?? 0;
                        const wellness = result?.wellness_days_synced ?? 0;
                        const message =
                          activities > 0 || wellness > 0
                            ? `Синхронизировано: ${activities} тренировок, ${wellness} дн. wellness.`
                            : "Готово. Данных за период нет.";
                        Alert.alert("Синхронизация Intervals", message);
                      } catch (e) {
                        Alert.alert("Ошибка синхронизации", e instanceof Error ? e.message : "Не удалось синхронизировать");
                      } finally {
                        setIntervalsSyncLoading(false);
                      }
                    }}
                    disabled={intervalsSyncLoading}
                    style={[styles.fitnessActionSync, intervalsSyncLoading && styles.fitnessActionSyncDisabled]}
                  >
                    {intervalsSyncLoading ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={[styles.fitnessActionSecondary, { color: colors.primary }]}>{t("fitness.sync")}</Text>
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
            <Text style={[styles.fitnessHint, { color: colors.textMuted }]}>{t("fitness.hint")}</Text>
            {workoutFitness ? (
              <View style={styles.fitnessMetricsBlock}>
                <Text style={[styles.fitnessMetricsLine, { color: colors.text }]}>
                  CTL {workoutFitness.ctl.toFixed(0)} · ATL {workoutFitness.atl.toFixed(0)} · TSB {workoutFitness.tsb.toFixed(0)}
                </Text>
                <Text style={[styles.fitnessCaption, { color: colors.textMuted }]}>{t("fitness.dateLabel")} {workoutFitness.date}</Text>
              </View>
            ) : (wellnessToday?.ctl != null || wellnessToday?.atl != null || wellnessToday?.tsb != null) ? (
              <View style={styles.fitnessMetricsBlock}>
                <Text style={[styles.fitnessMetricsLine, { color: colors.text }]}>
                  CTL {wellnessToday?.ctl?.toFixed(0) ?? "—"} · ATL {wellnessToday?.atl?.toFixed(0) ?? "—"} · TSB {wellnessToday?.tsb?.toFixed(0) ?? "—"}
                </Text>
                <Text style={[styles.fitnessCaption, styles.fitnessCaptionMuted, { color: colors.textMuted }]}>{t("fitness.fromWellness")}</Text>
              </View>
            ) : (
              <Text style={[styles.placeholder, styles.fitnessPlaceholder, { color: colors.textMuted }]}>{t("fitness.placeholder")}</Text>
            )}
          </View>

          {entryToEdit ? (
            <EditFoodEntryModal
              entry={entryToEdit}
              copyTargetDate={nutritionDate}
              onClose={() => setEntryToEdit(null)}
              onSaved={() => {
                setEntryToEdit(null);
                loadNutritionForDate(nutritionDate);
              }}
              onDeleted={() => {
                setEntryToEdit(null);
                loadNutritionForDate(nutritionDate);
              }}
            />
          ) : null}

          {wellnessEditVisible ? (
            <EditWellnessModal
              date={today}
              initialWellness={wellnessToday}
              initialWeight={athleteProfile?.weight_kg ?? null}
              onClose={() => setWellnessEditVisible(false)}
              onSaved={() => {
                setWellnessEditVisible(false);
                load();
              }}
            />
          ) : null}

          {workoutAddVisible ? (
            <AddWorkoutModal
              defaultDate={today}
              onClose={() => setWorkoutAddVisible(false)}
              onSaved={() => {
                setWorkoutAddVisible(false);
                load();
              }}
            />
          ) : null}

          {fitPreviewData ? (
            <WorkoutPreviewModal
              file={fitPreviewData.file}
              preview={fitPreviewData.preview}
              onClose={() => setFitPreviewData(null)}
              onSave={onSaveFitFromPreview}
            />
          ) : null}

          {selectedWorkout ? (
            <WorkoutDetailModal
              workout={selectedWorkout}
              onClose={() => setSelectedWorkout(null)}
              onDeleted={load}
            />
          ) : null}

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>{t("workouts.title")}</Text>
              <View style={styles.cardTitleActions}>
                <TouchableOpacity
                  onPress={onSelectFitFile}
                  disabled={fitUploading}
                  style={fitUploading ? styles.syncBtnDisabled : undefined}
                >
                  {fitUploading ? (
                    <ActivityIndicator size="small" color="#38bdf8" />
                  ) : (
                    <Text style={styles.intervalsLinkText}>{t("workouts.uploadFit")}</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setWorkoutAddVisible(true)}>
                  <Text style={styles.intervalsLinkText}>{t("workouts.add")}</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.hint}>Последние 14 дней · ручной ввод, FIT и Intervals.icu</Text>
            {wellnessToday?.sport_info?.length ? (() => {
              const ride = wellnessToday.sport_info.find((s) => s.type === "Ride") ?? wellnessToday.sport_info[0];
              const eftp = ride?.eftp != null ? Math.round(ride.eftp) : null;
              const pmax = ride?.pMax != null ? Math.round(ride.pMax) : null;
              const show = eftp != null || pmax != null;
              return show ? (
                <Text style={[styles.hint, { marginBottom: 6 }]}>
                  {eftp != null ? `eFTP ${eftp}` : ""}{eftp != null && pmax != null ? " · " : ""}{pmax != null ? `pMax ${pmax}` : ""}
                </Text>
              ) : null;
            })() : null}
            {workouts.length > 0 ? workouts.map((act) => (
              <TouchableOpacity
                key={act.id}
                style={styles.activityRow}
                onPress={() => setSelectedWorkout(act)}
                activeOpacity={0.7}
              >
                <Text style={styles.calendarDate}>{formatEventDate(act.start_date)}</Text>
                <View style={styles.activityInfo}>
                  <Text style={styles.calendarTitle}>{act.name || "Тренировка"}</Text>
                  <Text style={styles.hint}>
                    {formatDuration(act.duration_sec ?? undefined)}
                    {act.distance_m != null ? ` · ${(act.distance_m / 1000).toFixed(1)} km` : ""}
                    {act.tss != null ? ` · TSS ${Math.round(act.tss)}` : ""}
                  </Text>
                </View>
              </TouchableOpacity>
            )) : (
              <Text style={styles.placeholder}>Нет тренировок. Подключите Intervals.icu и нажмите «Синхронизировать» или добавьте вручную / загрузите FIT.</Text>
            )}
          </View>

          {lastAnalysisResult ? (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Text style={styles.cardTitle}>Результат анализа</Text>
              <Text style={styles.analysisDecision}>Решение: {lastAnalysisResult.decision}</Text>
              <Text style={styles.value}>{lastAnalysisResult.reason}</Text>
              {lastAnalysisResult.suggestions_next_days ? (
                <Text style={[styles.hint, styles.analysisSuggestions]}>{lastAnalysisResult.suggestions_next_days}</Text>
              ) : null}
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.analysisBtn, analysisLoading && styles.analysisBtnDisabled]}
            onPress={onRunAnalysisNow}
            disabled={analysisLoading}
          >
            {analysisLoading ? (
              <ActivityIndicator size="small" color="#0f172a" />
            ) : (
              <Text style={styles.analysisBtnText}>Запустить анализ</Text>
            )}
          </TouchableOpacity>

        </>
      )}
      </View>
      </ScrollView>
      <TouchableOpacity style={styles.fab} onPress={onOpenCamera} activeOpacity={0.8}>
        <Text style={styles.fabLabel}>📷</Text>
        <Text style={styles.fabText}>Фото</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a2e" },
  scrollView: { flex: 1 },
  userRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  userActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  headerSeparator: { fontSize: 14, color: "#64748b" },
  userEmail: { fontSize: 14, color: "#b8c5d6", flex: 1, marginRight: 12 },
  logoutText: { fontSize: 14, color: "#38bdf8" },
  content: { padding: 20, paddingBottom: 120 },
  contentWrap: { maxWidth: 960, width: "100%", alignSelf: "center" as const },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12 },
  menuIconBtn: { padding: 8 },
  menuIcon: { fontSize: 24, color: "#38bdf8", fontWeight: "700" },
  brandHeader: { marginBottom: 8 },
  brandTitle: { fontSize: 18, fontWeight: "700", color: "#eee", marginBottom: 2 },
  brandSubtitle: { fontSize: 13, color: "#94a3b8" },
  title: { fontSize: 24, fontWeight: "700", color: "#eee", marginBottom: 20 },
  menuBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-start", alignItems: "flex-end", paddingTop: 50, paddingRight: 16, paddingHorizontal: 20 },
  menuBox: { minWidth: 260, borderRadius: 12, padding: 16, paddingVertical: 12 },
  menuHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  menuEmail: { fontSize: 14, color: "#94a3b8", flex: 1 },
  menuCloseBtn: { padding: 4 },
  menuCloseIcon: { fontSize: 20, color: "#94a3b8", fontWeight: "600" },
  menuItem: { paddingVertical: 12 },
  menuItemText: { fontSize: 16, color: "#38bdf8" },
  loader: { marginTop: 40 },
  skeletonWrap: { gap: 12 },
  skeletonCard: { backgroundColor: "#16213e", borderRadius: 12, padding: 16, marginBottom: 12 },
  skeletonTitle: { width: "60%", height: 14, backgroundColor: "#334155", borderRadius: 4, marginBottom: 12 },
  skeletonLine: { width: "100%", height: 12, backgroundColor: "#334155", borderRadius: 4, marginBottom: 8 },
  skeletonLineShort: { width: "80%", height: 12, backgroundColor: "#334155", borderRadius: 4 },
  card: {
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 16, color: "#b8c5d6", marginBottom: 6 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 0 },
  cardTitleActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardTitleLink: { paddingVertical: 4, paddingLeft: 8 },
  syncBtn: {
    backgroundColor: "#38bdf8",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  syncBtnDisabled: { opacity: 0.7 },
  syncBtnText: { fontSize: 14, color: "#0f172a", fontWeight: "600" },
  value: { fontSize: 18, color: "#e2e8f0", fontWeight: "600" },
  cardValue: { fontSize: 20, fontWeight: "700", color: "#e2e8f0" },
  placeholder: { fontSize: 16, color: "#94a3b8" },
  hint: { fontSize: 12, color: "#94a3b8", marginTop: 4 },
  disclaimer: { fontSize: 11, color: "#64748b", marginTop: 2 },
  hintRemaining: { fontSize: 12, color: "#94a3b8", marginTop: 8 },
  weeklySleepLine: { fontSize: 14, color: "#e2e8f0", marginTop: 8 },
  calendarLink: { marginBottom: 8, paddingVertical: 4 },
  intervalsActionsRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  intervalsLinkText: { fontSize: 14, color: "#38bdf8" },
  sleepReminderBanner: {
    marginTop: 12,
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  sleepReminderText: { fontSize: 14, color: "#94a3b8", marginBottom: 10 },
  sleepReminderButtons: { flexDirection: "row", gap: 10 },
  sleepReminderBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: "#334155",
  },
  sleepReminderBtnText: { fontSize: 14, color: "#38bdf8", fontWeight: "600" },
  fitnessHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  fitnessActionsRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  fitnessActionLink: { paddingVertical: 4, paddingRight: 4 },
  fitnessActionPrimary: { fontSize: 14, fontWeight: "600" },
  fitnessActionSync: { paddingVertical: 4, paddingHorizontal: 8, minHeight: 28, justifyContent: "center" },
  fitnessActionSyncDisabled: { opacity: 0.7 },
  fitnessActionSecondary: { fontSize: 14 },
  fitnessHint: { fontSize: 12, marginTop: 2, marginBottom: 10 },
  fitnessMetricsBlock: { marginTop: 2 },
  fitnessMetricsLine: { fontSize: 20, fontWeight: "700", lineHeight: 28 },
  fitnessCaption: { fontSize: 12, marginTop: 4 },
  fitnessCaptionMuted: { fontStyle: "italic" },
  fitnessPlaceholder: { marginTop: 4 },
  errorHint: { fontSize: 12, color: "#f87171", marginBottom: 4 },
  dateNavBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  dateNavBtnActive: { backgroundColor: "#38bdf8" },
  dateNavText: { fontSize: 12, color: "#b8c5d6" },
  dateNavTextActive: { color: "#0f172a", fontWeight: "600" },
  mealRow: { marginTop: 2 },
  mealLine: { fontSize: 12, color: "#94a3b8" },
  deleteAction: { backgroundColor: "#dc2626", justifyContent: "center", alignItems: "center", paddingHorizontal: 16, marginTop: 2, borderRadius: 8 },
  deleteActionText: { color: "#fff", fontWeight: "600" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalBox: {
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 16,
    maxWidth: 400,
    width: "100%",
    maxHeight: "85%",
  },
  modalTitle: { fontSize: 18, fontWeight: "600", color: "#e2e8f0", marginBottom: 12 },
  modalScroll: { maxHeight: 320 },
  modalLabel: { fontSize: 12, color: "#b8c5d6", marginTop: 8, marginBottom: 4 },
  modalInput: {
    backgroundColor: "#1a1a2e",
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    color: "#e2e8f0",
  },
  mealTypeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8, marginBottom: 12 },
  mealTypeBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: "#1a1a2e" },
  mealTypeBtnActive: { backgroundColor: "#38bdf8" },
  mealTypeBtnText: { fontSize: 12, color: "#94a3b8" },
  mealTypeBtnTextActive: { fontSize: 12, color: "#0f172a", fontWeight: "600" },
  micronutrientsBlock: { marginTop: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "#1e293b", borderRadius: 8 },
  micronutrientRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  micronutrientLabel: { fontSize: 12, color: "#94a3b8" },
  micronutrientValue: { fontSize: 12, color: "#e2e8f0" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#334155" },
  modalBtnCancel: { paddingVertical: 10, paddingHorizontal: 16 },
  modalBtnCancelText: { fontSize: 16, color: "#b8c5d6" },
  modalBtnDelete: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: "#dc2626" },
  modalBtnDeleteText: { fontSize: 16, color: "#fff", fontWeight: "600" },
  modalBtnSave: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: "#38bdf8" },
  modalBtnSaveText: { fontSize: 16, color: "#0f172a", fontWeight: "600" },
  modalBtnCopy: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: "#475569" },
  modalBtnCopyText: { fontSize: 16, color: "#e2e8f0", fontWeight: "600" },
  modalBtnDisabled: { opacity: 0.7 },
  deleteConfirmBox: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#334155" },
  deleteConfirmTitle: { fontSize: 16, fontWeight: "600", color: "#e2e8f0", marginBottom: 4 },
  deleteConfirmMessage: { fontSize: 14, color: "#94a3b8", marginBottom: 12 },
  deleteConfirmActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  calendarRow: { flexDirection: "row", alignItems: "center", marginTop: 10, gap: 12 },
  calendarDate: { fontSize: 12, color: "#94a3b8", minWidth: 72 },
  calendarTitle: { fontSize: 14, color: "#e2e8f0", flex: 1 },
  activityRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 10, gap: 12 },
  activityInfo: { flex: 1 },
  analysisDecision: { fontSize: 14, color: "#38bdf8", fontWeight: "600", marginBottom: 6 },
  analysisSuggestions: { marginTop: 8, fontStyle: "italic" },
  analysisBtn: {
    marginTop: 12,
    backgroundColor: "#38bdf8",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  analysisBtnDisabled: { opacity: 0.7 },
  analysisBtnText: { fontSize: 16, color: "#0f172a", fontWeight: "600" },
  chatLink: { marginTop: 16, paddingVertical: 12 },
  chatLinkText: { fontSize: 16, color: "#38bdf8" },
  fab: {
    position: "absolute",
    bottom: 24,
    left: 20,
    backgroundColor: "#38bdf8",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabLabel: { fontSize: 22 },
  fabText: { fontSize: 16, color: "#0f172a", fontWeight: "600" },
});
