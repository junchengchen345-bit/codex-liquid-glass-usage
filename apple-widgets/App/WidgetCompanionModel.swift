import Combine
import Foundation

@MainActor
final class WidgetCompanionModel: ObservableObject {
    @Published private(set) var snapshot: CodexUsageSnapshot?
    @Published private(set) var isRefreshing = false
    @Published private(set) var statusMessage = "正在检查组件快照"
    @Published var cloudSyncEnabled: Bool {
        didSet {
            UserDefaults.standard.set(cloudSyncEnabled, forKey: CodexUsageWidgetConfiguration.cloudSyncSettingKey)
            if cloudSyncEnabled, let snapshot {
                _ = store.save(snapshot, syncToCloud: true)
            }
        }
    }

    private let store = CodexUsageSnapshotStore.shared
    private var cloudChangeObserver: NSObjectProtocol?

    init() {
        cloudSyncEnabled = UserDefaults.standard.bool(forKey: CodexUsageWidgetConfiguration.cloudSyncSettingKey)
        snapshot = store.loadNewestAvailableSnapshot()
        statusMessage = !store.isAppGroupAvailable
            ? "需要在 Xcode 启用 App Groups 后才能添加小组件"
            : snapshot.map { "最近同步：\(CodexUsageFormat.freshnessText($0.fetchedAt))" } ?? "等待首次同步"

        cloudChangeObserver = store.observeCloudChanges { [weak self] in
            Task { @MainActor [weak self] in
                self?.importCloudSnapshot()
            }
        }
    }

    deinit {
        if let cloudChangeObserver {
            NotificationCenter.default.removeObserver(cloudChangeObserver)
        }
    }

    func start() {
        guard store.isAppGroupAvailable else { return }
        importCloudSnapshot()

        #if os(macOS)
        if snapshot == nil {
            refreshFromCodex()
        }
        #endif
    }

    func importCloudSnapshot() {
        guard store.isAppGroupAvailable else {
            statusMessage = "需要在 Xcode 为 App 和组件启用同一个 App Group"
            return
        }
        if let cloud = store.importLatestCloudSnapshot() {
            snapshot = cloud
            statusMessage = "最近同步：\(CodexUsageFormat.freshnessText(cloud.fetchedAt))"
        } else {
            statusMessage = "等待 Mac 同步快照"
        }
    }

    #if os(macOS)
    func refreshFromCodex() {
        guard !isRefreshing else { return }
        guard store.isAppGroupAvailable else {
            statusMessage = "请先在 Xcode 的 Signing & Capabilities 中启用 App Groups"
            return
        }
        isRefreshing = true
        statusMessage = "正在读取本机 Codex 用量"

        Task {
            do {
                let fresh = try await CodexAppServerClient().fetchUsageSnapshot()
                _ = store.save(fresh, syncToCloud: cloudSyncEnabled)
                snapshot = fresh
                statusMessage = cloudSyncEnabled
                    ? "已同步到 iCloud · \(CodexUsageFormat.freshnessText(fresh.fetchedAt))"
                    : "已刷新本机组件 · \(CodexUsageFormat.freshnessText(fresh.fetchedAt))"
            } catch {
                statusMessage = "读取失败：\(error.localizedDescription)"
            }
            isRefreshing = false
        }
    }
    #endif
}
