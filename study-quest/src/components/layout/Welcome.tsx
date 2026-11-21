"use client";

import { ArrowRight, Flame, Layers, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Logo } from "@/components/brand/Logo";
import { useAuth } from "@/components/providers/AuthProvider";
import { useI18n } from "@/components/providers/I18nProvider";
import { FullPageLoader } from "@/components/ui/Spinner";
import { LanguageToggle } from "./LanguageToggle";

const FEATURES = {
  en: [
    { icon: Sparkles, title: "Describe any topic", body: "Write what you want to learn in your own words. AI organises it into stages, levels and small missions." },
    { icon: Layers, title: "Move level by level", body: "Each level builds on the last. Always know where you are and what comes next." },
    { icon: Flame, title: "Progress that feels real", body: "Earn XP, keep a gentle streak and collect quiet milestones — without the noise." },
  ],
  ar: [
    { icon: Sparkles, title: "صِف أي موضوع", body: "اكتب ما تريد تعلّمه بكلماتك، وسينظمه الذكاء الاصطناعي في مراحل ومستويات ومهام صغيرة." },
    { icon: Layers, title: "تقدّم مستوى بمستوى", body: "يبني كل مستوى على ما قبله. اعرف دائمًا أين أنت وما الخطوة التالية." },
    { icon: Flame, title: "تقدّم تشعر به", body: "اكسب النقاط وحافظ على سلسلة هادئة واجمع إنجازات صغيرة — دون ضجيج." },
  ],
} as const;

const COPY = {
  en: { headline: "Make studying feel like a peaceful journey.", start: "Start for free", login: "Log in" },
  ar: { headline: "اجعل المذاكرة رحلة هادئة.", start: "ابدأ مجانًا", login: "تسجيل الدخول" },
} as const;

export function Welcome() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);
  if (user) return <FullPageLoader label={t("common.loading")} />;
  const copy = COPY[locale];
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-8">
        <Logo label={t("app.name")} />
        <div className="flex items-center gap-1">
          <LanguageToggle />
          <Link href="/login" className="rounded-[10px] px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink">
            {copy.login}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pt-12 pb-20 sm:px-8 sm:pt-20">
        <div className="max-w-2xl animate-rise">
          <h1 className="font-display text-[40px] leading-[1.08] font-medium text-ink sm:text-[56px]">{copy.headline}</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-2">{t("app.tagline")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="inline-flex h-12 items-center gap-2 rounded-[14px] bg-sage-strong px-5 text-[15px] font-medium text-white shadow-soft hover:bg-[color-mix(in_oklab,var(--sage-strong),black_8%)] dark:text-sage-ink"
            >
              {copy.start}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Link>
            <Link href="/login" className="inline-flex h-12 items-center rounded-[14px] border border-line bg-surface px-5 text-[15px] font-medium text-ink shadow-soft hover:bg-surface-2">
              {copy.login}
            </Link>
          </div>
        </div>
        <div className="mt-20 grid gap-4 sm:grid-cols-3">
          {FEATURES[locale].map((f) => (
            <div key={f.title} className="rounded-[var(--radius-card)] border border-line/70 bg-surface p-6 shadow-soft">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sage-soft text-sage-strong">
                <f.icon className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-[15px] font-semibold text-ink">{f.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{f.body}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
