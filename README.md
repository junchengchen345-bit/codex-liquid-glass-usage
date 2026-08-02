# Codex Liquid Glass Usage

An unofficial, privacy-conscious macOS dashboard for viewing Codex rate limits,
reset times, credits, and token activity through the documented local
`codex app-server` protocol.

> This is an independent community project. It is not affiliated with,
> endorsed by, or maintained by OpenAI.

## Features

- Live Codex rate-limit percentages and reset times
- Daily, 30-day, and lifetime token activity
- Native transparent macOS Liquid Glass window
- Appearance presets, adjustable glass controls, and reduced-motion support
- One-minute automatic refresh and manual refresh
- No direct access to `auth.json`, browser cookies, access tokens, or raw account identifiers
- Optional experimental WidgetKit companion for macOS and iPhone

## Requirements

- macOS 14 or newer
- Node.js 20 or newer
- Rust 1.77.2 or newer
- A locally installed and authenticated Codex CLI or Codex desktop app
- Xcode 16 or newer only when building the WidgetKit companion

## Run locally

```bash
npm ci
npm run desktop:dev
```

The development command starts Vite and the Tauri window together. A browser
preview is also available with `npm run dev`.

## Build

```bash
npm run desktop:build
```

The macOS app bundle is written to:

```text
src-tauri/target/release/bundle/macos/Codex.app
```

The transparent Tauri window uses a macOS private API. Direct distribution is
possible after normal signing and notarization, but this configuration is not
suitable for Mac App Store submission.

## How data flows

```text
Codex CLI / desktop app
        |
        | local JSON-RPC over stdio
        v
codex app-server
        |
        | normalized usage snapshot
        v
Tauri dashboard (memory + five-second process cache)
```

The app requests `account/rateLimits/read` and `account/usage/read` from the
local app server. It does not open credential files or send analytics. Visual
preferences are stored in the WebView's `localStorage`; account data is not.

The optional WidgetKit companion stores a minimized snapshot in an App Group.
Its iPhone view can use iCloud Key-Value Store to receive that snapshot from a
Mac. This is optional and is not a real-time sync channel. See
[apple-widgets/README.md](apple-widgets/README.md) for setup and data-boundary
details.

## Repository structure

```text
src/                React dashboard
server/             Browser-preview bridge to codex app-server
src-tauri/          Rust/Tauri desktop host
apple-widgets/      Experimental SwiftUI + WidgetKit companion
```

## Project status

The Tauri dashboard builds and runs on macOS. The WidgetKit project builds with
code signing disabled, but signed-device installation, iCloud delivery, and
distribution are not yet verified. Prebuilt binaries are not currently
published.

## Contributing and security

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before
opening a pull request. Please report vulnerabilities using the process in
[SECURITY.md](SECURITY.md), and never attach credentials or raw account
responses to a public issue.

## License

Source code is available under the [MIT License](LICENSE).

“OpenAI,” “Codex,” and related marks belong to their respective owners. Their
use here identifies compatibility and does not imply endorsement.
