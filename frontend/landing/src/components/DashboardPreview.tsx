import React from "react";

export function DashboardPreview() {
  return (
    <div className="dashboard-preview w-full aspect-[4/3] max-h-[360px] min-h-[280px] bg-[#0f0f0f] rounded-xl overflow-hidden flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-600/30" />
          <span className="text-sm font-semibold text-white/90">tssAI</span>
        </div>
        <div className="flex gap-2">
          <div className="w-8 h-8 rounded-lg bg-white/10" />
          <div className="w-8 h-8 rounded-full bg-white/10" />
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex gap-3 p-3 overflow-hidden">
        {/* Left: summary cards */}
        <div className="flex flex-col gap-2 w-[38%] shrink-0">
          <div className="rounded-lg bg-white/5 border border-white/10 p-3">
            <div className="text-[10px] text-white/50 uppercase tracking-wider mb-1">Today</div>
            <div className="text-lg font-bold text-emerald-400">
              2,450 <span className="text-xs font-normal text-white/60">kcal</span>
            </div>
          </div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-2">
            <div className="flex gap-1 mb-1">
              <div className="h-1 flex-1 rounded-full bg-amber-500/80" style={{ width: "60%" }} />
              <div className="h-1 flex-1 rounded-full bg-blue-500/80" style={{ width: "25%" }} />
              <div className="h-1 flex-1 rounded-full bg-emerald-500/80" style={{ width: "45%" }} />
            </div>
            <div className="text-[10px] text-white/50">P / F / C</div>
          </div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-2">
            <div className="text-[10px] text-white/50 mb-1">Decision</div>
            <div className="text-sm font-bold text-emerald-400">GO</div>
          </div>
        </div>

        {/* Right: list */}
        <div className="flex-1 rounded-lg bg-white/[0.03] border border-white/10 overflow-hidden flex flex-col min-w-0">
          <div className="px-3 py-2 border-b border-white/10 text-xs text-white/50 font-medium">Nutrition</div>
          <ul className="flex-1 p-2 space-y-1.5">
            {["Breakfast • 520 kcal", "Lunch • 890 kcal", "Snack • 340 kcal", "Dinner • 700 kcal"].map(
              (line, i) => (
                <li key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/5">
                  <div className="w-6 h-6 rounded bg-white/10 shrink-0" />
                  <span className="text-xs text-white/80 truncate">{line}</span>
                </li>
              )
            )}
          </ul>
        </div>
      </div>

      {/* Bottom strip */}
      <div className="shrink-0 h-8 px-3 flex items-center gap-4 border-t border-white/10">
        <div className="h-1.5 flex-1 max-w-[120px] rounded-full bg-white/10" />
        <div className="h-1.5 flex-1 max-w-[80px] rounded-full bg-white/10" />
        <div className="h-1.5 flex-1 max-w-[100px] rounded-full bg-white/10" />
      </div>
    </div>
  );
}
