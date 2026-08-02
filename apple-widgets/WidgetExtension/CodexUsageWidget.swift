import SwiftUI
import WidgetKit

struct CodexUsageTimelineEntry: TimelineEntry {
    let date: Date
    let snapshot: CodexUsageSnapshot?

    static let preview = CodexUsageTimelineEntry(date: .now, snapshot: .preview)
}

struct CodexUsageTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> CodexUsageTimelineEntry {
        .preview
    }

    func getSnapshot(in context: Context, completion: @escaping (CodexUsageTimelineEntry) -> Void) {
        let snapshot = context.isPreview
            ? CodexUsageSnapshot.preview
            : CodexUsageSnapshotStore.shared.loadNewestAvailableSnapshot()
        completion(CodexUsageTimelineEntry(date: .now, snapshot: snapshot))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CodexUsageTimelineEntry>) -> Void) {
        let snapshot = CodexUsageSnapshotStore.shared.loadNewestAvailableSnapshot()
        let entry = CodexUsageTimelineEntry(date: .now, snapshot: snapshot)
        let nextRefresh = Calendar.current.date(byAdding: .minute, value: 15, to: .now) ?? .now.addingTimeInterval(900)
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }
}

struct CodexUsageWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: CodexUsageWidgetKind.value, provider: CodexUsageTimelineProvider()) { entry in
            CodexUsageWidgetView(entry: entry)
                .widgetURL(URL(string: "codexusage://open"))
                .containerBackground(for: .widget) {
                    WidgetLiquidBackground()
                }
        }
        .configurationDisplayName("Codex 用量")
        .description("查看 Codex 周额度、下次重置时间和近期 Token 活动。")
        .supportedFamilies([.systemSmall, .systemMedium])
        .contentMarginsDisabled()
    }
}

private struct CodexUsageWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: CodexUsageTimelineEntry

    var body: some View {
        Group {
            if let snapshot = entry.snapshot {
                switch family {
                case .systemMedium:
                    CodexUsageMediumWidget(snapshot: snapshot)
                default:
                    CodexUsageSmallWidget(snapshot: snapshot)
                }
            } else {
                CodexUsageEmptyWidget()
            }
        }
        .foregroundStyle(.primary)
        .privacySensitive(false)
    }
}

private struct CodexUsageSmallWidget: View {
    let snapshot: CodexUsageSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            WidgetHeader(plan: snapshot.planType)

            HStack(alignment: .center, spacing: 10) {
                QuotaGauge(limit: snapshot.generalLimit, diameter: 82)
                VStack(alignment: .leading, spacing: 5) {
                    Text(snapshot.generalLimit?.label ?? "通用额度")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Text(CodexUsageFormat.resetText(snapshot.generalLimit?.resetAt))
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                    if let spark = snapshot.sparkLimit {
                        Label("Spark \(spark.safeRemainingPercent)%", systemImage: "bolt.fill")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.purple)
                    }
                }
            }

            Spacer(minLength: 0)

            HStack(spacing: 5) {
                Circle().fill(.green).frame(width: 6, height: 6)
                Text(CodexUsageFormat.freshnessText(snapshot.fetchedAt))
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(.secondary)
                Spacer()
                Text("用量")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(15)
    }
}

private struct CodexUsageMediumWidget: View {
    let snapshot: CodexUsageSnapshot

    var body: some View {
        HStack(spacing: 15) {
            VStack(alignment: .leading, spacing: 8) {
                WidgetHeader(plan: snapshot.planType)
                QuotaGauge(limit: snapshot.generalLimit, diameter: 90)
                HStack(spacing: 5) {
                    Circle().fill(.green).frame(width: 6, height: 6)
                    Text(CodexUsageFormat.resetText(snapshot.generalLimit?.resetAt))
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(.secondary)
                }
            }
            .frame(width: 108)

            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("累计 Token")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Text(CodexUsageFormat.compactTokens(snapshot.lifetimeTokens))
                            .font(.title3.weight(.bold))
                            .monospacedDigit()
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("Spark")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Text("\(snapshot.sparkLimit?.safeRemainingPercent ?? 0)%")
                            .font(.headline.weight(.bold))
                            .foregroundStyle(.purple)
                            .monospacedDigit()
                    }
                }

                MiniActivityStrip(days: snapshot.recentActivity)

                HStack(spacing: 5) {
                    Image(systemName: "arrow.triangle.2.circlepath")
                    Text(CodexUsageFormat.freshnessText(snapshot.fetchedAt))
                    Spacer()
                    if snapshot.hasCredits, let credits = snapshot.credits {
                        Text(String(format: "%.0f credits", credits))
                    }
                }
                .font(.caption2.weight(.medium))
                .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(15)
    }
}

private struct WidgetHeader: View {
    let plan: String?

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "sparkles.rectangle.stack.fill")
                .foregroundStyle(.blue, .purple)
            Text("codex")
                .font(.caption.weight(.heavy))
            Spacer()
            if let plan, !plan.isEmpty {
                Text(plan.uppercased())
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

private struct CodexUsageEmptyWidget: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            WidgetHeader(plan: nil)
            Spacer()
            Image(systemName: "icloud.and.arrow.down")
                .font(.title2)
                .foregroundStyle(.blue)
            Text("等待用量快照")
                .font(.headline)
            Text("请在 Mac 上打开 Codex 用量并刷新。")
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding(15)
    }
}

private struct WidgetLiquidBackground: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color.indigo.opacity(0.48), Color.purple.opacity(0.33), Color.cyan.opacity(0.22)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            ContainerRelativeShape()
                .fill(.ultraThinMaterial)
            ContainerRelativeShape()
                .stroke(.white.opacity(0.48), lineWidth: 1)
        }
    }
}

#if DEBUG
struct CodexUsageWidget_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            CodexUsageSmallWidget(snapshot: .preview)
                .previewContext(WidgetPreviewContext(family: .systemSmall))
            CodexUsageMediumWidget(snapshot: .preview)
                .previewContext(WidgetPreviewContext(family: .systemMedium))
        }
    }
}
#endif
