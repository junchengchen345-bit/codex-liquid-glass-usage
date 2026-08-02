import {
  CalendarDots,
  ChartLine,
  ClockCounterClockwise,
  Coins,
  Fire,
  Gauge,
  Lightning,
  Pulse,
  Sparkle,
  TrendUp,
} from "@phosphor-icons/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatCompact,
  formatCredits,
  formatDuration,
  formatExact,
  formatResetTime,
  timeUntil,
} from "../lib/usage";
import { TokenActivityHeatmap } from "./TokenActivityHeatmap";

function InsightCard({ icon: Icon, label, value, detail, tone = "blue", unit }) {
  const displayValue = typeof value === "number" ? formatCompact(value) : value;
  return (
    <article className={`insight-card tone-${tone}`}>
      <div className="insight-heading">
        <span className="insight-icon"><Icon weight="duotone" /></span>
        <span>{label}</span>
      </div>
      <strong title={typeof value === "number" ? formatExact(value) : undefined}>
        <span>{displayValue}</span>
        {unit ? <small>{unit}</small> : null}
      </strong>
      <p>{detail}</p>
    </article>
  );
}

export function OverviewView({ payload, summary, active, motionEnabled, motionMode, accentHue }) {
  const general = summary.generalLimit;
  const spark = summary.sparkLimit;

  return (
    <div className="overview-view">
      <div className="insight-grid">
        <InsightCard
          icon={Gauge}
          label="通用额度"
          value={Number.isFinite(general?.remainingPercent) ? `${general.remainingPercent}%` : "—"}
          detail={general?.resetAt ? `${formatResetTime(general.resetAt)} 重置` : "等待额度数据"}
          tone="blue"
        />
        <InsightCard
          icon={Lightning}
          label="Spark 额度"
          value={Number.isFinite(spark?.remainingPercent) ? `${spark.remainingPercent}%` : "—"}
          detail={spark?.resetAt ? `${formatResetTime(spark.resetAt)} 重置` : "等待额度数据"}
          tone="violet"
        />
        <InsightCard
          icon={Fire}
          label="峰值 Token"
          value={payload?.tokenUsage?.peakDailyTokens}
          detail={summary.peakDay?.tokens ? `近 30 天峰值 ${summary.peakDay.shortDate}` : "尚无近期活动"}
          tone="coral"
        />
        <InsightCard
          icon={Coins}
          label="点数余额"
          value={formatCredits(payload?.credits)}
          unit="credits"
          detail={payload?.credits?.hasCredits ? "账户原生 credits 单位" : "当前无可用点数"}
          tone="green"
        />
      </div>

      <TokenActivityHeatmap
        summary={summary}
        dataReady={Boolean(payload)}
        active={active}
        motionEnabled={motionEnabled}
        motionMode={motionMode}
        accentHue={accentHue}
      />
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <span>{label}</span>
      <strong>{formatExact(payload[0].value)} tokens</strong>
    </div>
  );
}

export function TrendsView({ summary, motionEnabled = true, motionDuration = 650 }) {
  return (
    <div className="trends-view">
      <div className="trend-chart-card">
        <div className="view-section-heading">
          <div>
            <p className="eyebrow">30 DAYS</p>
            <h2>Token 活动趋势</h2>
          </div>
          <strong>{formatCompact(summary.thirtyDayTokens)}</strong>
        </div>
        <div className="trend-chart" aria-label="最近三十天 Token 趋势图">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={summary.daily30} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,.12)" />
              <XAxis dataKey="shortDate" axisLine={false} tickLine={false} minTickGap={26} tick={{ fill: "rgba(255,255,255,.56)", fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false} width={52} tickFormatter={formatCompact} tick={{ fill: "rgba(255,255,255,.5)", fontSize: 10 }} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(255,255,255,.35)", strokeWidth: 1 }} />
              <Area
                type="monotone"
                dataKey="tokens"
                stroke="var(--accent-bright)"
                fill="var(--accent-soft)"
                strokeWidth={3}
                isAnimationActive={motionEnabled}
                animationDuration={motionEnabled ? motionDuration : 0}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="trend-side-stats">
        <InsightCard icon={TrendUp} label="近 7 天日均" value={summary.sevenDayAverage} detail="按账户每日统计桶计算" tone="blue" />
        <InsightCard icon={CalendarDots} label="近 30 天活跃" value={`${summary.activeDays} 天`} detail="Token 活动大于 0 的日期" tone="violet" />
        <InsightCard icon={Pulse} label="近 30 天总量" value={summary.thirtyDayTokens} detail="与周额度百分比独立计量" tone="green" />
      </div>
    </div>
  );
}

export function AccountView({ payload, summary }) {
  const stats = [
    { icon: Sparkle, label: "当前套餐", value: payload?.planType?.toUpperCase() || "—", detail: "当前登录的 Codex 账户" },
    { icon: ChartLine, label: "累计 Token", value: formatCompact(payload?.tokenUsage?.lifetimeTokens), detail: formatExact(payload?.tokenUsage?.lifetimeTokens) },
    { icon: ClockCounterClockwise, label: "最长任务", value: formatDuration(payload?.tokenUsage?.longestRunningTurnSeconds), detail: "账户历史最长运行时长" },
    { icon: Fire, label: "当前连续", value: `${payload?.tokenUsage?.currentStreakDays ?? "—"} 天`, detail: `最长 ${payload?.tokenUsage?.longestStreakDays ?? "—"} 天` },
  ];

  return (
    <div className="account-view">
      <div className="account-stat-grid">
        {stats.map(({ icon: Icon, label, value, detail }) => (
          <article className="account-stat" key={label}>
            <Icon weight="duotone" />
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </article>
        ))}
      </div>

      <div className="limit-detail-list">
        {payload?.limits?.map((limit) => {
          const remaining = Number.isFinite(limit.remainingPercent)
            ? Math.min(100, Math.max(0, limit.remainingPercent))
            : null;
          return (
            <article
              className="limit-detail-row"
              key={limit.id}
              role={remaining === null ? "status" : "meter"}
              aria-label={`${limit.label}，剩余 ${remaining ?? "未知"}%，距重置 ${timeUntil(limit.resetAt)}`}
              aria-valuemin={remaining === null ? undefined : 0}
              aria-valuemax={remaining === null ? undefined : 100}
              aria-valuenow={remaining ?? undefined}
            >
              <div>
                <span className="limit-name" title={limit.label}><i />{limit.label}</span>
                <strong>{remaining !== null ? `${remaining}%` : "—"} 剩余</strong>
              </div>
              <div className="limit-detail-track"><span className={limit.id === "codex" ? "is-primary" : "is-secondary"} style={{ transform: `scaleX(${(remaining ?? 0) / 100})` }} /></div>
              <div className="limit-detail-meta">
                <span>{Number.isFinite(limit.usedPercent) ? `${limit.usedPercent}%` : "—"} 已用</span>
                <span>距重置 {timeUntil(limit.resetAt)}</span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
