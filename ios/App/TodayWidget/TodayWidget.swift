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

struct CatCount: Decodable {
    let name: String
    let n: Int
}

struct WeekData: Decodable {
    let days: [Int]
    let todayIdx: Int
    let total: Int
    let cats: [CatCount]
}

struct Payload: Decodable {
    let date: String
    let items: [PickItem]
    let week: WeekData?
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
        ], week: WeekData(days: [2, 1, 0, 3, 1, 0, 0], todayIdx: 4, total: 7, cats: [CatCount(name: "Home", n: 4), CatCount(name: "Body", n: 3)])))
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
private let track = Color(red: 0xD9 / 255, green: 0xE4 / 255, blue: 0xD6 / 255)

private func dotColor(_ u: String) -> Color {
    switch u {
    case "long time": return amber
    case "been a while": return Color(red: 0x8A / 255, green: 0x7A / 255, blue: 0x2E / 255)
    default: return moss
    }
}

// ============ WIDGET 1: TODAY'S PICKS ============

struct TodayWidgetView: View {
    var entry: PicksEntry
    @Environment(\.widgetFamily) var family

    var maxRows: Int { family == .systemLarge ? 6 : 3 }

    var body: some View {
        if family == .accessoryRectangular {
            // Lock screen: glanceable, tap opens the app
            VStack(alignment: .leading, spacing: 1) {
                Text("Today").font(.caption2.weight(.semibold))
                ForEach(Array((entry.payload?.items ?? []).prefix(2).enumerated()), id: \.offset) { _, item in
                    Text("· \(item.name)").font(.caption2).lineLimit(1)
                }
                if (entry.payload?.items ?? []).isEmpty {
                    Text("All clear").font(.caption2)
                }
            }
            .containerBackground(for: .widget) { Color.clear }
        } else {
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
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TodayWidget", provider: Provider()) { entry in
            TodayWidgetView(entry: entry)
        }
        .configurationDisplayName("Today's picks")
        .description("What's worth doing today — no due dates, no guilt.")
        .supportedFamilies([.systemMedium, .systemLarge, .accessoryRectangular])
    }
}

// ============ WIDGET 2: THIS WEEK ============

struct WeekWidgetView: View {
    var entry: PicksEntry
    @Environment(\.widgetFamily) var family

    private let dayLetters = ["M", "T", "W", "T", "F", "S", "S"]

    var body: some View {
        let week = entry.payload?.week
        VStack(alignment: .leading, spacing: family == .systemLarge ? 12 : 8) {
            HStack(alignment: .firstTextBaseline) {
                Text("This week")
                    .font(.system(.headline, design: .rounded).weight(.semibold))
                    .foregroundStyle(ink)
                Spacer()
                Text("\(week?.total ?? 0) done")
                    .font(.caption2)
                    .foregroundStyle(ink.opacity(0.5))
            }
            if let week = week {
                HStack(spacing: 6) {
                    ForEach(0..<7, id: \.self) { i in
                        let n = i < week.days.count ? week.days[i] : 0
                        let isToday = i == week.todayIdx
                        let future = i > week.todayIdx
                        VStack(spacing: 3) {
                            RoundedRectangle(cornerRadius: 8)
                                .fill(n > 0 ? moss.opacity(0.25 + min(Double(n) / 5.0, 1.0) * 0.75) : track.opacity(future ? 0.35 : 1))
                                .frame(height: family == .systemLarge ? 40 : 28)
                                .overlay(
                                    Text(future ? "" : (n > 0 ? "\(n)" : "·"))
                                        .font(.system(.footnote, design: .rounded).weight(.semibold))
                                        .foregroundStyle(n >= 3 ? Color.white : ink.opacity(0.7))
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8)
                                        .strokeBorder(isToday ? moss : Color.clear, lineWidth: 1.5)
                                )
                            Text(dayLetters[i])
                                .font(.caption2)
                                .foregroundStyle(ink.opacity(isToday ? 0.9 : 0.45))
                        }
                    }
                }
                if family == .systemLarge {
                    if week.cats.isEmpty {
                        Text("Nothing yet this week — the week is young.")
                            .font(.footnote)
                            .foregroundStyle(ink.opacity(0.55))
                    } else {
                        let maxCat = max(week.cats.map(\.n).max() ?? 1, 1)
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(Array(week.cats.enumerated()), id: \.offset) { _, c in
                                VStack(alignment: .leading, spacing: 3) {
                                    HStack {
                                        Text(c.name).font(.system(.footnote, design: .rounded)).foregroundStyle(ink)
                                        Spacer()
                                        Text("\(c.n)").font(.caption2).foregroundStyle(ink.opacity(0.5))
                                    }
                                    GeometryReader { geo in
                                        ZStack(alignment: .leading) {
                                            Capsule().fill(track)
                                            Capsule().fill(moss).frame(width: geo.size.width * CGFloat(c.n) / CGFloat(maxCat))
                                        }
                                    }
                                    .frame(height: 5)
                                }
                            }
                        }
                    }
                }
            } else {
                Text("Open Today to start the week.")
                    .font(.footnote)
                    .foregroundStyle(ink.opacity(0.55))
            }
            Spacer(minLength: 0)
        }
        .containerBackground(card, for: .widget)
    }
}

struct TodayWeekWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TodayWeekWidget", provider: Provider()) { entry in
            WeekWidgetView(entry: entry)
        }
        .configurationDisplayName("This week")
        .description("How the week is going — day by day, category by category.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

@main
struct TodayWidgetBundle: WidgetBundle {
    var body: some Widget {
        TodayWidget()
        TodayWeekWidget()
    }
}
