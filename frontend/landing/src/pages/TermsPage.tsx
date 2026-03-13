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
        <p className="text-white/60 text-sm mb-12">{t("termsOfService.lastUpdated")}</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-white/80">
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">{t("termsOfService.s1Title")}</h2>
            <p>{t("termsOfService.s1Content")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">{t("termsOfService.s2Title")}</h2>
            <p>{t("termsOfService.s2Content")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">{t("termsOfService.s3Title")}</h2>
            <p>{t("termsOfService.s3Content")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">{t("termsOfService.s4Title")}</h2>
            <p>{t("termsOfService.s4Content")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">{t("termsOfService.s5Title")}</h2>
            <p>{t("termsOfService.s5Content")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">{t("termsOfService.s6Title")}</h2>
            <p>{t("termsOfService.s6Content")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">{t("termsOfService.s7Title")}</h2>
            <p>
              {t("termsOfService.s7Content")}{" "}
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
