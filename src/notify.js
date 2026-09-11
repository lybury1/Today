// Daily reminder via native local notifications, or a full-screen AlarmKit
// alarm (iOS 26+, same mechanism as Todoist's urgent reminders). Web builds
// get canNotify=false and the settings UI for it stays hidden.
import { Capacitor, registerPlugin } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

const AlarmBridge = registerPlugin("AlarmBridge");

export const canNotify = Capacitor.isNativePlatform();

// hour = 0-23 to schedule a repeating daily nudge, null to turn it off.
// style: "gentle" (notification) or "alarm" (full-screen AlarmKit alarm).
// Returns false if permission was refused (leave the setting off).
export const setDailyReminder = async (hour, style) => {
  if (!canNotify) return false;
  await LocalNotifications.cancel({ notifications: [{ id: 1 }] }).catch(() => {});
  await AlarmBridge.cancel().catch(() => {});
  if (hour == null) return true;
  if (style === "alarm") {
    try {
      const r = await AlarmBridge.schedule({ hour, minute: 0, title: "Time to pick your day" });
      return !!(r && r.ok);
    } catch (e) { return false; }
  }
  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== "granted") return false;
  await LocalNotifications.schedule({
    notifications: [{
      id: 1,
      title: "Today",
      body: "A fresh set of picks is ready when you are.",
      schedule: { on: { hour, minute: 0 } },
    }],
  });
  return true;
};

// Habit guardian: one-off nudges at the next 9am for slipping non-negotiables
// (ids 20-22). Re-planned on every app run; cancelled when nothing is slipping.
export const setHabitNudges = async (habits) => {
  if (!canNotify) return;
  await LocalNotifications.cancel({ notifications: [20, 21, 22].map((id) => ({ id })) }).catch(() => {});
  if (!habits.length) return;
  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== "granted") return;
  const at = new Date();
  if (at.getHours() >= 9) at.setDate(at.getDate() + 1);
  at.setHours(9, 0, 0, 0);
  await LocalNotifications.schedule({
    notifications: habits.slice(0, 3).map((h, i) => ({
      id: 20 + i,
      title: "Today",
      body: `★ “${h.name}” has drifted for ${h.days} days. This would be a good morning to bring it back.`,
      schedule: { at: new Date(at.getTime() + i * 2 * 60 * 1000) },
    })),
  });
};

// One-off full-screen alarm for a single task ("today at HH:MM").
export const setTaskAlarm = async (uuid, hour, minute, title) => {
  if (!canNotify) return false;
  try {
    const r = await AlarmBridge.schedule({ uuid, hour, minute, title, once: true });
    return !!(r && r.ok);
  } catch (e) { return false; }
};
export const cancelTaskAlarm = async (uuid) => {
  try { await AlarmBridge.cancel({ uuid }); } catch (e) {}
};

// Gentle recurring check-in nudges through the day (notification ids 10+).
// When a topTask name is given, the nudge names it — refreshed whenever picks change.
const CHECKIN_HOURS = { 2: [10, 16], 3: [9, 13, 18], 5: [9, 12, 15, 18, 21] };
export const setCheckIns = async (n, topTask) => {
  if (!canNotify) return false;
  await LocalNotifications.cancel({ notifications: [10, 11, 12, 13, 14].map((id) => ({ id })) }).catch(() => {});
  if (!n) return true;
  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== "granted") return false;
  const body = topTask
    ? `“${topTask}” is top of the list, if a minute opens up.`
    : "A spare minute? Something on the list might fit.";
  await LocalNotifications.schedule({
    notifications: (CHECKIN_HOURS[n] || []).map((h, i) => ({
      id: 10 + i,
      title: "Today",
      body,
      schedule: { on: { hour: h, minute: 0 } },
    })),
  });
  return true;
};
