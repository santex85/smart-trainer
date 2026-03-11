import React from "react";
import { useLandingTranslation } from "../i18n";

export function ProblemSection() {
  const { t } = useLandingTranslation();
  return (
    <section className="py-20 px-6">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-4xl md:text-5xl font-bold mb-6 text-center">
          {t("problem.title")}
        </h2>
        <p className="text-xl text-white/60 max-w-3xl mx-auto text-center mb-12">
          {t("problem.subtitle")}
        </p>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <h3 className="font-semibold mb-2">{t("problem.card1Title")}</h3>
            <p className="text-white/60 text-sm">{t("problem.card1Desc")}</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <h3 className="font-semibold mb-2">{t("problem.card2Title")}</h3>
            <p className="text-white/60 text-sm">{t("problem.card2Desc")}</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <h3 className="font-semibold mb-2">{t("problem.card3Title")}</h3>
            <p className="text-white/60 text-sm">{t("problem.card3Desc")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
