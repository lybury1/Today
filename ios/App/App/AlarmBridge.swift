import Foundation
import Capacitor
import SwiftUI
#if canImport(AlarmKit)
import AlarmKit
#endif

// Full-screen daily alarm via AlarmKit (iOS 26+) — the same mechanism as
// Todoist's "urgent reminders": a real alarm that cuts through Silent/Focus.

#if canImport(AlarmKit)
@available(iOS 26.0, *)
struct TodayAlarmMetadata: AlarmMetadata {
    init() {}
}
#endif

@objc(AlarmBridgePlugin)
public class AlarmBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AlarmBridgePlugin"
    public let jsName = "AlarmBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "schedule", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
    ]

    static let alarmID = UUID(uuidString: "E4A6C9D2-7B31-4F5E-9C08-2D94A1B3F6E5")!

    @objc func schedule(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        guard #available(iOS 26.0, *) else { call.resolve(["ok": false, "reason": "needs iOS 26"]); return }
        let hour = call.getInt("hour") ?? 8
        let minute = call.getInt("minute") ?? 0
        let testSeconds = call.getInt("testSeconds") ?? 0
        let title = call.getString("title") ?? "Time to pick your day"
        Task {
            do {
                let state = try await AlarmManager.shared.requestAuthorization()
                guard state == .authorized else { call.resolve(["ok": false, "reason": "not authorised"]); return }
                let stop = AlarmButton(text: "Done", textColor: .white, systemImageName: "checkmark")
                let alert = AlarmPresentation.Alert(title: LocalizedStringResource(stringLiteral: title), stopButton: stop)
                let attributes = AlarmAttributes<TodayAlarmMetadata>(
                    presentation: AlarmPresentation(alert: alert),
                    tintColor: Color(red: 0x2F / 255, green: 0x6F / 255, blue: 0x4E / 255))
                let config: AlarmManager.AlarmConfiguration<TodayAlarmMetadata>
                if testSeconds > 0 {
                    config = AlarmManager.AlarmConfiguration(
                        countdownDuration: Alarm.CountdownDuration(preAlert: TimeInterval(testSeconds), postAlert: nil),
                        attributes: attributes)
                } else {
                    let time = Alarm.Schedule.Relative.Time(hour: hour, minute: minute)
                    let schedule = Alarm.Schedule.relative(Alarm.Schedule.Relative(
                        time: time,
                        repeats: .weekly([.monday, .tuesday, .wednesday, .thursday, .friday, .saturday, .sunday])))
                    config = AlarmManager.AlarmConfiguration(schedule: schedule, attributes: attributes)
                }
                _ = try await AlarmManager.shared.schedule(id: Self.alarmID, configuration: config)
                call.resolve(["ok": true])
            } catch {
                call.resolve(["ok": false, "reason": error.localizedDescription])
            }
        }
        #else
        call.resolve(["ok": false, "reason": "AlarmKit unavailable"])
        #endif
    }

    @objc func cancel(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            try? AlarmManager.shared.cancel(id: Self.alarmID)
        }
        #endif
        call.resolve()
    }
}
