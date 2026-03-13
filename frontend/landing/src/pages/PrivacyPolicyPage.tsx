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
        <p className="text-white/60 text-sm mb-12">{t("privacyPolicy.lastUpdated")}</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-white/80">
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">{t("privacyPolicy.s1Title")}</h2>
            <p>{t("privacyPolicy.s1Content")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">{t("privacyPolicy.s2Title")}</h2>
            <p className="mb-4">{t("privacyPolicy.s2Intro")}</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>{t("privacyPolicy.s2Account")}</li>
              <li>{t("privacyPolicy.s2Profile")}</li>
              <li>{t("privacyPolicy.s2Nutrition")}</li>
              <li>{t("privacyPolicy.s2Sleep")}</li>
              <li>{t("privacyPolicy.s2Training")}</li>
              <li>{t("privacyPolicy.s2Chat")}</li>
              <li>{t("privacyPolicy.s2Payments")}</li>
              <li>{t("privacyPolicy.s2Push")}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">{t("privacyPolicy.s3Title")}</h2>
            <p>{t("privacyPolicy.s3Content")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">{t("privacyPolicy.s4Title")}</h2>
            <p className="mb-4">{t("privacyPolicy.s4Intro")}</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>{t("privacyPolicy.s4Gemini")}</li>
              <li>{t("privacyPolicy.s4Intervals")}</li>
              <li>{t("privacyPolicy.s4Stripe")}</li>
              <li>{t("privacyPolicy.s4Sentry")}</li>
              <li>{t("privacyPolicy.s4S3")}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">{t("privacyPolicy.s5Title")}</h2>
            <p>{t("privacyPolicy.s5Content")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">{t("privacyPolicy.s6Title")}</h2>
            <p>{t("privacyPolicy.s6Content")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">{t("privacyPolicy.s7Title")}</h2>
            <p>{t("privacyPolicy.s7Content")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">{t("privacyPolicy.s8Title")}</h2>
            <p>{t("privacyPolicy.s8Content")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">{t("privacyPolicy.s9Title")}</h2>
            <p>
              {t("privacyPolicy.s9Content")}{" "}
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
