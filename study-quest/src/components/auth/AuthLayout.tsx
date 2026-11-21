"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { useAuth } from "@/components/providers/AuthProvider";
import { useI18n } from "@/components/providers/I18nProvider";
import { FullPageLoader } from "@/components/ui/Spinner";
import { safeNext } from "@/lib/client/authErrors";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { ConfigMissing } from "@/components/layout/ConfigMissing";

function JourneyIllustration() {
  // A calm, abstract journey: milestones along a soft path.
  return (
    <svg viewBox="0 0 360 420" className="h-auto w-full max-w-[360px]" aria-hidden>
      <path
        d="M60 380 C 60 300, 200 320, 190 250 S 90 170, 170 120 S 300 90, 290 40"
        fill="none"
        stroke="var(--sage)"
        strokeOpacity="0.35"
        strokeWidth="2"
        strokeDasharray="2 8"
        strokeLinecap="round"
      />
      {[
        [60, 380, 1, true],
        [190, 250, 2, true],
        [170, 120, 3, false],
        [290, 40, 4, false],
      ].map(([x, y, n, done]) => (
        <g key={String(n)}>
          <circle cx={x as number} cy={y as number} r="20" fill={done ? "var(--sage)" : "var(--surface)"} stroke="var(--sage)" strokeOpacity={done ? 0 : 0.5} strokeWidth="1.5" />
          <text x={x as number} y={(y as number) + 5} textAnchor="middle" fontSize="14" fontFamily="var(--font-sans)" fill={done ? "#fff" : "var(--sage-strong)"} fontWeight="600">
            {n}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const { t } = useI18n();
  const { user, configured } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    if (user) router.replace(safeNext(params.get("next")));
  }, [user, router, params]);

  if (!configured) return <ConfigMissing />;
  if (user === undefined || user) return <FullPageLoader label={t("common.loading")} />;

  return (
    <div className="flex min-h-dvh">
      <div className="flex flex-1 flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label={t("app.name")}>
            <Logo label={t("app.name")} />
          </Link>
          <LanguageToggle />
        </div>
        <main className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">
          <h1 className="font-display text-[30px] leading-tight font-medium text-ink">{title}</h1>
          <p className="mt-2 text-[15px] text-ink-2">{subtitle}</p>
          <div className="mt-8 animate-rise">{children}</div>
        </main>
      </div>
      <aside className="relative hidden w-[44%] max-w-[620px] items-center justify-center overflow-hidden border-s border-line bg-surface-2 lg:flex">
        <div className="flex flex-col items-center gap-8 px-12 text-center">
          <JourneyIllustration />
          <p className="max-w-xs font-display text-xl leading-snug text-ink-2">{t("app.tagline")}</p>
        </div>
      </aside>
    </div>
  );
}

export function Divider({ label }: { label: string }) {
  return (
    <div className="my-6 flex items-center gap-3 text-[12px] text-ink-3">
      <span className="h-px flex-1 bg-line" />
      {label}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
