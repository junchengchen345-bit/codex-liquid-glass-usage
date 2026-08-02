import SwiftUI

struct QuotaGauge: View {
    let limit: CodexUsageSnapshot.Limit?
    let diameter: CGFloat

    private var remaining: Double {
        Double(limit?.safeRemainingPercent ?? 0) / 100
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(.white.opacity(0.16), style: StrokeStyle(lineWidth: diameter * 0.13, lineCap: .round))

            Circle()
                .trim(from: 0, to: remaining)
                .stroke(
                    AngularGradient(
                        colors: [.cyan, .blue, .purple, .cyan],
                        center: .center
                    ),
                    style: StrokeStyle(lineWidth: diameter * 0.13, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .shadow(color: .cyan.opacity(0.42), radius: 8)

            VStack(spacing: 2) {
                Text("\(limit?.safeRemainingPercent ?? 0)%")
                    .font(.system(size: diameter * 0.27, weight: .bold, design: .rounded))
                    .monospacedDigit()
                Text("本周剩余")
                    .font(.system(size: diameter * 0.11, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: diameter, height: diameter)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(limit?.label ?? "通用额度")，剩余 \(limit?.safeRemainingPercent ?? 0)%")
    }
}

struct MiniActivityStrip: View {
    let days: [CodexUsageSnapshot.DailyUsage]

    private var peak: Int {
        max(days.map(\.tokens).max() ?? 0, 1)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Label("Token 活动", systemImage: "chart.bar.xaxis")
                    .font(.caption.weight(.semibold))
                Spacer()
                Text("低 → 高")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 4) {
                ForEach(days) { day in
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill(activityGradient(for: day.tokens))
                        .frame(maxWidth: .infinity, minHeight: 16, maxHeight: 26)
                        .overlay(alignment: .top) {
                            RoundedRectangle(cornerRadius: 4, style: .continuous)
                                .fill(.white.opacity(day.tokens > 0 ? 0.22 : 0.06))
                                .frame(height: 1)
                        }
                        .accessibilityLabel("\(day.date)，\(CodexUsageFormat.compactTokens(day.tokens)) Token")
                }
            }
        }
    }

    private func activityGradient(for tokens: Int) -> LinearGradient {
        let intensity = min(1, sqrt(Double(max(tokens, 0)) / Double(peak)))
        let start = Color.cyan.opacity(0.13 + (intensity * 0.75))
        let end = Color.purple.opacity(0.12 + (intensity * 0.82))
        return LinearGradient(colors: [start, end], startPoint: .bottomLeading, endPoint: .topTrailing)
    }
}
