import React, { useEffect } from "react";
import { HeroSection } from "../components/HeroSection";
import { ProblemSection } from "../components/ProblemSection";
import { SolutionSection } from "../components/SolutionSection";
import { FeaturesSection } from "../components/FeaturesSection";
import { PhotoAnalysisSection } from "../components/PhotoAnalysisSection";
import { HowItWorksSection } from "../components/HowItWorksSection";
import { PricingSection } from "../components/PricingSection";
import { FAQSection } from "../components/FAQSection";
import { TestimonialsSection } from "../components/TestimonialsSection";
import { FinalCTASection } from "../components/FinalCTASection";
import { useLocation } from "react-router-dom";

const APP_URL = import.meta.env.VITE_APP_URL || "https://app.tsspro.tech";

export function HomePage() {
  const { hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const id = hash.slice(1);
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [hash]);

  return (
    <>
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
    </>
  );
}
