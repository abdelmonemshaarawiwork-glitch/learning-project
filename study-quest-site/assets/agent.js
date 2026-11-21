/* Study Quest — private study planner (client). No dependencies.
 * All model text is inserted with textContent (never innerHTML). */
(function () {
  "use strict";
  var T = JSON.parse(document.getElementById("agent-i18n").textContent);
  var LOCALE = document.documentElement.lang === "ar" ? "ar" : "en";
  var PW_KEY = "sq_agent_pw";
  var CHAT_KEY = "sq_agent_chat";
  var JOB_KEY = "sq_agent_job";
  var $ = function (id) { return document.getElementById(id); };

  var state = { password: null, chatId: null, chat: null, busy: false, provider: "sample" };

  // ---------- storage helpers (never fatal) ----------
  function loadPw() {
    try { return localStorage.getItem(PW_KEY) || sessionStorage.getItem(PW_KEY); } catch (e) { return null; }
  }
  function savePw(pw, remember) {
    try {
      localStorage.removeItem(PW_KEY); sessionStorage.removeItem(PW_KEY);
      (remember ? localStorage : sessionStorage).setItem(PW_KEY, pw);
    } catch (e) { /* storage unavailable: stays in memory */ }
  }
  function clearPw() { try { localStorage.removeItem(PW_KEY); sessionStorage.removeItem(PW_KEY); } catch (e) {} }
  function setLastChat(id) { try { id ? localStorage.setItem(CHAT_KEY, id) : localStorage.removeItem(CHAT_KEY); } catch (e) {} }
  function getLastChat() { try { return localStorage.getItem(CHAT_KEY); } catch (e) { return null; } }
  function setPendingJob(j) { try { j ? localStorage.setItem(JOB_KEY, JSON.stringify(j)) : localStorage.removeItem(JOB_KEY); } catch (e) {} }
  function getPendingJob() { try { return JSON.parse(localStorage.getItem(JOB_KEY) || "null"); } catch (e) { return null; } }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) {
      e.textContent = text;
      e.setAttribute("dir", "auto"); // Arabic text inside the English page (and vice versa) reads correctly
    }
    return e;
  }
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }
  function errText(code) { return T.errors[code] || T.errors.server_error; }
  function fmtMinutes(m) {
    var h = Math.floor(m / 60), r = m % 60;
    if (!h) return m + " " + T.units.min;
    return r ? h + " " + T.units.h + " " + r + " " + T.units.min : h + " " + T.units.h;
  }

  // ---------- API ----------
  function api(path, opts) {
    opts = opts || {};
    var headers = { "x-agent-password": state.password || "" };
    if (opts.body) headers["content-type"] = "application/json";
    return fetch(path, { method: opts.method || "GET", headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: "no-store" })
      .then(function (r) {
        return r.text().then(function (txt) {
          var data = null;
          try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
          return { status: r.status, data: data };
        });
      }, function () { return { status: 0, data: { error: "network" } }; });
  }

  // ---------- lock screen ----------
  function showLock(message) {
    $("workspace").hidden = true;
    $("lock").hidden = false;
    $("lock-error").textContent = message || "";
    $("pw").value = "";
    setTimeout(function () { $("pw").focus(); }, 30);
  }
  function unlock(pw, remember, silent) {
    state.password = pw;
    var btn = $("unlock-btn");
    btn.disabled = true;
    return api("/api/agent/auth", { method: "POST", body: {} }).then(function (r) {
      btn.disabled = false;
      if (r.status === 200) {
        if (!silent) savePw(pw, remember);
        state.provider = (r.data && r.data.provider) || "sample";
        openWorkspace();
        return;
      }
      clearPw();
      state.password = null;
      showLock(errText((r.data && r.data.error) || (r.status === 0 ? "network" : "server_error")));
    });
  }

  // ---------- workspace ----------
  function openWorkspace() {
    $("lock").hidden = true;
    $("workspace").hidden = false;
    $("ai-notice").hidden = state.provider !== "sample";
    refreshHistory();
    var pending = getPendingJob();
    var last = getLastChat();
    if (pending && Date.now() - pending.started < 15 * 60 * 1000) {
      // A turn was in progress when the page was closed. If it has finished since,
      // just show the conversation; otherwise show it and keep waiting.
      api("/api/agent/status?id=" + encodeURIComponent(pending.jobId)).then(function (r) {
        var finished = r.status === 200 && r.data && (r.data.state === "done" || r.data.state === "error");
        if (finished) {
          setPendingJob(null);
          setLastChat(pending.chatId);
          loadChat(pending.chatId);
        } else {
          loadChat(pending.chatId, function () { track(pending); });
        }
      });
    } else {
      setPendingJob(null);
      if (last) loadChat(last); else renderAll();
    }
    setTimeout(function () { $("prompt").focus(); }, 30);
  }

  function refreshHistory() {
    api("/api/agent/chats").then(function (r) {
      var sel = $("history");
      while (sel.options.length > 1) sel.remove(1);
      var chats = (r.data && r.data.chats) || [];
      chats.forEach(function (c) {
        var o = el("option", null, (c.title || T.untitled) + (typeof c.progress === "number" ? " — " + c.progress + "%" : ""));
        o.value = c.id;
        sel.appendChild(o);
      });
      sel.value = state.chatId && chats.some(function (c) { return c.id === state.chatId; }) ? state.chatId : "";
      sel.disabled = chats.length === 0;
    });
  }

  function loadChat(id, then) {
    api("/api/agent/chats/" + encodeURIComponent(id)).then(function (r) {
      if (r.status === 200 && r.data) {
        state.chatId = r.data.id;
        state.chat = r.data;
        setLastChat(r.data.id);
      } else {
        state.chatId = null; state.chat = null; setLastChat(null);
      }
      renderAll();
      refreshHistory();
      if (then) then();
    });
  }

  function newChat() {
    if (state.busy) return;
    state.chatId = null; state.chat = null; setLastChat(null);
    $("history").value = "";
    renderAll();
    $("prompt").focus();
  }

  // ---------- rendering ----------
  function renderAll() {
    renderMessages();
    renderPlan(state.chat && state.chat.plan, false);
    var first = !state.chat || !state.chat.turns || state.chat.turns.length === 0;
    $("first-opts").hidden = !first;
    $("suggestions").hidden = first || !(state.chat && state.chat.plan);
    $("delete-chat").hidden = !state.chatId;
  }

  function renderMessages(extraUser, working) {
    var box = $("messages");
    box.textContent = "";
    var turns = (state.chat && state.chat.turns) || [];
    if (!turns.length && !extraUser) {
      var intro = el("div", "intro");
      intro.appendChild(el("h2", null, T.introTitle));
      intro.appendChild(el("p", null, T.introBody));
      var chips = el("div", "chips");
      T.examples.forEach(function (ex) {
        var b = el("button", "chip", ex);
        b.type = "button";
        b.addEventListener("click", function () { $("prompt").value = ex; $("prompt").focus(); });
        chips.appendChild(b);
      });
      intro.appendChild(chips);
      box.appendChild(intro);
    }
    turns.forEach(function (t) {
      var m = el("div", "msg " + t.role, t.text);
      if (t.role === "assistant" && t.planChanged) m.appendChild(el("span", "tag", T.planUpdated));
      box.appendChild(m);
    });
    if (extraUser) box.appendChild(el("div", "msg user", extraUser));
    if (working) {
      var w = el("div", "msg assistant working");
      w.appendChild(el("span", "spinner"));
      w.appendChild(el("span", null, working));
      w.id = "working";
      box.appendChild(w);
    }
    box.scrollTop = box.scrollHeight;
    var pane = $("chat-pane");
    if (pane.getBoundingClientRect().bottom > window.innerHeight && (extraUser || working)) {
      box.lastChild && box.lastChild.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function planToText(p) {
    var lines = [p.title, "", p.summary];
    if (p.pacing) lines.push("", T.pacing + ": " + p.pacing);
    var n = 0;
    p.stages.forEach(function (s, si) {
      lines.push("", T.stage + " " + (si + 1) + " — " + s.title);
      s.levels.forEach(function (l) {
        n++;
        lines.push("  " + T.level + " " + n + ": " + l.title);
        l.objectives.forEach(function (o) { lines.push("    • " + o); });
        l.missions.forEach(function (m) { lines.push("    - " + m.title + " (" + T.activity[m.activity] + ", " + fmtMinutes(m.minutes) + ", " + T.difficulty[m.difficulty] + ")"); });
      });
    });
    return lines.join("\n");
  }


  // ---------- journey (ticking missions) ----------
  function mKey(title) { return String(title).trim().toLowerCase().replace(/\s+/g, " ").slice(0, 160); }
  var DIFF = { easy: 1, medium: 1.25, hard: 1.5 };
  function missionXp(m) { return Math.round((8 + Math.min(120, Math.max(5, m.minutes)) * 0.6) * (DIFF[m.difficulty] || 1)); }
  function localDay(ts) { var d = new Date(ts); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function streakDays(done) {
    var days = {};
    Object.keys(done).forEach(function (k) { days[localDay(done[k])] = true; });
    var d = new Date(), n = 0;
    if (!days[localDay(d.getTime())]) d.setDate(d.getDate() - 1);
    while (days[localDay(d.getTime())]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function journeyModel(plan, done) {
    var levels = [];
    plan.stages.forEach(function (s, si) { s.levels.forEach(function (l) { levels.push({ stage: si, level: l }); }); });
    var current = -1;
    levels.forEach(function (x, i) {
      x.doneCount = x.level.missions.filter(function (m) { return done[mKey(m.title)]; }).length;
      x.complete = x.level.missions.length > 0 && x.doneCount === x.level.missions.length;
      if (!x.complete && current === -1) current = i;
    });
    levels.forEach(function (x, i) {
      x.state = x.complete ? "done" : i === current ? "current" : x.doneCount > 0 ? "current" : "locked";
      x.index = i;
    });
    return { levels: levels, current: current };
  }

  var journeyFlash = null; // message shown once after finishing a level

  function tick(m, makeDone) {
    var chat = state.chat;
    if (!chat || !chat.journey) return;
    var key = mKey(m.title);
    var before = journeyModel(chat.plan, chat.journey.done);
    var prev = chat.journey.done[key];
    if (makeDone) chat.journey.done[key] = Date.now(); else delete chat.journey.done[key];
    var after = journeyModel(chat.plan, chat.journey.done);
    if (makeDone) {
      after.levels.forEach(function (x, i) {
        if (x.complete && !before.levels[i].complete) {
          journeyFlash = after.current === -1 ? T.journeyDone : T.levelDone.replace("{n}", i + 1) + (after.current >= 0 ? " · " + T.nextUnlocked.replace("{n}", after.current + 1) : "");
        }
      });
    }
    renderPlan(chat.plan, false);
    api("/api/agent/chats/" + encodeURIComponent(state.chatId) + "/journey", { method: "POST", body: { action: "tick", title: m.title, done: makeDone } }).then(function (r) {
      if (r.status === 200) { refreshHistory(); return; }
      if (prev) chat.journey.done[key] = prev; else delete chat.journey.done[key];
      journeyFlash = null;
      renderPlan(chat.plan, false);
      $("plan").insertBefore(el("p", "error", T.saveError), $("plan").firstChild);
    });
  }

  function journeyCall(action) {
    return api("/api/agent/chats/" + encodeURIComponent(state.chatId) + "/journey", { method: "POST", body: { action: action } }).then(function (r) {
      if (r.status === 200 && r.data) {
        state.chat.journey = r.data.journey;
        renderPlan(state.chat.plan, false);
        refreshHistory();
      } else {
        $("plan").insertBefore(el("p", "error", T.saveError), $("plan").firstChild);
      }
    });
  }

  function renderJourney(plan, wrap) {
    var done = state.chat.journey.done;
    var model = journeyModel(plan, done);
    var all = model.levels.reduce(function (a, x) { return a + x.level.missions.length; }, 0);
    var finished = model.levels.reduce(function (a, x) { return a + x.doneCount; }, 0);
    var pct = all ? Math.round((finished / all) * 100) : 0;
    var xp = 0, minutes = 0;
    model.levels.forEach(function (x) {
      x.level.missions.forEach(function (m) { if (done[mKey(m.title)]) { xp += missionXp(m); minutes += m.minutes; } });
      if (x.complete) xp += 40;
    });

    if (journeyFlash) {
      wrap.appendChild(el("div", "flash", journeyFlash));
      journeyFlash = null;
    }
    var prog = el("div", "journey-progress");
    var top = el("div", "jp-top");
    top.appendChild(el("strong", null, pct + "%"));
    top.appendChild(el("span", null, T.journeyProgress.replace("{done}", finished).replace("{total}", all)));
    prog.appendChild(top);
    var bar = el("div", "progress");
    var fill = el("span");
    fill.style.width = pct + "%";
    bar.appendChild(fill);
    prog.appendChild(bar);
    var stats = el("div", "plan-stats");
    stats.appendChild(el("span", "chip", T.xp.replace("{n}", xp)));
    var sd = streakDays(done);
    stats.appendChild(el("span", "chip", sd > 0 ? T.streak.replace("{n}", sd) : T.streakNone));
    stats.appendChild(el("span", "chip", T.doneTime.replace("{time}", fmtMinutes(minutes))));
    prog.appendChild(stats);
    wrap.appendChild(prog);

    if (model.current === -1) {
      wrap.appendChild(el("div", "flash done", T.journeyDone));
    } else {
      var next = model.levels[model.current].level.missions.filter(function (m) { return !done[mKey(m.title)]; })[0];
      if (next) {
        var nx = el("div", "next-up");
        nx.appendChild(el("small", null, T.nextMission + " · " + T.level + " " + (model.current + 1)));
        nx.appendChild(el("b", null, next.title));
        wrap.appendChild(nx);
      }
    }

    plan.stages.forEach(function (s, si) {
      var st = el("section", "p-stage");
      var title = el("div", "stage-title", T.stage + " " + (si + 1) + " ");
      title.appendChild(el("b", null, s.title));
      st.appendChild(title);
      var ol = el("ol", "levels");
      model.levels.filter(function (x) { return x.stage === si; }).forEach(function (x) {
        var li = el("li", "p-level j-" + x.state);
        var node = el("span", "node");
        if (x.state === "done") node.innerHTML = T.checkIcon;
        else if (x.state === "locked") node.innerHTML = T.lockIcon;
        else node.textContent = String(x.index + 1);
        li.appendChild(node);
        var body = el("div");
        var h = el("h3", null, x.level.title);
        h.appendChild(el("span", "jstate", x.state === "done" ? T.stateDone : x.state === "current" ? T.stateCurrent : T.stateLocked));
        body.appendChild(h);
        if (x.state === "locked") body.appendChild(el("p", "locked-hint", T.lockedHint.replace("{n}", model.current + 1)));
        var ms = el("ul", "missions jm");
        x.level.missions.forEach(function (m) {
          var isDone = !!done[mKey(m.title)];
          var row = el("li", isDone ? "is-done" : "");
          var b = el("button", "tick");
          b.type = "button";
          b.setAttribute("role", "checkbox");
          b.setAttribute("aria-checked", String(isDone));
          b.setAttribute("aria-label", (isDone ? T.markUndone : T.markDone) + ": " + m.title);
          b.disabled = x.state === "locked";
          var box = el("span", "box");
          if (isDone) box.innerHTML = T.checkIcon;
          b.appendChild(box);
          var txt = el("span", "t");
          txt.appendChild(el("span", null, m.title));
          txt.appendChild(el("small", null, T.activity[m.activity] + " · " + fmtMinutes(m.minutes) + " · " + T.difficulty[m.difficulty] + " · +" + missionXp(m) + " XP"));
          b.appendChild(txt);
          b.addEventListener("click", function () { tick(m, !isDone); });
          row.appendChild(b);
          ms.appendChild(row);
        });
        body.appendChild(ms);
        li.appendChild(body);
        ol.appendChild(li);
      });
      st.appendChild(ol);
      wrap.appendChild(st);
    });
  }

  function renderPlan(plan, isPreview) {
    var pane = $("plan");
    pane.textContent = "";
    if (!plan || !plan.stages || !plan.stages.length) {
      var empty = el("div", "plan-empty");
      empty.innerHTML = T.mapIcon; // static icon markup from the page, not model output
      empty.appendChild(el("p", null, isPreview ? T.writingPlan : T.planEmpty));
      pane.appendChild(empty);
      return;
    }
    var wrap = el("div", isPreview ? "preview" : "fade-in");
    var head = el("div", "plan-head");
    head.appendChild(el("h2", null, plan.title || (isPreview ? T.writingPlan : "")));
    if (!isPreview && plan.summary) head.appendChild(el("p", null, plan.summary));
    wrap.appendChild(head);

    if (!isPreview) {
      var missions = 0, minutes = 0, levels = 0;
      plan.stages.forEach(function (s) { s.levels.forEach(function (l) { levels++; l.missions.forEach(function (m) { missions++; minutes += m.minutes; }); }); });
      var stats = el("div", "plan-stats");
      [T.count.stages.replace("{n}", plan.stages.length), T.count.levels.replace("{n}", levels), T.count.missions.replace("{n}", missions), fmtMinutes(minutes)].forEach(function (s) { stats.appendChild(el("span", "chip", s)); });
      wrap.appendChild(stats);
      var actions = el("div", "plan-actions");
      var copy = el("button", "btn btn-secondary btn-sm", T.copy);
      copy.type = "button";
      copy.addEventListener("click", function () {
        var txt = planToText(plan);
        (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () {
          copy.textContent = T.copied; setTimeout(function () { copy.textContent = T.copy; }, 1600);
        }, function () { window.prompt(T.copy, txt); });
      });
      var print = el("button", "btn btn-ghost btn-sm", T.print);
      print.type = "button";
      print.addEventListener("click", function () { window.print(); });
      var journeyOn = !!(state.chat && state.chat.journey && state.chat.plan === plan);
      if (!journeyOn && state.chatId) {
        var start = el("button", "btn btn-primary btn-sm", T.startJourney);
        start.type = "button";
        start.id = "start-journey";
        start.addEventListener("click", function () { start.disabled = true; journeyCall("start"); });
        actions.appendChild(start);
      }
      actions.appendChild(copy); actions.appendChild(print);
      if (journeyOn) {
        var reset = el("button", "btn btn-ghost btn-sm", T.reset);
        reset.type = "button";
        reset.addEventListener("click", function () { if (window.confirm(T.resetConfirm)) journeyCall("reset"); });
        actions.appendChild(reset);
      }
      wrap.appendChild(actions);
      if (!journeyOn && state.chatId) wrap.appendChild(el("p", "start-hint", T.startHint));
      if (journeyOn) {
        renderJourney(plan, wrap);
        pane.appendChild(wrap);
        return;
      }
      if (plan.pacing) {
        var pacing = el("div", "pacing");
        pacing.appendChild(el("b", null, T.pacing));
        pacing.appendChild(document.createTextNode(plan.pacing));
        wrap.appendChild(pacing);
      }
    }

    var n = 0;
    plan.stages.forEach(function (s, si) {
      var st = el("section", "p-stage");
      var title = el("div", "stage-title", T.stage + " " + (si + 1) + " ");
      title.appendChild(el("b", null, s.title));
      st.appendChild(title);
      var ol = el("ol", "levels");
      (s.levels || []).forEach(function (l) {
        n++;
        var li = el("li", "p-level");
        li.appendChild(el("span", "node", String(n)));
        var body = el("div");
        body.appendChild(el("h3", null, isPreview ? l : l.title));
        if (!isPreview) {
          if (l.objectives && l.objectives.length) {
            var ul = el("ul", "objectives");
            l.objectives.forEach(function (o) { ul.appendChild(el("li", null, o)); });
            body.appendChild(ul);
          }
          var ms = el("ul", "missions");
          l.missions.forEach(function (m) {
            var row = el("li");
            row.appendChild(el("span", null, m.title));
            row.appendChild(el("small", null, T.activity[m.activity] + " · " + fmtMinutes(m.minutes) + " · " + T.difficulty[m.difficulty]));
            ms.appendChild(row);
          });
          body.appendChild(ms);
        }
        li.appendChild(body);
        ol.appendChild(li);
      });
      st.appendChild(ol);
      wrap.appendChild(st);
    });
    pane.appendChild(wrap);
  }

  // ---------- sending a turn ----------
  function send(text) {
    text = (text || "").trim();
    if (!text || state.busy) return;
    state.busy = true;
    var isFirst = !state.chat || !state.chat.turns || !state.chat.turns.length;
    var chatId = state.chatId || uid();
    var jobId = uid();
    var body = { jobId: jobId, chatId: chatId, message: text, locale: LOCALE };
    if (isFirst) {
      var mins = Number($("minutes").value);
      if (mins) body.minutesPerDay = mins;
      if ($("deadline").value) body.deadline = $("deadline").value;
    }
    $("prompt").value = "";
    var job = { jobId: jobId, chatId: chatId, text: text, started: Date.now(), hadChat: !isFirst };
    setPendingJob(job);
    track(job, body);
  }

  /** Start (when body is given) and/or follow a running turn until it finishes. */
  function track(job, body) {
    state.busy = true;
    $("send-btn").disabled = true;
    var workingText = function () { return T.working.replace("{s}", Math.round((Date.now() - job.started) / 1000)); };
    renderMessages(job.text, workingText());
    var misses = 0;

    if (body) {
      api("/api/agent/run", { method: "POST", body: body }).then(function (r) {
        if (r.status !== 202 && r.status !== 200) return finish((r.data && r.data.error) || "server_error");
        poll();
      });
    } else {
      poll();
    }

    function poll() {
      setTimeout(function () {
        api("/api/agent/status?id=" + encodeURIComponent(job.jobId)).then(function (r) {
          var w = document.getElementById("working");
          if (w && w.lastChild) w.lastChild.textContent = workingText();
          if (r.status === 404) {
            misses++;
            return misses > 20 ? finish("not_started") : poll();
          }
          if (r.status === 401 || r.status === 429) {
            setPendingJob(null); clearPw(); state.busy = false; $("send-btn").disabled = false;
            return showLock(errText(r.data && r.data.error));
          }
          if (r.status !== 200 || !r.data) {
            misses++;
            return misses > 20 ? finish("network") : poll();
          }
          var j = r.data;
          if (j.state === "running") {
            if (j.preview && j.preview.stages && j.preview.stages.length) {
              renderPlan({ title: j.preview.title, stages: j.preview.stages.map(function (s) { return { title: s.title, levels: s.levels }; }) }, true);
            }
            if (Date.now() - job.started > 15 * 60 * 1000) return finish("timeout");
            return poll();
          }
          if (j.state === "error") return finish(j.code);
          if (j.state === "done") return finish(null);
          poll();
        });
      }, 1500);
    }

    function finish(error) {
      state.busy = false;
      setPendingJob(null);
      $("send-btn").disabled = false;
      if (error) {
        renderMessages();
        renderPlan(state.chat && state.chat.plan, false);
        $("messages").appendChild(el("p", "error", errText(error)));
        if (!$("prompt").value) $("prompt").value = job.text;
        return;
      }
      setLastChat(job.chatId);
      loadChat(job.chatId);
    }
  }

  // ---------- wire up ----------
  $("lock-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var pw = $("pw").value;
    if (!pw) { $("lock-error").textContent = T.errors.wrong_password; return; }
    unlock(pw, $("remember").checked, false);
  });
  $("composer").addEventListener("submit", function (e) { e.preventDefault(); send($("prompt").value); });
  $("prompt").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send($("prompt").value); }
  });
  $("new-chat").addEventListener("click", newChat);
  $("lock-btn").addEventListener("click", function () { clearPw(); state.password = null; state.chat = null; state.chatId = null; showLock(""); });
  $("history").addEventListener("change", function (e) { if (e.target.value && !state.busy) loadChat(e.target.value); });
  $("delete-chat").addEventListener("click", function () {
    if (!state.chatId || state.busy || !window.confirm(T.deleteConfirm)) return;
    api("/api/agent/chats/" + encodeURIComponent(state.chatId), { method: "DELETE" }).then(function () { newChat(); refreshHistory(); });
  });
  Array.prototype.forEach.call(document.querySelectorAll("#suggestions .chip"), function (b) {
    b.addEventListener("click", function () { send(b.textContent); });
  });

  var saved = loadPw();
  if (saved) unlock(saved, true, true); else showLock("");
})();
