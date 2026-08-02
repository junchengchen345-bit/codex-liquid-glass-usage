use chrono::{DateTime, NaiveDate, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    ffi::OsString,
    process::Stdio,
    time::{Duration, Instant},
};
use tauri::State;
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStderr, ChildStdin, ChildStdout, Command},
    sync::Mutex,
    time::timeout,
};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
const CACHE_TTL: Duration = Duration::from_secs(5);
const GENERAL_LIMIT_ID: &str = "codex";

#[derive(Default)]
pub struct UsageBridge {
    cache: Mutex<Option<CachedUsage>>,
}

#[derive(Clone)]
struct CachedUsage {
    created_at: Instant,
    payload: CodexUsagePayload,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexUsagePayload {
    source: String,
    fetched_at: String,
    plan_type: Option<String>,
    limits: Vec<UsageLimit>,
    credits: Option<CreditsPayload>,
    reset_credits_available: Option<i64>,
    token_usage: TokenUsagePayload,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UsageLimit {
    id: String,
    label: String,
    used_percent: i64,
    remaining_percent: i64,
    reset_at: Option<String>,
    window_duration_minutes: Option<i64>,
    plan_type: Option<String>,
    reached: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreditsPayload {
    balance: Option<f64>,
    has_credits: bool,
    unlimited: bool,
    unit: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TokenUsagePayload {
    lifetime_tokens: Option<i64>,
    peak_daily_tokens: Option<i64>,
    longest_running_turn_seconds: Option<i64>,
    current_streak_days: Option<i64>,
    longest_streak_days: Option<i64>,
    daily_usage: Vec<DailyUsagePayload>,
}

#[derive(Clone, Serialize)]
struct DailyUsagePayload {
    date: String,
    tokens: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawRateLimitsResponse {
    rate_limits: RawRateLimitSnapshot,
    #[serde(default)]
    rate_limits_by_limit_id: Option<BTreeMap<String, RawRateLimitSnapshot>>,
    #[serde(default)]
    rate_limit_reset_credits: Option<RawResetCredits>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawRateLimitSnapshot {
    #[serde(default)]
    credits: Option<RawCredits>,
    #[serde(default)]
    limit_id: Option<String>,
    #[serde(default)]
    limit_name: Option<String>,
    #[serde(default)]
    plan_type: Option<String>,
    #[serde(default)]
    primary: Option<RawRateLimitWindow>,
    #[serde(default)]
    rate_limit_reached_type: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawRateLimitWindow {
    used_percent: i64,
    #[serde(default)]
    resets_at: Option<i64>,
    #[serde(default)]
    window_duration_mins: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawCredits {
    #[serde(default)]
    balance: Option<Value>,
    has_credits: bool,
    unlimited: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawResetCredits {
    available_count: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawUsageResponse {
    summary: RawUsageSummary,
    #[serde(default)]
    daily_usage_buckets: Option<Vec<RawDailyUsage>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawUsageSummary {
    #[serde(default)]
    lifetime_tokens: Option<i64>,
    #[serde(default)]
    peak_daily_tokens: Option<i64>,
    #[serde(default)]
    longest_running_turn_sec: Option<i64>,
    #[serde(default)]
    current_streak_days: Option<i64>,
    #[serde(default)]
    longest_streak_days: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawDailyUsage {
    start_date: String,
    tokens: i64,
}

#[tauri::command]
pub async fn read_codex_usage(state: State<'_, UsageBridge>) -> Result<CodexUsagePayload, String> {
    // Serialize timer/manual refreshes and avoid immediately spawning twice.
    let mut cache = state.cache.lock().await;

    if let Some(hit) = cache.as_ref() {
        if hit.created_at.elapsed() < CACHE_TTL {
            return Ok(hit.payload.clone());
        }
    }

    let (rate_limits, usage) = run_codex_rpc().await?;
    let payload = normalize_payload(rate_limits, usage);

    *cache = Some(CachedUsage {
        created_at: Instant::now(),
        payload: payload.clone(),
    });

    Ok(payload)
}

async fn run_codex_rpc() -> Result<(RawRateLimitsResponse, RawUsageResponse), String> {
    let mut child = spawn_codex()?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Unable to open Codex stdin.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Unable to open Codex stdout.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Unable to open Codex stderr.".to_string())?;

    // Always drain stderr; otherwise a full pipe can deadlock the child process.
    let stderr_task = tokio::spawn(drain_stderr(stderr));
    let exchange_result = timeout(REQUEST_TIMEOUT, exchange_messages(&mut stdin, stdout)).await;

    let _ = stdin.shutdown().await;

    let exited = matches!(
        timeout(Duration::from_millis(350), child.wait()).await,
        Ok(Ok(_))
    );

    if !exited {
        let _ = child.start_kill();
        let _ = timeout(Duration::from_secs(1), child.wait()).await;
    }

    let stderr_text = match timeout(Duration::from_secs(1), stderr_task).await {
        Ok(Ok(text)) => text,
        _ => String::new(),
    };

    match exchange_result {
        Ok(Ok(results)) => Ok(results),
        Ok(Err(error)) => Err(add_stderr(error, &stderr_text)),
        Err(_) => Err(add_stderr(
            "Codex account data timed out.".to_string(),
            &stderr_text,
        )),
    }
}

async fn exchange_messages(
    stdin: &mut ChildStdin,
    stdout: ChildStdout,
) -> Result<(RawRateLimitsResponse, RawUsageResponse), String> {
    send_json(
        stdin,
        &json!({
            "method": "initialize",
            "id": 0,
            "params": {
                "clientInfo": {
                    "name": "codex_token_glass_widget",
                    "title": "Codex Token Glass Widget",
                    "version": env!("CARGO_PKG_VERSION")
                },
                "capabilities": {
                    "optOutNotificationMethods": [
                        "thread/started",
                        "item/started",
                        "item/completed",
                        "item/agentMessage/delta"
                    ]
                }
            }
        }),
    )
    .await?;

    let mut lines = BufReader::new(stdout).lines();
    let mut initialized = false;
    let mut rate_result: Option<Value> = None;
    let mut usage_result: Option<Value> = None;

    while let Some(line) = lines
        .next_line()
        .await
        .map_err(|error| format!("Unable to read Codex stdout: {error}"))?
    {
        let message: Value = match serde_json::from_str(&line) {
            Ok(message) => message,
            Err(_) => continue,
        };

        let Some(id) = rpc_id(&message) else {
            // Server notifications do not have request ids and are irrelevant here.
            continue;
        };

        if id == 0 && !initialized {
            if let Some(error) = rpc_error(&message) {
                return Err(format!("Codex app-server initialization failed: {error}"));
            }

            if message.get("result").is_none() {
                continue;
            }

            initialized = true;
            send_json(stdin, &json!({ "method": "initialized", "params": {} })).await?;
            send_json(
                stdin,
                &json!({
                    "method": "account/rateLimits/read",
                    "id": 1,
                    "params": null
                }),
            )
            .await?;
            send_json(
                stdin,
                &json!({
                    "method": "account/usage/read",
                    "id": 2,
                    "params": null
                }),
            )
            .await?;
            continue;
        }

        if !initialized || (id != 1 && id != 2) {
            continue;
        }

        if let Some(error) = rpc_error(&message) {
            return Err(format!("Codex account data request failed: {error}"));
        }

        let Some(result) = message.get("result").cloned() else {
            continue;
        };

        if id == 1 {
            rate_result = Some(result);
        } else {
            usage_result = Some(result);
        }

        if rate_result.is_some() && usage_result.is_some() {
            let rates = serde_json::from_value(
                rate_result
                    .take()
                    .expect("rate result was checked immediately above"),
            )
            .map_err(|error| format!("Unable to parse Codex rate limits: {error}"))?;
            let usage = serde_json::from_value(
                usage_result
                    .take()
                    .expect("usage result was checked immediately above"),
            )
            .map_err(|error| format!("Unable to parse Codex token usage: {error}"))?;

            return Ok((rates, usage));
        }
    }

    Err("Codex app-server closed before returning account data.".to_string())
}

async fn send_json(stdin: &mut ChildStdin, message: &Value) -> Result<(), String> {
    let mut bytes = serde_json::to_vec(message)
        .map_err(|error| format!("Unable to serialize a Codex request: {error}"))?;
    bytes.push(b'\n');

    stdin
        .write_all(&bytes)
        .await
        .map_err(|error| format!("Unable to write to Codex stdin: {error}"))?;
    stdin
        .flush()
        .await
        .map_err(|error| format!("Unable to flush Codex stdin: {error}"))
}

fn rpc_id(message: &Value) -> Option<i64> {
    let id = message.get("id")?;
    id.as_i64()
        .or_else(|| id.as_str().and_then(|value| value.parse().ok()))
}

fn rpc_error(message: &Value) -> Option<String> {
    let error = message.get("error")?;
    if error.is_null() {
        return None;
    }

    let code = error.get("code").and_then(Value::as_i64);
    let text = error
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("Unknown JSON-RPC error");

    Some(match code {
        Some(code) => format!("{text} ({code})"),
        None => text.to_string(),
    })
}

async fn drain_stderr(stderr: ChildStderr) -> String {
    let mut reader = BufReader::new(stderr);
    let mut chunk = [0_u8; 1024];
    let mut saved = Vec::with_capacity(8192);

    loop {
        let count = match reader.read(&mut chunk).await {
            Ok(0) | Err(_) => break,
            Ok(count) => count,
        };

        if saved.len() < 8192 {
            let remaining = 8192 - saved.len();
            saved.extend_from_slice(&chunk[..count.min(remaining)]);
        }
    }

    String::from_utf8_lossy(&saved).into_owned()
}

fn spawn_codex() -> Result<Child, String> {
    let mut errors = Vec::new();

    for binary in codex_candidates() {
        let mut command = Command::new(&binary);
        command
            .arg("app-server")
            .arg("--stdio")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        match command.spawn() {
            Ok(child) => return Ok(child),
            Err(error) => errors.push(format!("{}: {error}", binary.to_string_lossy())),
        }
    }

    Err(format!(
        "Unable to find a working Codex CLI.{}",
        errors
            .last()
            .map(|value| format!(" {value}"))
            .unwrap_or_default()
    ))
}

fn codex_candidates() -> Vec<OsString> {
    let mut candidates = Vec::new();

    if let Some(binary) = std::env::var_os("CODEX_BIN") {
        candidates.push(binary);
    }

    candidates.push("codex".into());

    #[cfg(target_os = "macos")]
    {
        candidates.push("/Applications/ChatGPT.app/Contents/Resources/codex".into());
        candidates.push("/Applications/Codex.app/Contents/Resources/codex".into());
        candidates.push("/opt/homebrew/bin/codex".into());
        candidates.push("/usr/local/bin/codex".into());

        if let Some(home) = std::env::var_os("HOME") {
            candidates.push(
                std::path::PathBuf::from(home)
                    .join("Applications/ChatGPT.app/Contents/Resources/codex")
                    .into_os_string(),
            );
        }
    }

    candidates
}

fn normalize_payload(rates: RawRateLimitsResponse, usage: RawUsageResponse) -> CodexUsagePayload {
    let mut limits = Vec::new();

    if let Some(by_id) = rates
        .rate_limits_by_limit_id
        .as_ref()
        .filter(|map| !map.is_empty())
    {
        for (fallback_id, snapshot) in by_id {
            if let Some(limit) = normalize_limit(snapshot, fallback_id) {
                limits.push(limit);
            }
        }
    } else if let Some(limit) = normalize_limit(&rates.rate_limits, GENERAL_LIMIT_ID) {
        limits.push(limit);
    }

    limits.sort_by_key(|limit| (limit.id != GENERAL_LIMIT_ID, limit.id.clone()));

    let plan_type = limits
        .iter()
        .find(|limit| limit.id == GENERAL_LIMIT_ID)
        .and_then(|limit| limit.plan_type.clone())
        .or_else(|| limits.first().and_then(|limit| limit.plan_type.clone()));

    let credits = rates
        .rate_limits
        .credits
        .as_ref()
        .map(|credits| CreditsPayload {
            balance: finite_number(credits.balance.as_ref()),
            has_credits: credits.has_credits,
            unlimited: credits.unlimited,
            unit: "credits".to_string(),
        });

    let RawUsageResponse {
        summary,
        daily_usage_buckets,
    } = usage;

    let mut daily_usage = daily_usage_buckets
        .unwrap_or_default()
        .into_iter()
        .filter(|bucket| NaiveDate::parse_from_str(&bucket.start_date, "%Y-%m-%d").is_ok())
        .map(|bucket| DailyUsagePayload {
            date: bucket.start_date,
            tokens: bucket.tokens,
        })
        .collect::<Vec<_>>();

    daily_usage.sort_by(|left, right| left.date.cmp(&right.date));

    CodexUsagePayload {
        source: "codex-app-server".to_string(),
        fetched_at: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        plan_type,
        limits,
        credits,
        reset_credits_available: rates
            .rate_limit_reset_credits
            .map(|summary| summary.available_count),
        token_usage: TokenUsagePayload {
            lifetime_tokens: summary.lifetime_tokens,
            peak_daily_tokens: summary.peak_daily_tokens,
            longest_running_turn_seconds: summary.longest_running_turn_sec,
            current_streak_days: summary.current_streak_days,
            longest_streak_days: summary.longest_streak_days,
            daily_usage,
        },
    }
}

fn normalize_limit(snapshot: &RawRateLimitSnapshot, fallback_id: &str) -> Option<UsageLimit> {
    let primary = snapshot.primary.as_ref()?;
    let id = snapshot
        .limit_id
        .as_deref()
        .filter(|value| !value.is_empty())
        .unwrap_or(fallback_id)
        .to_string();

    if id.is_empty() {
        return None;
    }

    let used_percent = primary.used_percent.clamp(0, 100);
    let label = snapshot
        .limit_name
        .as_deref()
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| {
            if id == GENERAL_LIMIT_ID {
                "通用使用限额".to_string()
            } else {
                id.clone()
            }
        });

    Some(UsageLimit {
        id,
        label,
        used_percent,
        remaining_percent: 100 - used_percent,
        reset_at: unix_seconds_to_iso(primary.resets_at),
        window_duration_minutes: primary.window_duration_mins,
        plan_type: snapshot.plan_type.clone(),
        reached: snapshot.rate_limit_reached_type.is_some(),
    })
}

fn unix_seconds_to_iso(seconds: Option<i64>) -> Option<String> {
    DateTime::<Utc>::from_timestamp(seconds?, 0)
        .map(|date| date.to_rfc3339_opts(SecondsFormat::Millis, true))
}

fn finite_number(value: Option<&Value>) -> Option<f64> {
    let parsed = match value? {
        Value::Number(number) => number.as_f64(),
        Value::String(number) => number.parse::<f64>().ok(),
        _ => None,
    }?;

    parsed.is_finite().then_some(parsed)
}

fn add_stderr(base: String, stderr: &str) -> String {
    let Some(last_line) = stderr.lines().rev().find(|line| !line.trim().is_empty()) else {
        return base;
    };

    let detail = last_line.chars().take(500).collect::<String>();
    format!("{base} {detail}")
}
