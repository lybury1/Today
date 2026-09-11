import Foundation
import Capacitor
import WidgetKit

// Receives today's picks from the web app as JSON, drops them in the shared
// app-group container, and asks WidgetKit to refresh the home-screen widget.
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pullPending", returnType: CAPPluginReturnPromise),
    ]

    @objc func update(_ call: CAPPluginCall) {
        let json = call.getString("json") ?? "{}"
        let defaults = UserDefaults(suiteName: "group.com.lybury1.today")
        defaults?.set(json, forKey: "widget-data")
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
        call.resolve()
    }

    // Task ids marked Done from the widget's buttons, queued by MarkDoneIntent.
    @objc func pullPending(_ call: CAPPluginCall) {
        let defaults = UserDefaults(suiteName: "group.com.lybury1.today")
        let ids = defaults?.stringArray(forKey: "pending-done") ?? []
        defaults?.removeObject(forKey: "pending-done")
        call.resolve(["ids": ids])
    }
}
