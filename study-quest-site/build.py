#!/usr/bin/env python3
"""Builds the Study Quest information site: index.html (English) and ar/index.html (Arabic).

All copy lives in COPY below; the markup is shared. Run:  python3 build.py
"""
import html
import json
from pathlib import Path

ROOT = Path(__file__).parent
ICONS = json.loads((ROOT / "assets" / "icons.json").read_text())
SITE_URL = "https://study-quest-journey.netlify.app"


def icon(name: str, cls: str = "") -> str:
    svg = ICONS[name]
    return svg.replace("<svg ", f'<svg class="{cls}" ', 1) if cls else svg


LOGO = (
    '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#526b57"/>'
    '<path d="M8 23c4.5 0 5-6 8.5-7.5S22 14 24 9" fill="none" stroke="#f8f7f2" stroke-opacity=".55" stroke-width="1.6" stroke-linecap="round"/>'
    '<circle cx="8.5" cy="22.5" r="2.2" fill="#f8f7f2"/><circle cx="16.3" cy="15.8" r="2.2" fill="#f8f7f2"/>'
    '<circle cx="23.6" cy="9.4" r="2.2" fill="#f8f7f2" fill-opacity=".55"/></svg>'
)

COPY = {
    "en": {
        "dir": "ltr",
        "path": "/",
        "other": ("ar", "/ar/", "العربية"),
        "brand": "Study Quest",
        "title": "Study Quest — make studying feel like a peaceful journey",
        "description": "Study Quest turns any study topic into a calm, structured journey of stages, levels and small missions, with gentle progress you can see.",
        "skip": "Skip to content",
        "nav": [("#how", "How it works"), ("#features", "Features"), ("#screens", "Look inside"), ("#who", "Who it's for")],
        "eyebrow": "AI-planned · calmly gamified",
        "h1": "Make studying feel like a peaceful journey.",
        "lead": "Study Quest turns any topic into a clear path of stages, levels and small missions — so you always know where you are, what you've done and what comes next.",
        "cta1": "See how it works",
        "cta2": "Look inside",
        "hero_alt": "The Study Quest dashboard: the next mission, progress, daily goals and active quests.",
        "float_a": ("Level complete", "Orientation · +45 XP"),
        "float_b": ("3-day streak", "One mission a day keeps it going"),
        "principles": [
            ("Simple to start", "Describe what you want to learn in your own words."),
            ("Structured for you", "Stages, levels and missions in a logical order, sized to the topic."),
            ("Calm by design", "Progress you can feel, without noise or pressure."),
        ],
        "how_title": "From a sentence to a study plan",
        "how_lead": "You bring the topic. Study Quest organises it, keeps you focused and makes progress visible.",
        "steps": [
            ("Describe what you want to learn", "Write it the way you would say it. Add a target date or the time you have each day if you like."),
            ("Get a structured journey", "AI works out the topic's complexity and the best learning order, then builds stages, levels and missions with objectives and time estimates."),
            ("Study one mission at a time", "Focus mode shows only the mission, its objectives, a calm timer and a place for your notes."),
            ("Watch your progress grow", "Earn XP, unlock the next level, keep a gentle daily streak and collect quiet milestones."),
        ],
        "example_label": "You write",
        "example_quote": "“I want to study the brachial plexus, including anatomy, branches, relations, and clinical applications.”",
        "example_chips": ["45 min a day", "Exam in 3 weeks"],
        "example_quest": "Brachial plexus",
        "example_progress": "40% complete",
        "stage_word": "Stage",
        "stages": [
            ("1", "Foundations", [
                ("done", "1", "Basic organisation", "Completed", [("Understand the spinal roots", "20 min", True), ("Learn the trunks", "20 min", True), ("Understand the divisions", "15 min", True)]),
                ("current", "2", "Anatomical structure", "In progress", [("Understand the cords", "25 min", True), ("Learn the terminal branches", "30 min", False), ("Review anatomical relations", "25 min", False)]),
            ]),
            ("2", "Clinical anatomy", [
                ("locked", "3", "Clinical applications", "Unlocks after level 2", [("Understand common injuries", "30 min", False), ("Review clinical presentations", "25 min", False), ("Solve clinical scenarios", "40 min", False)]),
            ]),
        ],
        "features_title": "Everything a focused learner needs — nothing more",
        "features_lead": "Gamification that motivates without distracting.",
        "features": [
            ("sparkles", "AI study planner", "Turns any topic into stages, levels and missions with objectives, time estimates and a sensible order. Edit or regenerate it any time."),
            ("map", "A visual journey", "A calm level map with numbered milestones. Locked levels explain exactly what unlocks them."),
            ("timer", "Focus mode", "A distraction-free page with a timer, pause and resume, objectives and notes that save themselves."),
            ("trendingUp", "XP and levels", "Missions earn XP by effort and difficulty, with bonuses for finishing levels, stages and quests."),
            ("flame", "Gentle streaks", "A day counts when you complete a mission. No punishments — just a quiet nudge to keep going."),
            ("award", "Achievements", "Milestones like First Mission, 7-Day Streak, Level Master and Study Marathon."),
            ("chart", "Clear statistics", "Study time by day, week and month, XP over time and a calendar of your study days."),
            ("languages", "English and Arabic", "A full right-to-left Arabic interface, a warm light theme and an optional dark mode."),
        ],
        "screens_title": "Look inside",
        "screens_lead": "Real screens from Study Quest.",
        "screens": [
            ("dashboard", "Always know what comes next", "The dashboard opens on your next mission, with your level, streak and today's goals beside it.", ["Up next, one tap away", "Daily goals and weekly activity", "Every active quest at a glance"], "The Study Quest dashboard"),
            ("journey", "See the whole path", "Each quest is a journey of stages and levels. Completed milestones fill in; the next one waits, clearly marked.", ["Levels unlock in order", "Progress for every level and stage", "Unlock early or skip, with confirmation"], "A quest's journey map with completed and upcoming levels"),
            ("planner", "Adjust the plan before you begin", "Review the generated plan, rename anything, reorder levels, add missions or change estimates.", ["Edit everything before you start", "Regenerate with your own feedback", "Completed work is always kept"], "The study planner preview with an editable plan"),
            ("focus", "Study without distractions", "One mission, its objectives, a calm timer and your notes. Nothing else competes for attention.", ["Timer or stopwatch, pause and resume", "Notes save while you type", "Finish and move straight to the next mission"], "Focus mode with a timer and notes"),
            ("achievements", "Quiet milestones", "Achievements mark real progress — and show how close you are to the next one.", ["16 achievements to collect", "Progress toward each locked one", "Rewards without flashy pop-ups"], "The achievements page"),
        ],
        "mobile_title": "Made for phones, too",
        "mobile_text": "A layout designed for small screens, with navigation at your thumb — shown here in Arabic with dark mode.",
        "mobile_points": ["Comfortable touch targets", "Right-to-left Arabic interface", "Light or dark, your choice"],
        "mobile_alt": "Study Quest on a phone, in Arabic with dark mode",
        "who_title": "Who it's for",
        "who": [
            ("graduation", "University students", "Turn a syllabus topic into a plan you can actually follow."),
            ("stethoscope", "Medical students", "Work through dense topics from anatomy to clinical application."),
            ("microscope", "Researchers", "Learn a new method or field step by step, on your own schedule."),
            ("book", "Lifelong learners", "Explore anything you're curious about, one calm session at a time."),
        ],
        "calm_title": "Calm by design",
        "calm_lead": "Built to be comfortable for hours of study.",
        "calm_yes_title": "What you'll find",
        "calm_yes": ["Warm, soft colours and generous space", "Clear progress at every level", "Subtle, gentle transitions", "Reminders that nudge, never nag"],
        "calm_no_title": "What you won't",
        "calm_no": ["Neon colours or loud gradients", "Flashing XP pop-ups and cartoon mascots", "Crowded dashboards", "Punishing streak losses"],
        "closing_title": "Every topic, one calm step at a time.",
        "closing_text": "Study Quest helps you know where you are, what you've accomplished, what comes next — and how far you've come.",
        "footer": "A calm, structured way to study.",
        "lang_label": "Language",
    },
    "ar": {
        "dir": "rtl",
        "path": "/ar/",
        "other": ("en", "/", "English"),
        "brand": "رحلة المذاكرة",
        "title": "رحلة المذاكرة — اجعل المذاكرة رحلة هادئة",
        "description": "تحوّل رحلة المذاكرة أي موضوع دراسي إلى رحلة هادئة ومنظمة من المراحل والمستويات والمهام الصغيرة، مع تقدّم واضح تراه بعينيك.",
        "skip": "انتقل إلى المحتوى",
        "nav": [("#how", "كيف تعمل"), ("#features", "المزايا"), ("#screens", "نظرة من الداخل"), ("#who", "لمن هي")],
        "eyebrow": "تخطيط بالذكاء الاصطناعي · تحفيز هادئ",
        "h1": "اجعل المذاكرة رحلة هادئة.",
        "lead": "تحوّل رحلة المذاكرة أي موضوع إلى مسار واضح من المراحل والمستويات والمهام الصغيرة — لتعرف دائمًا أين أنت، وماذا أنجزت، وما الخطوة التالية.",
        "cta1": "تعرّف كيف تعمل",
        "cta2": "نظرة من الداخل",
        "hero_alt": "لوحة رحلة المذاكرة: المهمة التالية، والتقدّم، وأهداف اليوم، والرحلات النشطة.",
        "float_a": ("اكتمل المستوى", "مدخل إلى الموضوع · ‎+45 نقطة"),
        "float_b": ("سلسلة 3 أيام", "مهمة واحدة يوميًا تُبقيها مستمرة"),
        "principles": [
            ("سهلة البدء", "صِف ما تريد تعلّمه بكلماتك."),
            ("منظمة من أجلك", "مراحل ومستويات ومهام بترتيب منطقي يناسب حجم الموضوع."),
            ("هادئة بطبيعتها", "تقدّم تشعر به، دون ضجيج أو ضغط."),
        ],
        "how_title": "من جملة واحدة إلى خطة مذاكرة",
        "how_lead": "أنت تحدد الموضوع، ورحلة المذاكرة تنظّمه وتساعدك على التركيز وتجعل تقدّمك مرئيًا.",
        "steps": [
            ("صِف ما تريد تعلّمه", "اكتبه كما تقوله. ويمكنك إضافة موعد مستهدف أو الوقت المتاح لك يوميًا."),
            ("احصل على رحلة منظمة", "يحدد الذكاء الاصطناعي مدى تعقيد الموضوع وأفضل ترتيب لتعلّمه، ثم يبني المراحل والمستويات والمهام مع الأهداف وتقدير الوقت."),
            ("ذاكر مهمة واحدة في كل مرة", "يعرض وضع التركيز المهمة وأهدافها ومؤقتًا هادئًا ومكانًا لملاحظاتك فقط."),
            ("شاهد تقدّمك ينمو", "اكسب النقاط، وافتح المستوى التالي، وحافظ على سلسلة يومية هادئة، واجمع إنجازات صغيرة."),
        ],
        "example_label": "أنت تكتب",
        "example_quote": "«أريد أن أذاكر الضفيرة العضدية بما في ذلك التشريح، الفروع، العلاقات، والتطبيقات السريرية.»",
        "example_chips": ["45 دقيقة يوميًا", "الامتحان بعد 3 أسابيع"],
        "example_quest": "الضفيرة العضدية",
        "example_progress": "مكتمل 40٪",
        "stage_word": "المرحلة",
        "stages": [
            ("1", "الأساسيات", [
                ("done", "1", "التنظيم الأساسي", "مكتمل", [("فهم الجذور الشوكية", "20 د", True), ("تعلّم الجذوع", "20 د", True), ("فهم الأقسام", "15 د", True)]),
                ("current", "2", "البنية التشريحية", "قيد التقدم", [("فهم الحبال", "25 د", True), ("تعلّم الفروع الطرفية", "30 د", False), ("مراجعة العلاقات التشريحية", "25 د", False)]),
            ]),
            ("2", "التشريح السريري", [
                ("locked", "3", "التطبيقات السريرية", "يُفتح بعد المستوى 2", [("فهم الإصابات الشائعة", "30 د", False), ("مراجعة الأعراض السريرية", "25 د", False), ("حل حالات سريرية", "40 د", False)]),
            ]),
        ],
        "features_title": "كل ما يحتاجه المتعلّم المركّز — ولا شيء أكثر",
        "features_lead": "تحفيز يشجّعك دون أن يشتّتك.",
        "features": [
            ("sparkles", "مخطط مذاكرة بالذكاء الاصطناعي", "يحوّل أي موضوع إلى مراحل ومستويات ومهام بأهداف وتقدير للوقت وترتيب منطقي. عدّله أو أعد إنشاءه متى شئت."),
            ("map", "رحلة مرئية", "خريطة مستويات هادئة بمحطات مرقّمة، والمستويات المغلقة توضّح بالضبط ما يفتحها."),
            ("timer", "وضع التركيز", "صفحة خالية من المشتتات فيها مؤقت وإيقاف مؤقت واستئناف وأهداف وملاحظات تُحفظ تلقائيًا."),
            ("trendingUp", "النقاط والمستويات", "تمنح المهام نقاطًا حسب الجهد والصعوبة، مع مكافآت لإنهاء المستويات والمراحل والرحلات."),
            ("flame", "سلاسل هادئة", "يُحتسب اليوم عندما تُكمل مهمة. لا عقوبات — فقط تذكير لطيف بالاستمرار."),
            ("award", "الإنجازات", "محطات مثل المهمة الأولى وسلسلة 7 أيام وسيد المستويات وماراثون المذاكرة."),
            ("chart", "إحصاءات واضحة", "وقت المذاكرة يوميًا وأسبوعيًا وشهريًا، والنقاط عبر الزمن، وتقويم لأيام مذاكرتك."),
            ("languages", "العربية والإنجليزية", "واجهة عربية كاملة من اليمين إلى اليسار، وسمة فاتحة دافئة، ووضع داكن اختياري."),
        ],
        "screens_title": "نظرة من الداخل",
        "screens_lead": "شاشات حقيقية من رحلة المذاكرة.",
        "screens": [
            ("ar-dashboard", "اعرف دائمًا ما الخطوة التالية", "تبدأ اللوحة بمهمتك التالية، وبجانبها مستواك وسلسلتك وأهداف اليوم.", ["المهمة التالية بلمسة واحدة", "أهداف يومية ونشاط أسبوعي", "كل رحلاتك النشطة في نظرة"], "لوحة رحلة المذاكرة"),
            ("ar-journey", "شاهد المسار كاملًا", "كل رحلة مسار من المراحل والمستويات. المحطات المكتملة تمتلئ، والتالية تنتظرك بوضوح.", ["المستويات تُفتح بالترتيب", "تقدّم لكل مستوى ومرحلة", "افتح مبكرًا أو تخطَّ بعد التأكيد"], "خريطة رحلة بمستويات مكتملة وقادمة"),
            ("ar-planner", "عدّل الخطة قبل أن تبدأ", "راجع الخطة المقترحة، وأعد تسمية ما تشاء، وأعد ترتيب المستويات، وأضف مهامًا أو غيّر تقدير الوقت.", ["عدّل كل شيء قبل البدء", "أعد الإنشاء مع ملاحظاتك", "يبقى ما أنجزته دائمًا"], "معاينة مخطط المذاكرة بخطة قابلة للتعديل"),
            ("ar-focus", "ذاكر دون مشتتات", "مهمة واحدة وأهدافها ومؤقت هادئ وملاحظاتك. لا شيء آخر ينافس على انتباهك.", ["مؤقت أو ساعة إيقاف مع إيقاف واستئناف", "الملاحظات تُحفظ أثناء الكتابة", "أنهِ وانتقل مباشرة إلى المهمة التالية"], "وضع التركيز مع مؤقت وملاحظات"),
            ("ar-achievements", "إنجازات هادئة", "تحتفي الإنجازات بالتقدّم الحقيقي — وتوضّح كم تبقّى على الإنجاز التالي.", ["16 إنجازًا لتجمعها", "تقدّم نحو كل إنجاز لم يتحقق بعد", "مكافآت دون نوافذ صاخبة"], "صفحة الإنجازات"),
        ],
        "mobile_title": "مصممة للهاتف أيضًا",
        "mobile_text": "تصميم خاص بالشاشات الصغيرة، والتنقل في متناول إبهامك — هنا بالعربية مع الوضع الداكن.",
        "mobile_points": ["أزرار مريحة للمس", "واجهة عربية من اليمين إلى اليسار", "فاتح أو داكن، حسب اختيارك"],
        "mobile_alt": "رحلة المذاكرة على الهاتف بالعربية مع الوضع الداكن",
        "who_title": "لمن هي",
        "who": [
            ("graduation", "طلاب الجامعة", "حوّل موضوعًا من المنهج إلى خطة يمكنك الالتزام بها فعلًا."),
            ("stethoscope", "طلاب الطب", "تقدّم في الموضوعات الكثيفة من التشريح حتى التطبيق السريري."),
            ("microscope", "الباحثون", "تعلّم منهجًا أو مجالًا جديدًا خطوة بخطوة وبجدولك الخاص."),
            ("book", "محبو التعلّم", "استكشف أي شيء يثير فضولك، جلسة هادئة تلو الأخرى."),
        ],
        "calm_title": "هادئة بطبيعتها",
        "calm_lead": "صُممت لتكون مريحة لساعات من المذاكرة.",
        "calm_yes_title": "ما ستجده",
        "calm_yes": ["ألوان دافئة وهادئة ومساحات واسعة", "تقدّم واضح في كل مستوى", "انتقالات ناعمة وخفيفة", "تذكيرات لطيفة لا تُلحّ"],
        "calm_no_title": "ما لن تجده",
        "calm_no": ["ألوان نيون أو تدرجات صاخبة", "نوافذ نقاط وامضة وشخصيات كرتونية", "لوحات مزدحمة", "عقوبات على انقطاع السلسلة"],
        "closing_title": "كل موضوع، خطوة هادئة في كل مرة.",
        "closing_text": "تساعدك رحلة المذاكرة على معرفة أين أنت، وماذا أنجزت، وما الخطوة التالية — وكم قطعت من الطريق.",
        "footer": "طريقة هادئة ومنظمة للمذاكرة.",
        "lang_label": "اللغة",
    },
}


