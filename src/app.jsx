import React, { useState, useMemo, useEffect } from "react";
import { saveState, saveSync, clearSync } from "./storage.js";
import { canNotify, setDailyReminder, setTaskAlarm, cancelTaskAlarm, setCheckIns } from "./notify.js";
import { canWidget, pushWidgetData, pullPendingDone } from "./widget.js";

// ============ LIBRARY (see tasks.js) ============
const RAW = window.TASK_LIBRARY;

const LIB_CATS = Object.keys(RAW);
const LIB = [];
Object.keys(RAW).forEach((cat) =>
  RAW[cat].forEach(([name, cadence, opps, effort, energy]) =>
    LIB.push({ id: `${cat}:${name}`, name, cat, cadence, opps, effort, energy })
  )
);
const LIB_BY_ID = Object.fromEntries(LIB.map((t) => [t.id, t]));

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dateOf = (day) => new Date(2026, 0, 1 + day);
const todayIndex = () => { const n = new Date(); return Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(2026, 0, 1)) / 864e5); };
const fmt = (day) => { const d = dateOf(day); return `${DAYS[d.getDay()]} ${d.getDate()} ${d.toLocaleString("en-GB", { month: "short" })}`; };
const weekStart = (d) => d - ((dateOf(d).getDay() + 6) % 7);
const nextMonday = (d) => d + ((8 - dateOf(d).getDay()) % 7 || 7);

const STARTER = window.STARTER_TASKS;

const seedState = () => {
  const active = {};
  const today = todayIndex();
  STARTER.forEach((id, i) => {
    const t = LIB_BY_ID[id];
    if (!t) return;
    const frac = ((i * 37) % 100) / 100;
    active[id] = { lastDone: today - Math.round(t.cadence * (0.4 + frac * 1.2)), history: [] };
  });
  return { active, overrides: {}, custom: {}, points: 0, skipped: { day: today, ids: [] }, hiddenLib: [] };
};

const urgencyWord = (u) => (u < 0.6 ? "fresh" : u < 1 ? "coming up" : u < 1.6 ? "ready" : u < 2.5 ? "been a while" : "long time");
// snooze entries are { until, at } (timestamped so deletions survive sync merges); bare numbers are legacy
const snUntil = (v) => (typeof v === "number" ? v : (v && v.until) || 0);
const snAt = (v) => (typeof v === "number" ? 0 : (v && v.at) || 0);
// state equality ignoring the sync timestamp — used to avoid pointless writes and churn loops
const sameCore = (x, y) => JSON.stringify({ ...x, updatedAt: 0 }) === JSON.stringify({ ...y, updatedAt: 0 });

