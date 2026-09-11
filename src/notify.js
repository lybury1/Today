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
