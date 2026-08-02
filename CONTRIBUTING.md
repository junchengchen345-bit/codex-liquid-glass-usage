# Contributing

Thanks for helping improve Codex Liquid Glass Usage.

## Before opening a pull request

```bash
npm ci
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo check --manifest-path src-tauri/Cargo.toml --locked
```

For WidgetKit changes, also build the `CodexUsage` scheme with code signing
disabled or test with your own Apple Developer Team.

Keep pull requests focused and explain any user-visible, privacy, or protocol
changes. Add tests when changing data normalization or formatting behavior.

Never attach `auth.json`, cookies, access tokens, raw app-server responses, or
screenshots containing personal account or desktop information. Use clearly
fictional data in documentation and tests.
