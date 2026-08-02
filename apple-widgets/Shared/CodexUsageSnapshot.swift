import Foundation

/// Shared, credential-free payload consumed by the macOS/iOS app and WidgetKit extension.
/// It intentionally stores usage totals and limits only; tokens and account identifiers never
/// leave the locally authenticated Codex app-server process.
struct CodexUsageSnapshot: Codable, Equatable, Sendable {
    struct Limit: Codable, Equatable, Sendable, Identifiable {
        let id: String
        let label: String
        let usedPercent: Int
        let remainingPercent: Int
        let resetAt: Date?
        let reached: Bool

        var safeRemainingPercent: Int {
            min(100, max(0, remainingPercent))
        }
    }

    struct DailyUsage: Codable, Equatable, Sendable, Identifiable {
        let date: String
        let tokens: Int

        var id: String { date }
    }

    let source: String
    let fetchedAt: Date
    let planType: String?
    let limits: [Limit]
    let credits: Double?
    let hasCredits: Bool
    let lifetimeTokens: Int?
    let peakDailyTokens: Int?
    let dailyUsage: [DailyUsage]

    var generalLimit: Limit? {
        limits.first(where: { $0.id == "codex" }) ?? limits.first
    }

    var sparkLimit: Limit? {
        limits.first(where: { $0.id != generalLimit?.id })
    }

    var recentActivity: [DailyUsage] {
        Array(dailyUsage.suffix(14))
    }

    var activeDayCount: Int {
        dailyUsage.filter { $0.tokens > 0 }.count
    }

    static let preview = CodexUsageSnapshot(
        source: "preview",
        fetchedAt: .now,
        planType: "Pro",
        limits: [
            Limit(
                id: "codex",
                label: "通用额度",
                usedPercent: 19,
                remainingPercent: 81,
                resetAt: Calendar.current.date(byAdding: .hour, value: 18, to: .now),
                reached: false
            ),
            Limit(
                id: "spark",
                label: "Spark 额度",
                usedPercent: 0,
                remainingPercent: 100,
                resetAt: Calendar.current.date(byAdding: .day, value: 1, to: .now),
                reached: false
            ),
        ],
        credits: 1_862.46,
        hasCredits: true,
        lifetimeTokens: 786_000_000,
        peakDailyTokens: 101_000_000,
        dailyUsage: Self.previewActivity
    )

    private static var previewActivity: [DailyUsage] {
        let calendar = Calendar.current
        let weights = [0, 2, 5, 0, 8, 14, 6, 0, 20, 38, 16, 53, 26, 41]
        return weights.enumerated().compactMap { index, weight in
            guard let day = calendar.date(byAdding: .day, value: index - weights.count + 1, to: .now) else {
                return nil
            }
            return DailyUsage(
                date: Self.dayFormatter.string(from: day),
                tokens: weight * 1_000_000
            )
        }
    }

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}

enum CodexUsageFormat {
    static func compactTokens(_ value: Int?) -> String {
        guard let value else { return "—" }
        let number = Double(value)
        switch number {
        case 100_000_000...:
            return String(format: "%.2f亿", number / 100_000_000)
        case 10_000...:
            return String(format: "%.1f万", number / 10_000)
        default:
            return NumberFormatter.localizedString(from: NSNumber(value: value), number: .decimal)
        }
    }

    static func resetText(_ date: Date?, relativeTo now: Date = .now) -> String {
        guard let date else { return "等待同步" }
        let seconds = max(0, date.timeIntervalSince(now))
        if seconds < 60 { return "即将重置" }

        let components = Calendar.current.dateComponents([.day, .hour, .minute], from: now, to: date)
        if let day = components.day, day > 0 {
            return "\(day) 天 \(components.hour ?? 0) 小时"
        }
        if let hour = components.hour, hour > 0 {
            return "\(hour) 小时 \(components.minute ?? 0) 分"
        }
        return "\(max(1, components.minute ?? 0)) 分钟"
    }

    static func freshnessText(_ date: Date, relativeTo now: Date = .now) -> String {
        let seconds = max(0, now.timeIntervalSince(date))
        if seconds < 60 { return "刚刚同步" }
        if seconds < 3_600 { return "\(Int(seconds / 60)) 分钟前" }
        if seconds < 86_400 { return "\(Int(seconds / 3_600)) 小时前" }
        return "\(Int(seconds / 86_400)) 天前"
    }
}
