import React from "react";
import { Header } from "./components/Header";
import { HeroSection } from "./components/HeroSection";
import { ProblemSection } from "./components/ProblemSection";
import { SolutionSection } from "./components/SolutionSection";
import { FeaturesSection } from "./components/FeaturesSection";
import { PhotoAnalysisSection } from "./components/PhotoAnalysisSection";
import { HowItWorksSection } from "./components/HowItWorksSection";
import { PricingSection } from "./components/PricingSection";
import { FAQSection } from "./components/FAQSection";
import { TestimonialsSection } from "./components/TestimonialsSection";
import { FinalCTASection } from "./components/FinalCTASection";
import { useLandingTranslation } from "./i18n";

const APP_URL = import.meta.env.VITE_APP_URL || "https://app.tsspro.tech";

export default function App() {
  const { t } = useLandingTranslation();
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <Header appUrl={APP_URL} />
      <main>
        <HeroSection appUrl={APP_URL} />
        <ProblemSection />
        <SolutionSection />
        <FeaturesSection />
        <PhotoAnalysisSection />
        <HowItWorksSection />
        <PricingSection />
        <TestimonialsSection />
        <FAQSection />
        <FinalCTASection appUrl={APP_URL} />
      </main>
      <footer className="border-t border-white/10 py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="text-2xl font-bold mb-4">tssproAI</div>
              <p className="text-white/60 text-sm">{t("footer.tagline")}</p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">{t("footer.product")}</h4>
              <ul className="space-y-2 text-sm text-white/60">
                <li><a href="#features" className="hover:text-white transition">{t("footer.features")}</a></li>
                <li><a href="#pricing" className="hover:text-white transition">{t("footer.pricing")}</a></li>
                <li><a href="#how-it-works" className="hover:text-white transition">{t("footer.howItWorks")}</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">{t("footer.support")}</h4>
              <ul className="space-y-2 text-sm text-white/60">
                <li><a href="#faq" className="hover:text-white transition">{t("footer.faq")}</a></li>
                <li><a href={APP_URL} className="hover:text-white transition">{t("footer.contact")}</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">{t("footer.legal")}</h4>
              <ul className="space-y-2 text-sm text-white/60">
                <li><a href={`${APP_URL}/privacy`} className="hover:text-white transition">{t("footer.privacy")}</a></li>
                <li><a href={`${APP_URL}/terms`} className="hover:text-white transition">{t("footer.terms")}</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-white/10 text-center text-sm text-white/40">
            {t("footer.copyright").replace("{year}", String(year))}
          </div>
        </div>
      </footer>
    </div>
  );
}
