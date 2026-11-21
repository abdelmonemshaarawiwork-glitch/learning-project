import type { PlanDraft } from "@/lib/domain/plan";
import type { ActivityType, Complexity } from "@/lib/domain/types";
import { normalizePlan, type AiPlan, type PlannerInput } from "./schema";

/**
 * Sample planner used when no AI key is configured (and in tests).
 * It is deterministic and rule-based: it pulls sub-topics out of the request
 * and builds a sensible foundations → core → application → review journey.
 * The UI labels plans from this planner as sample plans.
 */

const ARABIC = /[؀-ۿ]/;

const LEAD_EN =
  /^(i\s+(want|need|would like|'d like|have)\s+to\s+(study|learn|review|revise|master|understand|cover)|(please\s+)?(help me\s+)?(study|learn|review|revise|master|understand)|plan\s+(for|to study))\s+/i;
const LEAD_AR = /^(أريد|اريد|أحتاج|احتاج|عايز|عاوز|ساعدني)\s+(أن\s+|ان\s+)?(أذاكر|اذاكر|أدرس|ادرس|أتعلم|اتعلم|أراجع|اراجع|مذاكرة|دراسة|تعلم|مراجعة)\s*/;
const SPLIT_LIST_EN = /\b(?:including|such as|covering|focusing on|with emphasis on|especially)\b|:|—|–/i;
const SPLIT_LIST_AR = /(?:بما في ذلك|بما فيها|مثل|تشمل|يشمل|خاصة|:|—|–)/;

function titleCase(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

export function extractTopic(topic: string): { subject: string; parts: string[] } {
  const ar = ARABIC.test(topic);
  let text = topic.trim().replace(/\s+/g, " ").replace(/[.!؟?]+$/, "");
  text = text.replace(ar ? LEAD_AR : LEAD_EN, "").replace(/^(the|about)\s+/i, "");
  const splitter = ar ? SPLIT_LIST_AR : SPLIT_LIST_EN;
  const m = splitter.exec(text);
  let subject = text;
  let rest = "";
  if (m && m.index > 0) {
    subject = text.slice(0, m.index);
    rest = text.slice(m.index + m[0].length);
  }
  subject = subject.replace(/[,،;؛]+\s*$/, "").trim();
  const partSplit = ar ? /\s*(?:[,،;؛/&]|\sو(?=\S)|\sأو\s)\s*/ : /\s*(?:[,;/&]|\band\b|\bor\b)\s*/i;
  const seen = new Set<string>();
  const parts = rest
    .split(partSplit)
    .map((p) => p.replace(/^(the|its|their)\s+/i, "").replace(/^و(?=ال)/, "").trim())
    .filter((p) => p.length >= 2 && p.length <= 80)
    .filter((p) => {
      const k = p.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 6);
  if (!subject) subject = parts.shift() ?? text;
  subject = subject.slice(0, 70);
  return { subject: ar ? subject : titleCase(subject), parts: parts.map((p) => (ar ? p : titleCase(p))) };
}

type M = { t: string; d: string; a: ActivityType; min: number; diff: "easy" | "medium" | "hard"; req?: boolean };
const mission = (x: M) => ({
  title: x.t,
  description: x.d,
  activity: x.a,
  estimated_minutes: x.min,
  difficulty: x.diff,
  required: x.req ?? true,
});

interface Copy {
  foundations: string;
  foundationsDesc: string;
  core: string;
  coreDesc: string;
  apply: string;
  applyDesc: string;
  orientation: (s: string) => string;
  orientationDesc: string;
  orientationObjectives: (s: string) => string[];
  orientationMissions: (s: string) => M[];
  partLevelDesc: (p: string) => string;
  partObjectives: (p: string) => string[];
  partMissions: (p: string, hard: boolean) => M[];
  genericCore: (s: string) => { t: string; d: string }[];
  buildsOnPrev: (t: string) => string;
  applyLevel: (s: string) => string;
  applyLevelDesc: string;
  applyObjectives: string[];
  applyMissions: (s: string) => M[];
  review: string;
  reviewDesc: string;
  reviewObjectives: string[];
  reviewMissions: M[];
  description: (s: string) => string;
  pacing: (min: number, perDay: number | null) => string;
}

const EN: Copy = {
  foundations: "Foundations",
  foundationsDesc: "Get oriented and learn the language of the topic.",
  core: "Core understanding",
  coreDesc: "Work through each part of the topic in a logical order.",
  apply: "Application & mastery",
  applyDesc: "Use what you know, connect the ideas and test yourself.",
  orientation: (s) => `Orientation: ${s}`,
  orientationDesc: "Build a map of the topic before going into detail.",
  orientationObjectives: (s) => [`Describe what ${s} covers and why it matters`, "Define the key terms", "Outline how the parts fit together"],
  orientationMissions: (s) => [
    { t: `Survey the big picture of ${s}`, d: "Skim an overview and note the main sections and themes.", a: "read", min: 20, diff: "easy" },
    { t: "Build a key-terms glossary", d: "Write short definitions of the essential vocabulary in your own words.", a: "notes", min: 20, diff: "easy" },
    { t: "Sketch a concept map", d: "Draw how the main ideas connect; you will refine it as you go.", a: "diagram", min: 15, diff: "easy" },
  ],
  partLevelDesc: (p) => `Understand ${p} clearly and be able to explain it without notes.`,
  partObjectives: (p) => [`Explain ${p} in your own words`, `Recall the key facts about ${p}`, `Apply ${p} to an example`],
  partMissions: (p, hard) => [
    { t: `Study ${p}`, d: "Read carefully and take structured notes on the essentials.", a: "read", min: 30, diff: "medium" },
    { t: `Explain ${p} from memory`, d: "Close your notes and write or say everything you remember, then check gaps.", a: "recall", min: 20, diff: "medium" },
    { t: `Practise with ${p}`, d: "Work through questions or examples that use this part.", a: "practice", min: 25, diff: hard ? "hard" : "medium" },
  ],
  genericCore: (s) => [
    { t: `Key concepts of ${s}`, d: "Learn the central ideas and how they work." },
    { t: `Deeper details of ${s}`, d: "Go beyond the basics: mechanisms, exceptions and relationships." },
  ],
  buildsOnPrev: (t) => `Builds on “${t}”.`,
  applyLevel: (s) => `Applying ${s}`,
  applyLevelDesc: "Use your knowledge on realistic problems and link the parts together.",
  applyObjectives: ["Solve applied problems or cases", "Connect ideas across the topic"],
  applyMissions: (s) => [
    { t: `Work through applied problems on ${s}`, d: "Choose realistic questions or cases and solve them step by step.", a: "practice", min: 35, diff: "hard" },
    { t: "Connect the parts", d: "Update your concept map and write how each part relates to the others.", a: "diagram", min: 20, diff: "medium" },
  ],
  review: "Review & self-test",
  reviewDesc: "Consolidate everything and find any remaining gaps.",
  reviewObjectives: ["Recall the whole topic without notes", "Identify and close remaining gaps"],
  reviewMissions: [
    { t: "Spaced review of every level", d: "Revisit your notes level by level and quiz yourself on each.", a: "review", min: 25, diff: "medium" },
    { t: "Take a self-test", d: "Answer a mixed set of questions under light time pressure.", a: "quiz", min: 30, diff: "hard" },
    { t: "Make flashcards for weak spots", d: "Turn anything you missed into flashcards for later review.", a: "flashcards", min: 15, diff: "easy", req: false },
  ],
  description: (s) => `A step-by-step journey through ${s}, from the foundations to confident application.`,
  pacing: (min, perDay) =>
    perDay
      ? `About ${Math.round(min / 60)} hours in total — roughly ${Math.max(1, Math.ceil(min / perDay))} study days at ${perDay} minutes a day.`
      : `About ${Math.round(min / 60)} hours in total. Short, regular sessions work better than long, rare ones.`,
};

const AR: Copy = {
  foundations: "الأساسيات",
  foundationsDesc: "تعرّف على الموضوع وتعلّم مصطلحاته الأساسية.",
  core: "الفهم المتعمق",
  coreDesc: "ادرس كل جزء من الموضوع بترتيب منطقي.",
  apply: "التطبيق والإتقان",
  applyDesc: "طبّق ما تعلمته واربط الأفكار واختبر نفسك.",
  orientation: (s) => `مدخل إلى ${s}`,
  orientationDesc: "كوّن صورة شاملة للموضوع قبل الدخول في التفاصيل.",
  orientationObjectives: (s) => [`وصف ما يشمله ${s} وأهميته`, "تعريف المصطلحات الأساسية", "توضيح كيف تترابط الأجزاء"],
  orientationMissions: (s) => [
    { t: `استعرض الصورة الكاملة لـ ${s}`, d: "اقرأ نظرة عامة سريعة وسجّل الأقسام والأفكار الرئيسية.", a: "read", min: 20, diff: "easy" },
    { t: "أنشئ قائمة بالمصطلحات الأساسية", d: "اكتب تعريفات قصيرة للمفردات الأساسية بأسلوبك.", a: "notes", min: 20, diff: "easy" },
    { t: "ارسم خريطة مفاهيم", d: "ارسم العلاقات بين الأفكار الرئيسية، وستطورها لاحقًا.", a: "diagram", min: 15, diff: "easy" },
  ],
  partLevelDesc: (p) => `افهم ${p} بوضوح وكن قادرًا على شرحه دون الرجوع إلى ملاحظاتك.`,
  partObjectives: (p) => [`شرح ${p} بأسلوبك`, `استرجاع الحقائق الأساسية عن ${p}`, `تطبيق ${p} على مثال`],
  partMissions: (p, hard) => [
    { t: `ادرس ${p}`, d: "اقرأ بتركيز ودوّن ملاحظات منظمة عن الأساسيات.", a: "read", min: 30, diff: "medium" },
    { t: `اشرح ${p} من الذاكرة`, d: "أغلق ملاحظاتك واكتب كل ما تتذكره، ثم راجع الثغرات.", a: "recall", min: 20, diff: "medium" },
    { t: `تدرّب على ${p}`, d: "حل أسئلة أو أمثلة تستخدم هذا الجزء.", a: "practice", min: 25, diff: hard ? "hard" : "medium" },
  ],
  genericCore: (s) => [
    { t: `المفاهيم الأساسية في ${s}`, d: "تعلّم الأفكار المحورية وكيف تعمل." },
    { t: `تفاصيل أعمق في ${s}`, d: "تجاوز الأساسيات: الآليات والاستثناءات والعلاقات." },
  ],
  buildsOnPrev: (t) => `يعتمد على «${t}».`,
  applyLevel: (s) => `تطبيق ${s}`,
  applyLevelDesc: "استخدم معرفتك في مسائل واقعية واربط الأجزاء ببعضها.",
  applyObjectives: ["حل مسائل أو حالات تطبيقية", "الربط بين أفكار الموضوع"],
  applyMissions: (s) => [
    { t: `حل مسائل تطبيقية عن ${s}`, d: "اختر أسئلة أو حالات واقعية وحلها خطوة بخطوة.", a: "practice", min: 35, diff: "hard" },
    { t: "اربط الأجزاء ببعضها", d: "حدّث خريطة المفاهيم واكتب كيف يرتبط كل جزء بالآخر.", a: "diagram", min: 20, diff: "medium" },
  ],
  review: "المراجعة والاختبار الذاتي",
  reviewDesc: "ثبّت كل ما تعلمته واكتشف ما تبقى من ثغرات.",
  reviewObjectives: ["استرجاع الموضوع كاملًا دون ملاحظات", "تحديد الثغرات المتبقية وسدها"],
  reviewMissions: [
    { t: "مراجعة متباعدة لكل المستويات", d: "راجع ملاحظاتك مستوى بمستوى واختبر نفسك في كل منها.", a: "review", min: 25, diff: "medium" },
    { t: "اختبر نفسك", d: "أجب عن مجموعة متنوعة من الأسئلة في وقت محدد.", a: "quiz", min: 30, diff: "hard" },
    { t: "اصنع بطاقات لنقاط الضعف", d: "حوّل ما أخطأت فيه إلى بطاقات للمراجعة لاحقًا.", a: "flashcards", min: 15, diff: "easy", req: false },
  ],
  description: (s) => `رحلة منظمة خطوة بخطوة في ${s}، من الأساسيات حتى التطبيق بثقة.`,
  pacing: (min, perDay) =>
    perDay
      ? `حوالي ${Math.round(min / 60)} ساعات إجمالًا — قرابة ${Math.max(1, Math.ceil(min / perDay))} يوم دراسة بمعدل ${perDay} دقيقة يوميًا.`
      : `حوالي ${Math.round(min / 60)} ساعات إجمالًا. الجلسات القصيرة المنتظمة أفضل من الطويلة المتقطعة.`,
};

export function buildMockPlan(input: PlannerInput): PlanDraft {
  const ar = ARABIC.test(input.topic);
  const c = ar ? AR : EN;
  const { subject, parts } = extractTopic(input.topic);
  const familiar = input.familiarity === "confident";
  const complexity: Complexity =
    parts.length >= 4 ? "advanced" : parts.length >= 2 || input.topic.length > 120 ? "intermediate" : "introductory";

  const coreLevels =
    parts.length > 0
      ? parts.map((p, i) => ({
          title: p,
          description: c.partLevelDesc(p),
          objectives: c.partObjectives(p),
          builds_on: c.buildsOnPrev(i === 0 ? c.orientation(subject) : parts[i - 1]),
          missions: c.partMissions(p, familiar || complexity === "advanced").map(mission),
        }))
      : c.genericCore(subject).map((g, i, arr) => ({
          title: g.t,
          description: g.d,
          objectives: c.partObjectives(subject).slice(0, 2),
          builds_on: c.buildsOnPrev(i === 0 ? c.orientation(subject) : arr[i - 1].t),
          missions: c.partMissions(subject, familiar).map(mission),
        }));

  const foundations = {
    title: c.foundations,
    description: c.foundationsDesc,
    levels: [
      {
        title: c.orientation(subject),
        description: c.orientationDesc,
        objectives: c.orientationObjectives(subject),
        builds_on: "",
        missions: c.orientationMissions(subject).map(mission),
      },
    ],
  };
  const lastCore = coreLevels[coreLevels.length - 1].title;
  const applyLevels = [
    {
      title: c.applyLevel(subject),
      description: c.applyLevelDesc,
      objectives: c.applyObjectives,
      builds_on: c.buildsOnPrev(lastCore),
      missions: c.applyMissions(subject).map(mission),
    },
    {
      title: c.review,
      description: c.reviewDesc,
      objectives: c.reviewObjectives,
      builds_on: c.buildsOnPrev(c.applyLevel(subject)),
      missions: c.reviewMissions.map(mission),
    },
  ];

  let stages: AiPlan["stages"];
  if (complexity === "introductory") {
    // Small topic: keep it compact — two stages.
    stages = [
      { ...foundations, levels: [...foundations.levels, ...coreLevels.slice(0, 1)] },
      { title: c.apply, description: c.applyDesc, levels: [applyLevels[1]] },
    ];
  } else {
    stages = [
      foundations,
      { title: c.core, description: c.coreDesc, levels: coreLevels },
      { title: c.apply, description: c.applyDesc, levels: applyLevels },
    ];
  }
  // Leave out already-completed work when regenerating.
  if (input.completed && input.completed.length > 0) {
    const done = new Set(input.completed.map((t) => t.trim().toLowerCase()));
    stages = stages
      .map((s) => ({
        ...s,
        levels: s.levels
          .map((l) => ({ ...l, missions: l.missions.filter((m) => !done.has(m.title.toLowerCase())) }))
          .filter((l) => l.missions.length > 0),
      }))
      .filter((s) => s.levels.length > 0);
    if (stages.length === 0) {
      stages = [{ title: c.apply, description: c.applyDesc, levels: [applyLevels[1]] }];
    }
  }
  const totalMinutes = stages.reduce(
    (sum, s) => sum + s.levels.reduce((a, l) => a + l.missions.reduce((b, m) => b + m.estimated_minutes, 0), 0),
    0,
  );
  const raw: AiPlan = {
    title: subject,
    description: c.description(subject),
    subject_area: "",
    complexity,
    prerequisites: [],
    pacing_note: c.pacing(totalMinutes, input.minutesPerDay ?? null),
    stages,
  };
  return normalizePlan(raw, input.topic);
}

/** Emit the plan as JSON text in small chunks to mimic a streamed model. */
export async function streamMockPlan(
  plan: PlanDraft,
  onText?: (delta: string) => void,
  delayMs = Number(process.env.MOCK_PLANNER_DELAY_MS ?? "35"),
): Promise<void> {
  if (!onText) return;
  const text = JSON.stringify(plan);
  const chunk = Math.max(40, Math.ceil(text.length / 40));
  for (let i = 0; i < text.length; i += chunk) {
    onText(text.slice(i, i + chunk));
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
}
