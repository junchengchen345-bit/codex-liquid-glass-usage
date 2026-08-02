# Codex macOS desktop widget

## Run locally

```bash
npm install
npm run desktop:dev
```

The development command starts Vite and the Tauri window together. The app reads the locally authenticated Codex account through `codex app-server`; it does not read `auth.json`, browser cookies or access tokens.

## Build the app

```bash
npm run desktop:build
```

The macOS bundle is created at:

```text
src-tauri/target/release/bundle/macos/Codex.app
```

## Window behavior

- Starts on the desktop layer and appears on every Space.
- Drag the empty area of the header to move it.
- The pin button switches between desktop-layer and always-on-top modes.
- The palette button opens presets and all Liquid Glass controls.
- Data refreshes once per minute; the refresh button forces an immediate update.

## Distribution note

Transparent WKWebView windows use Tauri's macOS private API option. The app can be distributed directly after normal signing/notarization, but this configuration is not suitable for Mac App Store submission.
