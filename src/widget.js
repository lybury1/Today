// Feeds today's picks to the iOS home-screen widget. No-op on the web —
// the WidgetBridge plugin only exists inside the native shell.
import { Capacitor, registerPlugin } from "@capacitor/core";

const WidgetBridge = registerPlugin("WidgetBridge");

export const canWidget = Capacitor.isNativePlatform();

export const pushWidgetData = async (payload) => {
  if (!canWidget) return;
  try {
    await WidgetBridge.update({ json: JSON.stringify(payload) });
    console.log("[widget] pushed", payload.items.length, "items");
  } catch (e) {
    console.log("[widget] push failed:", e && e.message ? e.message : String(e));
  }
};
