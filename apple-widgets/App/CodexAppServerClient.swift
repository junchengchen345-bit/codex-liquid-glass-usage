#if os(macOS)
import Foundation

/// Uses the same public local `codex app-server` RPC contract as the existing desktop widget.
/// No credential files are opened or copied; the Codex CLI remains the authenticated boundary.
struct CodexAppServerClient {
    enum ClientError: LocalizedError {
        case cannotStart
        case timedOut
        case malformedResponse
        case server(String)

        var errorDescription: String? {
            switch self {
            case .cannotStart:
                return "未找到可用的 Codex CLI。请在组件伴侣 App 中选择 codex 可执行文件。"
            case .timedOut:
                return "Codex 用量读取超时。"
            case .malformedResponse:
                return "Codex app-server 返回了无法识别的数据。"
            case let .server(message):
                return message
            }
        }
    }

    func fetchUsageSnapshot() async throws -> CodexUsageSnapshot {
        try await withCheckedThrowingContinuation { continuation in
            let process = Process()
            let input = Pipe()
            let output = Pipe()
            let state = ExchangeState()

            let executable = resolveExecutable()
            process.executableURL = executable.url
            process.arguments = executable.arguments
            process.standardInput = input
            process.standardOutput = output
            process.standardError = FileHandle.nullDevice

            let complete: (Result<CodexUsageSnapshot, Error>) -> Void = { result in
                guard !state.finished else { return }
                state.finished = true
                state.timeout?.cancel()
                output.fileHandleForReading.readabilityHandler = nil
                input.fileHandleForWriting.closeFile()
                if process.isRunning {
                    process.terminate()
                }
                continuation.resume(with: result)
            }

            let send: ([String: Any]) -> Void = { message in
                guard JSONSerialization.isValidJSONObject(message),
                      let data = try? JSONSerialization.data(withJSONObject: message)
                else { return }
                input.fileHandleForWriting.write(data)
                input.fileHandleForWriting.write(Data([0x0A]))
            }

            output.fileHandleForReading.readabilityHandler = { handle in
                let chunk = handle.availableData
                guard !chunk.isEmpty else {
                    if !state.finished {
                        complete(.failure(ClientError.server("Codex app-server 提前结束。")))
                    }
                    return
                }

                state.buffer.append(chunk)
                while let newline = state.buffer.firstIndex(of: 0x0A) {
                    let line = state.buffer.prefix(upTo: newline)
                    state.buffer.removeSubrange(...newline)
                    guard let object = try? JSONSerialization.jsonObject(with: line) as? [String: Any],
                          let id = Self.intValue(object["id"])
                    else { continue }

                    if let error = object["error"] as? [String: Any] {
                        complete(.failure(ClientError.server(Self.stringValue(error["message"]) ?? "Codex app-server 请求失败。")))
                        return
                    }

                    if id == 0, !state.initialized {
                        guard object["result"] != nil else { continue }
                        state.initialized = true
                        send(["method": "initialized", "params": [:]])
                        send(["method": "account/rateLimits/read", "id": 1, "params": NSNull()])
                        send(["method": "account/usage/read", "id": 2, "params": NSNull()])
                        continue
                    }

                    guard state.initialized, let result = object["result"] as? [String: Any] else { continue }
                    if id == 1 { state.rateLimits = result }
                    if id == 2 { state.usage = result }

                    if let rateLimits = state.rateLimits, let usage = state.usage {
                        complete(Result {
                            try Self.normalize(rateLimits: rateLimits, usage: usage)
                        })
                        return
                    }
                }
            }

            let timeout = DispatchWorkItem {
                complete(.failure(ClientError.timedOut))
            }
            state.timeout = timeout
            DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 15, execute: timeout)

            do {
                try process.run()
            } catch {
                complete(.failure(ClientError.cannotStart))
                return
            }

            send([
                "method": "initialize",
                "id": 0,
                "params": [
                    "clientInfo": [
                        "name": "codex_usage_widgetkit",
                        "title": "Codex Usage Widget",
                        "version": "0.1.0",
                    ],
                    "capabilities": [
                        "optOutNotificationMethods": [
                            "thread/started",
                            "item/started",
                            "item/completed",
                            "item/agentMessage/delta",
                        ],
                    ],
                ],
            ])
        }
    }

    private func resolveExecutable() -> (url: URL, arguments: [String]) {
        let customPath = UserDefaults.standard.string(forKey: "codexCLIPath")
        let candidates = [
            customPath,
            "/Applications/ChatGPT.app/Contents/Resources/codex",
            "/Applications/Codex.app/Contents/Resources/codex",
            NSString(string: "~/Applications/ChatGPT.app/Contents/Resources/codex").expandingTildeInPath,
            NSString(string: "~/Applications/Codex.app/Contents/Resources/codex").expandingTildeInPath,
            "/opt/homebrew/bin/codex",
            "/usr/local/bin/codex",
            NSString(string: "~/.local/bin/codex").expandingTildeInPath,
        ].compactMap { $0 }

        if let path = candidates.first(where: { FileManager.default.isExecutableFile(atPath: $0) }) {
            return (URL(fileURLWithPath: path), ["app-server", "--stdio"])
        }

        // `env` is a final fallback for terminals / developer installs with a richer PATH.
        return (URL(fileURLWithPath: "/usr/bin/env"), ["codex", "app-server", "--stdio"])
    }

    private static func normalize(rateLimits: [String: Any], usage: [String: Any]) throws -> CodexUsageSnapshot {
        let limits = normalizedLimits(from: rateLimits)
        guard !limits.isEmpty else { throw ClientError.malformedResponse }

        let primaryRateLimit = dictionary(rateLimits["rateLimits"])
        let credits = dictionary(primaryRateLimit?["credits"])
        let summary = dictionary(usage["summary"])
        let dailyUsage = (usage["dailyUsageBuckets"] as? [[String: Any]] ?? [])
            .compactMap { bucket -> CodexUsageSnapshot.DailyUsage? in
                guard let date = stringValue(bucket["startDate"])?.prefix(10),
                      date.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil
                else { return nil }
                return CodexUsageSnapshot.DailyUsage(
                    date: String(date),
                    tokens: intValue(bucket["tokens"]) ?? 0
                )
            }
            .sorted { $0.date < $1.date }

        return CodexUsageSnapshot(
            source: "codex-app-server",
            fetchedAt: .now,
            planType: stringValue(primaryRateLimit?["planType"]),
            limits: limits,
            credits: doubleValue(credits?["balance"]),
            hasCredits: boolValue(credits?["hasCredits"]),
            lifetimeTokens: intValue(summary?["lifetimeTokens"]),
            peakDailyTokens: intValue(summary?["peakDailyTokens"]),
            dailyUsage: dailyUsage
        )
    }

    private static func normalizedLimits(from response: [String: Any]) -> [CodexUsageSnapshot.Limit] {
        let explicit = dictionary(response["rateLimitsByLimitId"])
        let source: [(String, [String: Any])]

        if let explicit, !explicit.isEmpty {
            source = explicit.compactMap { key, value in
                dictionary(value).map { (key, $0) }
            }
        } else if let single = dictionary(response["rateLimits"]) {
            source = [(stringValue(single["limitId"]) ?? "codex", single)]
        } else {
            source = []
        }

        return source.compactMap { fallbackID, snapshot in
            guard let primary = dictionary(snapshot["primary"]),
                  let usedPercent = intValue(primary["usedPercent"])
            else { return nil }

            let id = stringValue(snapshot["limitId"]) ?? fallbackID
            let resetAt = intValue(primary["resetsAt"]).map { Date(timeIntervalSince1970: TimeInterval($0)) }
            return CodexUsageSnapshot.Limit(
                id: id,
                label: stringValue(snapshot["limitName"]) ?? (id == "codex" ? "通用额度" : id),
                usedPercent: min(100, max(0, usedPercent)),
                remainingPercent: min(100, max(0, 100 - usedPercent)),
                resetAt: resetAt,
                reached: stringValue(snapshot["rateLimitReachedType"]) != nil
            )
        }
        .sorted { lhs, rhs in
            if lhs.id == "codex" { return true }
            if rhs.id == "codex" { return false }
            return lhs.id < rhs.id
        }
    }

    private static func dictionary(_ value: Any?) -> [String: Any]? { value as? [String: Any] }
    private static func stringValue(_ value: Any?) -> String? {
        if let value = value as? String, !value.isEmpty { return value }
        return nil
    }
    private static func intValue(_ value: Any?) -> Int? {
        if let value = value as? Int { return value }
        if let value = value as? NSNumber { return value.intValue }
        if let value = value as? String { return Int(value) }
        return nil
    }
    private static func doubleValue(_ value: Any?) -> Double? {
        if let value = value as? Double { return value }
        if let value = value as? NSNumber { return value.doubleValue }
        if let value = value as? String { return Double(value) }
        return nil
    }
    private static func boolValue(_ value: Any?) -> Bool {
        if let value = value as? Bool { return value }
        if let value = value as? NSNumber { return value.boolValue }
        return false
    }
}

private final class ExchangeState {
    var buffer = Data()
    var initialized = false
    var rateLimits: [String: Any]?
    var usage: [String: Any]?
    var timeout: DispatchWorkItem?
    var finished = false
}
#endif
