import React from "react";

export function PhotoAnalysisPreview() {
  return (
    <div
      className="relative w-full aspect-[4/3] max-h-[360px] min-h-[280px] rounded-xl overflow-hidden flex items-center justify-center p-6"
      style={{ backgroundColor: "#0f0f0f" }}
      role="img"
      aria-label="tssAI Photo Analysis — Vegetable & Tofu Fried Rice with nutrition breakdown"
    >
      {/* Scene: plate with meal */}
      <div className="relative w-full max-w-[280px] aspect-square">
        {/* Plate */}
        <div
          className="absolute inset-0 rounded-full shadow-xl"
          style={{
            backgroundColor: "#9ca3af",
            backgroundImage: "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4), rgba(156,163,175,0.9))",
            boxShadow: "inset 0 2px 8px rgba(255,255,255,0.3), 0 4px 16px rgba(0,0,0,0.4)",
          }}
        />

        {/* Rice mound (central dome) */}
        <div
          className="absolute rounded-[45%] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[70%] h-[65%]"
          style={{
            backgroundColor: "#c4a574",
            backgroundImage: "radial-gradient(ellipse 60% 50% at 40% 50%, #d4b896, #b8956a)",
            boxShadow: "inset 0 -4px 12px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.2)",
          }}
        />

        {/* Fried shallots / garnish on top of rice */}
        <div
          className="absolute left-1/2 top-[28%] -translate-x-1/2 w-8 h-2 rounded-full"
          style={{ backgroundColor: "#a16207", opacity: 0.9 }}
        />
        <div
          className="absolute left-[48%] top-[26%] w-2 h-2 rounded-full"
          style={{ backgroundColor: "#22c55e", opacity: 0.8 }}
        />

        {/* Sauce bowl */}
        <div
          className="absolute right-[8%] top-[15%] w-[22%] aspect-square rounded-full"
          style={{
            backgroundColor: "#422006",
            boxShadow: "inset 0 2px 8px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.3)",
          }}
        />
        {/* Chili slices in sauce */}
        <div
          className="absolute right-[10%] top-[17%] w-1.5 h-3 rounded-sm rotate-12"
          style={{ backgroundColor: "#dc2626", opacity: 0.9 }}
        />
        <div
          className="absolute right-[14%] top-[20%] w-1 h-2 rounded-sm -rotate-6"
          style={{ backgroundColor: "#dc2626", opacity: 0.8 }}
        />

        {/* Lime wedge */}
        <div
          className="absolute left-[10%] bottom-[18%] w-[16%] h-[12%] rounded-br-lg"
          style={{
            backgroundColor: "#84cc16",
            transform: "rotate(-25deg)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }}
        />

        {/* Tomato slices */}
        <div
          className="absolute right-[12%] bottom-[22%] w-[10%] h-[6%] rounded-full"
          style={{ backgroundColor: "#ef4444", transform: "rotate(-15deg)", opacity: 0.95 }}
        />
        <div
          className="absolute right-[18%] bottom-[18%] w-[8%] h-[5%] rounded-full"
          style={{ backgroundColor: "#ef4444", transform: "rotate(10deg)", opacity: 0.9 }}
        />
        <div
          className="absolute right-[14%] bottom-[26%] w-[7%] h-[4%] rounded-full"
          style={{ backgroundColor: "#ef4444", transform: "rotate(-5deg)", opacity: 0.85 }}
        />
      </div>

      {/* Nutrition breakdown overlay */}
      <div
        className="absolute bottom-4 left-4 right-4 rounded-lg px-4 py-2 flex items-center justify-between"
        style={{
          backgroundColor: "rgba(0,0,0,0.6)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <span className="text-sm font-medium text-white/90">Vegetable & Tofu Fried Rice</span>
        <span className="text-xs text-white/70">420 kcal · P 12g · F 8g · C 58g</span>
      </div>
    </div>
  );
}
