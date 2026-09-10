// Daily reminder via native local notifications. Web builds get canNotify=false
// and the settings UI for it stays hidden — no server, no web push.
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

export const canNotify = Capacitor.isNativePlatform();

// hour = 0-23 to schedule a repeating daily nudge, null to turn it off.
// Returns false if permission was refused (leave the setting off).
export const setDailyReminder = async (hour) => {
  if (!canNotify) return false;
  await LocalNotifications.cancel({ notifications: [{ id: 1 }] }).catch(() => {});
  if (hour == null) return true;
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
