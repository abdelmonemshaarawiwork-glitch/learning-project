import type { AgentReply } from "./schema.mts";
import type { HistoryMessage } from "./claude.mts";

/** Local-development stand-in for Claude (AGENT_MOCK=1). Never used on the live site. */
export async function runMock(history: HistoryMessage[], onText: (soFar: string) => void): Promise<{ reply: AgentReply; raw: string }> {
  const last = history[history.length - 1]?.content ?? "";
  const ar = /[؀-ۿ]/.test(last);
  const first = history.filter((m) => m.role === "user").length === 1;
  const shorter = /short|أقصر/i.test(last);
  const t = (en: string, a: string) => (ar ? a : en);
  const mission = (title: string, minutes: number, activity: AgentReply["plan"]["stages"][0]["levels"][0]["missions"][0]["activity"], difficulty: "easy" | "medium" | "hard" = "medium") => ({ title, minutes, activity, difficulty });
  const plan: AgentReply["plan"] = {
    title: t("Brachial plexus", "الضفيرة العضدية"),
    summary: t("From roots to clinical cases in three calm stages.", "من الجذور إلى الحالات السريرية في ثلاث مراحل هادئة."),
    pacing: t("About 4 hours in total — roughly 6 days at 45 minutes a day.", "حوالي 4 ساعات إجمالًا — قرابة 6 أيام بمعدل 45 دقيقة يوميًا."),
    stages: [
      {
        title: t("Foundations", "الأساسيات"),
        levels: [
          { title: t("Basic organisation", "التنظيم الأساسي"), objectives: [t("Name the roots, trunks and divisions", "تسمية الجذور والجذوع والأقسام")], missions: [mission(t("Understand the spinal roots", "فهم الجذور الشوكية"), 20, "read", "easy"), mission(t("Learn the trunks", "تعلّم الجذوع"), 20, "notes", "easy"), mission(t("Draw the plexus from memory", "ارسم الضفيرة من الذاكرة"), 15, "diagram")] },
        ],
      },
      {
        title: t("Clinical anatomy", "التشريح السريري"),
        levels: [
          { title: t("Clinical applications", "التطبيقات السريرية"), objectives: [t("Link injuries to deficits", "ربط الإصابات بالأعراض")], missions: [mission(t("Understand common injuries", "فهم الإصابات الشائعة"), 30, "read"), mission(t("Solve clinical scenarios", "حل حالات سريرية"), 40, "practice", "hard")].slice(0, shorter ? 1 : 2) },
        ],
      },
    ],
  };
  const reply: AgentReply = {
    reply: first
      ? t("Here is a plan in two stages. Tell me if you want it shorter or with more practice.", "إليك خطة من مرحلتين. أخبرني إن أردتها أقصر أو بتدريب أكثر.")
      : shorter
        ? t("I trimmed the clinical level to its essentials.", "اختصرت المستوى السريري إلى الأساسيات.")
        : t("Done — I kept the plan and answered your question.", "تم — أبقيت الخطة وأجبت عن سؤالك."),
    plan_changed: first || shorter,
    plan,
  };
  const raw = JSON.stringify(reply);
  const step = Math.ceil(raw.length / 12);
  for (let i = step; i < raw.length + step; i += step) {
    onText(raw.slice(0, i));
    await new Promise((r) => setTimeout(r, Number(process.env.AGENT_MOCK_DELAY_MS ?? "250")));
  }
  return { reply, raw };
}
