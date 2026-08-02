import Foundation

#if canImport(WidgetKit)
import WidgetKit
#endif

enum CodexUsageWidgetConfiguration {
    static let appGroup = "group.io.github.junchengchen345bit.CodexUsage"
    static let snapshotKey = "codexUsageSnapshot.v1"
    static let cloudSnapshotKey = "codexUsageSnapshot.v1"
    static let cloudSyncSettingKey = "codexUsageCloudSyncEnabled"
}

/// App Group is used for immediate app → local widget handoff. iCloud KVS is optional and
/// copies only the sanitized snapshot between a user's Mac and iPhone on the same Apple ID.
final class CodexUsageSnapshotStore {
    static let shared = CodexUsageSnapshotStore()

    private let defaults: UserDefaults?
    private let groupContainerURL: URL?
    private let cloudStore: NSUbiquitousKeyValueStore
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    private init(
        defaults: UserDefaults? = UserDefaults(suiteName: CodexUsageWidgetConfiguration.appGroup),
        cloudStore: NSUbiquitousKeyValueStore = .default
    ) {
        self.defaults = defaults
        self.groupContainerURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: CodexUsageWidgetConfiguration.appGroup
        )
        self.cloudStore = cloudStore
        self.cloudStore.synchronize()
    }

    /// UserDefaults can be constructed without a granted entitlement on some systems.
    /// Verify the actual shared container as well, otherwise host and extension could diverge.
    var isAppGroupAvailable: Bool { defaults != nil && groupContainerURL != nil }

    func load() -> CodexUsageSnapshot? {
        guard let defaults else { return nil }
        return decode(defaults.data(forKey: CodexUsageWidgetConfiguration.snapshotKey))
    }

    func loadNewestAvailableSnapshot() -> CodexUsageSnapshot? {
        let local = load()
        let cloud = decode(cloudStore.data(forKey: CodexUsageWidgetConfiguration.cloudSnapshotKey))

        guard let cloud else { return local }
        guard let local, local.fetchedAt >= cloud.fetchedAt else {
            _ = writeToLocalContainer(cloud)
            return cloud
        }
        return local
    }

    @discardableResult
    func save(_ snapshot: CodexUsageSnapshot, syncToCloud: Bool) -> Bool {
        var didChange = writeToLocalContainer(snapshot)
        if syncToCloud, let data = try? encoder.encode(snapshot) {
            if cloudStore.data(forKey: CodexUsageWidgetConfiguration.cloudSnapshotKey) != data {
                cloudStore.set(data, forKey: CodexUsageWidgetConfiguration.cloudSnapshotKey)
                cloudStore.synchronize()
                didChange = true
            }
        }
        if didChange {
            reloadWidgetTimelines()
        }
        return didChange
    }

    @discardableResult
    func importLatestCloudSnapshot() -> CodexUsageSnapshot? {
        guard let cloud = decode(cloudStore.data(forKey: CodexUsageWidgetConfiguration.cloudSnapshotKey)) else {
            return load()
        }
        guard let local = load(), local.fetchedAt >= cloud.fetchedAt else {
            if writeToLocalContainer(cloud) {
                reloadWidgetTimelines()
            }
            return cloud
        }
        return local
    }

    func observeCloudChanges(using handler: @escaping () -> Void) -> NSObjectProtocol {
        NotificationCenter.default.addObserver(
            forName: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
            object: cloudStore,
            queue: .main
        ) { _ in
            handler()
        }
    }

    private func writeToLocalContainer(_ snapshot: CodexUsageSnapshot) -> Bool {
        guard let defaults, let data = try? encoder.encode(snapshot) else { return false }
        guard defaults.data(forKey: CodexUsageWidgetConfiguration.snapshotKey) != data else { return false }
        defaults.set(data, forKey: CodexUsageWidgetConfiguration.snapshotKey)
        return true
    }

    private func decode(_ data: Data?) -> CodexUsageSnapshot? {
        guard let data else { return nil }
        return try? decoder.decode(CodexUsageSnapshot.self, from: data)
    }

    private func reloadWidgetTimelines() {
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadTimelines(ofKind: CodexUsageWidgetKind.value)
        #endif
    }
}

enum CodexUsageWidgetKind {
    static let value = "io.github.junchengchen345bit.CodexUsage.quota"
}