// Merge two saved states so a device that was offline can't lose its day.
// Histories are unioned; simple fields (settings, hidden lists, points) favour the newer state.
const mergeStates = (a, b) => {
  const newer = (a.updatedAt || 0) >= (b.updatedAt || 0) ? a : b;
  const older = newer === a ? b : a;
  const removed = { ...(older.removed || {}), ...(newer.removed || {}) };
  const active = {};
  new Set([...Object.keys(a.active || {}), ...Object.keys(b.active || {})]).forEach((id) => {
    const ra = (a.active || {})[id], rb = (b.active || {})[id];
    if (ra && rb) {
      const history = [...new Set([...(ra.history || []), ...(rb.history || [])])].sort((x, y) => x - y);
      const rec = { ...rb, ...ra, lastDone: Math.max(ra.lastDone, rb.lastDone), history };
      const added = Math.min(ra.added ?? Infinity, rb.added ?? Infinity);
      if (added !== Infinity) rec.added = added;
      active[id] = rec;
    } else if (!(id in removed)) active[id] = ra || rb;
  });
  Object.keys(active).forEach((id) => delete removed[id]);
  const custom = { ...(older.custom || {}), ...(newer.custom || {}) };
  Object.keys(custom).forEach((id) => { if (custom[id].once && !active[id]) delete custom[id]; });
  const seen = new Set();
  const doneOnce = [...(a.doneOnce || []), ...(b.doneOnce || [])]
    .filter((x) => { const k = x.name + "|" + x.day; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((x, y) => x.day - y.day).slice(-50);
  // snoozes: per-id, the most recent write wins (an unsnooze writes {until: 0}, so "bring back" sticks)
  const snoozed = {};
  for (const src of [a.snoozed, b.snoozed]) for (const [id, v] of Object.entries(src || {})) {
    if (!(id in snoozed) || snAt(v) > snAt(snoozed[id])) snoozed[id] = v;
  }
  // day-scoped skips/pins: the later day always wins; same day: skips union (additive),
  // pins follow the newer state so an unpin sticks
  const dayScoped = (key, unionSameDay) => {
    const na = a[key], nb = b[key];
    if (!na || !nb) return na || nb;
    if (na.day !== nb.day) return na.day > nb.day ? na : nb;
    if (!unionSameDay) return newer[key] ?? na;
    return { day: na.day, ids: [...new Set([...(na.ids || []), ...(nb.ids || [])])] };
  };
  // learning logs: union, capped
  const unionLog = (key, cap) => {
    const out = {};
    for (const src of [older[key], newer[key]]) for (const [id, arr] of Object.entries(src || {})) {
      const set = new Map((out[id] || []).map((e) => [JSON.stringify(e), e]));
      for (const e of arr) set.set(JSON.stringify(e), e);
      out[id] = [...set.values()].sort((x, y) => (Array.isArray(x) ? x[0] : x) - (Array.isArray(y) ? y[0] : y)).slice(-cap);
    }
    return out;
  };
  return {
    ...older, ...newer, active, custom, removed,
    overrides: { ...(older.overrides || {}), ...(newer.overrides || {}) },
    points: Math.max(a.points || 0, b.points || 0), doneOnce,
    snoozed, skipped: dayScoped("skipped", true), pinned: dayScoped("pinned", false),
    tlog: unionLog("tlog", 40), skiplog: unionLog("skiplog", 20),
  };
};

// ============ APP ============
export default function DailyPicker({ initial, initialSync }) {
  const [st, setSt] = useState(() => initial || seedState());
  const [day, setDay] = useState(todayIndex);
  const [newCat, setNewCat] = useState("");
  const [sync, setSync] = useState(initialSync || {});
  const [syncStatus, setSyncStatus] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [mins, setMins] = useState(60);
  const [energy, setEnergy] = useState(2);
  const [tab, setTab] = useState("today");
  const [byCat, setByCat] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [moreAnyway, setMoreAnyway] = useState(false); // "show more anyway" past today's budget
  const [qa, setQa] = useState(""); // quick-add / search box on Today
  const [mineFilter, setMineFilter] = useState("");
  const [open, setOpen] = useState(null); // task id in detail view
  const [libFilter, setLibFilter] = useState("");
  const [libCat, setLibCat] = useState("All");

  // save on every change; re-check the date whenever the app comes back to the front
  useEffect(() => { saveState(st); }, [st]);
  const setStamped = (fn) => setSt((s) => ({ ...(typeof fn === "function" ? fn(s) : fn), updatedAt: Date.now() }));

  // ---- gist sync ----
  const gh = (path, opts = {}) => fetch("https://api.github.com" + path, { ...opts, headers: { Authorization: "Bearer " + sync.token, Accept: "application/vnd.github+json", "Content-Type": "application/json", ...(opts.headers || {}) } });
  const authFailed = (status) => status === 401 || status === 403;
  const [syncBroken, setSyncBroken] = useState(false); // token rejected — surfaced on the Today tab
  const pullFromGist = async (cfg) => {
    const r = await fetch("https://api.github.com/gists/" + cfg.gistId, { headers: { Authorization: "Bearer " + cfg.token, Accept: "application/vnd.github+json" } });
    if (!r.ok) { const e = new Error("gist read failed " + r.status); e.status = r.status; throw e; }
    const j = await r.json(); const f = j.files["today.json"]; if (!f) return null;
    const txt = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
    return JSON.parse(txt);
  };
  // a local state that has never been touched should adopt the cloud wholesale (new phone),
  // instead of merging the starter seed into real history
  const isPristine = (s) => !s.updatedAt && (s.points || 0) === 0 && Object.values(s.active || {}).every((r) => !(r.history || []).length) && !(s.doneOnce || []).length;
  const syncFailMsg = (e) => { if (authFailed(e.status)) { setSyncBroken(true); return "token rejected — make a new one (Settings)"; } return "offline / sync error"; };
  // after a merge brings in a completion from another device, its local alarm is stale
  const cancelAlarmsDoneElsewhere = (merged) => {
    Object.entries(merged.alarms || {}).forEach(([id, a]) => {
      if ((merged.active?.[id]?.history || []).includes(day) || !(id in (merged.active || {}))) {
        cancelTaskAlarm(a.uuid); delete merged.alarms[id];
      }
    });
    return merged;
  };
  const lastPullRef = React.useRef(0);
  const pullInFlight = React.useRef(false);
  const pullAndMerge = async (label) => {
    if (!sync.token || !sync.gistId || pullInFlight.current) return;
    pullInFlight.current = true;
    lastPullRef.current = Date.now();
    try {
      setSyncStatus(label || "checking…");
      const remote = await pullFromGist(sync);
      if (remote) {
        // functional update: merge against the state as it is NOW, not as it was
        // before the network round-trip — otherwise concurrent taps are wiped
        setSt((s) => {
          const next = isPristine(s) ? { ...remote } : cancelAlarmsDoneElsewhere(mergeStates(s, remote));
          return sameCore(next, s) ? s : { ...next, updatedAt: Date.now() };
        });
        setSyncStatus("synced"); setSyncBroken(false);
      } else setSyncStatus("up to date");
    } catch (e) { setSyncStatus(syncFailMsg(e)); }
    finally { pullInFlight.current = false; }
  };
  useEffect(() => { pullAndMerge(); }, [sync.gistId]);
  // re-pull when the app comes back to the foreground (webview lives for days on iOS)
  useEffect(() => {
    const onWake = () => { if (document.visibilityState !== "hidden" && Date.now() - lastPullRef.current > 5 * 60 * 1000) pullAndMerge(); };
    document.addEventListener("visibilitychange", onWake); window.addEventListener("focus", onWake);
    return () => { document.removeEventListener("visibilitychange", onWake); window.removeEventListener("focus", onWake); };
  });
  useEffect(() => {
    if (!sync.token || !sync.gistId || !st.updatedAt) return;
    const id = setTimeout(async () => {
      try {
        setSyncStatus("saving…");
        // merge the remote in before writing, so a stale device never clobbers newer work
        let body = st;
        try {
          const remote = await pullFromGist(sync);
          if (remote && !sameCore(remote, st)) body = cancelAlarmsDoneElsewhere(mergeStates(st, remote));
        } catch (e) { /* pull failed — push local as-is */ }
        const r = await gh("/gists/" + sync.gistId, { method: "PATCH", body: JSON.stringify({ files: { "today.json": { content: JSON.stringify(body) } } }) });
        if (r.ok) { setSyncStatus("saved to cloud " + new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })); setSyncBroken(false); }
        else { setSyncStatus(authFailed(r.status) ? "token rejected — make a new one (Settings)" : "save failed " + r.status); if (authFailed(r.status)) setSyncBroken(true); }
        // fold the merged remote back in functionally — never replace state that moved during the fetch
        if (body !== st) setSt((s) => {
          const next = s === st ? body : cancelAlarmsDoneElsewhere(mergeStates(s, body));
          return sameCore(next, s) ? s : { ...next, updatedAt: Date.now() };
        });
      } catch (e) { setSyncStatus("offline — will retry"); }
    }, 2500);
    return () => clearTimeout(id);
  }, [st]);
  const connectGist = async () => {
    const token = tokenInput.trim(); if (!token) return;
    try {
      setSyncStatus("connecting…");
      // look for an existing Today gist first
      const list = await fetch("https://api.github.com/gists?per_page=100", { headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" } });
      if (!list.ok) throw new Error("token rejected " + list.status);
      const gists = await list.json();
      let g = gists.find((x) => x.files && x.files["today.json"]);
      if (!g) {
        const r = await fetch("https://api.github.com/gists", { method: "POST", headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "Content-Type": "application/json" }, body: JSON.stringify({ description: "Today app data", public: false, files: { "today.json": { content: JSON.stringify({ ...st, updatedAt: Date.now() }) } } }) });
        if (!r.ok) throw new Error("could not create gist " + r.status);
        g = await r.json();
      }
      const cfg = { token, gistId: g.id };
      saveSync(cfg); setSync(cfg); setTokenInput("");
    } catch (e) { setSyncStatus(String(e.message || e)); }
  };
  const disconnectGist = () => { clearSync(); setSync({}); setSyncStatus(""); };
  const syncNow = () => pullAndMerge("syncing…");

  // ---- export / import ----
  const exportData = () => {
    const blob = new Blob([JSON.stringify(st, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "today-backup-" + new Date().toISOString().slice(0, 10) + ".json"; document.body.appendChild(a); a.click(); a.remove();
  };
  const importData = (file) => {
    const rd = new FileReader();
    rd.onload = () => { try { const j = JSON.parse(rd.result); if (!j.active) throw new Error(); if (window.confirm("Replace everything in the app with this backup?")) setStamped(j); } catch (e) { window.alert("That doesn't look like a Today backup."); } };
    rd.readAsText(file);
  };
  const addCategory = () => { const n = newCat.trim(); if (!n || CATS.includes(n)) return; setStamped((s) => ({ ...s, customCats: [...(s.customCats || []), n] })); setNewCat(""); };
  const hideCat = (c) => setStamped((s) => ({ ...s, hiddenCats: [...(s.hiddenCats || []), c] }));
  const unhideCat = (c) => setStamped((s) => ({ ...s, hiddenCats: (s.hiddenCats || []).filter((x) => x !== c) }));
  const deleteCustomCat = (c) => { if (!window.confirm(`Delete category "${c}"? Tasks in it move to Admin.`)) return;
    setStamped((s) => { const ov = { ...s.overrides }; const cu = { ...s.custom };
      Object.keys(cu).forEach((id) => { if (cu[id].cat === c) cu[id] = { ...cu[id], cat: "Admin" }; });
      Object.keys(ov).forEach((id) => { if (ov[id].cat === c) ov[id] = { ...ov[id], cat: "Admin" }; });
      return { ...s, customCats: (s.customCats || []).filter((x) => x !== c), overrides: ov, custom: cu }; }); };
  const createLibTask = (cat) => {
    const id = `custom:${Date.now()}`;
    setStamped((s) => ({ ...s, custom: { ...s.custom, [id]: { id, name: "", cat, cadence: 7, opps: null, effort: 15, energy: 1 } } }));
    setOpen(id);
  };
  useEffect(() => {
    const tick = () => setDay(todayIndex());
    document.addEventListener("visibilitychange", tick); window.addEventListener("focus", tick);
    const iv = setInterval(tick, 60000);
    return () => { document.removeEventListener("visibilitychange", tick); window.removeEventListener("focus", tick); clearInterval(iv); };
  }, []);
  useEffect(() => { setMoreAnyway(false); }, [day]); // budget escape hatch resets at rollover

  const { active, overrides, custom, points } = st;
  const hiddenLib = st.hiddenLib || [];
  const hiddenCats = st.hiddenCats || [];
  const customCats = st.customCats || [];
  const CATS = [...LIB_CATS.filter((c) => !hiddenCats.includes(c)), ...customCats, "One-off"];
  const skipped = st.skipped && st.skipped.day === day ? st.skipped.ids : [];
  const snoozed = st.snoozed || {};
  const pinnedIds = st.pinned && st.pinned.day === day ? st.pinned.ids : [];
  const holiday = st.holiday || null;
  const uDay = holiday ? Math.min(day, holiday.since) : day; // on a break, urgency clocks freeze
  const doneToday = Object.keys(active).filter((id) => (active[id].history || []).includes(day));
  const weekday = dateOf(day).getDay();

  // merged task definitions (library + custom, with edits applied)
  const taskOf = (id) => {
    const base = LIB_BY_ID[id] || custom[id];
    return base ? { ...base, ...(overrides[id] || {}) } : null;
  };
  const allDefs = useMemo(() => [...LIB.map((t) => t.id), ...Object.keys(custom)].map(taskOf), [overrides, custom]);
  const activeTasks = useMemo(
    () => Object.keys(active).map((id) => { const t = taskOf(id); return t && { ...t, u: t.once ? 1.2 + (uDay - (active[id].added ?? active[id].lastDone)) / 7 : (uDay - active[id].lastDone) / t.cadence }; }).filter(Boolean),
    [active, overrides, custom, uDay]
  );

  const surfaced = activeTasks.filter((t) => (t.opps === null || t.opps.includes(weekday)) && !doneToday.includes(t.id) && !skipped.includes(t.id) && !(snUntil(snoozed[t.id]) > day));

  // effort already completed today draws down the time budget, so a day can actually finish
  const spentToday = doneToday.reduce((a, id) => { const t = taskOf(id); return a + (t ? t.effort : 0); }, 0)
    + (st.doneOnce || []).filter((x) => x.day === day).reduce((a, x) => a + (x.effort || 0), 0);

  // learned time-of-day fit: fraction of this task's logged completions within ±2h of now
  const tlog = st.tlog || {};
  const nowMin = (() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); })();
  const timeFit = (id) => {
    const logs = tlog[id] || [];
    if (logs.length < 4) return 0;
    const near = logs.filter(([, m]) => Math.abs(m - nowMin) <= 120 || Math.abs(m - nowMin) >= 1320).length;
    return near / logs.length;
  };

  const picks = useMemo(() => {
    const pinnedTasks = surfaced.filter((t) => pinnedIds.includes(t.id));
    const rest = surfaced.filter((t) => !pinnedIds.includes(t.id)).map((t) => ({ ...t, fit: timeFit(t.id) }));
    // non-negotiables that are due go first and ignore the energy filter — they don't slip
    const keystones = rest.filter((t) => t.keystone && t.u >= 1).sort((a, b) => b.u - a.u);
    const sorted = rest.filter((t) => !keystones.includes(t))
      .sort((a, b) => (b.u * (1 + 0.15 * b.fit)) - (a.u * (1 + 0.15 * a.fit)));
    const out = [...pinnedTasks];
    const budget = moreAnyway ? mins : Math.max(0, mins - spentToday);
    let left = Math.max(0, budget - pinnedTasks.reduce((a, t) => a + t.effort, 0));
    for (const t of keystones) {
      if (out.length >= 8 || t.effort > left) continue;
      out.push(t); left -= t.effort;
    }
    for (const t of sorted) {
      if (out.length >= 8) break;
      const okEnergy = t.energy <= energy || (t.energy === energy + 1 && t.u > 1.5);
      if (okEnergy && t.effort <= left) { out.push(t); left -= t.effort; }
    }
    return out;
  }, [surfaced, mins, energy, pinnedIds, spentToday, moreAnyway, nowMin]);
  const pickIds = new Set(picks.map((t) => t.id));
  const others = surfaced.filter((t) => !pickIds.has(t.id)).sort((a, b) => b.u - a.u);

  // keep the home-screen widgets in step with today's picks + this week (native only)
  useEffect(() => {
    if (!canWidget) return;
    const ws = weekStart(day);
    const perDay = Array(7).fill(0); const catCounts = {};
    Object.keys(active).forEach((id) => { const t = taskOf(id); if (!t) return;
      (active[id].history || []).forEach((d) => { if (d >= ws && d <= ws + 6) { perDay[d - ws]++; catCounts[t.cat] = (catCounts[t.cat] || 0) + 1; } }); });
    (st.doneOnce || []).forEach((x) => { if (x.day >= ws && x.day <= ws + 6) { perDay[x.day - ws]++; catCounts["One-off"] = (catCounts["One-off"] || 0) + 1; } });
    pushWidgetData({
      date: `${DAYS[weekday]} ${dateOf(day).getDate()} ${dateOf(day).toLocaleString("en-GB", { month: "long" })}`,
      day,
      items: picks.map((t) => ({ id: t.id, name: t.name || "(untitled)", cat: t.cat, effort: t.effort, u: urgencyWord(t.u) })),
      week: {
        days: perDay, todayIdx: day - ws, total: perDay.reduce((a, b) => a + b, 0),
        cats: Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, n]) => ({ name, n })),
      },
    });
  }, [picks, day, active]);
  const hidden = activeTasks.filter((t) => t.opps !== null && !t.opps.includes(weekday));

  const mineMatch = (t) => { const f = mineFilter.trim().toLowerCase(); return !f || t.name.toLowerCase().includes(f) || t.cat.toLowerCase().includes(f); };
  // quick-add search: tracked tasks first, then untracked library matches; name or category
  const searchMatches = useMemo(() => {
    const f = qa.trim().toLowerCase(); if (!f) return [];
    const match = (t) => t && !t.once && (t.name.toLowerCase().includes(f) || t.cat.toLowerCase().includes(f)) && !hiddenLib.includes(t.id);
    const tracked = activeTasks.filter((t) => match(t)).map((t) => ({ t, tracked: true }));
    const activeIds = new Set(Object.keys(active));
    const lib = allDefs.filter((t) => match(t) && !activeIds.has(t.id)).map((t) => ({ t, tracked: false }));
    return [...tracked, ...lib].slice(0, 6);
  }, [qa, activeTasks, allDefs, hiddenLib, active]);

  // ---- actions ----
  const done = (t) => {
    const priorAlarm = st.alarms?.[t.id]; if (priorAlarm) cancelTaskAlarm(priorAlarm.uuid);
    const n = new Date(); const minute = n.getHours() * 60 + n.getMinutes();
    setStamped((s) => {
      if (!t.once && (s.active[t.id]?.history || []).includes(day)) return s; // already done today
      const alarms = { ...(s.alarms || {}) }; delete alarms[t.id];
      const tl = { ...(s.tlog || {}) };
      tl[t.id] = [...(tl[t.id] || []), [day, minute]].slice(-40);
      const pts = s.points + Math.max(5, Math.round(t.effort / 3)) + (t.u > 1.5 ? 5 : 0);
      if (t.once) {
        const a = { ...s.active }; delete a[t.id];
        const c = { ...s.custom }; delete c[t.id];
        return { ...s, active: a, custom: c, alarms, tlog: tl, removed: { ...(s.removed || {}), [t.id]: day }, points: pts, doneOnce: [...(s.doneOnce || []), { name: t.name, day, effort: t.effort }].slice(-50) };
      }
      return { ...s, active: { ...s.active, [t.id]: { ...s.active[t.id], lastDone: day, history: [...(s.active[t.id]?.history || []), day] } }, alarms, tlog: tl, points: pts };
    });
  };
  const undo = (t) => {
    setStamped((s) => {
      const h = (s.active[t.id]?.history || []).filter((d) => d !== day);
      return { ...s, active: { ...s.active, [t.id]: { lastDone: h.length ? h[h.length - 1] : day - t.cadence, history: h } } };
    });
  };
  const logSkip = (s, id) => ({ ...(s.skiplog || {}), [id]: [...((s.skiplog || {})[id] || []), day].slice(-20) });
  const skip = (t) => setStamped((s) => ({ ...s, skipped: { day, ids: [...(s.skipped?.day === day ? s.skipped.ids : []), t.id] }, skiplog: logSkip(s, t.id), pinned: s.pinned?.day === day ? { day, ids: s.pinned.ids.filter((x) => x !== t.id) } : s.pinned }));
  const skipWeek = (t) => setStamped((s) => ({
    ...s,
    snoozed: { ...Object.fromEntries(Object.entries(s.snoozed || {}).filter(([, v]) => snUntil(v) > day)), [t.id]: { until: nextMonday(day), at: Date.now() } },
    skiplog: logSkip(s, t.id),
    pinned: s.pinned?.day === day ? { day, ids: s.pinned.ids.filter((x) => x !== t.id) } : s.pinned,
  }));
  const unsnooze = (id) => setStamped((s) => ({ ...s, snoozed: { ...(s.snoozed || {}), [id]: { until: 0, at: Date.now() } } }));
  const pin = (t) => setStamped((s) => { const ids = s.pinned?.day === day ? s.pinned.ids : [];
    return { ...s, pinned: { day, ids: ids.includes(t.id) ? ids.filter((x) => x !== t.id) : [...ids, t.id] } }; });
  const setReminderTo = async (h, styleArg) => {
    const style = styleArg ?? st.reminderStyle ?? "gentle";
    const ok = await setDailyReminder(h, style);
    if (ok) setStamped((s) => ({ ...s, reminder: h, reminderStyle: style }));
  };
  const setCheckInsTo = async (n) => { const ok = await setCheckIns(n); if (ok) setStamped((s) => ({ ...s, checkIns: n })); };
  const setTaskAlarmFor = async (t, timeStr) => {
    const [h, m] = timeStr.split(":").map(Number);
    const uuid = st.alarms?.[t.id]?.uuid || crypto.randomUUID();
    const ok = await setTaskAlarm(uuid, h, m, t.name || "Task");
    if (ok) setStamped((s) => ({ ...s, alarms: { ...(s.alarms || {}), [t.id]: { t: timeStr, uuid } } }));
    return ok;
  };
  const clearTaskAlarmFor = (t) => {
    const a = st.alarms?.[t.id]; if (a) cancelTaskAlarm(a.uuid);
    setStamped((s) => { const al = { ...(s.alarms || {}) }; delete al[t.id]; return { ...s, alarms: al }; });
  };
  const startHoliday = () => {
    if (canNotify) { // silence everything for the break; settings are kept and restored on return
      setDailyReminder(null, st.reminderStyle);
      setCheckIns(0);
      Object.values(st.alarms || {}).forEach((a) => cancelTaskAlarm(a.uuid));
    }
    setStamped((s) => ({ ...s, holiday: { since: day }, alarms: {} }));
  };
  const endHoliday = () => {
    if (canNotify) {
      if (st.reminder != null) setDailyReminder(st.reminder, st.reminderStyle ?? "gentle");
      if (st.checkIns) setCheckIns(st.checkIns);
    }
    setStamped((s) => {
      const gap = day - s.holiday.since; const a = {};
      Object.entries(s.active).forEach(([id, r]) => { a[id] = { ...r, lastDone: Math.min(day, r.lastDone + gap), ...(r.added != null ? { added: Math.min(day, r.added + gap) } : {}) }; });
      return { ...s, active: a, holiday: null };
    });
  };
  const add = (t) => setStamped((s) => { const removed = { ...(s.removed || {}) }; delete removed[t.id];
    return { ...s, removed, active: { ...s.active, [t.id]: { lastDone: day - Math.round(t.cadence * 0.5), history: [] } } }; });
  const remove = (t) => setStamped((s) => { const a = { ...s.active }; delete a[t.id]; return { ...s, active: a, removed: { ...(s.removed || {}), [t.id]: day } }; });
  const edit = (id, patch) => setStamped((s) => ({ ...s, overrides: { ...s.overrides, [id]: { ...(s.overrides[id] || {}), ...patch } } }));
  const createOneOffNamed = (name) => {
    const id = `custom:${Date.now()}`;
    setStamped((s) => ({
      ...s,
      custom: { ...s.custom, [id]: { id, name, cat: "One-off", cadence: 7, opps: null, effort: 15, energy: 1, once: true } },
      active: { ...s.active, [id]: { lastDone: day - 3, added: day, history: [] } },
      // pinned so it is visibly in today's list even when the budget is already spent
      pinned: { day, ids: [...(s.pinned?.day === day ? s.pinned.ids : []), id] },
    }));
    setQa("");
  };
  const createCustom = (once) => {
    const id = `custom:${Date.now()}`;
    setStamped((s) => ({
      ...s,
      custom: { ...s.custom, [id]: once
        ? { id, name: "", cat: "One-off", cadence: 7, opps: null, effort: 15, energy: 1, once: true }
        : { id, name: "", cat: "Admin", cadence: 7, opps: null, effort: 15, energy: 1 } },
      active: { ...s.active, [id]: { lastDone: day - 3, added: day, history: [] } },
    }));
    setOpen(id);
  };
  const hideLib = (t) => setStamped((s) => ({ ...s, hiddenLib: [...(s.hiddenLib || []), t.id] }));
  const unhideLib = (t) => setStamped((s) => ({ ...s, hiddenLib: (s.hiddenLib || []).filter((x) => x !== t.id) }));
  const deleteCustom = (t) => setStamped((s) => { const c = { ...s.custom }; delete c[t.id]; const a = { ...s.active }; delete a[t.id]; return { ...s, custom: c, active: a, removed: { ...(s.removed || {}), [t.id]: day } }; });
  const reset = () => { if (window.confirm("Reset everything to the starter set?")) setStamped(seedState()); };

  // apply Done taps made on the home-screen widget. Everything reads from the
  // reducer's own state (never the render closure), is deduped, and is
  // idempotent per day — so late or repeated drains can't double-count, and a
  // drain during unmount/remount still applies (the queue was already cleared natively).
  const applyWidgetDone = (rawIds) => {
    const ids = [...new Set(rawIds)];
    const dayNow = todayIndex();
    const n = new Date(); const minute = n.getHours() * 60 + n.getMinutes();
    const toCancel = [];
    setStamped((s) => {
      let next = s;
      for (const id of ids) {
        const rec = next.active?.[id]; if (!rec) continue;
        const base = LIB_BY_ID[id] || next.custom?.[id];
        const t = base ? { ...base, ...(next.overrides?.[id] || {}) } : null;
        if (!t) continue;
        if (!t.once && (rec.history || []).includes(dayNow)) continue;
        const alarms = { ...(next.alarms || {}) };
        if (alarms[id]) { toCancel.push(alarms[id].uuid); delete alarms[id]; }
        const tl = { ...(next.tlog || {}) }; tl[id] = [...(tl[id] || []), [dayNow, minute]].slice(-40);
        const pts = next.points + Math.max(5, Math.round(t.effort / 3));
        if (t.once) {
          const a = { ...next.active }; delete a[id];
          const c = { ...next.custom }; delete c[id];
          next = { ...next, active: a, custom: c, alarms, tlog: tl, removed: { ...(next.removed || {}), [id]: dayNow }, points: pts, doneOnce: [...(next.doneOnce || []), { name: t.name, day: dayNow, effort: t.effort }].slice(-50) };
        } else {
          next = { ...next, active: { ...next.active, [id]: { ...rec, lastDone: dayNow, history: [...(rec.history || []), dayNow] } }, alarms, tlog: tl, points: pts };
        }
      }
      return next;
    });
    toCancel.forEach((u) => cancelTaskAlarm(u));
  };
  useEffect(() => {
    if (!canWidget) return;
    const drain = async () => { const ids = await pullPendingDone(); if (ids.length) applyWidgetDone(ids); };
    drain();
    document.addEventListener("visibilitychange", drain); window.addEventListener("focus", drain);
    return () => { document.removeEventListener("visibilitychange", drain); window.removeEventListener("focus", drain); };
  }, []);

  const level = Math.floor(points / 100) + 1;
  const openTask = open ? taskOf(open) : null;

  return (
    <div style={S.page}>
      <div style={S.phone}>
        <div style={S.header}>
          <div>
            <div style={S.dateBig}>{DAYS[weekday]}</div>
            <div style={S.dateSmall}>{dateOf(day).getDate()} {dateOf(day).toLocaleString("en-GB", { month: "long" })}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={S.level}>Level {level}</div>
            <div style={S.dateSmall}>{points % 100} / 100</div>
            <div style={S.xpTrack}><div style={{ ...S.xpFill, width: `${points % 100}%` }} /></div>
          </div>
        </div>

        <div style={S.tabs}>
          {[["today", "Today"], ["all", `Mine (${activeTasks.length})`], ["week", "Week"], ["lib", "Library"], ["set", "⚙"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ ...S.tab, ...(tab === k ? S.tabOn : {}) }}>{l}</button>
          ))}
        </div>

        {tab === "today" && (
          <>
            {holiday && (
              <div style={{ ...S.nudge, marginBottom: 12 }}>On a break since {fmt(holiday.since)} — nothing is piling up while you're away.
                <button style={{ ...S.linkBtn, marginLeft: 6 }} onClick={endHoliday}>I'm back</button>
              </div>
            )}
            {syncBroken && (
              <div style={{ ...S.hiddenNote, marginBottom: 10, marginTop: 0 }}>Sync has stopped — the token was rejected. Make a new one and reconnect in ⚙.</div>
            )}
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input style={{ ...S.search, marginBottom: 0, flex: 1 }} placeholder="Add a one-off, or search everything…" value={qa}
                onChange={(e) => setQa(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && qa.trim()) { createOneOffNamed(qa.trim()); } }} />
              <button style={S.addBtnSm} onClick={() => qa.trim() ? createOneOffNamed(qa.trim()) : createCustom(true)}>Add</button>
            </div>
            {qa.trim() && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ ...S.allRow, cursor: "pointer" }} onClick={() => createOneOffNamed(qa.trim())}>
                  <div style={{ flex: 1 }}>New one-off “{qa.trim()}”<div style={S.meta}>added straight to today</div></div>
                  <button style={S.addBtnSm}>Add</button>
                </div>
                {searchMatches.map(({ t, tracked }) => (
                  <div key={t.id} style={S.allRow}>
                    <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setOpen(t.id)}>
                      <div>{t.name}</div>
                      <div style={S.meta}>{t.cat} · {t.effort} min{tracked ? " · tracking" : " · in library"}</div>
                    </div>
                    {tracked
                      ? <button style={S.addBtnSm} onClick={() => { pin(t); setQa(""); }}>pin today</button>
                      : <button style={S.addBtnSm} onClick={() => { add(t); pin(t); setQa(""); }}>add for today</button>}
                  </div>
                ))}
              </div>
            )}
            <div style={S.controls}>
              <div style={S.ctlRow}><span style={S.ctlLabel}>Time</span>
                {[15, 30, 60, 120, 240].map((m) => <Chip key={m} on={mins === m} onClick={() => setMins(m)}>{m < 60 ? `${m}m` : `${m / 60}h`}</Chip>)}
              </div>
              <div style={S.ctlRow}><span style={S.ctlLabel}>Energy</span>
                {[[1, "Low"], [2, "OK"], [3, "Good"]].map(([e, l]) => <Chip key={e} on={energy === e} onClick={() => setEnergy(e)}>{l}</Chip>)}
              </div>
              <div style={S.ctlRow}><span style={S.ctlLabel}>View</span>
                <Chip on={!byCat} onClick={() => setByCat(false)}>By urgency</Chip>
                <Chip on={byCat} onClick={() => setByCat(true)}>By category</Chip>
              </div>
            </div>

            {picks.length === 0 ? (
              surfaced.length === 0 ? (
                <div style={S.empty}>Nothing left for today. Nice.</div>
              ) : spentToday >= mins && !moreAnyway ? (
                <div style={S.empty}>
                  That’s your {mins < 60 ? `${mins} minutes` : `${mins / 60} hour${mins > 60 ? "s" : ""}`} done. Anything more is a bonus.
                  <div style={{ marginTop: 10 }}><button style={S.addBtnSm} onClick={() => setMoreAnyway(true)}>show more anyway</button></div>
                </div>
              ) : (
                <div style={S.empty}>Nothing fits that time and energy. Try more time, or call it a day.</div>
              )
            ) : (
              <div>
                <div style={S.sectionTitle}>Suggested — {picks.reduce((a, t) => a + t.effort, 0)} min{spentToday > 0 ? ` · ${spentToday} min done` : ""}</div>
                {(byCat ? CATS.map((c) => [c, picks.filter((t) => t.cat === c)]).filter(([, r]) => r.length) : [[null, picks]]).map(([c, rows]) => (
                  <div key={c || "flat"}>
                    {c && <div style={S.catTitle}>{c}</div>}
                    {rows.map((t) => <TaskRow key={t.id} t={t} pinned={pinnedIds.includes(t.id)} onPin={() => pin(t)} onOpen={() => setOpen(t.id)} onDone={() => done(t)} onSkip={() => skip(t)} onSkipWeek={() => skipWeek(t)} />)}
                  </div>
                ))}
              </div>
            )}

            {doneToday.length > 0 && (
              <details style={S.details}><summary style={S.summary}>Done today ({doneToday.length})</summary>
                {doneToday.map((id) => { const t = taskOf(id); return t && (
                  <div key={id} style={{ ...S.row, opacity: 0.6 }}><span style={{ flex: 1, textDecoration: "line-through" }}>{t.name}</span>
                    <button style={S.linkBtn} onClick={() => undo(t)}>undo</button></div>); })}
              </details>
            )}
            {others.length > 0 && (
              <details style={S.details}><summary style={S.summary}>Also possible today ({others.length})</summary>
                {(byCat ? CATS.map((c) => [c, others.filter((t) => t.cat === c)]).filter(([, r]) => r.length) : [[null, others]]).map(([c, rows]) => (
                  <div key={c || "flat"}>
                    {c && <div style={S.catTitle}>{c}</div>}
                    {rows.map((t) => <TaskRow key={t.id} t={t} pinned={pinnedIds.includes(t.id)} onPin={() => pin(t)} onOpen={() => setOpen(t.id)} onDone={() => done(t)} onSkip={() => skip(t)} onSkipWeek={() => skipWeek(t)} muted />)}
                  </div>
                ))}
              </details>
            )}
            {Object.values(snoozed).filter((v) => snUntil(v) > day).length > 0 && (
              <div style={S.hiddenNote}>{Object.values(snoozed).filter((v) => snUntil(v) > day).length} snoozed until next week · <button style={S.linkBtn} onClick={() => setStamped((s) => ({ ...s, snoozed: Object.fromEntries(Object.keys(s.snoozed || {}).map((k) => [k, { until: 0, at: Date.now() }])) }))}>bring back</button></div>
            )}
            {hidden.length > 0 && (
              <div style={S.hiddenNote}>{hidden.length} waiting for another day — {hidden.slice(0, 3).map((t) => `${t.name} (${t.opps.map((d) => DAYS[d]).join("/")})`).join(", ")}{hidden.length > 3 ? "…" : ""}</div>
            )}

            <div style={S.footnote}>Tap any task name to edit it or see its history. Nothing here is ever overdue — things you don't do just come back a little higher next time they're possible.</div>
          </>
        )}

        {tab === "all" && (
          <div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={S.addBtn} onClick={() => createCustom(false)}>+ Repeating task</button>
              <button style={S.addBtn} onClick={() => createCustom(true)}>+ One-off</button>
            </div>
            <input style={{ ...S.search, marginTop: 10 }} placeholder="Search your tasks" value={mineFilter} onChange={(e) => setMineFilter(e.target.value)} />
            {activeTasks.some((t) => t.once && mineMatch(t)) && (<div><div style={S.sectionTitle}>One-offs</div>
              {activeTasks.filter((t) => t.once && mineMatch(t)).sort((a, b) => b.u - a.u).map((t) => (
                <div key={t.id} style={S.allRow}><UrgencyDot u={t.u} />
                  <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setOpen(t.id)}><div>{t.name || "(untitled)"}</div>
                    <div style={S.meta}>{t.effort} min{t.opps ? ` · ${t.opps.map((d) => DAYS[d]).join("/")}` : ""} · {urgencyWord(t.u)}</div></div>
                </div>))}
            </div>)}
            {CATS.filter((c) => c !== "One-off").map((c) => {
              const rows = activeTasks.filter((t) => t.cat === c && !t.once && mineMatch(t)).sort((a, b) => b.u - a.u);
              if (!rows.length) return null;
              return (<div key={c}><div style={S.sectionTitle}>{c}</div>
                {rows.map((t) => (
                  <div key={t.id} style={S.allRow}><UrgencyDot u={t.u} />
                    <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setOpen(t.id)}>
                      <div>{t.name}</div>
                      <div style={S.meta}>every ~{t.cadence}d{t.opps ? ` · ${t.opps.map((d) => DAYS[d]).join("/")}` : ""} · {urgencyWord(t.u)}{snUntil(snoozed[t.id]) > day ? " · snoozed" : ""} · done {active[t.id].history.length}×</div>
                    </div>
                  </div>))}
              </div>);
            })}
          </div>
        )}

        {tab === "week" && (() => {
          const ws = weekStart(day) - weekOffset * 7;
          const days7 = Array.from({ length: 7 }, (_, i) => ws + i);
          const rows = [];
          Object.keys(active).forEach((id) => { const t = taskOf(id); if (!t) return;
            (active[id].history || []).forEach((d) => { if (d >= ws && d <= ws + 6) rows.push({ d, name: t.name, cat: t.cat }); }); });
          (st.doneOnce || []).forEach((x) => { if (x.day >= ws && x.day <= ws + 6) rows.push({ d: x.day, name: x.name, cat: "One-off" }); });
          const perDay = days7.map((d) => rows.filter((r) => r.d === d).length);
          const cats = {}; rows.forEach((r) => { cats[r.cat] = (cats[r.cat] || 0) + 1; });
          const maxCat = Math.max(1, ...Object.values(cats));
          return (
            <div>
              <div style={S.ctlRow}>
                <Chip on={weekOffset === 0} onClick={() => setWeekOffset(0)}>This week</Chip>
                <Chip on={weekOffset === 1} onClick={() => setWeekOffset(1)}>Last week</Chip>
              </div>
              <div style={S.sectionTitle}>{fmt(ws)} – {fmt(ws + 6)} · {rows.length} done</div>
              <div style={{ display: "flex", gap: 6 }}>
                {days7.map((d, i) => (
                  <div key={d} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ ...S.weekCell, background: perDay[i] ? mix("#DCE6D8", "#2F6F4E", Math.min(perDay[i] / 5, 1)) : "#F0F3EE", color: perDay[i] >= 3 ? "white" : ink, opacity: d > day ? 0.4 : 1 }}>{d > day ? "" : perDay[i] || "·"}</div>
                    <div style={S.meta}>{DAYS[dateOf(d).getDay()]}</div>
                  </div>
                ))}
              </div>
              {rows.length ? (
                <div>
                  <div style={S.sectionTitle}>By category</div>
                  {Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, n]) => (
                    <div key={c} style={{ margin: "6px 0" }}>
                      <div style={{ display: "flex", fontSize: 13 }}><span style={{ flex: 1 }}>{c}</span><span style={S.meta}>{n}</span></div>
                      <div style={S.barTrack}><div style={{ ...S.xpFill, width: `${(n / maxCat) * 100}%` }} /></div>
                    </div>
                  ))}
                  <details style={S.details}><summary style={S.summary}>Everything ({rows.length})</summary>
                    {days7.map((d, i) => perDay[i] ? (
                      <div key={d}><div style={S.catTitle}>{fmt(d)}</div>
                        {rows.filter((r) => r.d === d).map((r, j) => (
                          <div key={j} style={{ ...S.allRow, borderBottom: "none", padding: "3px 0" }}>{r.name}<span style={{ ...S.meta, marginLeft: 6 }}>{r.cat}</span></div>
                        ))}
                      </div>) : null)}
                  </details>
                </div>
              ) : (
                <div style={S.empty}>{weekOffset ? "Nothing logged last week. That's allowed." : "Nothing yet this week — the week is young."}</div>
              )}
              {(() => {
                // ---- coach: what the app has quietly learned ----
                const allLogs = Object.entries(st.tlog || {}).flatMap(([id, arr]) => arr.map(([d, m]) => ({ id, d, m })));
                if (allLogs.length < 10) return null;
                const lines = [];
                const buckets = { morning: 0, afternoon: 0, evening: 0 };
                allLogs.forEach(({ m }) => { buckets[m < 720 ? "morning" : m < 1020 ? "afternoon" : "evening"]++; });
                const best = Object.entries(buckets).sort((x, y) => y[1] - x[1])[0];
                if (best[1] / allLogs.length > 0.45) lines.push(`Most things get done in the ${best[0]} — that's your window.`);
                const dow = Array(7).fill(0);
                allLogs.forEach(({ d }) => dow[dateOf(d).getDay()]++);
                const bestDow = dow.indexOf(Math.max(...dow));
                if (Math.max(...dow) >= 5) lines.push(`${["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"][bestDow]} are when you get the most done.`);
                const slipping = activeTasks.find((t) => t.keystone && !t.once && (uDay - (active[t.id]?.lastDone ?? uDay)) / t.cadence > 2);
                if (slipping) lines.push(`★ “${slipping.name}” is non-negotiable and it's slipping — give it tomorrow's first slot.`);
                const skipTotals = Object.entries(st.skiplog || {}).map(([id, arr]) => ({ id, n: arr.filter((d) => day - d <= 30).length })).sort((x, y) => y.n - x.n);
                if (skipTotals[0]?.n >= 4) { const t = taskOf(skipTotals[0].id); if (t) lines.push(t.keystone ? `★ “${t.name}” is non-negotiable but keeps getting skipped — pin it or set an alarm.` : `“${t.name}” keeps getting a “not today” — open it for gentler options.`); }
                const consistent = activeTasks.filter((t) => !t.once && (active[t.id]?.history || []).filter((d) => day - d <= 28).length >= Math.max(3, Math.floor(28 / t.cadence) * 0.8))
                  .sort((x, y) => (active[y.id]?.history || []).length - (active[x.id]?.history || []).length)[0];
                if (consistent) lines.push(`“${consistent.name}” has become a genuine habit — it basically runs itself now.`);
                if (!lines.length) return null;
                return (
                  <div style={{ ...S.nudge, marginTop: 16 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>What Today has noticed</div>
                    {lines.slice(0, 3).map((l, i) => <div key={i} style={{ marginBottom: 4 }}>{l}</div>)}
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {tab === "lib" && (
          <div>
            <input style={S.search} placeholder="Search the library" value={libFilter} onChange={(e) => setLibFilter(e.target.value)} />
            <div style={{ ...S.ctlRow, flexWrap: "wrap", marginBottom: 8 }}>
              {["All", ...CATS].map((c) => <Chip key={c} on={libCat === c} onClick={() => setLibCat(c)}>{c}</Chip>)}
            </div>
            {libFilter.trim() && (() => {
              const f = libFilter.trim().toLowerCase();
              const trackedHits = activeTasks.filter((t) => !t.once && (t.name.toLowerCase().includes(f) || t.cat.toLowerCase().includes(f)));
              if (!trackedHits.length) return null;
              return (<div><div style={S.sectionTitle}>Already tracking ({trackedHits.length})</div>
                {trackedHits.map((t) => (
                  <div key={t.id} style={{ ...S.allRow, opacity: 0.75, cursor: "pointer" }} onClick={() => setOpen(t.id)}>
                    <div style={{ flex: 1 }}>{t.name}<div style={S.meta}>{t.cat} · tap to edit</div></div>
                  </div>))}
              </div>);
            })()}
            {CATS.filter((c) => c !== "One-off" && (libCat === "All" || libCat === c)).map((c) => {
              const f = libFilter.trim().toLowerCase();
              const rows = allDefs.filter((t) => t.cat === c && !active[t.id] && !hiddenLib.includes(t.id) && !t.once && (t.name.toLowerCase().includes(f) || c.toLowerCase().includes(f)));
              if (!rows.length && libCat === "All") return null;
              return (<div key={c}><div style={{ ...S.sectionTitle, display: "flex", alignItems: "center" }}>{c}<span style={{ flex: 1 }} />
                  <button style={S.linkBtn} onClick={() => createLibTask(c)}>+ add</button>
                  {LIB_CATS.includes(c) ? <button style={S.linkBtn} onClick={() => hideCat(c)}>hide category</button>
                    : <button style={S.linkBtn} onClick={() => deleteCustomCat(c)}>delete category</button>}
                </div>
                {rows.map((t) => (
                  <div key={t.id} style={S.allRow}>
                    <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setOpen(t.id)}><div>{t.name}</div>
                      <div style={S.meta}>every ~{t.cadence}d · {t.effort} min{t.opps ? ` · ${t.opps.map((d) => DAYS[d]).join("/")}` : ""}</div></div>
                    <button style={S.linkBtn} onClick={() => hideLib(t)}>hide</button>
                    <button style={S.addBtnSm} onClick={() => add(t)}>Add</button>
                  </div>))}
              </div>);
            })}
            <div style={S.sectionTitle}>New category</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input style={{ ...S.search, marginBottom: 0 }} placeholder="e.g. Allotment" value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCategory()} />
              <button style={S.addBtnSm} onClick={addCategory}>Add</button>
            </div>
            {hiddenCats.length > 0 && (
              <details style={S.details}><summary style={S.summary}>Hidden categories ({hiddenCats.length})</summary>
                {hiddenCats.map((c) => (<div key={c} style={{ ...S.allRow, opacity: 0.6 }}><div style={{ flex: 1 }}>{c}</div>
                  <button style={S.linkBtn} onClick={() => unhideCat(c)}>restore</button></div>))}
              </details>
            )}
            {hiddenLib.length > 0 && (
              <details style={S.details}><summary style={S.summary}>Hidden tasks ({hiddenLib.length})</summary>
                {hiddenLib.map((id) => { const t = taskOf(id); return t && (
                  <div key={id} style={{ ...S.allRow, opacity: 0.6 }}><div style={{ flex: 1 }}>{t.name}<div style={S.meta}>{t.cat}</div></div>
                    <button style={S.linkBtn} onClick={() => unhideLib(t)}>restore</button></div>); })}
              </details>
            )}
          </div>
        )}

        {tab === "set" && (
          <div>
            <div style={S.sectionTitle}>Sync across devices (GitHub Gist)</div>
            {sync.gistId ? (
              <div>
                <div style={{ fontSize: 14 }}>Connected · <span style={S.meta}>{syncStatus || "idle"}</span></div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button style={S.addBtnSm} onClick={syncNow}>Sync now</button>
                  <button style={S.linkBtn} onClick={disconnectGist}>disconnect</button>
                </div>
                <div style={S.footnote}>Saves a couple of seconds after each change. If two devices edit while offline, the most recent wins.</div>
              </div>
            ) : (
              <div>
                <div style={S.footnote}>Paste a GitHub token with only the <b>gist</b> permission. The app creates a private gist called "Today app data" and keeps it in sync. See README for how to make the token.</div>
                <input style={S.search} placeholder="ghp_… or github_pat_…" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} autoCapitalize="off" autoCorrect="off" />
                <button style={S.addBtn} onClick={connectGist}>Connect</button>
                {syncStatus && <div style={S.footnote}>{syncStatus}</div>}
              </div>
            )}

            <div style={S.sectionTitle}>Backup</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button style={S.addBtnSm} onClick={exportData}>Export file</button>
              <label style={{ ...S.addBtnSm, display: "inline-block" }}>Import file<input type="file" accept=".json,application/json" style={{ display: "none" }} onChange={(e) => e.target.files[0] && importData(e.target.files[0])} /></label>
            </div>
            <div style={S.footnote}>Export saves a JSON file to your phone (Files / iCloud). Import replaces everything with that file.</div>

            <div style={S.sectionTitle}>Stats</div>
            <div style={S.statRow}><Stat n={activeTasks.length} l="tracking" /><Stat n={Object.values(active).reduce((a, r) => a + (r.history || []).length, 0)} l="things done" /><Stat n={(st.doneOnce || []).length} l="one-offs done" /><Stat n={points} l="points" /></div>

            {canNotify && (
              <>
                <div style={S.sectionTitle}>Daily reminder</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <Chip on={st.reminder == null} onClick={() => setReminderTo(null)}>Off</Chip>
                  {[8, 13, 18].map((h) => <Chip key={h} on={st.reminder === h} onClick={() => setReminderTo(h)}>{h}:00</Chip>)}
                </div>
                {st.reminder != null && (
                  <div style={{ ...S.ctlRow, marginTop: 8 }}>
                    <span style={S.ctlLabel}>Style</span>
                    <Chip on={(st.reminderStyle ?? "gentle") === "gentle"} onClick={() => setReminderTo(st.reminder, "gentle")}>Gentle</Chip>
                    <Chip on={st.reminderStyle === "alarm"} onClick={() => setReminderTo(st.reminder, "alarm")}>Alarm</Chip>
                  </div>
                )}
                <div style={S.footnote}>{st.reminderStyle === "alarm" ? "A full-screen alarm that cuts through Silent and Focus. For when gentle isn't working." : "One gentle nudge a day, nothing else. No badges, no nagging."}</div>

                <div style={S.sectionTitle}>Check-ins</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <Chip on={!st.checkIns} onClick={() => setCheckInsTo(0)}>Off</Chip>
                  {[2, 3, 5].map((n) => <Chip key={n} on={st.checkIns === n} onClick={() => setCheckInsTo(n)}>{n}× a day</Chip>)}
                </div>
                <div style={S.footnote}>Quiet nudges to glance at the list. 2× is 10:00 &amp; 16:00, 3× is 9:00 / 13:00 / 18:00, 5× is every ~3h from 9:00 to 21:00.</div>
              </>
            )}

            <div style={S.sectionTitle}>Going away?</div>
            {holiday ? (
              <div>
                <div style={{ fontSize: 14 }}>On a break since {fmt(holiday.since)}.</div>
                <button style={{ ...S.addBtnSm, marginTop: 8 }} onClick={endHoliday}>I'm back</button>
              </div>
            ) : (
              <div>
                <button style={S.addBtnSm} onClick={startHoliday}>Pause the clocks</button>
                <div style={S.footnote}>While paused, nothing gains urgency. When you're back, everything picks up exactly where it left off — no pile-up.</div>
              </div>
            )}

            <div style={S.sectionTitle}>Danger</div>
            <button style={S.linkBtn} onClick={reset}>reset to starter set</button>
          </div>
        )}
      </div>

      {openTask && (
        <Detail t={openTask} rec={active[openTask.id]} day={day} isActive={!!active[openTask.id]}
          onClose={() => setOpen(null)} onEdit={(p) => edit(openTask.id, p)}
          onDone={() => done({ ...openTask, u: active[openTask.id] ? (day - active[openTask.id].lastDone) / openTask.cadence : 1 })}
          onAdd={() => add(openTask)} onRemove={() => { (openTask.once ? deleteCustom : remove)(openTask); setOpen(null); }} onDelete={openTask.id.startsWith("custom:") ? () => { deleteCustom(openTask); setOpen(null); } : null} cats={CATS} doneToday={doneToday.includes(openTask.id)}
          pinned={pinnedIds.includes(openTask.id)} onPin={() => { pin(openTask); setOpen(null); setTab("today"); }}
          onSkipWeek={() => { skipWeek(openTask); setOpen(null); }}
          snoozedUntil={snUntil(snoozed[openTask.id]) > day ? snUntil(snoozed[openTask.id]) : null} onUnsnooze={() => unsnooze(openTask.id)}
          alarm={st.alarms?.[openTask.id]} onSetAlarm={(tm) => setTaskAlarmFor(openTask, tm)} onClearAlarm={() => clearTaskAlarmFor(openTask)}
          slog={st.skiplog?.[openTask.id]} />
      )}
    </div>
  );
}

// ============ DETAIL SHEET ============
function Detail({ t, rec, day, isActive, onClose, onEdit, onDone, onAdd, onRemove, onDelete, doneToday, cats, pinned, onPin, onSkipWeek, snoozedUntil, onUnsnooze, alarm, onSetAlarm, onClearAlarm, slog }) {
  const [alarmTime, setAlarmTime] = useState("17:00");
  const hist = rec?.history || [];
  const gaps = hist.slice(1).map((d, i) => d - hist[i]);
  const avgGap = gaps.length ? (gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1) : null;
  const sinceLast = rec ? day - rec.lastDone : null;
  const grid = Array.from({ length: 28 }, (_, i) => day - 27 + i);
  const anyDay = t.opps === null;

  return (
    <div style={S.sheetBg} onClick={onClose}>
      <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
        <input style={S.nameInput} value={t.name} placeholder="What is it?" autoFocus={!t.name} onChange={(e) => onEdit({ name: e.target.value })} />
        <textarea style={S.noteArea} rows={t.note ? Math.min(6, (t.note.match(/\n/g) || []).length + 2) : 1} placeholder="Notes — details, lists, links…"
          value={t.note || ""} onChange={(e) => onEdit({ note: e.target.value })} />
        {(t.note || "").match(/https?:\/\/\S+/g)?.map((u, i) => (
          <div key={i} style={{ marginBottom: 4 }}><a href={u} target="_blank" rel="noreferrer" style={{ color: "#2F6F4E", fontSize: 13, wordBreak: "break-all" }}>{u}</a></div>
        ))}

        <Field label="Repeats?">
          <div style={{ display: "flex", gap: 4 }}>
            <Chip on={!t.once} onClick={() => onEdit({ once: false, cat: t.cat === "One-off" ? "Admin" : t.cat })}>Repeats</Chip>
            <Chip on={!!t.once} onClick={() => onEdit({ once: true, cat: "One-off" })}>Just once</Chip>
          </div>
        </Field>
        {!t.once && (<Field label="Category">
          <select style={S.select} value={t.cat} onChange={(e) => onEdit({ cat: e.target.value })}>{cats.filter((c) => c !== "One-off").map((c) => <option key={c}>{c}</option>)}</select>
        </Field>)}
        {!t.once && (<Field label="Roughly every">
          <NumField value={t.cadence} onCommit={(n) => onEdit({ cadence: n })} /> <span style={S.meta}>days</span>
        </Field>)}
        <Field label="Can happen">
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <Chip on={anyDay} onClick={() => onEdit({ opps: null })}>Any day</Chip>
            {DAYS.map((d, i) => (
              <Chip key={d} on={!anyDay && t.opps.includes(i)} onClick={() => {
                const cur = anyDay ? [] : t.opps;
                const next = cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].sort();
                onEdit({ opps: next.length ? next : null });
              }}>{d}</Chip>
            ))}
          </div>
        </Field>
        <Field label="Takes about">
          <NumField value={t.effort} onCommit={(n) => onEdit({ effort: n })} /> <span style={S.meta}>min</span>
        </Field>
        <Field label="Needs">
          <div style={{ display: "flex", gap: 4 }}>{[[1, "Low energy"], [2, "Some"], [3, "Real effort"]].map(([e, l]) => <Chip key={e} on={t.energy === e} onClick={() => onEdit({ energy: e })}>{l}</Chip>)}</div>
        </Field>
        {!t.once && (<Field label="Matters">
          <div style={{ display: "flex", gap: 4 }}>
            <Chip on={!t.keystone} onClick={() => onEdit({ keystone: false })}>Normal</Chip>
            <Chip on={!!t.keystone} onClick={() => onEdit({ keystone: true })}>★ Non-negotiable</Chip>
          </div>
        </Field>)}
        {isActive && canNotify && (
          <Field label="Alarm">
            {alarm ? (
              <span style={{ fontSize: 14 }}>{alarm.t} today · full-screen <button style={S.linkBtn} onClick={onClearAlarm}>remove</button></span>
            ) : (
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="time" style={{ ...S.num, width: 110 }} value={alarmTime} onChange={(e) => setAlarmTime(e.target.value)} />
                <button style={S.addBtnSm} onClick={() => alarmTime && onSetAlarm(alarmTime)}>Set for today</button>
              </span>
            )}
          </Field>
        )}

        {isActive && !t.once && (
          <div style={{ marginTop: 18 }}>
            <div style={S.sectionTitle}>Last 4 weeks</div>
            <div style={S.grid}>
              {grid.map((d) => {
                const did = hist.includes(d);
                const possible = t.opps === null || t.opps.includes(dateOf(d).getDay());
                return <div key={d} title={fmt(d)} style={{ ...S.cell, background: did ? "#2F6F4E" : possible ? "#DCE6D8" : "#F0F3EE" }} />;
              })}
            </div>
            <div style={S.statRow}>
              <Stat n={hist.length} l="times done" />
              <Stat n={sinceLast === 0 ? "today" : `${sinceLast}d`} l="since last" />
              <Stat n={avgGap ? `${avgGap}d` : "—"} l="avg gap" />
              <Stat n={`${t.cadence}d`} l="target" />
            </div>
            {avgGap && +avgGap > t.cadence * 1.5 && (
              <div style={S.nudge}>You're doing this about every {avgGap} days, not {t.cadence}. Either that's fine — or make it official:{" "}
                <button style={{ ...S.addBtnSm, marginLeft: 4 }} onClick={() => onEdit({ cadence: Math.max(1, Math.round(+avgGap)) })}>make it ~{Math.round(+avgGap)}d</button>
              </div>
            )}
            {(() => {
              const skips = (slog || []).filter((d) => day - d <= 60).length;
              const dones = hist.filter((d) => day - d <= 60).length;
              if (t.keystone && skips >= 3 && skips > dones) return (
                <div style={S.nudge}>★ This is non-negotiable, and it's slipping — {skips} skips lately. Give it the day's first slot, or a time it can't dodge.{" "}
                  {onPin && <button style={{ ...S.addBtnSm, marginLeft: 4 }} onClick={onPin}>pin it today</button>}
                </div>
              );
              if (!t.keystone && skips >= 5 && skips > 2 * dones) return (
                <div style={S.nudge}>This one's been "not today" {skips} times lately. No guilt — but maybe it wants to be rarer, or let go.{" "}
                  <button style={{ ...S.addBtnSm, marginLeft: 4 }} onClick={() => onEdit({ cadence: t.cadence * 2 })}>every ~{t.cadence * 2}d instead</button>{" "}
                  <button style={S.linkBtn} onClick={onRemove}>stop tracking</button>
                </div>
              );
              return null;
            })()}
            {hist.length > 0 && (
              <details style={S.details}><summary style={S.summary}>All completions</summary>
                <div style={S.meta}>{[...hist].reverse().map(fmt).join(" · ")}</div>
              </details>
            )}
          </div>
        )}

        {snoozedUntil && (
          <div style={S.nudge}>Snoozed until {fmt(snoozedUntil)}. <button style={S.linkBtn} onClick={onUnsnooze}>bring back</button></div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap", alignItems: "center" }}>
          {isActive ? (
            <>
              <button style={S.doneBtn} onClick={() => { onDone(); onClose(); }} disabled={doneToday}>{doneToday ? "Done today" : t.once ? "Done" : "Mark done today"}</button>
              {!doneToday && <button style={S.addBtnSm} onClick={onPin}>{pinned ? "Unpin" : "Do today"}</button>}
              {!doneToday && !snoozedUntil && <button style={S.linkBtn} onClick={onSkipWeek}>not this week</button>}
              <button style={S.linkBtn} onClick={onRemove}>{t.once ? "delete" : "stop tracking"}</button>
            </>
          ) : (
            <button style={S.doneBtn} onClick={() => { onAdd(); onClose(); }}>Start tracking</button>
          )}
          {onDelete && !t.once && <button style={S.linkBtn} onClick={() => window.confirm("Delete this task completely?") && onDelete()}>delete</button>}
          <button style={{ ...S.linkBtn, marginLeft: "auto" }} onClick={onClose}>close</button>
        </div>
      </div>
    </div>
  );
}

// ============ BITS ============
// Number input that tolerates being emptied while retyping; snaps to a sane
// value on blur instead of fighting every keystroke.
function NumField({ value, onCommit }) {
  const [v, setV] = useState(String(value));
  useEffect(() => { setV(String(value)); }, [value]);
  return (
    <input type="number" min="1" inputMode="numeric" style={S.num} value={v}
      onChange={(e) => { setV(e.target.value); const n = Math.round(+e.target.value); if (e.target.value !== "" && n >= 1) onCommit(n); }}
      onBlur={() => { const n = Math.max(1, Math.round(+v) || 1); setV(String(n)); onCommit(n); }} />
  );
}

const Field = ({ label, children }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0" }}>
    <div style={{ ...S.meta, width: 92, flexShrink: 0 }}>{label}</div><div style={{ flex: 1 }}>{children}</div>
  </div>
);
const Stat = ({ n, l }) => <div style={{ flex: 1 }}><div style={{ fontSize: 18, fontWeight: 600 }}>{n}</div><div style={S.meta}>{l}</div></div>;
function Chip({ on, onClick, children }) { return <button onClick={onClick} style={{ ...S.chip, ...(on ? S.chipOn : {}) }}>{children}</button>; }
function UrgencyDot({ u }) {
  const t = Math.min(u / 2.5, 1);
  const bg = t < 0.5 ? mix("#D9E4D6", "#2F6F4E", t * 2) : mix("#2F6F4E", "#C9892A", (t - 0.5) * 2);
  return <div style={{ ...S.dot, background: bg }} title={urgencyWord(u)} />;
}
function TaskRow({ t, onOpen, onDone, onSkip, onSkipWeek, onPin, pinned, muted }) {
  return (
    <div style={{ ...S.row, opacity: muted ? 0.75 : 1 }}>
      <UrgencyDot u={t.u} />
      <div style={{ flex: 1, cursor: "pointer" }} onClick={onOpen}>
        <div>{t.keystone ? <span style={{ color: "#C9892A" }}>★ </span> : null}{t.name || "(untitled)"}{t.note ? " ✎" : ""}</div>
        <div style={S.meta}>{pinned ? "pinned · " : ""}{t.cat} · {t.effort} min · {urgencyWord(t.u)}{t.fit >= 0.5 ? " · usually about now" : ""}</div>
      </div>
      {onPin && <button style={{ ...S.miniBtn, marginRight: 2 }} onClick={onPin}>{pinned ? "unpin" : "pin"}</button>}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6 }}>
        <button style={S.miniBtn} onClick={onSkip}>not today</button>
        {onSkipWeek && <button style={S.miniBtn} onClick={onSkipWeek}>not this wk</button>}
      </div>
      <button style={S.doneBtn} onClick={onDone}>Done</button>
    </div>
  );
}
function mix(a, b, t) {
  const h = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [r1, g1, b1] = h(a), [r2, g2, b2] = h(b);
  const c = (x, y) => Math.round(x + (y - x) * t);
  return `rgb(${c(r1, r2)},${c(g1, g2)},${c(b1, b2)})`;
}

