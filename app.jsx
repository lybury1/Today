const { useState, useMemo, useEffect } = React;

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
const STORAGE_KEY = "today-app-v1";
const SYNC_KEY = "today-app-sync";

// ============ APP ============
function DailyPicker() {
  const [st, setSt] = useState(() => { try { const s = localStorage.getItem(STORAGE_KEY); if (s) return JSON.parse(s); } catch (e) {} return seedState(); });
  const [day, setDay] = useState(todayIndex);
  const [newCat, setNewCat] = useState("");
  const [sync, setSync] = useState(() => { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch (e) { return {}; } });
  const [syncStatus, setSyncStatus] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [mins, setMins] = useState(60);
  const [energy, setEnergy] = useState(2);
  const [tab, setTab] = useState("today");
  const [open, setOpen] = useState(null); // task id in detail view
  const [libFilter, setLibFilter] = useState("");
  const [libCat, setLibCat] = useState("All");

  // save on every change; re-check the date whenever the app comes back to the front
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(st)); } catch (e) {} }, [st]);
  const setStamped = (fn) => setSt((s) => ({ ...(typeof fn === "function" ? fn(s) : fn), updatedAt: Date.now() }));

  // ---- gist sync ----
  const gh = (path, opts = {}) => fetch("https://api.github.com" + path, { ...opts, headers: { Authorization: "Bearer " + sync.token, Accept: "application/vnd.github+json", "Content-Type": "application/json", ...(opts.headers || {}) } });
  const pullFromGist = async (cfg) => {
    const r = await fetch("https://api.github.com/gists/" + cfg.gistId, { headers: { Authorization: "Bearer " + cfg.token, Accept: "application/vnd.github+json" } });
    if (!r.ok) throw new Error("gist read failed " + r.status);
    const j = await r.json(); const f = j.files["today.json"]; if (!f) return null;
    const txt = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
    return JSON.parse(txt);
  };
  useEffect(() => {
    if (!sync.token || !sync.gistId) return;
    (async () => {
      try {
        setSyncStatus("checking…");
        const remote = await pullFromGist(sync);
        if (remote && (remote.updatedAt || 0) > (st.updatedAt || 0)) { setSt(remote); setSyncStatus("loaded from cloud"); }
        else setSyncStatus("up to date");
      } catch (e) { setSyncStatus("offline / sync error"); }
    })();
  }, [sync.gistId]);
  useEffect(() => {
    if (!sync.token || !sync.gistId || !st.updatedAt) return;
    const id = setTimeout(async () => {
      try {
        setSyncStatus("saving…");
        const r = await gh("/gists/" + sync.gistId, { method: "PATCH", body: JSON.stringify({ files: { "today.json": { content: JSON.stringify(st) } } }) });
        setSyncStatus(r.ok ? "saved to cloud " + new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "save failed " + r.status);
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
      localStorage.setItem(SYNC_KEY, JSON.stringify(cfg)); setSync(cfg); setTokenInput("");
    } catch (e) { setSyncStatus(String(e.message || e)); }
  };
  const disconnectGist = () => { localStorage.removeItem(SYNC_KEY); setSync({}); setSyncStatus(""); };
  const syncNow = async () => {
    try { setSyncStatus("checking…"); const remote = await pullFromGist(sync);
      if (remote && (remote.updatedAt || 0) > (st.updatedAt || 0)) { setSt(remote); setSyncStatus("loaded from cloud"); } else { setStamped((x) => x); }
    } catch (e) { setSyncStatus("offline / sync error"); }
  };

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

  const { active, overrides, custom, points } = st;
  const hiddenLib = st.hiddenLib || [];
  const hiddenCats = st.hiddenCats || [];
  const customCats = st.customCats || [];
  const CATS = [...LIB_CATS.filter((c) => !hiddenCats.includes(c)), ...customCats, "One-off"];
  const skipped = st.skipped && st.skipped.day === day ? st.skipped.ids : [];
  const doneToday = Object.keys(active).filter((id) => (active[id].history || []).includes(day));
  const weekday = dateOf(day).getDay();

  // merged task definitions (library + custom, with edits applied)
  const taskOf = (id) => {
    const base = LIB_BY_ID[id] || custom[id];
    return base ? { ...base, ...(overrides[id] || {}) } : null;
  };
  const allDefs = useMemo(() => [...LIB.map((t) => t.id), ...Object.keys(custom)].map(taskOf), [overrides, custom]);
  const activeTasks = useMemo(
    () => Object.keys(active).map((id) => { const t = taskOf(id); return t && { ...t, u: t.once ? 1 + (day - (active[id].added ?? active[id].lastDone)) / 7 : (day - active[id].lastDone) / t.cadence }; }).filter(Boolean),
    [active, overrides, custom, day]
  );

  const surfaced = activeTasks.filter((t) => (t.opps === null || t.opps.includes(weekday)) && !doneToday.includes(t.id) && !skipped.includes(t.id));
  const picks = useMemo(() => {
    const sorted = [...surfaced].sort((a, b) => b.u - a.u);
    const out = []; let left = mins;
    for (const t of sorted) {
      if (out.length >= 8) break;
      const okEnergy = t.energy <= energy || (t.energy === energy + 1 && t.u > 1.5);
      if (okEnergy && t.effort <= left) { out.push(t); left -= t.effort; }
    }
    return out;
  }, [surfaced, mins, energy]);
  const others = surfaced.filter((t) => !picks.includes(t)).sort((a, b) => b.u - a.u);
  const hidden = activeTasks.filter((t) => t.opps !== null && !t.opps.includes(weekday));

  // ---- actions ----
  const done = (t) => {
    setStamped((s) => {
      const pts = s.points + Math.max(5, Math.round(t.effort / 3)) + (t.u > 1.5 ? 5 : 0);
      if (t.once) {
        const a = { ...s.active }; delete a[t.id];
        const c = { ...s.custom }; delete c[t.id];
        return { ...s, active: a, custom: c, points: pts, doneOnce: [...(s.doneOnce || []), { name: t.name, day }].slice(-50) };
      }
      return { ...s, active: { ...s.active, [t.id]: { ...s.active[t.id], lastDone: day, history: [...(s.active[t.id]?.history || []), day] } }, points: pts };
    });
  };
  const undo = (t) => {
    setStamped((s) => {
      const h = (s.active[t.id]?.history || []).filter((d) => d !== day);
      return { ...s, active: { ...s.active, [t.id]: { lastDone: h.length ? h[h.length - 1] : day - t.cadence, history: h } } };
    });
  };
  const skip = (t) => setStamped((s) => ({ ...s, skipped: { day, ids: [...(s.skipped?.day === day ? s.skipped.ids : []), t.id] } }));
  const add = (t) => setStamped((s) => ({ ...s, active: { ...s.active, [t.id]: { lastDone: day - Math.round(t.cadence * 0.5), history: [] } } }));
  const remove = (t) => setStamped((s) => { const a = { ...s.active }; delete a[t.id]; return { ...s, active: a }; });
  const edit = (id, patch) => setStamped((s) => ({ ...s, overrides: { ...s.overrides, [id]: { ...(s.overrides[id] || {}), ...patch } } }));
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
  const deleteCustom = (t) => setStamped((s) => { const c = { ...s.custom }; delete c[t.id]; const a = { ...s.active }; delete a[t.id]; return { ...s, custom: c, active: a }; });
  const reset = () => { if (window.confirm("Reset everything to the starter set?")) setStamped(seedState()); };

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
          {[["today", "Today"], ["all", `Mine (${activeTasks.length})`], ["lib", "Library"], ["set", "⚙"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ ...S.tab, ...(tab === k ? S.tabOn : {}) }}>{l}</button>
          ))}
        </div>

        {tab === "today" && (
          <>
            <button style={{ ...S.addBtn, marginBottom: 16 }} onClick={() => createCustom(true)}>+ Add a one-off</button>
            <div style={S.controls}>
              <div style={S.ctlRow}><span style={S.ctlLabel}>Time</span>
                {[30, 60, 120, 240].map((m) => <Chip key={m} on={mins === m} onClick={() => setMins(m)}>{m < 60 ? `${m}m` : `${m / 60}h`}</Chip>)}
              </div>
              <div style={S.ctlRow}><span style={S.ctlLabel}>Energy</span>
                {[[1, "Low"], [2, "OK"], [3, "Good"]].map(([e, l]) => <Chip key={e} on={energy === e} onClick={() => setEnergy(e)}>{l}</Chip>)}
              </div>
            </div>

            {picks.length === 0 ? (
              <div style={S.empty}>{surfaced.length === 0 ? "Nothing left for today. Nice." : "Nothing fits that time and energy. Try more time, or call it a day."}</div>
            ) : (
              <div>
                <div style={S.sectionTitle}>Suggested — {picks.reduce((a, t) => a + t.effort, 0)} min</div>
                {picks.map((t) => <TaskRow key={t.id} t={t} onOpen={() => setOpen(t.id)} onDone={() => done(t)} onSkip={() => skip(t)} />)}
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
                {others.map((t) => <TaskRow key={t.id} t={t} onOpen={() => setOpen(t.id)} onDone={() => done(t)} onSkip={() => skip(t)} muted />)}
              </details>
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
            {activeTasks.some((t) => t.once) && (<div><div style={S.sectionTitle}>One-offs</div>
              {activeTasks.filter((t) => t.once).sort((a, b) => b.u - a.u).map((t) => (
                <div key={t.id} style={S.allRow}><UrgencyDot u={t.u} />
                  <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setOpen(t.id)}><div>{t.name || "(untitled)"}</div>
                    <div style={S.meta}>{t.effort} min{t.opps ? ` · ${t.opps.map((d) => DAYS[d]).join("/")}` : ""} · {urgencyWord(t.u)}</div></div>
                </div>))}
            </div>)}
            {CATS.filter((c) => c !== "One-off").map((c) => {
              const rows = activeTasks.filter((t) => t.cat === c && !t.once).sort((a, b) => b.u - a.u);
              if (!rows.length) return null;
              return (<div key={c}><div style={S.sectionTitle}>{c}</div>
                {rows.map((t) => (
                  <div key={t.id} style={S.allRow}><UrgencyDot u={t.u} />
                    <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setOpen(t.id)}>
                      <div>{t.name}</div>
                      <div style={S.meta}>every ~{t.cadence}d{t.opps ? ` · ${t.opps.map((d) => DAYS[d]).join("/")}` : ""} · {urgencyWord(t.u)} · done {active[t.id].history.length}×</div>
                    </div>
                  </div>))}
              </div>);
            })}
          </div>
        )}

        {tab === "lib" && (
          <div>
            <input style={S.search} placeholder="Search the library" value={libFilter} onChange={(e) => setLibFilter(e.target.value)} />
            <div style={{ ...S.ctlRow, flexWrap: "wrap", marginBottom: 8 }}>
              {["All", ...CATS].map((c) => <Chip key={c} on={libCat === c} onClick={() => setLibCat(c)}>{c}</Chip>)}
            </div>
            {CATS.filter((c) => c !== "One-off" && (libCat === "All" || libCat === c)).map((c) => {
              const rows = allDefs.filter((t) => t.cat === c && !active[t.id] && !hiddenLib.includes(t.id) && !t.once && t.name.toLowerCase().includes(libFilter.toLowerCase()));
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
      </div>

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

            <div style={S.sectionTitle}>Danger</div>
            <button style={S.linkBtn} onClick={reset}>reset to starter set</button>
          </div>
        )}

      {openTask && (
        <Detail t={openTask} rec={active[openTask.id]} day={day} isActive={!!active[openTask.id]}
          onClose={() => setOpen(null)} onEdit={(p) => edit(openTask.id, p)}
          onDone={() => done({ ...openTask, u: active[openTask.id] ? (day - active[openTask.id].lastDone) / openTask.cadence : 1 })}
          onAdd={() => add(openTask)} onRemove={() => { (openTask.once ? deleteCustom : remove)(openTask); setOpen(null); }} onDelete={openTask.id.startsWith("custom:") ? () => { deleteCustom(openTask); setOpen(null); } : null} cats={CATS} doneToday={doneToday.includes(openTask.id)} />
      )}
    </div>
  );
}

// ============ DETAIL SHEET ============
function Detail({ t, rec, day, isActive, onClose, onEdit, onDone, onAdd, onRemove, onDelete, doneToday, cats }) {
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
          <input type="number" min="1" style={S.num} value={t.cadence} onChange={(e) => onEdit({ cadence: Math.max(1, +e.target.value || 1) })} /> <span style={S.meta}>days</span>
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
          <input type="number" min="1" style={S.num} value={t.effort} onChange={(e) => onEdit({ effort: Math.max(1, +e.target.value || 1) })} /> <span style={S.meta}>min</span>
        </Field>
        <Field label="Needs">
          <div style={{ display: "flex", gap: 4 }}>{[[1, "Low energy"], [2, "Some"], [3, "Real effort"]].map(([e, l]) => <Chip key={e} on={t.energy === e} onClick={() => onEdit({ energy: e })}>{l}</Chip>)}</div>
        </Field>

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
              <div style={S.nudge}>You're doing this about every {avgGap} days, not {t.cadence}. Either that's fine — bump the target — or it wants a fixed slot.</div>
            )}
            {hist.length > 0 && (
              <details style={S.details}><summary style={S.summary}>All completions</summary>
                <div style={S.meta}>{[...hist].reverse().map(fmt).join(" · ")}</div>
              </details>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          {isActive ? (
            <>
              <button style={S.doneBtn} onClick={() => { onDone(); if (t.once) onClose(); }} disabled={doneToday}>{doneToday ? "Done today" : t.once ? "Done" : "Mark done today"}</button>
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
function TaskRow({ t, onOpen, onDone, onSkip, muted }) {
  return (
    <div style={{ ...S.row, opacity: muted ? 0.75 : 1 }}>
      <UrgencyDot u={t.u} />
      <div style={{ flex: 1, cursor: "pointer" }} onClick={onOpen}>
        <div>{t.name || "(untitled)"}</div><div style={S.meta}>{t.cat} · {t.effort} min · {urgencyWord(t.u)}</div>
      </div>
      <button style={S.linkBtn} onClick={onSkip}>not today</button>
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
  doneBtn: { background: moss, color: "white", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer" },
  addBtn: { background: "white", border: `1px solid ${moss}`, color: moss, borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer", width: "100%", marginTop: 4 },
  addBtnSm: { background: "white", border: `1px solid ${moss}`, color: moss, borderRadius: 8, padding: "5px 12px", fontSize: 13, cursor: "pointer" },
  linkBtn: { background: "none", border: "none", color: ink, opacity: 0.5, fontSize: 12, cursor: "pointer" },
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
};

ReactDOM.createRoot(document.getElementById("root")).render(<DailyPicker />);
