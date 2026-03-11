import React, { useState } from "react";
import { Check, Zap } from "lucide-react";
import { useLandingTranslation } from "../i18n";

const freeFeatureKeys = ["pricing.freeF1", "pricing.freeF2", "pricing.freeF3", "pricing.freeF4", "pricing.freeF5"] as const;
const proFeatureKeys = ["pricing.proF1", "pricing.proF2", "pricing.proF3", "pricing.proF4", "pricing.proF5", "pricing.proF6", "pricing.proF7", "pricing.proF8"] as const;

export function PricingSection() {
  const { t } = useLandingTranslation();
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");

  return (
    <section id="pricing" className="py-20 px-6">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-4xl md:text-5xl font-bold mb-4 text-center">{t("pricing.title")}</h2>
        <p className="text-xl text-white/60 max-w-3xl mx-auto text-center mb-8">
          {t("pricing.subtitle")}
        </p>

        <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full p-1 mx-auto flex justify-center mb-12">
          <button
            onClick={() => setBillingPeriod("monthly")}
            className={`px-6 py-2 rounded-full font-medium transition ${
              billingPeriod === "monthly" ? "bg-emerald-600 text-white" : "text-white/60 hover:text-white"
            }`}
          >
            {t("pricing.monthly")}
          </button>
          <button
            onClick={() => setBillingPeriod("annual")}
            className={`px-6 py-2 rounded-full font-medium transition ${
              billingPeriod === "annual" ? "bg-emerald-600 text-white" : "text-white/60 hover:text-white"
            }`}
          >
            {t("pricing.annual")}
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
            <h3 className="text-xl font-semibold mb-2">{t("pricing.free")}</h3>
            <div className="text-3xl font-bold mb-4">{t("pricing.freePrice")}</div>
            <p className="text-white/60 text-sm mb-6">{t("pricing.freeDesc")}</p>
            <ul className="space-y-3 mb-8">
              {freeFeatureKeys.map((key) => (
                <li key={key} className="flex items-center gap-2 text-sm">
                  <Check size={16} className="text-emerald-500" />
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-2xl p-8 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-emerald-600 rounded-full text-xs font-semibold">
              {t("pricing.pro")}
            </div>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xl font-semibold">{t("pricing.pro")}</h3>
              <Zap size={18} className="text-emerald-500" />
            </div>
            <div className="text-3xl font-bold mb-1">
              {billingPeriod === "monthly" ? t("pricing.proMonthly") : t("pricing.proAnnual")}
              <span className="text-lg font-normal text-white/60">/{billingPeriod === "monthly" ? t("pricing.month") : t("pricing.year")}</span>
            </div>
            {billingPeriod === "annual" && (
              <p className="text-emerald-400 text-sm mb-4">{t("pricing.save")}</p>
            )}
            <p className="text-white/60 text-sm mb-6">{t("pricing.proTrial")}</p>
            <ul className="space-y-3 mb-8">
              {proFeatureKeys.map((key) => (
                <li key={key} className="flex items-center gap-2 text-sm">
                  <Check size={16} className="text-emerald-500" />
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
