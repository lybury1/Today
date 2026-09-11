import WidgetKit
import SwiftUI

// Reads the JSON snapshot the app writes to the shared app-group container.
// The app pushes a fresh snapshot (and a reload) whenever the day's picks change.

struct PickItem: Decodable {
    let name: String
    let cat: String
    let effort: Int
    let u: String
}

struct Payload: Decodable {
    let date: String
    let items: [PickItem]
}

struct PicksEntry: TimelineEntry {
    let date: Date
    let payload: Payload?
}

struct Provider: TimelineProvider {
    private func load() -> Payload? {
        guard let s = UserDefaults(suiteName: "group.com.lybury1.today")?.string(forKey: "widget-data"),
              let d = s.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(Payload.self, from: d)
    }

    func placeholder(in context: Context) -> PicksEntry {
        PicksEntry(date: .now, payload: Payload(date: "Today", items: [
            PickItem(name: "Stretch 10 min", cat: "Body", effort: 10, u: "ready"),
            PickItem(name: "Water plants", cat: "Home", effort: 5, u: "ready"),
        ]))
    }

    func getSnapshot(in context: Context, completion: @escaping (PicksEntry) -> Void) {
        completion(PicksEntry(date: .now, payload: load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PicksEntry>) -> Void) {
        // One entry now; ask for a refresh just after midnight so the date rolls
        // over even if the app isn't opened. The app also reloads us on change.
        let next = Calendar.current.nextDate(after: .now, matching: DateComponents(hour: 0, minute: 5), matchingPolicy: .nextTime) ?? .now.addingTimeInterval(3600)
        completion(Timeline(entries: [PicksEntry(date: .now, payload: load())], policy: .after(next)))
    }
}

// Palette (matches the app)
private let ink = Color(red: 0x1F / 255, green: 0x2A / 255, blue: 0x22 / 255)
private let moss = Color(red: 0x2F / 255, green: 0x6F / 255, blue: 0x4E / 255)
private let amber = Color(red: 0xC9 / 255, green: 0x89 / 255, blue: 0x2A / 255)
private let card = Color(red: 0xF6 / 255, green: 0xF8 / 255, blue: 0xF4 / 255)

private func dotColor(_ u: String) -> Color {
    switch u {
    case "long time": return amber
    case "been a while": return Color(red: 0x8A / 255, green: 0x7A / 255, blue: 0x2E / 255)
    default: return moss
    }
}

struct TodayWidgetView: View {
    var entry: PicksEntry
    @Environment(\.widgetFamily) var family

    var maxRows: Int { family == .systemLarge ? 6 : 3 }

    var body: some View {
        VStack(alignment: .leading, spacing: family == .systemLarge ? 10 : 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(entry.payload?.date ?? "Today")
                    .font(.system(.headline, design: .rounded).weight(.semibold))
                    .foregroundStyle(ink)
                Spacer()
                if let n = entry.payload?.items.count, n > 0 {
                    Text("\(n) worth doing")
                        .font(.caption2)
                        .foregroundStyle(ink.opacity(0.5))
                }
            }
            if let items = entry.payload?.items, !items.isEmpty {
                ForEach(Array(items.prefix(maxRows).enumerated()), id: \.offset) { _, item in
                    HStack(spacing: 8) {
                        Circle().fill(dotColor(item.u)).frame(width: 8, height: 8)
                        Text(item.name)
                            .font(.system(.footnote, design: .rounded))
                            .foregroundStyle(ink)
                            .lineLimit(1)
                        Spacer(minLength: 4)
                        Text("\(item.effort)m")
                            .font(.caption2)
                            .foregroundStyle(ink.opacity(0.45))
                    }
                }
                if let extra = entry.payload.map({ $0.items.count - maxRows }), extra > 0 {
                    Text("+ \(extra) more in the app")
                        .font(.caption2)
                        .foregroundStyle(ink.opacity(0.45))
                }
            } else {
                Text("Nothing waiting. Open Today to plan your day.")
                    .font(.footnote)
                    .foregroundStyle(ink.opacity(0.55))
            }
            Spacer(minLength: 0)
        }
        .containerBackground(card, for: .widget)
    }
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TodayWidget", provider: Provider()) { entry in
            TodayWidgetView(entry: entry)
        }
        .configurationDisplayName("Today's picks")
        .description("What's worth doing today — no due dates, no guilt.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

@main
struct TodayWidgetBundle: WidgetBundle {
    var body: some Widget {
        TodayWidget()
    }
}
