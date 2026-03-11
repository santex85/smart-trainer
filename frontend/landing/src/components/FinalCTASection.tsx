import React from "react";
import { useLandingTranslation } from "../i18n";

export function FinalCTASection({ appUrl }: { appUrl: string }) {
  const { t } = useLandingTranslation();
  return (
    <section className="py-20 px-6">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-4xl md:text-5xl font-bold mb-4">
          {t("finalCta.title")}
        </h2>
        <p className="text-xl text-white/60 mb-8">
          {t("finalCta.subtitle")}
        </p>
        <a
          href={appUrl}
          className="inline-block px-10 py-4 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-semibold text-lg transition shadow-lg shadow-emerald-600/20"
        >
          {t("finalCta.cta")}
        </a>
      </div>
    </section>
  );
}