// ============ STYLES ============
const ink = "#1F2A22", moss = "#2F6F4E";
const S = {
  page: { minHeight: "100vh", background: "#E6ECE4", display: "flex", justifyContent: "center", padding: 16, fontFamily: "'Avenir Next', 'Segoe UI', system-ui, sans-serif", color: ink },
  phone: { width: "100%", maxWidth: 420, background: "#F6F8F4", borderRadius: 22, padding: "20px 18px 24px", alignSelf: "flex-start" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 },
  dateBig: { fontSize: 34, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1 },
  dateSmall: { fontSize: 13, opacity: 0.6, marginTop: 4 },
  level: { fontSize: 15, fontWeight: 600 },
  xpTrack: { width: 90, height: 5, background: "#D9E4D6", borderRadius: 3, marginTop: 4, marginLeft: "auto" },
  xpFill: { height: 5, background: moss, borderRadius: 3, transition: "width .3s" },
  tabs: { display: "flex", gap: 4, borderBottom: "1px solid #D9E4D6", marginBottom: 12 },
  tab: { background: "none", border: "none", padding: "8px 10px", fontSize: 14, color: ink, opacity: 0.55, cursor: "pointer", borderBottom: "2px solid transparent", marginBottom: -1 },
  tabOn: { opacity: 1, borderBottom: `2px solid ${moss}`, fontWeight: 600 },
  controls: { marginBottom: 12 },
  ctlRow: { display: "flex", alignItems: "center", gap: 6, marginBottom: 6 },
  ctlLabel: { fontSize: 13, opacity: 0.6, width: 52 },
  chip: { border: "1px solid #C9D6C5", background: "white", borderRadius: 999, padding: "4px 11px", fontSize: 13, cursor: "pointer", color: ink },
  chipOn: { background: moss, borderColor: moss, color: "white" },
  sectionTitle: { fontSize: 13, opacity: 0.6, margin: "14px 0 6px" },
  row: { display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #E3EAE0", fontSize: 15 },
  allRow: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #E3EAE0", fontSize: 14 },
  meta: { fontSize: 12, opacity: 0.55, marginTop: 2 },
  dot: { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
  doneBtn: { background: moss, color: "white", border: "none", borderRadius: 8, padding: "10px 14px", fontSize: 13, cursor: "pointer" },
  addBtn: { background: "white", border: `1px solid ${moss}`, color: moss, borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer", width: "100%", marginTop: 4 },
  addBtnSm: { background: "white", border: `1px solid ${moss}`, color: moss, borderRadius: 8, padding: "5px 12px", fontSize: 13, cursor: "pointer" },
  linkBtn: { background: "none", border: "none", color: ink, opacity: 0.5, fontSize: 12, cursor: "pointer", padding: "6px 8px" },
  miniBtn: { background: "white", border: "1px solid #C9D6C5", color: ink, borderRadius: 999, fontSize: 12, cursor: "pointer", padding: "7px 11px", whiteSpace: "nowrap" },
  details: { marginTop: 10 },
  summary: { fontSize: 13, opacity: 0.7, cursor: "pointer", padding: "6px 0" },
  hiddenNote: { fontSize: 12, opacity: 0.55, marginTop: 14, lineHeight: 1.4 },
  empty: { padding: "28px 0", textAlign: "center", opacity: 0.7, fontSize: 15 },
  nextDay: { width: "100%", marginTop: 18, background: "white", border: "1px solid #C9D6C5", borderRadius: 12, padding: 12, fontSize: 14, cursor: "pointer", color: ink },
  footnote: { fontSize: 12, opacity: 0.5, marginTop: 10, lineHeight: 1.4 },
  search: { width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 10, border: "1px solid #C9D6C5", fontSize: 14, marginBottom: 8, background: "white", color: ink },
  sheetBg: { position: "fixed", inset: 0, background: "rgba(31,42,34,0.35)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 10 },
  sheet: { width: "100%", maxWidth: 420, maxHeight: "88vh", overflowY: "auto", background: "#F6F8F4", borderRadius: "22px 22px 0 0", padding: "20px 18px 28px", boxSizing: "border-box" },
  nameInput: { width: "100%", boxSizing: "border-box", fontSize: 22, fontWeight: 600, border: "none", borderBottom: "1px solid #D9E4D6", background: "transparent", padding: "4px 0 8px", color: ink, marginBottom: 6, fontFamily: "inherit" },
  select: { padding: "6px 8px", borderRadius: 8, border: "1px solid #C9D6C5", background: "white", fontSize: 14, color: ink },
  num: { width: 64, padding: "6px 8px", borderRadius: 8, border: "1px solid #C9D6C5", fontSize: 14, color: ink, background: "white" },
  grid: { display: "grid", gridTemplateColumns: "repeat(14, 1fr)", gap: 4 },
  cell: { aspectRatio: "1", borderRadius: 3 },
  statRow: { display: "flex", gap: 8, marginTop: 12 },
  nudge: { fontSize: 13, background: "#EEF3EC", borderRadius: 10, padding: "10px 12px", marginTop: 12, lineHeight: 1.4 },
  catTitle: { fontSize: 12, opacity: 0.55, margin: "10px 0 0", fontWeight: 600 },
  noteArea: { width: "100%", boxSizing: "border-box", border: "1px solid #D9E4D6", borderRadius: 10, background: "white", padding: "8px 10px", fontSize: 14, color: ink, fontFamily: "inherit", resize: "vertical", marginBottom: 8 },
  barTrack: { height: 5, background: "#D9E4D6", borderRadius: 3, marginTop: 3 },
  weekCell: { borderRadius: 8, padding: "10px 0", fontSize: 14, fontWeight: 600 },
};
