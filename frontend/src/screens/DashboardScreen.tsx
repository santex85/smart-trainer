import React, { useCallback, useEffect, useMemo, useState, memo } from "react";
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
} from "react-native";
import {
  getNutritionDay,
  updateNutritionEntry,
  deleteNutritionEntry,
  runOrchestrator,
  getWellness,
  createOrUpdateWellness,
  getSleepExtractions,
  getAthleteProfile,
  updateAthleteProfile,
  getWorkouts,
  getWorkoutFitness,
  createWorkout,
  uploadFitWorkout,
  type AthleteProfileResponse,
  type NutritionDayResponse,
  type NutritionDayEntry,
  type AuthUser,
  type WellnessDay,
  type WorkoutItem,
  type WorkoutFitness,
} from "../api/client";

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

const NutritionProgressBar = memo(function NutritionProgressBar({
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

const EditFoodEntryModal = memo(function EditFoodEntryModal({
  entry,
  onClose,
  onSaved,
  onDeleted,
}: {
  entry: NutritionDayEntry;
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
                style={[styles.modalBtnDelete, (saving || deleting) && styles.modalBtnDisabled]}
                onPress={showDeleteConfirm}
                disabled={saving || deleting}
              >
                <Text style={styles.modalBtnDeleteText}>Удалить</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnSave, (saving || deleting) && styles.modalBtnDisabled]}
                onPress={handleSave}
                disabled={saving || deleting}
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

const EditWellnessModal = memo(function EditWellnessModal({
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
      await createOrUpdateWellness({ date, sleep_hours: sh, rhr: r, hrv: h });
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

const AddWorkoutModal = memo(function AddWorkoutModal({
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

export function DashboardScreen({
  user,
  onLogout,
  onOpenCamera,
  onOpenChat,
  onOpenAthleteProfile,
  onOpenIntervals,
  refreshNutritionTrigger = 0,
  refreshSleepTrigger = 0,
}: {
  user?: AuthUser | null;
  onLogout?: () => void;
  onOpenCamera: () => void;
  onOpenChat: () => void;
  onOpenAthleteProfile?: () => void;
  onOpenIntervals?: () => void;
  refreshNutritionTrigger?: number;
  refreshSleepTrigger?: number;
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
  const [sleepFromPhoto, setSleepFromPhoto] = useState<{ sleep_hours?: number; actual_sleep_hours?: number; sleep_date?: string } | null>(null);
  const [athleteProfile, setAthleteProfile] = useState<AthleteProfileResponse | null>(null);
  const [wellnessEditVisible, setWellnessEditVisible] = useState(false);
  const [workoutAddVisible, setWorkoutAddVisible] = useState(false);
  const [fitUploading, setFitUploading] = useState(false);
  const [lastAnalysisResult, setLastAnalysisResult] = useState<{
    decision: string;
    reason: string;
    suggestions_next_days?: string;
  } | null>(null);

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
      const [nResult, wellnessList, sleepFromPhotoResult, profile, workoutsList, fitness] = await Promise.all([
        getNutritionDay(nutritionDate).then((n) => ({ ok: true as const, data: n })).catch(() => ({ ok: false as const, data: null })),
        getWellness(addDays(today, -6), addDays(today, 1)).then((w) => {
          if (!w || w.length === 0) return null;
          const todayNorm = today.slice(0, 10);
          const forToday = w.find((d) => String(d?.date ?? "").slice(0, 10) === todayNorm);
          if (forToday) return forToday;
          const withSleep = w.filter((d) => (d?.sleep_hours ?? 0) > 0).sort((a, b) => String(b?.date ?? "").localeCompare(String(a?.date ?? "")));
          return withSleep[0] ?? null;
        }).catch(() => null),
        getSleepExtractions(addDays(today, -59), today).then((list) => {
          if (!list || list.length === 0) return null;
          const withHours = list.find((x) => (x.actual_sleep_hours ?? x.sleep_hours) != null);
          if (!withHours) return null;
          return { sleep_hours: withHours.sleep_hours, actual_sleep_hours: withHours.actual_sleep_hours, sleep_date: withHours.sleep_date ?? undefined };
        }).catch(() => null),
        getAthleteProfile().catch(() => null),
        getWorkouts(activitiesStart, today).catch(() => []),
        getWorkoutFitness().catch(() => null),
      ]);
      setNutritionDay(nResult.ok ? nResult.data : null);
      setNutritionLoadError(!nResult.ok);
      setWellnessToday(wellnessList);
      setSleepFromPhoto(wellnessList?.sleep_hours != null ? null : sleepFromPhotoResult);
      setAthleteProfile(profile);
      setWorkouts(workoutsList ?? []);
      setWorkoutFitness(fitness ?? null);
    } catch {
      setNutritionDay(null);
      setNutritionLoadError(true);
      setWellnessToday(null);
      setSleepFromPhoto(null);
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
  }, [load, refreshNutritionTrigger, refreshSleepTrigger]);

  const setNutritionDateAndLoad = useCallback(
    (dateStr: string) => {
      setNutritionDate(dateStr);
      loadNutritionForDate(dateStr);
    },
    [loadNutritionForDate]
  );

  const calorieGoal = useMemo(() => athleteProfile?.nutrition_goals?.calorie_goal ?? CALORIE_GOAL, [athleteProfile]);
  const proteinGoal = useMemo(() => athleteProfile?.nutrition_goals?.protein_goal ?? PROTEIN_GOAL, [athleteProfile]);
  const fatGoal = useMemo(() => athleteProfile?.nutrition_goals?.fat_goal ?? FAT_GOAL, [athleteProfile]);
  const carbsGoal = useMemo(() => athleteProfile?.nutrition_goals?.carbs_goal ?? CARBS_GOAL, [athleteProfile]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const onSelectFitFile = useCallback(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      Alert.alert("FIT", "Загрузка FIT доступна в веб-версии. Откройте приложение в браузере.");
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
        await uploadFitWorkout(file);
        load();
      } catch (err) {
        Alert.alert("Ошибка", err instanceof Error ? err.message : "Не удалось загрузить FIT.");
      } finally {
        setFitUploading(false);
      }
    };
    input.click();
  }, [load]);

  const onRunAnalysisNow = async () => {
    setAnalysisLoading(true);
    setLastAnalysisResult(null);
    try {
      const result = await runOrchestrator();
      setLastAnalysisResult(result);
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Request failed";
      Alert.alert("Ошибка", msg);
    } finally {
      setAnalysisLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
      <View style={styles.contentWrap}>
      <View style={styles.brandHeader}>
        <Text style={styles.brandTitle}>Smart Trainer</Text>
        <Text style={styles.brandSubtitle}>Питание, сон и тренировки в одном месте</Text>
      </View>
      {user && onLogout ? (
        <View style={styles.userRow}>
          <Text style={styles.userEmail} numberOfLines={1}>{user.email}</Text>
          <TouchableOpacity onPress={onLogout}>
            <Text style={styles.logoutText}>Выйти</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <Text style={styles.title}>Сегодня</Text>

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
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>Питание (остаток по целям)</Text>
              <View style={styles.cardTitleActions}>
                <TouchableOpacity
                  onPress={() => setNutritionDateAndLoad(addDays(nutritionDate, -1))}
                  style={styles.dateNavBtn}
                >
                  <Text style={styles.dateNavText}>Вчера</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setNutritionDateAndLoad(today)}
                  style={[styles.dateNavBtn, nutritionDate === today && styles.dateNavBtnActive]}
                >
                  <Text style={[styles.dateNavText, nutritionDate === today && styles.dateNavTextActive]}>Сегодня</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setNutritionDateAndLoad(addDays(nutritionDate, 1))}
                  style={styles.dateNavBtn}
                >
                  <Text style={styles.dateNavText}>Завтра</Text>
                </TouchableOpacity>
              </View>
            </View>
            {nutritionLoadError && (
              <Text style={styles.errorHint}>Не удалось загрузить питание. Потяните для обновления.</Text>
            )}
            {!nutritionLoadError && nutritionDay && nutritionDay.entries.length > 0 ? (
              <>
                <Text style={styles.cardValue}>
                  Съедено: {Math.round(nutritionDay.totals.calories)} ккал · Б {Math.round(nutritionDay.totals.protein_g)}г · Ж{" "}
                  {Math.round(nutritionDay.totals.fat_g)}г · У {Math.round(nutritionDay.totals.carbs_g)}г
                </Text>
                <Text style={styles.hint}>
                  Осталось: {Math.max(0, calorieGoal - nutritionDay.totals.calories)} ккал · У{" "}
                  {Math.max(0, carbsGoal - nutritionDay.totals.carbs_g)}г · Б {Math.max(0, proteinGoal - nutritionDay.totals.protein_g)}г · Ж{" "}
                  {Math.max(0, fatGoal - nutritionDay.totals.fat_g)}г
                </Text>
                <NutritionProgressBar
                  current={nutritionDay.totals.calories}
                  goal={calorieGoal}
                  label="Ккал"
                  color="#38bdf8"
                />
                <NutritionProgressBar
                  current={nutritionDay.totals.protein_g}
                  goal={proteinGoal}
                  label="Белки"
                  color="#22c55e"
                />
                <NutritionProgressBar
                  current={nutritionDay.totals.fat_g}
                  goal={fatGoal}
                  label="Жиры"
                  color="#f59e0b"
                />
                <NutritionProgressBar
                  current={nutritionDay.totals.carbs_g}
                  goal={carbsGoal}
                  label="Углеводы"
                  color="#8b5cf6"
                />
                {nutritionDay.entries.map((entry) => (
                  <TouchableOpacity
                    key={entry.id}
                    onPress={() => setEntryToEdit(entry)}
                    style={styles.mealRow}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.mealLine}>
                      {entry.name}: {Math.round(entry.calories)} kcal
                    </Text>
                  </TouchableOpacity>
                ))}
              </>
            ) : !nutritionLoadError && nutritionDay ? (
              <>
                <Text style={styles.placeholder}>Отмечайте приёмы пищи камерой →</Text>
                <Text style={styles.hint}>Цель: {calorieGoal} ккал · У: {carbsGoal}г · Б: {proteinGoal}г · Ж: {fatGoal}г</Text>
                <NutritionProgressBar current={nutritionDay.totals.calories} goal={calorieGoal} label="Ккал" color="#38bdf8" />
                <NutritionProgressBar current={nutritionDay.totals.protein_g} goal={proteinGoal} label="Белки" color="#22c55e" />
                <NutritionProgressBar current={nutritionDay.totals.fat_g} goal={fatGoal} label="Жиры" color="#f59e0b" />
                <NutritionProgressBar current={nutritionDay.totals.carbs_g} goal={carbsGoal} label="Углеводы" color="#8b5cf6" />
              </>
            ) : !nutritionLoadError ? (
              <>
                <Text style={styles.placeholder}>Отмечайте приёмы пищи камерой →</Text>
                <Text style={styles.hint}>Цель: {calorieGoal} ккал · У: {carbsGoal}г · Б: {proteinGoal}г · Ж: {fatGoal}г</Text>
              </>
            ) : null}
          </View>

          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>Сон и здоровье</Text>
              <TouchableOpacity onPress={() => setWellnessEditVisible(true)}>
                <Text style={styles.intervalsLinkText}>Изменить</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>Сегодня. Данные хранятся в БД и учитываются ИИ при анализе и в чате.</Text>
            {(wellnessToday || sleepFromPhoto || athleteProfile?.weight_kg != null || wellnessToday?.weight_kg != null) ? (
              <>
                <Text style={styles.cardValue}>
                  {(wellnessToday?.sleep_hours ?? sleepFromPhoto?.actual_sleep_hours ?? sleepFromPhoto?.sleep_hours) != null
                    ? `Сон ${(wellnessToday?.sleep_hours ?? sleepFromPhoto?.actual_sleep_hours ?? sleepFromPhoto?.sleep_hours)} ч`
                    : "Сон —"}
                  {wellnessToday?.rhr != null ? ` · RHR ${wellnessToday.rhr}` : " · RHR —"}
                  {wellnessToday?.hrv != null ? ` · HRV ${wellnessToday.hrv}` : " · HRV —"}
                  {(wellnessToday?.weight_kg ?? athleteProfile?.weight_kg) != null
                    ? ` · Вес ${wellnessToday?.weight_kg ?? athleteProfile?.weight_kg} кг`
                    : " · Вес —"}
                </Text>
                {(wellnessToday?.sleep_hours ?? sleepFromPhoto?.actual_sleep_hours ?? sleepFromPhoto?.sleep_hours) == null && (
                  <Text style={styles.hint}>Введите сон вручную (Изменить) или загрузите фото сна через камеру.</Text>
                )}
              </>
            ) : (
              <Text style={styles.placeholder}>Нажмите «Изменить», чтобы ввести сон, RHR, HRV и вес.</Text>
            )}
          </View>

          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>Фитнес (CTL / ATL / TSB)</Text>
              {onOpenIntervals ? (
                <TouchableOpacity onPress={onOpenIntervals}>
                  <Text style={styles.intervalsLinkText}>Intervals.icu</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={styles.hint}>По TSS из тренировок. Подключите Intervals.icu для планов и синхронизации.</Text>
            {workoutFitness ? (
              <>
                <Text style={styles.cardValue}>
                  CTL {workoutFitness.ctl.toFixed(0)} · ATL {workoutFitness.atl.toFixed(0)} · TSB {workoutFitness.tsb.toFixed(0)}
                </Text>
                <Text style={styles.hint}>На дату {workoutFitness.date}</Text>
              </>
            ) : (wellnessToday?.ctl != null || wellnessToday?.atl != null || wellnessToday?.tsb != null) ? (
              <>
                <Text style={styles.cardValue}>
                  CTL {wellnessToday?.ctl?.toFixed(0) ?? "—"} · ATL {wellnessToday?.atl?.toFixed(0) ?? "—"} · TSB {wellnessToday?.tsb?.toFixed(0) ?? "—"}
                </Text>
                <Text style={styles.hint}>Из wellness. Добавляйте тренировки для расчёта по TSS.</Text>
              </>
            ) : (
              <Text style={styles.placeholder}>Добавляйте тренировки вручную или загружайте FIT — CTL/ATL/TSB посчитаются по TSS.</Text>
            )}
          </View>

          {entryToEdit ? (
            <EditFoodEntryModal
              entry={entryToEdit}
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

          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>Тренировки</Text>
              <View style={styles.cardTitleActions}>
                <TouchableOpacity
                  onPress={onSelectFitFile}
                  disabled={fitUploading}
                  style={fitUploading ? styles.syncBtnDisabled : undefined}
                >
                  {fitUploading ? (
                    <ActivityIndicator size="small" color="#38bdf8" />
                  ) : (
                    <Text style={styles.intervalsLinkText}>Загрузить FIT</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setWorkoutAddVisible(true)}>
                  <Text style={styles.intervalsLinkText}>+ Добавить</Text>
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
              <View key={act.id} style={styles.activityRow}>
                <Text style={styles.calendarDate}>{formatEventDate(act.start_date)}</Text>
                <View style={styles.activityInfo}>
                  <Text style={styles.calendarTitle}>{act.name || "Тренировка"}</Text>
                  <Text style={styles.hint}>
                    {formatDuration(act.duration_sec ?? undefined)}
                    {act.distance_m != null ? ` · ${(act.distance_m / 1000).toFixed(1)} km` : ""}
                    {act.tss != null ? ` · TSS ${Math.round(act.tss)}` : ""}
                  </Text>
                </View>
              </View>
            )) : (
              <Text style={styles.placeholder}>Нет тренировок. Подключите Intervals.icu и нажмите «Синхронизировать» или добавьте вручную / загрузите FIT.</Text>
            )}
          </View>

          {lastAnalysisResult ? (
            <View style={styles.card}>
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

          {onOpenAthleteProfile && (
            <TouchableOpacity style={styles.chatLink} onPress={onOpenAthleteProfile}>
              <Text style={styles.chatLinkText}>Профиль атлета →</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.chatLink} onPress={onOpenChat}>
            <Text style={styles.chatLinkText}>Открыть чат AI-тренера →</Text>
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
  userEmail: { fontSize: 14, color: "#b8c5d6", flex: 1, marginRight: 12 },
  logoutText: { fontSize: 14, color: "#38bdf8" },
  content: { padding: 20, paddingBottom: 120 },
  contentWrap: { maxWidth: 960, width: "100%", alignSelf: "center" as const },
  brandHeader: { marginBottom: 12 },
  brandTitle: { fontSize: 22, fontWeight: "700", color: "#eee", marginBottom: 2 },
  brandSubtitle: { fontSize: 14, color: "#94a3b8" },
  title: { fontSize: 28, fontWeight: "700", color: "#eee", marginBottom: 20 },
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
    marginBottom: 12,
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
  calendarLink: { marginBottom: 8, paddingVertical: 4 },
  intervalsLinkText: { fontSize: 14, color: "#38bdf8" },
  errorHint: { fontSize: 12, color: "#f87171", marginBottom: 4 },
  dateNavBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  dateNavBtnActive: { backgroundColor: "#38bdf8" },
  dateNavText: { fontSize: 12, color: "#b8c5d6" },
  dateNavTextActive: { color: "#0f172a", fontWeight: "600" },
  mealRow: { marginTop: 2 },
  mealLine: { fontSize: 12, color: "#94a3b8" },
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
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#334155" },
  modalBtnCancel: { paddingVertical: 10, paddingHorizontal: 16 },
  modalBtnCancelText: { fontSize: 16, color: "#b8c5d6" },
  modalBtnDelete: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: "#dc2626" },
  modalBtnDeleteText: { fontSize: 16, color: "#fff", fontWeight: "600" },
  modalBtnSave: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: "#38bdf8" },
  modalBtnSaveText: { fontSize: 16, color: "#0f172a", fontWeight: "600" },
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
