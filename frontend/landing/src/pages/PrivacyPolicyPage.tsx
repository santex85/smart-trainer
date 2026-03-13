import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { useLandingTranslation } from "../i18n";
import { CONTACT_EMAIL } from "../constants";

export function PrivacyPolicyPage() {
  const { t } = useLandingTranslation();

  useEffect(() => {
    document.title = `${t("privacy.pageTitle")} — tssproAI`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute("content", t("privacy.metaDescription"));
    }
  }, [t]);

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="max-w-3xl mx-auto px-6">
        <Link
          to="/"
          className="inline-flex items-center text-sm text-white/60 hover:text-white transition mb-8"
        >
          ← {t("privacy.backToHome")}
        </Link>

        <h1 className="text-3xl font-bold mb-2">{t("privacy.pageTitle")}</h1>
        <p className="text-white/60 text-sm mb-12">Last updated: March 2025</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-white/80">
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">1. Introduction</h2>
            <p>
              tssproAI (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is an AI-powered system for endurance athletes. This Privacy
              Policy explains how we collect, use, store, and protect your information when you use our
              website, mobile app, and services at tsspro.tech and app.tsspro.tech.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">2. Information We Collect</h2>
            <p className="mb-4">We collect the following categories of data:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Account data:</strong> Email address, password (stored as a secure hash), locale,
                and timezone.
              </li>
              <li>
                <strong>Athlete profile:</strong> Weight, height, birth year, FTP, calorie and macro
                goals (protein, fat, carbs), target race date and name.
              </li>
              <li>
                <strong>Nutrition:</strong> Food logs with meal names, portions, macros, micronutrients,
                and photos of meals (stored for AI analysis).
              </li>
              <li>
                <strong>Sleep and wellness:</strong> Sleep hours, resting heart rate (RHR), HRV, CTL,
                ATL, TSB, weight, and photos of sleep/wellness data.
              </li>
              <li>
                <strong>Training:</strong> Workouts (manual entry, FIT file imports, or Intervals.icu
                sync), including duration, distance, TSS, and activity metadata.
              </li>
              <li>
                <strong>Chat:</strong> Messages you send to our AI assistant and AI responses; we use
                your athlete context (nutrition, recovery, training load) to provide personalized
                guidance.
              </li>
              <li>
                <strong>Payments:</strong> Stripe customer ID and subscription status for billing.
              </li>
              <li>
                <strong>Push notifications:</strong> Device push token and platform (iOS/Android) when
                you enable notifications.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">3. How We Use Your Information</h2>
            <p>
              We use your data to provide and improve our services: to analyze nutrition, sleep, and
              training data; to generate AI recommendations (GO, MODIFY, SKIP); to sync with
              Intervals.icu; to process payments; to send push notifications; and to debug and
              improve our systems.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">4. Third-Party Services</h2>
            <p className="mb-4">We use the following third parties:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Google Gemini:</strong> AI analysis of meal photos, sleep/wellness photos, and
                chat. Your images and prompts are sent to Gemini for processing.
              </li>
              <li>
                <strong>Intervals.icu:</strong> OAuth integration to sync workouts and training load.
              </li>
              <li>
                <strong>Stripe:</strong> Payment processing and subscription management.
              </li>
              <li>
                <strong>Sentry:</strong> Error tracking and performance monitoring.
              </li>
              <li>
                <strong>Cloud storage (S3):</strong> Storage of meal, sleep, and wellness photos.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">5. Data Storage and Security</h2>
            <p>
              Your data is stored on secure servers. Passwords are hashed; we never store plain-text
              passwords. We use HTTPS for all communications and follow industry practices to protect
              your data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">6. Your Rights</h2>
            <p>
              You have the right to access, correct, delete, or export your data. You can manage your
              account and data in the app. To request deletion or export, contact us. If you are in the
              EU/EEA, you also have rights under GDPR, including the right to object to processing and
              to lodge a complaint with a supervisory authority.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">7. Cookies and Analytics</h2>
            <p>
              We may use cookies and similar technologies for session management, authentication, and
              analytics. We use Sentry for error tracking. You can control cookies through your
              browser settings.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">8. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of significant
              changes by posting the new policy on this page and updating the &quot;Last updated&quot; date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">9. Contact</h2>
            <p>
              For questions about this Privacy Policy or your data, contact us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-emerald-400 hover:text-emerald-300">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
