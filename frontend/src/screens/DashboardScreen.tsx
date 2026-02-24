import React, { useCallback, useEffect, useState } from "react";
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
} from "react-native";
import {
  getStravaActivities,
  getStravaStatus,
  syncStrava,
  getStravaFitness,
  getNutritionDay,
  updateNutritionEntry,
  deleteNutritionEntry,
  runOrchestrator,
  getWellness,
  createOrUpdateWellness,
  getSleepExtractions,
  getAthleteProfile,
  updateAthleteProfile,
  type ActivityItem,
  type NutritionDayResponse,
  type NutritionDayEntry,
  type AuthUser,
  type StravaFitness,
  type WellnessDay,
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

function EditFoodEntryModal({
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
      Alert.alert("Error", "Please enter valid numbers.");
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
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
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
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete");
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
              <Text style={styles.deleteConfirmTitle}>Delete entry?</Text>
              <Text style={styles.deleteConfirmMessage}>"{entry.name}" will be removed.</Text>
              <View style={styles.deleteConfirmActions}>
                <TouchableOpacity style={styles.modalBtnCancel} onPress={hideDeleteConfirm}>
                  <Text style={styles.modalBtnCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtnDelete} onPress={runDelete} disabled={deleting}>
                  {deleting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalBtnDeleteText}>Delete</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={onClose}>
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnDelete, (saving || deleting) && styles.modalBtnDisabled]}
                onPress={showDeleteConfirm}
                disabled={saving || deleting}
              >
                <Text style={styles.modalBtnDeleteText}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnSave, (saving || deleting) && styles.modalBtnDisabled]}
                onPress={handleSave}
                disabled={saving || deleting}
              >
                {saving ? <ActivityIndicator size="small" color="#0f172a" /> : <Text style={styles.modalBtnSaveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function EditWellnessModal({
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
}

export function DashboardScreen({
  user,
  onLogout,
  onOpenCamera,
  onOpenChat,
  onOpenStrava,
  onOpenStravaActivity,
  onOpenAthleteProfile,
  refreshNutritionTrigger = 0,
  refreshStravaTrigger = 0,
}: {
  user?: AuthUser | null;
  onLogout?: () => void;
  onOpenCamera: () => void;
  onOpenChat: () => void;
  onOpenStrava?: () => void;
  onOpenStravaActivity?: () => void;
  onOpenAthleteProfile?: () => void;
  refreshNutritionTrigger?: number;
  refreshStravaTrigger?: number;
}) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [activitiesLoadError, setActivitiesLoadError] = useState(false);
  const [stravaLinked, setStravaLinked] = useState(false);
  const [syncingStrava, setSyncingStrava] = useState(false);
  const [nutritionDay, setNutritionDay] = useState<NutritionDayResponse | null>(null);
  const [nutritionLoadError, setNutritionLoadError] = useState(false);
  const [nutritionDate, setNutritionDate] = useState(getTodayLocal);
  const [entryToEdit, setEntryToEdit] = useState<NutritionDayEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [fitnessData, setFitnessData] = useState<StravaFitness | null>(null);
  const [wellnessToday, setWellnessToday] = useState<WellnessDay | null>(null);
  const [sleepFromPhoto, setSleepFromPhoto] = useState<{ sleep_hours?: number; actual_sleep_hours?: number; sleep_date?: string } | null>(null);
  const [athleteProfile, setAthleteProfile] = useState<{ weight_kg: number | null } | null>(null);
  const [wellnessEditVisible, setWellnessEditVisible] = useState(false);
  const [lastAnalysisResult, setLastAnalysisResult] = useState<{
    decision: string;
    reason: string;
    suggestions_next_days?: string;
  } | null>(null);

  const today = getTodayLocal();
  const activitiesStart = addDays(today, -14);

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
    setActivitiesLoadError(false);
    try {
      const [stravaStatus, aResult, nResult, fitness, wellnessList, sleepFromPhotoResult, profile] = await Promise.all([
        getStravaStatus().then((s) => s.linked).catch(() => false),
        getStravaActivities(activitiesStart, today).then((a) => ({ ok: true as const, data: a || [] })).catch(() => ({ ok: false as const, data: [] as ActivityItem[] })),
        getNutritionDay(nutritionDate).then((n) => ({ ok: true as const, data: n })).catch(() => ({ ok: false as const, data: null })),
        getStravaFitness().then((f) => f ?? null).catch(() => null),
        getWellness(addDays(today, -1), addDays(today, 1)).then((w) => {
          if (!w || w.length === 0) return null;
          return w.find((d) => d.date === today) ?? null;
        }).catch(() => null),
        getSleepExtractions(addDays(today, -6), today).then((list) => {
          const latest = list && list.length > 0 ? list[0] : null;
          if (!latest) return null;
          const hours = latest.actual_sleep_hours ?? latest.sleep_hours;
          return hours != null ? { sleep_hours: latest.sleep_hours, actual_sleep_hours: latest.actual_sleep_hours, sleep_date: latest.sleep_date ?? undefined } : null;
        }).catch(() => null),
        getAthleteProfile().then((p) => ({ weight_kg: p.weight_kg })).catch(() => null),
      ]);
      setStravaLinked(stravaStatus);
      setActivities((aResult.ok ? aResult.data : []).sort((x, y) => (y.start_date || "").localeCompare(x.start_date || "")));
      setActivitiesLoadError(!aResult.ok);
      setNutritionDay(nResult.ok ? nResult.data : null);
      setNutritionLoadError(!nResult.ok);
      setFitnessData(fitness);
      setWellnessToday(wellnessList);
      setSleepFromPhoto(wellnessList?.sleep_hours != null ? null : sleepFromPhotoResult);
      setAthleteProfile(profile);
    } catch {
      setActivities([]);
      setActivitiesLoadError(true);
      setNutritionDay(null);
      setNutritionLoadError(true);
      setFitnessData(null);
      setWellnessToday(null);
      setSleepFromPhoto(null);
      setAthleteProfile(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [today, activitiesStart, nutritionDate]);

  useEffect(() => {
    load();
  }, [load, refreshNutritionTrigger, refreshStravaTrigger]);

  const setNutritionDateAndLoad = useCallback(
    (dateStr: string) => {
      setNutritionDate(dateStr);
      loadNutritionForDate(dateStr);
    },
    [loadNutritionForDate]
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const onRunAnalysisNow = async () => {
    setAnalysisLoading(true);
    setLastAnalysisResult(null);
    try {
      const result = await runOrchestrator();
      setLastAnalysisResult(result);
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Request failed";
      Alert.alert("Error", msg);
    } finally {
      setAnalysisLoading(false);
    }
  };

  const onSyncStrava = async () => {
    if (syncingStrava) return;
    setSyncingStrava(true);
    try {
      await syncStrava();
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sync failed";
      Alert.alert("Error", msg);
    } finally {
      setSyncingStrava(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {user && onLogout ? (
        <View style={styles.userRow}>
          <Text style={styles.userEmail} numberOfLines={1}>{user.email}</Text>
          <TouchableOpacity onPress={onLogout}>
            <Text style={styles.logoutText}>Log out</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <Text style={styles.title}>Today</Text>

      {loading ? (
        <ActivityIndicator size="large" style={styles.loader} />
      ) : (
        <>
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>Nutrition (goal remainder)</Text>
              <View style={styles.cardTitleActions}>
                <TouchableOpacity
                  onPress={() => setNutritionDateAndLoad(addDays(nutritionDate, -1))}
                  style={styles.dateNavBtn}
                >
                  <Text style={styles.dateNavText}>Yesterday</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setNutritionDateAndLoad(today)}
                  style={[styles.dateNavBtn, nutritionDate === today && styles.dateNavBtnActive]}
                >
                  <Text style={[styles.dateNavText, nutritionDate === today && styles.dateNavTextActive]}>Today</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setNutritionDateAndLoad(addDays(nutritionDate, 1))}
                  style={styles.dateNavBtn}
                >
                  <Text style={styles.dateNavText}>Tomorrow</Text>
                </TouchableOpacity>
              </View>
            </View>
            {nutritionLoadError && (
              <Text style={styles.errorHint}>Couldn&apos;t load nutrition. Pull to refresh.</Text>
            )}
            {!nutritionLoadError && nutritionDay && nutritionDay.entries.length > 0 ? (
              <>
                <Text style={styles.value}>
                  Logged: {Math.round(nutritionDay.totals.calories)} kcal · P {Math.round(nutritionDay.totals.protein_g)}g · F{" "}
                  {Math.round(nutritionDay.totals.fat_g)}g · C {Math.round(nutritionDay.totals.carbs_g)}g
                </Text>
                <Text style={styles.hint}>
                  Remainder: {Math.max(0, CALORIE_GOAL - nutritionDay.totals.calories)} kcal · Carbs{" "}
                  {Math.max(0, CARBS_GOAL - nutritionDay.totals.carbs_g)}g · P {Math.max(0, PROTEIN_GOAL - nutritionDay.totals.protein_g)}g · F{" "}
                  {Math.max(0, FAT_GOAL - nutritionDay.totals.fat_g)}g
                </Text>
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
            ) : !nutritionLoadError ? (
              <>
                <Text style={styles.placeholder}>Track meals with the camera →</Text>
                <Text style={styles.hint}>Goal: {CALORIE_GOAL} kcal · Carbs: {CARBS_GOAL}g · P: {PROTEIN_GOAL}g · F: {FAT_GOAL}g</Text>
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
            {(wellnessToday || sleepFromPhoto || athleteProfile?.weight_kg != null) ? (
              <Text style={styles.value}>
                {(wellnessToday?.sleep_hours ?? sleepFromPhoto?.actual_sleep_hours ?? sleepFromPhoto?.sleep_hours) != null
                  ? `Сон ${(wellnessToday?.sleep_hours ?? sleepFromPhoto?.actual_sleep_hours ?? sleepFromPhoto?.sleep_hours)} ч`
                  : "Сон —"}
                {wellnessToday?.rhr != null ? ` · RHR ${wellnessToday.rhr}` : " · RHR —"}
                {wellnessToday?.hrv != null ? ` · HRV ${wellnessToday.hrv}` : " · HRV —"}
                {athleteProfile?.weight_kg != null ? ` · Вес ${athleteProfile.weight_kg} кг` : " · Вес —"}
              </Text>
            ) : (
              <Text style={styles.placeholder}>Нажмите «Изменить», чтобы ввести сон, RHR, HRV и вес.</Text>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Fitness (CTL / ATL / TSB)</Text>
            <Text style={styles.hint}>TrainingPeaks-style from Strava TSS (last 90 days)</Text>
            {fitnessData ? (
              <>
                <Text style={styles.value}>
                  CTL {fitnessData.ctl.toFixed(0)} · ATL {fitnessData.atl.toFixed(0)} · TSB {fitnessData.tsb.toFixed(0)}
                </Text>
                <Text style={styles.hint}>As of {fitnessData.date}</Text>
              </>
            ) : (
              <Text style={styles.placeholder}>Connect Strava and sync workouts to see fitness.</Text>
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

          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>Training</Text>
              <View style={styles.cardTitleActions}>
                {stravaLinked && (
                  <TouchableOpacity
                    onPress={onSyncStrava}
                    style={[styles.syncBtn, syncingStrava && styles.syncBtnDisabled]}
                    disabled={syncingStrava}
                  >
                    {syncingStrava ? (
                      <ActivityIndicator size="small" color="#0f172a" />
                    ) : (
                      <Text style={styles.syncBtnText}>Sync</Text>
                    )}
                  </TouchableOpacity>
                )}
                {onOpenStrava && (
                  <TouchableOpacity onPress={onOpenStrava} style={styles.cardTitleLink}>
                    <Text style={styles.intervalsLinkText}>Strava</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <Text style={styles.hint}>Last 14 days · completed workouts from Strava</Text>
            {onOpenStravaActivity && stravaLinked && (
              <TouchableOpacity style={styles.calendarLink} onPress={onOpenStravaActivity}>
                <Text style={styles.intervalsLinkText}>All activity (calendar)</Text>
              </TouchableOpacity>
            )}
            {activitiesLoadError && (
              <Text style={styles.errorHint}>Couldn&apos;t load workouts. Pull to refresh or sync in Strava.</Text>
            )}
            {!activitiesLoadError && activities.length > 0 ? activities.map((act) => (
                <View key={act.id} style={styles.activityRow}>
                  <Text style={styles.calendarDate}>{formatEventDate(act.start_date)}</Text>
                  <View style={styles.activityInfo}>
                    <Text style={styles.calendarTitle}>{act.name || "Workout"}</Text>
                    <Text style={styles.hint}>
                      {formatDuration(act.duration_sec)}
                      {act.distance_km != null ? ` · ${act.distance_km} km` : ""}
                      {act.tss != null ? ` · TSS ${Math.round(act.tss)}` : ""}
                    </Text>
                  </View>
                </View>
              )) : !activitiesLoadError ? (
              <Text style={styles.placeholder}>No workouts. Connect Strava to import.</Text>
            ) : null}
          </View>

          {lastAnalysisResult ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Analysis result</Text>
              <Text style={styles.analysisDecision}>Decision: {lastAnalysisResult.decision}</Text>
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
              <Text style={styles.analysisBtnText}>Run analysis now</Text>
            )}
          </TouchableOpacity>

          {onOpenAthleteProfile && (
            <TouchableOpacity style={styles.chatLink} onPress={onOpenAthleteProfile}>
              <Text style={styles.chatLinkText}>Athlete profile →</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.chatLink} onPress={onOpenChat}>
            <Text style={styles.chatLinkText}>Open AI Coach chat →</Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity style={styles.fab} onPress={onOpenCamera} activeOpacity={0.8}>
        <Text style={styles.fabLabel}>📷</Text>
        <Text style={styles.fabText}>Photo</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a2e" },
  userRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  userEmail: { fontSize: 14, color: "#94a3b8", flex: 1, marginRight: 12 },
  logoutText: { fontSize: 14, color: "#38bdf8" },
  content: { padding: 20, paddingBottom: 120 },
  title: { fontSize: 28, fontWeight: "700", color: "#eee", marginBottom: 20 },
  loader: { marginTop: 40 },
  card: {
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 14, color: "#94a3b8", marginBottom: 6 },
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
  placeholder: { fontSize: 16, color: "#64748b" },
  hint: { fontSize: 12, color: "#64748b", marginTop: 4 },
  calendarLink: { marginBottom: 8, paddingVertical: 4 },
  intervalsLinkText: { fontSize: 14, color: "#38bdf8" },
  errorHint: { fontSize: 12, color: "#f87171", marginBottom: 4 },
  dateNavBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  dateNavBtnActive: { backgroundColor: "#38bdf8" },
  dateNavText: { fontSize: 12, color: "#94a3b8" },
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
  modalLabel: { fontSize: 12, color: "#94a3b8", marginTop: 8, marginBottom: 4 },
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
  modalBtnCancelText: { fontSize: 16, color: "#94a3b8" },
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
  calendarDate: { fontSize: 12, color: "#64748b", minWidth: 72 },
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
    right: 20,
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
