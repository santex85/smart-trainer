import React from "react";
import { Utensils } from "lucide-react";

const COLORS = {
  background: "#0D0D0D",
  glassBg: "rgba(255, 255, 255, 0.08)",
  glassBorder: "rgba(255, 255, 255, 0.1)",
  text: "#e2e8f0",
  textMuted: "#94a3b8",
  primary: "#38bdf8",
  cal: "#22D3EE",
  protein: "#4ADE80",
  fat: "#FBBF24",
  carbs: "#A78BFA",
  mealIcon: "#9ca3af",
} as const;

const DEMO_MACROS = [
  { label: "Cal", current: 1567, goal: 2070, color: COLORS.cal },
  { label: "Protein", current: 93, goal: 120, color: COLORS.protein },
  { label: "Fat", current: 45, goal: 69, color: COLORS.fat },
  { label: "Carbs", current: 180, goal: 215, color: COLORS.carbs },
];

const DEMO_MEALS = [
  { name: "Oatmeal with berries", kcal: 312 },
  { name: "Chicken salad", kcal: 420 },
  { name: "Protein shake", kcal: 180 },
  { name: "Rice with vegetables", kcal: 380 },
  { name: "Greek yogurt", kcal: 112 },
  { name: "Banana", kcal: 105 },
];

function ProgressBar({ label, current, goal, color }: { label: string; current: number; goal: number; color: string }) {
  const percent = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
  return (
    <div className="mt-3">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-[13px] font-semibold text-white">{label}</span>
        <span className="text-[13px] text-[#e2e8f0]">
          {Math.round(current)} / {Math.round(goal)}
        </span>
      </div>
      <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${percent}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export function DashboardPreview() {
  return (
    <div
      className="w-full aspect-[4/3] max-h-[360px] min-h-[280px] rounded-[24px] overflow-hidden flex flex-col p-4"
      style={{
        backgroundColor: COLORS.background,
        border: `1px solid ${COLORS.glassBorder}`,
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
      {/* Header row: title + date pills */}
      <div className="flex items-center justify-between shrink-0 mb-3">
        <h3 className="text-sm font-semibold text-white">Nutrition (remaining vs goals)</h3>
        <div className="flex gap-1.5">
          {["Mar 5", "Mar 6", "Mar 7"].map((d, i) => (
            <span
              key={d}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
              style={{
                backgroundColor: i === 1 ? COLORS.primary : "transparent",
                color: i === 1 ? "#0f172a" : COLORS.textMuted,
              }}
            >
              {d}
            </span>
          ))}
        </div>
      </div>

      {/* Remaining summary */}
      <p className="text-xs text-[#94a3b8] mb-2 shrink-0">
        Left: 503 kcal · P 93g · F 0g · C 35g
      </p>

      {/* Progress bars */}
      <div className="shrink-0">
        {DEMO_MACROS.map((m) => (
          <ProgressBar key={m.label} label={m.label} current={m.current} goal={m.goal} color={m.color} />
        ))}
      </div>

      {/* Meal list */}
      <div
        className="flex-1 mt-3 rounded-xl overflow-hidden min-h-0"
        style={{ backgroundColor: COLORS.glassBg, border: `1px solid ${COLORS.glassBorder}` }}
      >
        <ul className="divide-y divide-white/[0.06]">
          {DEMO_MEALS.map((meal, i) => (
            <li
              key={i}
              className="flex items-center gap-2.5 py-2.5 px-3"
            >
              <Utensils size={18} className="shrink-0" style={{ color: COLORS.mealIcon }} />
              <span className="text-sm text-[#e2e8f0] truncate">
                {meal.name}: {meal.kcal} kcal
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
