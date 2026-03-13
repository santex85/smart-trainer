import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { useLandingTranslation } from "../i18n";
import { CONTACT_EMAIL } from "../constants";

export function TermsPage() {
  const { t } = useLandingTranslation();

  useEffect(() => {
    document.title = `${t("terms.pageTitle")} — tssproAI`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute("content", t("terms.metaDescription"));
    }
  }, [t]);

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="max-w-3xl mx-auto px-6">
        <Link
          to="/"
          className="inline-flex items-center text-sm text-white/60 hover:text-white transition mb-8"
        >
          ← {t("terms.backToHome")}
        </Link>

        <h1 className="text-3xl font-bold mb-2">{t("terms.pageTitle")}</h1>
        <p className="text-white/60 text-sm mb-12">Last updated: March 2025</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-white/80">
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">1. Acceptance of Terms</h2>
            <p>
              By accessing or using tssproAI (&quot;Service&quot;), you agree to be bound by these Terms of
              Service. If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">2. Description of Service</h2>
            <p>
              tssproAI is an AI-powered system for endurance athletes. It provides nutrition tracking,
              sleep and recovery monitoring, training load analysis, and AI recommendations for daily
              training decisions (GO, MODIFY, SKIP).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">3. Account and Registration</h2>
            <p>
              You must provide accurate information when registering. You are responsible for
              maintaining the confidentiality of your account credentials.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">4. Acceptable Use</h2>
            <p>
              You agree not to misuse the Service, including by attempting to reverse engineer,
              circumventing access controls, or using the Service for any illegal purpose. AI
              recommendations are for informational purposes only and do not replace professional
              medical or coaching advice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">5. Subscriptions and Payments</h2>
            <p>
              Pro subscriptions are billed by Stripe. Free trials may be offered. You may cancel
              or change your subscription at any time. Refunds are handled according to our policies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">6. Limitation of Liability</h2>
            <p>
              The Service is provided &quot;as is&quot;. We are not liable for any indirect, incidental, or
              consequential damages arising from your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">7. Contact</h2>
            <p>
              For questions about these Terms, contact us at{" "}
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
