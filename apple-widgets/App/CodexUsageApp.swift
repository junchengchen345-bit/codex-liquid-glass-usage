import SwiftUI

@main
struct CodexUsageApp: App {
    var body: some Scene {
        WindowGroup {
            CompanionHomeView()
                .onOpenURL { _ in
                    // Opening a WidgetKit tile brings the companion to the foreground.
                }
        }
        #if os(macOS)
        .defaultSize(width: 680, height: 620)
        #endif
    }
}
