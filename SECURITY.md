# Security Policy

## Reporting a vulnerability

Please use GitHub's private vulnerability-reporting feature for this
repository. Do not publish security-sensitive details in an issue.

Reports should include the affected version, impact, and minimal reproduction
steps. Remove all personal information and never include `auth.json`, browser
cookies, access tokens, API keys, raw account responses, or complete diagnostic
archives.

This application communicates only with the local `codex app-server` process.
Any change that introduces a remote service, analytics, or credential access
must be documented and reviewed as a security-sensitive change.
