import React from "react";
import { Camera, Moon, Brain, Upload, Link2, TrendingUp } from "lucide-react";
import { useLandingTranslation } from "../i18n";

const features = [
  { icon: Camera, titleKey: "features.f1Title", descKey: "features.f1Desc", color: "emerald" },
  { icon: Moon, titleKey: "features.f2Title", descKey: "features.f2Desc", color: "blue" },
  { icon: Brain, titleKey: "features.f3Title", descKey: "features.f3Desc", color: "purple" },
  { icon: Upload, titleKey: "features.f4Title", descKey: "features.f4Desc", color: "orange" },
  { icon: Link2, titleKey: "features.f5Title", descKey: "features.f5Desc", color: "cyan" },
  { icon: TrendingUp, titleKey: "features.f6Title", descKey: "features.f6Desc", color: "pink" },
];

const colorMap: Record<string, { icon: string; border: string }> = {
  emerald: { icon: "text-emerald-500", border: "border-emerald-500/20" },
  blue: { icon: "text-blue-500", border: "border-blue-500/20" },
  purple: { icon: "text-purple-500", border: "border-purple-500/20" },
  orange: { icon: "text-orange-500", border: "border-orange-500/20" },
  cyan: { icon: "text-cyan-500", border: "border-cyan-500/20" },
  pink: { icon: "text-pink-500", border: "border-pink-500/20" },
};

export function FeaturesSection() {
  const { t } = useLandingTranslation();
  return (
    <section id="features" className="py-20 px-6">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-4xl md:text-5xl font-bold mb-4 text-center">{t("features.title")}</h2>
        <p className="text-xl text-white/60 max-w-2xl mx-auto text-center mb-16">
          {t("features.subtitle")}
        </p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => {
            const c = colorMap[f.color];
            return (
              <div
                key={f.titleKey}
                className={`p-6 rounded-xl border ${c.border} bg-white/5 hover:bg-white/[0.07] transition`}
              >
                <div className={`w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center mb-4 ${c.icon}`}>
                  <f.icon size={24} />
                </div>
                <h3 className="font-semibold mb-2">{t(f.titleKey)}</h3>
                <p className="text-white/60 text-sm">{t(f.descKey)}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
