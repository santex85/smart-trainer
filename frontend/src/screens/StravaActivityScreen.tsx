import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Calendar } from "react-native-calendars";
import {
  getStravaActivities,
  getStravaStatus,
  type ActivityItem,
} from "../api/client";

function getTodayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function firstDayOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function lastDayOfMonth(year: number, month: number): string {
  const last = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

function formatDuration(sec: number | undefined): string {
  if (sec == null || sec <= 0) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function dateStrFromIso(iso: string | undefined): string | null {
  if (!iso) return null;
  const i = iso.indexOf("T");
  return i >= 0 ? iso.slice(0, i) : iso.slice(0, 10);
}

function formatStartDateTime(iso: string | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("default", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const CALENDAR_THEME = {
  backgroundColor: "transparent",
  calendarBackground: "transparent",
  textSectionTitleColor: "#94a3b8",
  selectedDayBackgroundColor: "#38bdf8",
  selectedDayTextColor: "#0f172a",
  todayTextColor: "#38bdf8",
  dayTextColor: "#e2e8f0",
  textDisabledColor: "#475569",
  dotColor: "#38bdf8",
  selectedDotColor: "#0f172a",
  arrowColor: "#38bdf8",
  monthTextColor: "#e2e8f0",
  textDayFontWeight: "500" as const,
  textMonthFontWeight: "700" as const,
};

export function StravaActivityScreen({ onClose }: { onClose: () => void }) {
  const today = getTodayLocal();
  const [viewDate, setViewDate] = useState(today);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [linked, setLinked] = useState(false);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);

  const viewYear = useMemo(() => parseInt(viewDate.slice(0, 4), 10), [viewDate]);
  const viewMonth = useMemo(() => parseInt(viewDate.slice(5, 7), 10), [viewDate]);
  const fromDate = useMemo(() => firstDayOfMonth(viewYear, viewMonth), [viewYear, viewMonth]);
  const toDate = useMemo(() => lastDayOfMonth(viewYear, viewMonth), [viewYear, viewMonth]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [status, list] = await Promise.all([
        getStravaStatus(),
        getStravaActivities(fromDate, toDate),
      ]);
      setLinked(status.linked);
      setActivities(list ?? []);
    } catch {
      setLinked(false);
      setActivities([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    load();
  }, [load]);

  const markedDates = useMemo(() => {
    const dates: Record<string, { marked?: boolean; selected?: boolean }> = {};
    for (const a of activities) {
      const d = dateStrFromIso(a.start_date);
      if (d) dates[d] = { marked: true };
    }
    if (selectedDay) {
      dates[selectedDay] = dates[selectedDay] ? { ...dates[selectedDay], selected: true } : { marked: false, selected: true };
    }
    return dates;
  }, [activities, selectedDay]);

  const activitiesForSelectedDay = useMemo(() => {
    if (!selectedDay) return [];
    return activities.filter((a) => dateStrFromIso(a.start_date) === selectedDay);
  }, [activities, selectedDay]);

  const goPrevMonth = () => {
    const d = new Date(viewYear, viewMonth - 2, 1);
    setViewDate(firstDayOfMonth(d.getFullYear(), d.getMonth() + 1));
  };

  const goNextMonth = () => {
    const d = new Date(viewYear, viewMonth, 1);
    setViewDate(firstDayOfMonth(d.getFullYear(), d.getMonth() + 1));
  };

  if (!linked && !loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.title}>Strava activity</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.close}>Close</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Strava is not connected.</Text>
          <Text style={styles.hint}>Connect Strava in settings to see your activities here.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Strava activity</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.close}>Close</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.monthNav}>
        <TouchableOpacity onPress={goPrevMonth} style={styles.navBtn}>
          <Text style={styles.navBtnText}>← Prev</Text>
        </TouchableOpacity>
        <Text style={styles.monthTitle}>
          {new Date(viewYear, viewMonth - 1, 1).toLocaleString("default", { month: "long", year: "numeric" })}
        </Text>
        <TouchableOpacity onPress={goNextMonth} style={styles.navBtn}>
          <Text style={styles.navBtnText}>Next →</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#38bdf8" />
          <Text style={styles.hint}>Loading activities…</Text>
        </View>
      ) : (
        <>
          <Calendar
            current={viewDate}
            onMonthChange={(month) => setViewDate(month.dateString)}
            markedDates={markedDates}
            onDayPress={(day) => setSelectedDay(day.dateString)}
            theme={CALENDAR_THEME}
            style={styles.calendar}
          />
          <ScrollView style={styles.listScroll} contentContainerStyle={styles.listContent}>
            {selectedDay ? (
              <>
                <Text style={styles.sectionTitle}>
                  {new Date(selectedDay + "T12:00:00").toLocaleDateString("default", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                </Text>
                {activitiesForSelectedDay.length > 0 ? (
                  activitiesForSelectedDay.map((act) => (
                    <TouchableOpacity
                      key={act.id}
                      style={styles.activityCard}
                      onPress={() => setExpandedActivityId(expandedActivityId === act.id ? null : act.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.activityName}>{act.name || "Workout"}</Text>
                      {act.type ? (
                        <Text style={styles.activityType}>{act.type}</Text>
                      ) : null}
                      <Text style={styles.activityMeta}>
                        {formatDuration(act.duration_sec)}
                        {act.distance_km != null ? ` · ${act.distance_km} km` : ""}
                        {act.tss != null ? ` · TSS ${Math.round(act.tss)}` : ""}
                      </Text>
                      {expandedActivityId === act.id ? (
                        <View style={styles.detailsBlock}>
                          <Text style={styles.detailsTitle}>Детали</Text>
                          <Text style={styles.detailsLine}>Старт: {formatStartDateTime(act.start_date)}</Text>
                          {act.type ? (
                            <Text style={styles.detailsLine}>Тип: {act.type}</Text>
                          ) : null}
                          {act.duration_sec != null ? (
                            <Text style={styles.detailsLine}>Длительность: {formatDuration(act.duration_sec)}</Text>
                          ) : null}
                          {act.distance_km != null ? (
                            <Text style={styles.detailsLine}>Дистанция: {act.distance_km} km</Text>
                          ) : null}
                          {act.tss != null ? (
                            <Text style={styles.detailsLine}>TSS: {Math.round(act.tss)}</Text>
                          ) : null}
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  ))
                ) : (
                  <Text style={styles.hint}>No activities on this day.</Text>
                )}
              </>
            ) : (
              <Text style={styles.hint}>Select a day to see activities.</Text>
            )}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a2e", paddingHorizontal: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "700", color: "#eee" },
  close: { fontSize: 16, color: "#38bdf8" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  emptyText: { fontSize: 18, color: "#e2e8f0", marginBottom: 8 },
  hint: { fontSize: 14, color: "#94a3b8" },
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  navBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  navBtnText: { fontSize: 14, color: "#38bdf8" },
  monthTitle: { fontSize: 18, fontWeight: "600", color: "#e2e8f0" },
  calendar: { borderRadius: 12, marginBottom: 16 },
  listScroll: { flex: 1 },
  listContent: { paddingBottom: 24 },
  sectionTitle: { fontSize: 14, color: "#94a3b8", marginBottom: 12 },
  activityCard: {
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  activityName: { fontSize: 16, color: "#e2e8f0", fontWeight: "600" },
  activityType: { fontSize: 12, color: "#64748b", marginTop: 2 },
  activityMeta: { fontSize: 12, color: "#94a3b8", marginTop: 4 },
  detailsBlock: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#334155" },
  detailsTitle: { fontSize: 12, color: "#94a3b8", fontWeight: "600", marginBottom: 6 },
  detailsLine: { fontSize: 12, color: "#94a3b8", marginBottom: 2 },
});
