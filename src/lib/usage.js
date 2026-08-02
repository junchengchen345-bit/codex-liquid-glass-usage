const DAY_MS = 86_400_000;

export function formatExact(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat("zh-CN").format(value) : "—";
}

export function formatCompact(value) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatCredits(credits) {
  if (credits?.unlimited) return "无限";
  if (!Number.isFinite(credits?.balance)) return "—";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(credits.balance);
}

export function formatResetTime(resetAt, includeTime = true) {
  if (!resetAt) return "暂不可用";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(new Date(resetAt));
}

export function formatSyncTime(fetchedAt) {
  if (!fetchedAt) return "尚未同步";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(fetchedAt));
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours} 小时 ${minutes} 分` : `${minutes} 分钟`;
}

export function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildDailySeries(dailyUsage, count = 30) {
  const byDate = new Map((dailyUsage || []).map((bucket) => [bucket.date, bucket.tokens]));
  const today = new Date();

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (count - 1 - index));
    const key = localDateKey(date);
    return {
      date: key,
      shortDate: `${date.getMonth() + 1}/${date.getDate()}`,
      weekday: new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(date),
      tokens: byDate.get(key) || 0,
      isToday: index === count - 1,
    };
  });
}

export function summarizeUsage(payload) {
  const daily365 = buildDailySeries(payload?.tokenUsage?.dailyUsage, 365);
  const daily30 = buildDailySeries(payload?.tokenUsage?.dailyUsage, 30);
  const daily7 = daily30.slice(-7);
  const todayTokens = daily30.at(-1)?.tokens || 0;
  const sevenDayTokens = daily7.reduce((sum, day) => sum + day.tokens, 0);
  const thirtyDayTokens = daily30.reduce((sum, day) => sum + day.tokens, 0);
  const activeDays = daily30.filter((day) => day.tokens > 0).length;
  const peakDay = daily30.reduce((peak, day) => day.tokens > peak.tokens ? day : peak, daily30[0] || { tokens: 0 });
  const generalLimit = payload?.limits?.find((limit) => limit.id === "codex") || payload?.limits?.[0];
  const sparkLimit = payload?.limits?.find((limit) => limit.id !== generalLimit?.id);

  return {
    activeDays,
    daily365,
    daily7,
    daily30,
    generalLimit,
    peakDay,
    sevenDayAverage: sevenDayTokens / 7,
    sevenDayTokens,
    sparkLimit,
    thirtyDayTokens,
    todayTokens,
  };
}

export function timeUntil(resetAt) {
  if (!resetAt) return "—";
  const remaining = new Date(resetAt).getTime() - Date.now();
  if (!Number.isFinite(remaining)) return "—";
  if (remaining <= 0) return "即将重置";
  const days = Math.floor(remaining / DAY_MS);
  const hours = Math.floor((remaining % DAY_MS) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return `${Math.max(1, minutes)} 分钟`;
}
