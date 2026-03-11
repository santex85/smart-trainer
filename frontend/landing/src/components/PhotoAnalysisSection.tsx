import React from "react";
import { Camera, Zap, Beaker } from "lucide-react";
import { PhotoAnalysisPreview } from "./PhotoAnalysisPreview";
import { useLandingTranslation } from "../i18n";

export function PhotoAnalysisSection() {
  const { t } = useLandingTranslation();
  const points = [
    { icon: Camera, titleKey: "photoAnalysis.step1Title", descKey: "photoAnalysis.step1Desc" },
    { icon: Zap, titleKey: "photoAnalysis.step2Title", descKey: "photoAnalysis.step2Desc" },
    { icon: Beaker, titleKey: "photoAnalysis.step3Title", descKey: "photoAnalysis.step3Desc" },
  ];

  return (
    <section className="py-20 px-6 bg-white/[0.02]">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="min-w-0">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              {t("photoAnalysis.title")}{" "}
              <span className="text-emerald-500">{t("photoAnalysis.titleHighlight")}</span>
            </h2>
            <p className="text-xl text-white/60 mb-10 leading-relaxed">
              {t("photoAnalysis.subtitle")}
            </p>
            <ul className="space-y-6">
              {points.map((p) => (
                <li key={p.titleKey} className="flex gap-4">
                  <div className="w-12 h-12 rounded-lg bg-emerald-600/20 flex items-center justify-center shrink-0">
                    <p.icon size={24} className="text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">{t(p.titleKey)}</h3>
                    <p className="text-white/60 text-sm">{t(p.descKey)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative min-w-0">
            <div className="relative bg-gradient-to-br from-white/10 to-white/[0.02] border border-white/20 rounded-2xl p-2 backdrop-blur shadow-2xl">
              <div className="bg-[#0f0f0f] rounded-xl overflow-hidden">
                <PhotoAnalysisPreview />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
