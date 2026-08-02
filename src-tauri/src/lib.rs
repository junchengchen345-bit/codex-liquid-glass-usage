mod codex_usage;

use codex_usage::{read_codex_usage, UsageBridge};
#[cfg(target_os = "macos")]
use tauri::Manager;

#[cfg(target_os = "macos")]
fn apply_macos_glass(window: &tauri::WebviewWindow) {
    use objc2_web_kit::WKWebView;
    use window_vibrancy::{
        apply_liquid_glass, apply_vibrancy, LiquidGlassOptions, NSGlassEffectViewStyle,
        NSVisualEffectMaterial, NSVisualEffectState,
    };

    let glass_window = window.clone();
    let fallback_window = window.clone();

    if let Err(webview_error) = window.with_webview(move |platform_webview| {
        // Keep WKWebView inside NSGlassEffectView.contentView. Leaving both views as
        // siblings makes WindowServer briefly sample stale WebView frames while the
        // transparent window is being dragged.
        let webview: &WKWebView = unsafe { &*platform_webview.inner().cast() };
        let liquid_glass = LiquidGlassOptions::new(NSGlassEffectViewStyle::Clear)
            .radius(36.0)
            .opaque(false)
            .content_view(webview);

        if let Err(liquid_error) = apply_liquid_glass(&glass_window, liquid_glass) {
            log::info!("Liquid Glass is unavailable; falling back to vibrancy: {liquid_error}");

            if let Err(vibrancy_error) = apply_vibrancy(
                &glass_window,
                NSVisualEffectMaterial::UnderWindowBackground,
                Some(NSVisualEffectState::Active),
                Some(36.0),
            ) {
                log::warn!("Unable to apply the macOS vibrancy fallback: {vibrancy_error}");
            }
        }
    }) {
        log::warn!("Unable to access WKWebView for Liquid Glass: {webview_error}");

        if let Err(vibrancy_error) = apply_vibrancy(
            &fallback_window,
            NSVisualEffectMaterial::UnderWindowBackground,
            Some(NSVisualEffectState::Active),
            Some(36.0),
        ) {
            log::warn!("Unable to apply the macOS vibrancy fallback: {vibrancy_error}");
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(UsageBridge::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                apply_macos_glass(&window);
            } else {
                log::warn!("The main window was not available during macOS glass setup.");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![read_codex_usage])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
