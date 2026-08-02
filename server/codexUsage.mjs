import { spawn } from "node:child_process";
import readline from "node:readline";

const REQUEST_TIMEOUT_MS = 15_000;
const GENERAL_LIMIT_ID = "codex";

function clampPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number))) : null;
}

function toIsoTimestamp(unixSeconds) {
  const value = Number(unixSeconds);
  return Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeLimit(snapshot, fallbackId) {
  if (!snapshot) return null;

  const id = snapshot.limitId || fallbackId;
  const usedPercent = clampPercent(snapshot.primary?.usedPercent);
  if (!id || usedPercent === null) return null;

  return {
    id,
    label: snapshot.limitName || (id === GENERAL_LIMIT_ID ? "通用使用限额" : id),
    usedPercent,
    remainingPercent: 100 - usedPercent,
    resetAt: toIsoTimestamp(snapshot.primary?.resetsAt),
    windowDurationMinutes: toFiniteNumber(snapshot.primary?.windowDurationMins),
    planType: snapshot.planType || null,
    reached: Boolean(snapshot.rateLimitReachedType),
  };
}

function normalizePayload(rateLimitResult, usageResult) {
  const byId = rateLimitResult?.rateLimitsByLimitId;
  const sourceLimits = byId && Object.keys(byId).length > 0
    ? Object.entries(byId)
    : [[rateLimitResult?.rateLimits?.limitId || GENERAL_LIMIT_ID, rateLimitResult?.rateLimits]];

  const limits = sourceLimits
    .map(([id, snapshot]) => normalizeLimit(snapshot, id))
    .filter(Boolean)
    .sort((a, b) => Number(b.id === GENERAL_LIMIT_ID) - Number(a.id === GENERAL_LIMIT_ID));

  const credits = rateLimitResult?.rateLimits?.credits;
  const summary = usageResult?.summary || {};
  const dailyUsage = Array.isArray(usageResult?.dailyUsageBuckets)
    ? usageResult.dailyUsageBuckets
        .map((bucket) => ({
          date: bucket.startDate,
          tokens: toFiniteNumber(bucket.tokens) ?? 0,
        }))
        .filter((bucket) => /^\d{4}-\d{2}-\d{2}$/.test(bucket.date))
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];

  return {
    source: "codex-app-server",
    fetchedAt: new Date().toISOString(),
    planType: limits.find((limit) => limit.id === GENERAL_LIMIT_ID)?.planType || limits[0]?.planType || null,
    limits,
    credits: credits
      ? {
          balance: toFiniteNumber(credits.balance),
          hasCredits: Boolean(credits.hasCredits),
          unlimited: Boolean(credits.unlimited),
          unit: "credits",
        }
      : null,
    resetCreditsAvailable: toFiniteNumber(rateLimitResult?.rateLimitResetCredits?.availableCount),
    tokenUsage: {
      lifetimeTokens: toFiniteNumber(summary.lifetimeTokens),
      peakDailyTokens: toFiniteNumber(summary.peakDailyTokens),
      longestRunningTurnSeconds: toFiniteNumber(summary.longestRunningTurnSec),
      currentStreakDays: toFiniteNumber(summary.currentStreakDays),
      longestStreakDays: toFiniteNumber(summary.longestStreakDays),
      dailyUsage,
    },
  };
}

export function readCodexUsage() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.CODEX_BIN || "codex", ["app-server"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    const lines = readline.createInterface({ input: child.stdout });
    const responses = new Map();
    let initialized = false;
    let settled = false;
    let stderr = "";
    let timeout;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      lines.close();
      child.stdin.end();
      const killTimer = setTimeout(() => child.kill("SIGTERM"), 500);
      killTimer.unref?.();
      if (error) reject(error);
      else resolve(value);
    };

    const send = (message) => {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    };

    timeout = setTimeout(() => {
      finish(new Error("Codex account data timed out."));
    }, REQUEST_TIMEOUT_MS);

    child.stderr.on("data", (chunk) => {
      if (stderr.length < 2_000) stderr += chunk.toString();
    });

    child.on("error", (error) => finish(new Error(`Unable to start Codex app-server: ${error.message}`)));
    child.on("close", (code) => {
      if (!settled) {
        const detail = stderr.trim().split("\n").at(-1);
        finish(new Error(detail || `Codex app-server exited with code ${code}.`));
      }
    });

    lines.on("line", (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }

      if (message.id === 0 && !initialized) {
        if (message.error) {
          finish(new Error(message.error.message || "Codex app-server initialization failed."));
          return;
        }

        initialized = true;
        send({ method: "initialized", params: {} });
        send({ method: "account/rateLimits/read", id: 1, params: null });
        send({ method: "account/usage/read", id: 2, params: null });
        return;
      }

      if (message.id !== 1 && message.id !== 2) return;
      if (message.error) {
        finish(new Error(message.error.message || "Codex account data request failed."));
        return;
      }

      responses.set(message.id, message.result);
      if (responses.size === 2) {
        finish(null, normalizePayload(responses.get(1), responses.get(2)));
      }
    });

    send({
      method: "initialize",
      id: 0,
      params: {
        clientInfo: {
          name: "codex_token_glass_widget",
          title: "Codex Token Glass Widget",
          version: "0.1.0",
        },
        capabilities: {
          optOutNotificationMethods: [
            "thread/started",
            "item/started",
            "item/completed",
            "item/agentMessage/delta",
          ],
        },
      },
    });
  });
}