def esc(s: str) -> str:
    return html.escape(s, quote=True)


def render(lang: str) -> str:
    c = COPY[lang]
    other_lang, other_path, other_name = c["other"]
    url = SITE_URL + c["path"]
    nav = "".join(f'<a href="{h}">{esc(t)}</a>' for h, t in c["nav"])
    principles = "".join(
        f'<div class="principle reveal"><span class="num">{i + 1}</span><div><h3>{esc(t)}</h3><p>{esc(d)}</p></div></div>'
        for i, (t, d) in enumerate(c["principles"])
    )
    steps = "".join(
        f'<li class="step reveal"><span class="badge">{i + 1}</span><h3>{esc(t)}</h3><p>{esc(d)}</p></li>'
        for i, (t, d) in enumerate(c["steps"])
    )
    stages = ""
    for num, title, levels in c["stages"]:
        items = ""
        for state, n, ltitle, label, missions in levels:
            node = icon("check") if state == "done" else icon("lock") if state == "locked" else n
            ms = "".join(
                f'<li class="{"ok" if ok else ""}"><span>{esc(m)}</span><small>{esc(t)}</small></li>' for m, t, ok in missions
            )
            items += (
                f'<li class="level {state}"><span class="node">{node}</span><div>'
                f'<h4>{esc(ltitle)}<span class="state">{esc(label)}</span></h4><ul class="missions">{ms}</ul></div></li>'
            )
        stages += f'<div class="stage"><div class="stage-title">{esc(c["stage_word"])} {num} <b>{esc(title)}</b></div><ol class="levels">{items}</ol></div>'
    chips = "".join(f'<span class="chip">{esc(x)}</span>' for x in c["example_chips"])
    features = "".join(
        f'<article class="feature reveal"><span class="icon">{icon(i)}</span><h3>{esc(t)}</h3><p>{esc(d)}</p></article>'
        for i, t, d in c["features"]
    )
    screens = ""
    for idx, (img, title, text, points, alt) in enumerate(c["screens"]):
        lis = "".join(f"<li>{icon('check')}<span>{esc(p)}</span></li>" for p in points)
        screens += (
            f'<div class="screen{" flip" if idx % 2 else ""} reveal">'
            f'<figure class="shot frame" style="margin:0"><div class="chrome" aria-hidden="true"><span></span><span></span><span></span></div>'
            f'<img src="/assets/screens/{img}.webp" width="1600" height="1000" loading="lazy" decoding="async" alt="{esc(alt)}"></figure>'
            f'<div><h3>{esc(title)}</h3><p>{esc(text)}</p><ul>{lis}</ul></div></div>'
        )
    mobile_lis = "".join(f"<li>{icon('check')}<span>{esc(p)}</span></li>" for p in c["mobile_points"])
    screens += (
        f'<div class="screen mobile reveal"><figure class="phone" style="margin-block:0">'
        f'<img src="/assets/screens/mobile-ar-dark.webp" width="560" height="1212" loading="lazy" decoding="async" alt="{esc(c["mobile_alt"])}"></figure>'
        f'<div><h3>{esc(c["mobile_title"])}</h3><p>{esc(c["mobile_text"])}</p><ul>{mobile_lis}</ul></div></div>'
    )
    who = "".join(
        f'<div class="who reveal"><span class="icon">{icon(i)}</span><div><h3>{esc(t)}</h3><p>{esc(d)}</p></div></div>'
        for i, t, d in c["who"]
    )
    calm_yes = "".join(f"<li>{esc(x)}</li>" for x in c["calm_yes"])
    calm_no = "".join(f"<li>{esc(x)}</li>" for x in c["calm_no"])
    hero_img = "ar-dashboard" if lang == "ar" else "dashboard"
    fa_t, fa_s = c["float_a"]
    fb_t, fb_s = c["float_b"]

    return f"""<!doctype html>
<html lang="{lang}" dir="{c['dir']}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(c['title'])}</title>
<meta name="description" content="{esc(c['description'])}">
<link rel="canonical" href="{url}">
<link rel="alternate" hreflang="en" href="{SITE_URL}/">
<link rel="alternate" hreflang="ar" href="{SITE_URL}/ar/">
<link rel="alternate" hreflang="x-default" href="{SITE_URL}/">
<meta name="theme-color" content="#f8f7f2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#191b18" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="website">
<meta property="og:title" content="{esc(c['title'])}">
<meta property="og:description" content="{esc(c['description'])}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE_URL}/assets/og-image.png">
<meta property="og:locale" content="{'ar_AR' if lang == 'ar' else 'en_US'}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/{'ibm-plex-sans-arabic-arabic-400-normal' if lang == 'ar' else 'inter-latin-wght-normal'}.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
<a class="skip" href="#main">{esc(c['skip'])}</a>
<header class="site-header">
  <div class="container bar">
    <a class="brand" href="{c['path']}">{LOGO}<span>{esc(c['brand'])}</span></a>
    <nav class="nav" aria-label="{esc(c['brand'])}">{nav}</nav>
    <a class="lang" href="{other_path}" hreflang="{other_lang}" lang="{other_lang}" aria-label="{esc(c['lang_label'])}: {esc(other_name)}">{icon('languages')}{esc(other_name)}</a>
  </div>
</header>

<main id="main">
  <section class="hero">
    <div class="container">
      <span class="eyebrow">{esc(c['eyebrow'])}</span>
      <h1 class="display">{esc(c['h1'])}</h1>
      <p class="lead">{esc(c['lead'])}</p>
      <div class="actions">
        <a class="btn btn-primary" href="#how">{esc(c['cta1'])}{icon('arrowRight', 'flip')}</a>
        <a class="btn btn-secondary" href="#screens">{esc(c['cta2'])}</a>
      </div>
      <div class="hero-figure">
        <figure class="frame" style="margin:0">
          <div class="chrome" aria-hidden="true"><span></span><span></span><span></span></div>
          <img src="/assets/screens/{hero_img}.webp" width="1600" height="1000" fetchpriority="high" alt="{esc(c['hero_alt'])}">
        </figure>
        <div class="float-card float-a" aria-hidden="true"><span class="dot">{icon('check')}</span><span><strong>{esc(fa_t)}</strong><small>{esc(fa_s)}</small></span></div>
        <div class="float-card float-b" aria-hidden="true"><span class="dot" style="background:var(--honey);color:var(--honey-strong)">{icon('flame')}</span><span><strong>{esc(fb_t)}</strong><small>{esc(fb_s)}</small></span></div>
      </div>
      <div class="principles">{principles}</div>
    </div>
  </section>

  <section class="block band" id="how">
    <div class="container">
      <div class="section-head reveal"><h2 class="section-title">{esc(c['how_title'])}</h2><p class="lead">{esc(c['how_lead'])}</p></div>
      <ol class="steps">{steps}</ol>
      <div class="example" style="margin-top:56px">
        <div class="request reveal">
          <div class="label">{esc(c['example_label'])}</div>
          <blockquote>{esc(c['example_quote'])}</blockquote>
          <div class="meta">{chips}</div>
        </div>
        <div class="arrow-down" aria-hidden="true">{icon('arrowRight')}</div>
        <div class="journey reveal">
          <div class="quest"><h3>{esc(c['example_quest'])}</h3><span class="muted" style="font-size:14px">{esc(c['example_progress'])}</span></div>
          <div class="progress" aria-hidden="true"><span></span></div>
          {stages}
        </div>
      </div>
    </div>
  </section>

  <section class="block" id="features">
    <div class="container">
      <div class="section-head reveal"><h2 class="section-title">{esc(c['features_title'])}</h2><p class="lead">{esc(c['features_lead'])}</p></div>
      <div class="features">{features}</div>
    </div>
  </section>

  <section class="block band" id="screens">
    <div class="container">
      <div class="section-head reveal"><h2 class="section-title">{esc(c['screens_title'])}</h2><p class="lead">{esc(c['screens_lead'])}</p></div>
      <div class="screens">{screens}</div>
    </div>
  </section>

  <section class="block" id="who">
    <div class="container">
      <div class="section-head reveal"><h2 class="section-title">{esc(c['who_title'])}</h2></div>
      <div class="audience">{who}</div>
      <div class="section-head reveal" style="margin-top:96px"><h2 class="section-title">{esc(c['calm_title'])}</h2><p class="lead">{esc(c['calm_lead'])}</p></div>
      <div class="calm">
        <div class="calm-card reveal"><h3>{esc(c['calm_yes_title'])}</h3><ul>{calm_yes}</ul></div>
        <div class="calm-card no reveal"><h3>{esc(c['calm_no_title'])}</h3><ul>{calm_no}</ul></div>
      </div>
    </div>
  </section>

  <section class="closing band">
    <div class="container reveal">
      <h2 class="display">{esc(c['closing_title'])}</h2>
      <p class="lead">{esc(c['closing_text'])}</p>
      <div class="path" aria-hidden="true"><i></i><b></b><i></i><b></b><i class="open"></i><b class="dash"></b><i class="open"></i></div>
    </div>
  </section>
</main>

<footer class="site-footer">
  <div class="container row">
    <span class="brand">{LOGO}<span>{esc(c['brand'])}</span></span>
    <span>{esc(c['footer'])}</span>
    <a class="lang" href="{other_path}" hreflang="{other_lang}" lang="{other_lang}">{icon('languages')}{esc(other_name)}</a>
  </div>
</footer>

<script>
(function () {{
  if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var vh = window.innerHeight;
  var io = new IntersectionObserver(function (entries) {{
    entries.forEach(function (en) {{ if (en.isIntersecting) {{ en.target.classList.remove("pending"); io.unobserve(en.target); }} }});
  }}, {{ rootMargin: "0px 0px -6% 0px" }});
  document.querySelectorAll(".reveal").forEach(function (e) {{
    if (e.getBoundingClientRect().top > vh) {{ e.classList.add("pending"); io.observe(e); }}
  }});
  window.addEventListener("beforeprint", function () {{
    document.querySelectorAll(".reveal.pending").forEach(function (e) {{ e.classList.remove("pending"); }});
  }});
}})();
</script>
</body>
</html>
"""


def main() -> None:
    (ROOT / "index.html").write_text(render("en"), encoding="utf-8")
    (ROOT / "ar").mkdir(exist_ok=True)
    (ROOT / "ar" / "index.html").write_text(render("ar"), encoding="utf-8")
    print("built index.html and ar/index.html")


if __name__ == "__main__":
    main()
