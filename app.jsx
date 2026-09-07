const { useState, useMemo, useEffect } = React;

// ============ LIBRARY (see tasks.js) ============
const RAW = window.TASK_LIBRARY;

const CATS = Object.keys(RAW);
const LIB = [];
CATS.forEach((cat) =>
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
  return { active, overrides: {}, custom: {}, points: 0, skipped: { day: today, ids: [] } };
};

const urgencyWord = (u) => (u < 0.6 ? "fresh" : u < 1 ? "coming up" : u < 1.6 ? "ready" : u < 2.5 ? "been a while" : "long time");
const STORAGE_KEY = "today-app-v1";

// ============ APP ============
function DailyPicker() {
  const [st, setSt] = useState(() => { try { const s = localStorage.getItem(STORAGE_KEY); if (s) return JSON.parse(s); } catch (e) {} return seedState(); });
  const [day, setDay] = useState(todayIndex);
  const [mins, setMins] = useState(60);
  const [energy, setEnergy] = useState(2);
  const [tab, setTab] = useState("today");
  const [open, setOpen] = useState(null); // task id in detail view
  const [libFilter, setLibFilter] = useState("");
  const [libCat, setLibCat] = useState("All");

  // save on every change; re-check the date whenever the app comes back to the front
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(st)); } catch (e) {} }, [st]);
  useEffect(() => {
    const tick = () => setDay(todayIndex());
    document.addEventListener("visibilitychange", tick); window.addEventListener("focus", tick);
    const iv = setInterval(tick, 60000);
    return () => { document.removeEventListener("visibilitychange", tick); window.removeEventListener("focus", tick); clearInterval(iv); };
  }, []);

  const { active, overrides, custom, points } = st;
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
    () => Object.keys(active).map((id) => { const t = taskOf(id); return t && { ...t, u: (day - active[id].lastDone) / t.cadence }; }).filter(Boolean),
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
    setSt((s) => ({
      ...s,
      active: { ...s.active, [t.id]: { lastDone: day, history: [...(s.active[t.id]?.history || []), day] } },
      points: s.points + Math.max(5, Math.round(t.effort / 3)) + (t.u > 1.5 ? 5 : 0),
    }));
  };
  const undo = (t) => {
    setSt((s) => {
      const h = (s.active[t.id]?.history || []).filter((d) => d !== day);
      return { ...s, active: { ...s.active, [t.id]: { lastDone: h.length ? h[h.length - 1] : day - t.cadence, history: h } } };
    });
  };
  const skip = (t) => setSt((s) => ({ ...s, skipped: { day, ids: [...(s.skipped?.day === day ? s.skipped.ids : []), t.id] } }));
  const add = (t) => setSt((s) => ({ ...s, active: { ...s.active, [t.id]: { lastDone: day - Math.round(t.cadence * 0.5), history: [] } } }));
  const remove = (t) => setSt((s) => { const a = { ...s.active }; delete a[t.id]; return { ...s, active: a }; });
  const edit = (id, patch) => setSt((s) => ({ ...s, overrides: { ...s.overrides, [id]: { ...(s.overrides[id] || {}), ...patch } } }));
  const createCustom = () => {
    const id = `custom:${Date.now()}`;
    setSt((s) => ({
      ...s,
      custom: { ...s.custom, [id]: { id, name: "New task", cat: "Admin", cadence: 7, opps: null, effort: 15, energy: 1 } },
      active: { ...s.active, [id]: { lastDone: day - 3, history: [] } },
    }));
    setOpen(id);
  };
  const reset = () => { if (window.confirm("Reset everything to the starter set?")) setSt(seedState()); };

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
          {[["today", "Today"], ["all", `Mine (${activeTasks.length})`], ["lib", `Library (${LIB.length})`]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ ...S.tab, ...(tab === k ? S.tabOn : {}) }}>{l}</button>
          ))}
        </div>

        {tab === "today" && (
          <>
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
            <button style={S.addBtn} onClick={createCustom}>+ New task of your own</button>
            {CATS.map((c) => {
              const rows = activeTasks.filter((t) => t.cat === c).sort((a, b) => b.u - a.u);
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
            <button style={{ ...S.linkBtn, marginTop: 20 }} onClick={reset}>reset to starter set</button>
          </div>
        )}

        {tab === "lib" && (
          <div>
            <input style={S.search} placeholder="Search the library" value={libFilter} onChange={(e) => setLibFilter(e.target.value)} />
            <div style={{ ...S.ctlRow, flexWrap: "wrap", marginBottom: 8 }}>
              {["All", ...CATS].map((c) => <Chip key={c} on={libCat === c} onClick={() => setLibCat(c)}>{c}</Chip>)}
            </div>
            {CATS.filter((c) => libCat === "All" || libCat === c).map((c) => {
              const rows = allDefs.filter((t) => t.cat === c && !active[t.id] && t.name.toLowerCase().includes(libFilter.toLowerCase()));
              if (!rows.length) return null;
              return (<div key={c}><div style={S.sectionTitle}>{c}</div>
                {rows.map((t) => (
                  <div key={t.id} style={S.allRow}>
                    <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setOpen(t.id)}><div>{t.name}</div>
                      <div style={S.meta}>every ~{t.cadence}d · {t.effort} min{t.opps ? ` · ${t.opps.map((d) => DAYS[d]).join("/")}` : ""}</div></div>
                    <button style={S.addBtnSm} onClick={() => add(t)}>Add</button>
                  </div>))}
              </div>);
            })}
          </div>
        )}
      </div>

      {openTask && (
        <Detail t={openTask} rec={active[openTask.id]} day={day} isActive={!!active[openTask.id]}
          onClose={() => setOpen(null)} onEdit={(p) => edit(openTask.id, p)}
          onDone={() => done({ ...openTask, u: active[openTask.id] ? (day - active[openTask.id].lastDone) / openTask.cadence : 1 })}
          onAdd={() => add(openTask)} onRemove={() => { remove(openTask); setOpen(null); }} doneToday={doneToday.includes(openTask.id)} />
      )}
    </div>
  );
}

// ============ DETAIL SHEET ============
function Detail({ t, rec, day, isActive, onClose, onEdit, onDone, onAdd, onRemove, doneToday }) {
  const hist = rec?.history || [];
  const gaps = hist.slice(1).map((d, i) => d - hist[i]);
  const avgGap = gaps.length ? (gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1) : null;
  const sinceLast = rec ? day - rec.lastDone : null;
  const grid = Array.from({ length: 28 }, (_, i) => day - 27 + i);
  const anyDay = t.opps === null;

  return (
    <div style={S.sheetBg} onClick={onClose}>
      <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
        <input style={S.nameInput} value={t.name} onChange={(e) => onEdit({ name: e.target.value })} />

        <Field label="Category">
          <select style={S.select} value={t.cat} onChange={(e) => onEdit({ cat: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
        </Field>
        <Field label="Roughly every">
          <input type="number" min="1" style={S.num} value={t.cadence} onChange={(e) => onEdit({ cadence: Math.max(1, +e.target.value || 1) })} /> <span style={S.meta}>days</span>
        </Field>
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

        {isActive && (
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
              <button style={S.doneBtn} onClick={onDone} disabled={doneToday}>{doneToday ? "Done today" : "Mark done today"}</button>
              <button style={S.linkBtn} onClick={onRemove}>stop tracking</button>
            </>
          ) : (
            <button style={S.doneBtn} onClick={() => { onAdd(); onClose(); }}>Start tracking</button>
          )}
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
        <div>{t.name}</div><div style={S.meta}>{t.cat} · {t.effort} min · {urgencyWord(t.u)}</div>
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
