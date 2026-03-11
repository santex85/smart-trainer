import React from "react";
import riceImage from "@/assets/rice-fried.png";
import { useLandingTranslation } from "../i18n";

const MEAL_KEYS = ["photoPreview.breakfast", "photoPreview.lunch", "photoPreview.dinner", "photoPreview.snack", "photoPreview.other"] as const;

export function PhotoAnalysisPreview() {
  const { t } = useLandingTranslation();
  return (
    <div
      className="relative w-full aspect-[4/3] max-h-[400px] min-h-[280px] rounded-xl overflow-hidden flex flex-col"
      style={{ backgroundColor: "#0f0f0f" }}
      role="img"
      aria-label={t("photoPreview.ariaLabel")}
    >
      {/* Photo (matches CameraScreen photoThumbnail) */}
      <img
        src={riceImage}
        alt=""
        className="w-full h-[180px] object-cover rounded-t-lg shrink-0"
      />

      {/* Result card (matches CameraScreen result styles) */}
      <div
        className="flex-1 flex flex-col p-5"
        style={{
          backgroundColor: "rgba(255,255,255,0.08)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.1)",
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24,
        }}
      >
        <h3 className="text-xl font-semibold text-[#e2e8f0] mb-2">
          {t("photoPreview.dish")}
        </h3>
        <p className="text-base text-[#94a3b8] mb-3">
          {t("photoPreview.macros")}
        </p>
        <p className="text-sm text-[#64748b] mb-4">
          {t("photoPreview.portion")}
        </p>

        {/* Meal type pills (Other active) */}
        <div className="flex flex-wrap gap-2 mb-3">
          {MEAL_KEYS.map((key, i) => {
            const label = t(key);
            const isOther = key === "photoPreview.other";
            return (
              <span
                key={key}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
                style={{
                  backgroundColor: isOther ? "#38bdf8" : "#1a1a2e",
                  color: isOther ? "#0f172a" : "#94a3b8",
                }}
              >
                {label}
              </span>
            );
          })}
        </div>

        {/* Re-analyze button */}
        <div
          className="mt-auto py-2.5 px-4 rounded-lg text-center text-sm font-medium"
          style={{ backgroundColor: "#1e293b", color: "#94a3b8" }}
        >
          {t("photoPreview.reanalyze")}
        </div>
      </div>
    </div>
  );
}
