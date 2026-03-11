import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useLandingTranslation } from "../i18n";

const faqKeys = [
  { q: "faq.q1", a: "faq.a1" },
  { q: "faq.q2", a: "faq.a2" },
  { q: "faq.q3", a: "faq.a3" },
  { q: "faq.q4", a: "faq.a4" },
  { q: "faq.q5", a: "faq.a5" },
  { q: "faq.q6", a: "faq.a6" },
];

export function FAQSection() {
  const { t } = useLandingTranslation();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-20 px-6">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-4xl md:text-5xl font-bold mb-4 text-center">{t("faq.title")}</h2>
        <p className="text-xl text-white/60 text-center mb-12">
          {t("faq.subtitle")}
        </p>
        <div className="space-y-2">
          {faqKeys.map((faq, i) => (
            <div
              key={faq.q}
              className="bg-white/5 border border-white/10 rounded-xl overflow-hidden"
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition"
              >
                <span className="font-medium">{t(faq.q)}</span>
                <ChevronDown size={20} className={`text-white/60 transition ${openIndex === i ? "rotate-180" : ""}`} />
              </button>
              {openIndex === i && (
                <div className="px-4 pb-4 text-white/60 text-sm">
                  {t(faq.a)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
