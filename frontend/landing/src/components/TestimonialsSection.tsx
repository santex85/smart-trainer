import React from "react";
import { Star } from "lucide-react";
import { useLandingTranslation } from "../i18n";

const testimonials = [
  { nameKey: "testimonials.t1Name", roleKey: "testimonials.t1Role", contentKey: "testimonials.t1Content", rating: 5 },
  { nameKey: "testimonials.t2Name", roleKey: "testimonials.t2Role", contentKey: "testimonials.t2Content", rating: 5 },
  { nameKey: "testimonials.t3Name", roleKey: "testimonials.t3Role", contentKey: "testimonials.t3Content", rating: 5 },
];

export function TestimonialsSection() {
  const { t } = useLandingTranslation();
  return (
    <section className="py-20 px-6 bg-white/5">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-4xl md:text-5xl font-bold mb-4 text-center">{t("testimonials.title")}</h2>
        <p className="text-xl text-white/60 max-w-2xl mx-auto text-center mb-16">
          {t("testimonials.subtitle")}
        </p>
        
        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((item, i) => (
            <div key={i} className="bg-[#0a0a0a] border border-white/10 rounded-xl p-8 flex flex-col">
              <div className="flex gap-1 mb-4">
                {[...Array(item.rating)].map((_, j) => (
                  <Star key={j} size={16} className="fill-emerald-500 text-emerald-500" />
                ))}
              </div>
              <p className="text-white/80 mb-6 flex-grow">&quot;{t(item.contentKey)}&quot;</p>
              <div>
                <div className="font-semibold">{t(item.nameKey)}</div>
                <div className="text-sm text-white/60">{t(item.roleKey)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
