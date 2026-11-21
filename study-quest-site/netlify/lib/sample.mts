/**
 * Free, built-in study planner (no AI, no API key, no cost).
 *
 * A new topic: the request is split into its parts ("…, including anatomy,
 * branches and clinical applications") and turned into a foundations → core →
 * application → review plan. Follow-ups it understands (English and Arabic):
 * shorter, longer/deeper, more practice, fit into N days/weeks, N minutes a
 * day, explain level N, or a brand-new topic.
 */
import type { AgentReply, Plan } from "./schema.mts";

type Mission = Plan["stages"][number]["levels"][number]["missions"][number];
type Activity = Mission["activity"];
type Level = Plan["stages"][number]["levels"][number];

const ARABIC = /[؀-ۿ]/;

const LEAD_EN =
  /^(i\s+(want|need|would like|'d like|have)\s+to\s+(study|learn|review|revise|master|understand|cover)|(please\s+)?(help me\s+)?(study|learn|review|revise|master|understand|plan)|(make|create|build)\s+(me\s+)?a\s+(study\s+)?plan\s+(for|on|about))\s+/i;
const LEAD_AR = /^(أريد|اريد|أحتاج|احتاج|عايز|عاوز|ساعدني|خطط لي|ضع لي خطة)\s+(أن\s+|ان\s+|في\s+|ل)?(أذاكر|اذاكر|أدرس|ادرس|أتعلم|اتعلم|أراجع|اراجع|مذاكرة|دراسة|تعلم|مراجعة)?\s*/;
const SPLIT_LIST_EN = /\b(?:including|such as|covering|focusing on|with emphasis on|especially)\b|:|—|–/i;
const SPLIT_LIST_AR = /(?:بما في ذلك|بما فيها|مثل|تشمل|يشمل|خاصة|:|—|–)/;

const titleCase = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function extractTopic(topic: string): { subject: string; parts: string[] } {
  const ar = ARABIC.test(topic);
  let text = topic.trim().replace(/\s+/g, " ").replace(/[.!؟?]+$/, "");
  // Polite words are not part of the topic.
  text = text
    .replace(/^(please|pls|kindly)[,\s]+/i, "")
    .replace(/[,\s]+(please|pls|thanks?|thank you)[.!]*$/i, "")
    .replace(/^(من فضلك|لو سمحت|رجاءً?)[،,\s]+/, "")
    .replace(/[،,\s]+(من فضلك|لو سمحت|شكرًا|شكرا)$/, "");
  text = text.replace(ar ? LEAD_AR : LEAD_EN, "").replace(/^(the|about)\s+/i, "");
  // Drop trailing scheduling phrases ("for an exam in 10 days", "in 2 weeks").
  text = text.replace(/\s+(for (an|my) (exam|test|midterm|final).*|in \d+ (days?|weeks?).*)$/i, "").replace(/\s+(لامتحان|للامتحان|خلال|في غضون).*$/, "");
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

const mk = (title: string, minutes: number, activity: Activity, difficulty: Mission["difficulty"] = "medium"): Mission => ({ title, minutes, activity, difficulty });

function copy(ar: boolean) {
  return ar
    ? {
        foundations: "الأساسيات",
        core: "الفهم المتعمق",
        apply: "التطبيق والإتقان",
        orientation: (s: string) => `مدخل إلى ${s}`,
        orientationObjectives: (s: string) => [`وصف ما يشمله ${s} وأهميته`, "تعريف المصطلحات الأساسية", "توضيح كيف تترابط الأجزاء"],
        orientationMissions: (s: string) => [mk(`استعرض الصورة الكاملة لـ ${s}`, 20, "read", "easy"), mk("أنشئ قائمة بالمصطلحات الأساسية", 20, "notes", "easy"), mk("ارسم خريطة مفاهيم", 15, "diagram", "easy")],
        partObjectives: (p: string) => [`شرح ${p} بأسلوبك`, `استرجاع الحقائق الأساسية عن ${p}`, `تطبيق ${p} على مثال`],
        partMissions: (p: string, hard: boolean) => [mk(`ادرس ${p}`, 30, "read"), mk(`اشرح ${p} من الذاكرة`, 20, "recall"), mk(`تدرّب على ${p}`, 25, "practice", hard ? "hard" : "medium")],
        genericCore: (s: string) => [`المفاهيم الأساسية في ${s}`, `تفاصيل أعمق في ${s}`],
        applyLevel: (s: string) => `تطبيق ${s}`,
        applyObjectives: ["حل مسائل أو حالات تطبيقية", "الربط بين أفكار الموضوع"],
        applyMissions: (s: string) => [mk(`حل مسائل تطبيقية عن ${s}`, 35, "practice", "hard"), mk("اربط الأجزاء ببعضها في خريطة مفاهيم", 20, "diagram")],
        review: "المراجعة والاختبار الذاتي",
        reviewObjectives: ["استرجاع الموضوع كاملًا دون ملاحظات", "تحديد الثغرات المتبقية وسدها"],
        reviewMissions: [mk("مراجعة متباعدة لكل المستويات", 25, "review"), mk("اختبر نفسك", 30, "quiz", "hard"), mk("اصنع بطاقات لنقاط الضعف", 15, "flashcards", "easy")],
        extraPractice: (t: string) => mk(`أسئلة إضافية: ${t}`, 25, "quiz", "hard"),
        deeper: (t: string) => mk(`تعمّق: ${t}`, 30, "read", "hard"),
        summary: (s: string, n: number) => `رحلة منظمة في ${s} من ${n} مراحل، من الأساسيات حتى التطبيق والمراجعة.`,
      }
    : {
        foundations: "Foundations",
        core: "Core understanding",
        apply: "Application & mastery",
        orientation: (s: string) => `Orientation: ${s}`,
        orientationObjectives: (s: string) => [`Describe what ${s} covers and why it matters`, "Define the key terms", "Outline how the parts fit together"],
        orientationMissions: (s: string) => [mk(`Survey the big picture of ${s}`, 20, "read", "easy"), mk("Build a key-terms glossary", 20, "notes", "easy"), mk("Sketch a concept map", 15, "diagram", "easy")],
        partObjectives: (p: string) => [`Explain ${p} in your own words`, `Recall the key facts about ${p}`, `Apply ${p} to an example`],
        partMissions: (p: string, hard: boolean) => [mk(`Study ${p}`, 30, "read"), mk(`Explain ${p} from memory`, 20, "recall"), mk(`Practise with ${p}`, 25, "practice", hard ? "hard" : "medium")],
        genericCore: (s: string) => [`Key concepts of ${s}`, `Deeper details of ${s}`],
        applyLevel: (s: string) => `Applying ${s}`,
        applyObjectives: ["Solve applied problems or cases", "Connect ideas across the topic"],
        applyMissions: (s: string) => [mk(`Work through applied problems on ${s}`, 35, "practice", "hard"), mk("Connect the parts in a concept map", 20, "diagram")],
        review: "Review & self-test",
        reviewObjectives: ["Recall the whole topic without notes", "Identify and close remaining gaps"],
        reviewMissions: [mk("Spaced review of every level", 25, "review"), mk("Take a self-test", 30, "quiz", "hard"), mk("Make flashcards for weak spots", 15, "flashcards", "easy")],
        extraPractice: (t: string) => mk(`Extra questions: ${t}`, 25, "quiz", "hard"),
        deeper: (t: string) => mk(`Go deeper: ${t}`, 30, "read", "hard"),
        summary: (s: string, n: number) => `A step-by-step journey through ${s} in ${n} stages, from the foundations to confident application and review.`,
      };
}

export function totalMinutes(plan: Plan): number {
  return plan.stages.reduce((a, s) => a + s.levels.reduce((b, l) => b + l.missions.reduce((c, m) => c + m.minutes, 0), 0), 0);
}

function hours(min: number) {
  return Math.round((min / 60) * 10) / 10;
}

function daysBetween(from: string, to: string) {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export interface Pace {
  minutesPerDay?: number | null;
  days?: number | null;
}

export function pacingText(plan: Plan, ar: boolean, pace: Pace): string {
  const total = totalMinutes(plan);
  const h = hours(total);
  if (pace.days && pace.days > 0) {
    const perDay = Math.ceil(total / pace.days);
    return ar
      ? `حوالي ${h} ساعة إجمالًا — قرابة ${perDay} دقيقة يوميًا لمدة ${pace.days} يومًا.`
      : `About ${h} hours in total — roughly ${perDay} minutes a day for ${pace.days} days.`;
  }
  if (pace.minutesPerDay) {
    const days = Math.max(1, Math.ceil(total / pace.minutesPerDay));
    return ar
      ? `حوالي ${h} ساعة إجمالًا — قرابة ${days} يوم مذاكرة بمعدل ${pace.minutesPerDay} دقيقة يوميًا.`
      : `About ${h} hours in total — roughly ${days} study days at ${pace.minutesPerDay} minutes a day.`;
  }
  return ar
    ? `حوالي ${h} ساعة إجمالًا. الجلسات القصيرة المنتظمة أفضل من الطويلة المتقطعة.`
    : `About ${h} hours in total. Short, regular sessions work better than long, rare ones.`;
}

export function buildSamplePlan(topic: string, pace: Pace = {}): Plan {
  const ar = ARABIC.test(topic);
  const c = copy(ar);
  const { subject, parts } = extractTopic(topic);
  const small = parts.length === 0 && topic.length < 60;
  const hard = parts.length >= 4;
  const coreLevels: Level[] = (parts.length ? parts : c.genericCore(subject)).map((p) => ({
    title: p,
    objectives: c.partObjectives(parts.length ? p : subject).slice(0, parts.length ? 3 : 2),
    missions: c.partMissions(parts.length ? p : subject, hard),
  }));
  const orientation: Level = { title: c.orientation(subject), objectives: c.orientationObjectives(subject), missions: c.orientationMissions(subject) };
  const applyL: Level = { title: c.applyLevel(subject), objectives: c.applyObjectives, missions: c.applyMissions(subject) };
  const reviewL: Level = { title: c.review, objectives: c.reviewObjectives, missions: c.reviewMissions.map((m) => ({ ...m })) };
  const stages: Plan["stages"] = small
    ? [
        { title: c.foundations, levels: [orientation, coreLevels[0]] },
        { title: c.apply, levels: [reviewL] },
      ]
    : [
        { title: c.foundations, levels: [orientation] },
        { title: c.core, levels: coreLevels },
        { title: c.apply, levels: [applyL, reviewL] },
      ];
  const plan: Plan = { title: subject, summary: c.summary(subject, stages.length), pacing: "", stages };
  plan.pacing = pacingText(plan, ar, pace);
  return plan;
}

// ---------------- follow-ups ----------------

const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, ten: 10 };

function parseDuration(msg: string): number | null {
  const m = msg.toLowerCase();
  const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : NUM_WORDS[s] ?? NaN);
  let r = /(\d+|one|two|three|four|five|six|seven|eight|ten)\s*(weeks?)\b/.exec(m);
  if (r) return num(r[1]) * 7;
  r = /(\d+|one|two|three|four|five|six|seven|eight|ten)\s*(days?)\b/.exec(m);
  if (r) return num(r[1]);
  if (/\ba week\b/.test(m)) return 7;
  if (/أسبوعين|اسبوعين/.test(msg)) return 14;
  r = /(\d+)\s*(أسابيع|اسابيع|أسبوع|اسبوع)/.exec(msg);
  if (r) return Number(r[1]) * 7;
  if (/أسبوع|اسبوع/.test(msg)) return 7;
  if (/يومين/.test(msg)) return 2;
  r = /(\d+)\s*(أيام|ايام|يوم|يومًا|يوما)/.exec(msg);
  if (r) return Number(r[1]);
  return null;
}

function parseMinutesPerDay(msg: string): number | null {
  const r = /(\d+)\s*(min|mins|minutes|دقيقة|دقائق|د\b)/i.exec(msg);
  if (r && /(day|daily|a day|per day|يوم|يوميًا|يوميا)/i.test(msg)) return Math.min(600, Math.max(5, Number(r[1])));
  const h = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|ساعة|ساعات)/i.exec(msg);
  if (h && /(day|daily|a day|per day|يوم|يوميًا|يوميا)/i.test(msg)) return Math.min(600, Math.round(Number(h[1]) * 60));
  return null;
}

function levelNumber(msg: string): number | null {
  const r = /level\s*(\d+)|المستوى\s*(\d+)/i.exec(msg);
  return r ? Number(r[1] ?? r[2]) : null;
}

const RE = {
  shorter: /\b(short(er)?|less|fewer|quick(er)?|brief|trim|reduce|cut)\b|أقصر|اقصر|اختصر|أقل|اقل|مختصر/i,
  practice: /\b(practi[cs]e|questions?|quiz(zes)?|exercises?|problems?|cases?|mcqs?)\b|تدريب|أسئلة|اسئلة|تمارين|حالات|اختبار/i,
  deeper: /\b(longer|more detail(ed)?|deeper|in depth|in-depth|expand|harder|advanced)\b|أطول|اطول|أعمق|اعمق|تفاصيل|أصعب|متقدم/i,
  newTopic: /\b(i want to (study|learn)|new (topic|plan)|study|learn|plan for|help me (study|learn|revise))\b|أريد أن|اريد ان|أذاكر|اذاكر|أدرس|ادرس|خطة جديدة|موضوع جديد/i,
};

function allLevels(plan: Plan) {
  return plan.stages.flatMap((s) => s.levels);
}

function shorten(plan: Plan): Plan {
  const p: Plan = structuredClone(plan);
  for (const s of p.stages)
    for (const l of s.levels) {
      if (l.missions.length > 2) l.missions = l.missions.filter((m) => !["flashcards", "diagram", "notes"].includes(m.activity) || l.missions.length <= 2);
      if (l.missions.length > 2) l.missions = l.missions.slice(0, 2);
      l.missions = l.missions.map((m) => ({ ...m, minutes: Math.max(10, Math.round((m.minutes * 0.8) / 5) * 5) }));
    }
  return p;
}

function addPractice(plan: Plan, ar: boolean): Plan {
  const c = copy(ar);
  const p: Plan = structuredClone(plan);
  const levels = allLevels(p);
  const targets = levels.length > 2 ? levels.slice(1, -1) : levels;
  for (const l of targets) l.missions.push(c.extraPractice(l.title));
  return p;
}

function deepen(plan: Plan, ar: boolean): Plan {
  const c = copy(ar);
  const p: Plan = structuredClone(plan);
  const levels = allLevels(p);
  const targets = levels.length > 2 ? levels.slice(1, -1) : levels;
  for (const l of targets) l.missions.splice(1, 0, c.deeper(l.title));
  return p;
}

function describeLevel(plan: Plan, n: number, ar: boolean): string | null {
  const level = allLevels(plan)[n - 1];
  if (!level) return null;
  const steps = level.missions.map((m, i) => `${i + 1}) ${m.title} (${m.minutes} ${ar ? "د" : "min"})`).join(ar ? "، " : "; ");
  const goal = level.objectives[0] ?? "";
  return ar
    ? `المستوى ${n}: «${level.title}». ابدأ بالترتيب: ${steps}. الهدف: ${goal}. بعد كل مهمة، أغلق ملاحظاتك واشرح ما تعلمته بصوت عالٍ.`
    : `Level ${n}, “${level.title}”. Work in this order: ${steps}. Aim: ${goal}. After each mission, close your notes and explain what you learned out loud.`;
}

/**
 * One turn of the sample planner. `plan` is the conversation's current plan
 * (or null), `pace` the learner's first-turn options.
 */
export function sampleTurn(message: string, plan: Plan | null, pace: Pace): AgentReply {
  const ar = ARABIC.test(message);
  const empty: Plan = { title: "", summary: "", pacing: "", stages: [] };
  const say = (en: string, a: string) => (ar ? a : en);

  if (!plan) {
    const p = buildSamplePlan(message, pace);
    const lv = allLevels(p).length;
    return {
      reply: say(
        `Here's a plan for ${p.title}: ${p.stages.length} stages and ${lv} levels. You can ask me to make it shorter, add more practice, fit it into a number of days or weeks, or explain a level.`,
        `إليك خطة لـ ${p.title}: ${p.stages.length} مراحل و${lv} مستويات. يمكنك أن تطلب مني اختصارها، أو إضافة تدريب أكثر، أو جعلها في عدد من الأيام أو الأسابيع، أو شرح مستوى.`,
      ),
      plan_changed: true,
      plan: p,
    };
  }

  const n = levelNumber(message);
  if (n !== null && !RE.shorter.test(message)) {
    const d = describeLevel(plan, n, ar);
    return { reply: d ?? say(`This plan has ${allLevels(plan).length} levels — try a number between 1 and ${allLevels(plan).length}.`, `في هذه الخطة ${allLevels(plan).length} مستويات — جرّب رقمًا بين 1 و${allLevels(plan).length}.`), plan_changed: false, plan: empty };
  }

  const days = parseDuration(message);
  const perDay = parseMinutesPerDay(message);
  let p = plan;
  const did: string[] = [];
  if (RE.shorter.test(message)) {
    p = shorten(p);
    did.push(say("trimmed each level to its essentials", "اختصرت كل مستوى إلى الأساسيات"));
  }
  if (RE.practice.test(message)) {
    p = addPractice(p, ar);
    did.push(say("added practice questions to the core levels", "أضفت أسئلة تدريب إلى المستويات الأساسية"));
  } else if (RE.deeper.test(message)) {
    p = deepen(p, ar);
    did.push(say("added a deeper mission to the core levels", "أضفت مهمة أعمق إلى المستويات الأساسية"));
  }
  if (days || perDay) {
    p = { ...p, pacing: pacingText(p, ar, { days, minutesPerDay: perDay }) };
    did.push(days ? say(`spread it over ${days} days`, `وزعتها على ${days} يومًا`) : say(`paced it at ${perDay} minutes a day`, `جعلت الإيقاع ${perDay} دقيقة يوميًا`));
  } else if (did.length) {
    p = { ...p, pacing: pacingText(p, ar, pace) };
  }

  if (did.length) {
    return {
      reply: say(`Done — I ${did.join(" and ")}. It's now about ${hours(totalMinutes(p))} hours in total.`, `تم — ${did.join(" و")}. أصبحت الآن حوالي ${hours(totalMinutes(p))} ساعة إجمالًا.`),
      plan_changed: true,
      plan: p,
    };
  }

  // A new topic replaces the plan; anything else gets a short explanation.
  if (RE.newTopic.test(message) || (message.length > 30 && !/\?|؟/.test(message))) {
    const np = buildSamplePlan(message, pace);
    return {
      reply: say(`Here's a new plan for ${np.title}. Your previous plan is still in your saved plans if you started a new one.`, `إليك خطة جديدة لـ ${np.title}.`),
      plan_changed: true,
      plan: np,
    };
  }
  return {
    reply: say(
      "I'm the free sample planner, so I can't chat freely, but I can: make the plan shorter, add more practice, go deeper, fit it into a number of days or weeks (“fit it into 2 weeks”), set minutes per day (“45 minutes a day”), explain a level (“explain level 2”), or plan a new topic.",
      "أنا المخطط التجريبي المجاني، لذا لا أستطيع الدردشة بحرية، لكن يمكنني: اختصار الخطة، أو إضافة تدريب أكثر، أو التعمق أكثر، أو جعلها في عدد من الأيام أو الأسابيع («اجعلها في أسبوعين»)، أو تحديد الدقائق يوميًا («45 دقيقة يوميًا»)، أو شرح مستوى («اشرح المستوى 2»)، أو التخطيط لموضوع جديد.",
    ),
    plan_changed: false,
    plan: empty,
  };
}

export function paceFromInput(input: { minutesPerDay?: number | null; deadline?: string | null }, today = new Date().toISOString().slice(0, 10)): Pace {
  const days = input.deadline ? Math.max(1, daysBetween(today, input.deadline)) : null;
  return { minutesPerDay: input.minutesPerDay ?? null, days };
}
