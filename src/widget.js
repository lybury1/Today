// Feeds today's picks to the iOS home-screen widget. No-op on the web —
// the WidgetBridge plugin only exists inside the native shell.
import { Capacitor, registerPlugin } from "@capacitor/core";

const WidgetBridge = registerPlugin("WidgetBridge");

export const canWidget = Capacitor.isNativePlatform();

let lastPushed = null;
export const pushWidgetData = async (payload) => {
  if (!canWidget) return;
  const json = JSON.stringify(payload);
  if (json === lastPushed) return; // don't burn the WidgetKit reload budget on identical data
  try {
    await WidgetBridge.update({ json });
    lastPushed = json;
  } catch (e) {
    console.log("[widget] push failed:", e && e.message ? e.message : String(e));
  }
};

// Task ids ticked Done from the home-screen widget, waiting to be applied in-app.
export const pullPendingDone = async () => {
  if (!canWidget) return [];
  try {
    const r = await WidgetBridge.pullPending();
    return (r && r.ids) || [];
  } catch (e) { return []; }
};
