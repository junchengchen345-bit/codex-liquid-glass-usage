import SwiftUI

#if os(macOS)
import AppKit
import UniformTypeIdentifiers
#endif

struct CompanionHomeView: View {
    @StateObject private var model = WidgetCompanionModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    header
                    quotaPreview
                    syncPanel
                    installationPanel
                }
                .padding(20)
            }
            .background(CompanionBackdrop())
            .navigationTitle("Codex 用量")
            .toolbar {
                #if os(macOS)
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        model.refreshFromCodex()
                    } label: {
                        Label("立即刷新", systemImage: "arrow.clockwise")
                    }
                    .disabled(model.isRefreshing)
                }
                #endif
            }
        }
        .task { model.start() }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "sparkles.rectangle.stack.fill")
                .font(.system(size: 26, weight: .semibold))
                .foregroundStyle(
                    LinearGradient(
                        colors: [.cyan, .blue, .purple],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 48, height: 48)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text("你的 Codex 桌面组件")
                    .font(.title3.weight(.bold))
                Text(model.statusMessage)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)

            if model.isRefreshing {
                ProgressView()
                    .controlSize(.small)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var quotaPreview: some View {
        let snapshot = model.snapshot ?? .preview
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Label("组件预览", systemImage: "rectangle.3.group.fill")
                    .font(.headline)
                Spacer()
                Text(snapshot.planType?.uppercased() ?? "CODEX")
                    .font(.caption.weight(.bold))
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background(.white.opacity(0.16), in: Capsule())
            }

            HStack(alignment: .center, spacing: 18) {
                QuotaGauge(limit: snapshot.generalLimit, diameter: 104)

                VStack(alignment: .leading, spacing: 10) {
                    MetricLine(
                        title: "Spark 额度",
                        value: snapshot.sparkLimit.map { "\($0.safeRemainingPercent)%" } ?? "—",
                        detail: CodexUsageFormat.resetText(snapshot.sparkLimit?.resetAt),
                        tint: .purple
                    )
                    MetricLine(
                        title: "累计 Token",
                        value: CodexUsageFormat.compactTokens(snapshot.lifetimeTokens),
                        detail: "\(snapshot.activeDayCount) 个活动日",
                        tint: .cyan
                    )
                }
                Spacer(minLength: 0)
            }

            MiniActivityStrip(days: snapshot.recentActivity)
        }
        .padding(18)
        .background(CompanionGlass(fill: .white.opacity(0.14)))
    }

    private var syncPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("跨设备数据同步", systemImage: "icloud.and.arrow.up")
                .font(.headline)

            Toggle(isOn: $model.cloudSyncEnabled) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("通过 iCloud 同步安全快照")
                    Text("仅同步额度、Token 统计和更新时间；不会同步 Codex 登录信息或访问令牌。")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .toggleStyle(.switch)

            #if os(macOS)
            HStack(spacing: 10) {
                Button {
                    model.refreshFromCodex()
                } label: {
                    Label("刷新并更新桌面组件", systemImage: "arrow.triangle.2.circlepath")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.indigo)
                .disabled(model.isRefreshing)

                Button("选择 Codex CLI") {
                    selectCodexCLI()
                }
                .buttonStyle(.bordered)
            }
            #else
            Label("在 Mac 上打开 Codex 用量并刷新后，此 iPhone 会自动拿到最新快照。", systemImage: "arrow.down.circle")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            #endif
        }
        .padding(18)
        .background(CompanionGlass(fill: .white.opacity(0.12)))
    }

    private var installationPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("添加组件", systemImage: "plus.rectangle.on.rectangle")
                .font(.headline)

            #if os(macOS)
            Text("在桌面空白处点按右键 → 编辑小组件 → 搜索“Codex 用量” → 选择小号或中号组件。")
            #else
            Text("长按主屏幕 → 编辑主屏幕 → 添加小组件 → 搜索“Codex 用量” → 选择小号或中号组件。")
            #endif
        }
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(CompanionGlass(fill: .white.opacity(0.1)))
    }

    #if os(macOS)
    private func selectCodexCLI() {
        let panel = NSOpenPanel()
        panel.title = "选择 Codex 可执行文件"
        panel.message = "请选择名为 codex 的可执行文件。"
        panel.prompt = "使用此文件"
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.allowedContentTypes = [.unixExecutable]

        guard panel.runModal() == .OK, let url = panel.url else { return }
        UserDefaults.standard.set(url.path, forKey: "codexCLIPath")
        model.refreshFromCodex()
    }
    #endif
}

private struct MetricLine: View {
    let title: String
    let value: String
    let detail: String
    let tint: Color

    var body: some View {
        HStack(spacing: 9) {
            Circle()
                .fill(tint)
                .frame(width: 8, height: 8)
                .shadow(color: tint.opacity(0.7), radius: 5)
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                Text(value).font(.title3.weight(.bold)).monospacedDigit()
            }
            Spacer()
            Text(detail)
                .font(.caption2.weight(.medium))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.trailing)
        }
    }
}

private struct CompanionBackdrop: View {
    var body: some View {
        LinearGradient(
            colors: [Color.indigo.opacity(0.28), Color.purple.opacity(0.16), Color.cyan.opacity(0.14)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }
}

private struct CompanionGlass: View {
    let fill: Color

    var body: some View {
        RoundedRectangle(cornerRadius: 22, style: .continuous)
            .fill(.ultraThinMaterial)
            .overlay {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(.white.opacity(0.56), lineWidth: 1)
            }
            .overlay {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(fill)
            }
    }
}

#if DEBUG
struct CompanionHomeView_Previews: PreviewProvider {
    static var previews: some View {
        CompanionHomeView()
    }
}
#endif
