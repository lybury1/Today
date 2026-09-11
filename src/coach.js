// The weekly coach: turns the learning logs into a short, kind, factual note.
// The Claude API is called directly from the device with the user's own key
// (entered in settings, stored like the gist token). Only the aggregate digest
// below ever leaves the device — never raw history.
import Anthropic from "@anthropic-ai/sdk";

// Compact weekly summary the model writes from. Everything is precomputed so
// the note can only narrate facts, not invent them.
export const buildDigest = ({ st, day, weekStartDay, taskOf, activeTasks, dateOf, DAYS }) => {
  const ws = weekStartDay;
  const inWeek = (d) => d >= ws && d <= ws + 6;
  const perDay = Array(7).fill(0); const cats = {}; const doneNames = [];
  Object.keys(st.active || {}).forEach((id) => {
    const t = taskOf(id); if (!t) return;
    (st.active[id].history || []).forEach((d) => {
      if (inWeek(d)) { perDay[d - ws]++; cats[t.cat] = (cats[t.cat] || 0) + 1; doneNames.push(t.name); }
    });
  });
  (st.doneOnce || []).forEach((x) => { if (inWeek(x.day)) { perDay[x.day - ws]++; cats["One-off"] = (cats["One-off"] || 0) + 1; doneNames.push(x.name); } });
  // previous 3-week average per category, for gentle trend context
  const prevCats = {};
  Object.keys(st.active || {}).forEach((id) => {
    const t = taskOf(id); if (!t) return;
    (st.active[id].history || []).forEach((d) => { if (d >= ws - 21 && d < ws) prevCats[t.cat] = (prevCats[t.cat] || 0) + 1; });
  });
  const keystones = activeTasks.filter((t) => t.keystone && !t.once).map((t) => ({
    name: t.name,
    doneThisWeek: (st.active[t.id]?.history || []).filter(inWeek).length,
    urgency: Math.round(t.u * 10) / 10,
    recentSkips: ((st.skiplog || {})[t.id] || []).filter((d) => day - d <= 14).length,
  }));
  const skips = Object.entries(st.skiplog || {})
    .map(([id, arr]) => ({ name: taskOf(id)?.name, n: arr.filter((d) => day - d <= 14).length }))
    .filter((x) => x.name && x.n >= 3).sort((a, b) => b.n - a.n).slice(0, 3);
  const timeBuckets = { morning: 0, afternoon: 0, evening: 0 };
  Object.values(st.tlog || {}).flat().forEach(([, m]) => { timeBuckets[m < 720 ? "morning" : m < 1020 ? "afternoon" : "evening"]++; });
  return {
    weekOf: `${DAYS[dateOf(ws).getDay()]} ${dateOf(ws).getDate()}`,
    totalDone: perDay.reduce((a, b) => a + b, 0),
    perDay: Object.fromEntries(perDay.map((n, i) => [["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i], n])),
    byCategory: cats,
    previous3WeekWeeklyAverageByCategory: Object.fromEntries(Object.entries(prevCats).map(([k, v]) => [k, Math.round(v / 3 * 10) / 10])),
    nonNegotiables: keystones,
    frequentlySkippedLast2Weeks: skips,
    completionTimeOfDayCounts: timeBuckets,
    onHoliday: !!st.holiday,
    sampleOfThingsDone: [...new Set(doneNames)].slice(0, 12),
  };
};

const SYSTEM = `You write the weekly coach's note for "Today", a personal task app whose entire philosophy is: nothing is ever overdue, there are no streaks, and no guilt — ever. The user is Henry (UK English).

You receive a JSON digest of his week. Write a note of 3–5 short sentences. Hard rules:
- Only state things the digest supports. Never invent numbers or tasks.
- NEVER use: "streak", "behind", "overdue", "failed", "only", "just" (as in "only 3"), "should have", or any comparison framed as decline or debt.
- Celebrate what happened, name at most ONE gentle challenge, and it must concern a non-negotiable (★) task that is slipping — if none are slipping, no challenge at all.
- Returning after a quiet spell is a win, never an apology.
- Concrete beats generic: name real tasks and real patterns from the digest.
- End on something true and kind. No sign-off, no emoji, no bullet points — flowing prose only.`;

// Returns the note text, or null on any failure (caller falls back to templates).
export const generateCoachNote = async (apiKey, digest) => {
  try {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1024,
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content: "This week's digest:\n" + JSON.stringify(digest, null, 1) }],
    });
    if (response.stop_reason === "refusal") return null;
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    return text || null;
  } catch (e) {
    if (e && (e.status === 401 || e.status === 403)) return { badKey: true };
    return null;
  }
};
