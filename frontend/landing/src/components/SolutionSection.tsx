import React from "react";
import { useLandingTranslation } from "../i18n";

export function SolutionSection() {
  const { t } = useLandingTranslation();
  return (
    <section className="py-20 px-6 bg-white/[0.02]">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-4xl md:text-5xl font-bold mb-6 text-center">
          {t("solution.title")} <span className="text-emerald-500">{t("solution.titleHighlight")}</span>
        </h2>
        <p className="text-xl text-white/60 max-w-3xl mx-auto text-center mb-12">
          {t("solution.subtitle")}
        </p>
        <div className="flex justify-center px-2">
          <div className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 sm:px-6 py-3 bg-emerald-600/20 border border-emerald-500/30 rounded-lg text-emerald-400 max-w-full text-center sm:text-left">
            <span className="font-semibold">{t("solution.badge")}</span> {t("solution.badgeDesc")}
          </div>
        </div>
      </div>
    </section>
  );
}
