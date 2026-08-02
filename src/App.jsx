import { useMemo, useRef, useState } from "react";
import {
  ArrowsClockwise,
  ChartLineUp,
  CheckCircle,
  ClockCountdown,
  Gauge,
  MoonStars,
  Palette,
  PushPin,
  SlidersHorizontal,
  Sparkle,
  SquaresFour,
  UserCircle,
  X,
} from "@phosphor-icons/react";
import {
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
} from "recharts";
import { AppearancePanel } from "./components/AppearancePanel";
import { AccountView, OverviewView, TrendsView } from "./components/DashboardViews";
import { useAppearance } from "./hooks/useAppearance";
import { useCodexUsage } from "./hooks/useCodexUsage";
import { useLiquidPointer } from "./hooks/useLiquidPointer";
import {
  closeDesktopWindow,
  DESKTOP_RUNTIME,
  setDesktopPinned,
  startDesktopDrag,
} from "./lib/desktop";
import {
  formatCompact,
  formatExact,
  formatResetTime,
  formatSyncTime,
  summarizeUsage,
  timeUntil,
} from "./lib/usage";

const VIEW_ITEMS = [
  { id: "overview", label: "总览", icon: SquaresFour },
  { id: "trends", label: "用量趋势", icon: ChartLineUp },
  { id: "account", label: "账户额度", icon: UserCircle },
  { id: "appearance", label: "外观", icon: SlidersHorizontal },
];

function MetricCard({ icon: Icon, label, value, subtitle, detail, delay = 0 }) {
  return (
    <article className="metric-card" style={{ "--enter-delay": `${delay}ms` }}>
      <div className="metric-card-top">
        <span className="metric-card-icon"><Icon weight="duotone" /></span>
        <span>{label}</span>
      </div>
      <strong title={detail}>{value}</strong>
      <p>{subtitle}</p>
    </article>
  );
}

function clampPercent(value) {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null;
}

function QuotaDock({ limits, motionEnabled = true, motionDuration = 700 }) {
  const primary = limits?.find((limit) => limit.id === "codex") || limits?.[0];
  const primaryRemaining = clampPercent(primary?.remainingPercent);
  const ringData = [{
    name: primary?.label || "通用额度",
    value: primaryRemaining ?? 0,
    fill: "var(--ring-primary)",
  }];
  const health = primaryRemaining === null
    ? { className: "is-pending", label: "等待", fullLabel: "等待额度数据" }
    : primaryRemaining > 50
      ? { className: "is-healthy", label: "充足", fullLabel: "额度充足" }
      : primaryRemaining > 20
        ? { className: "is-watch", label: "注意", fullLabel: "注意额度节奏" }
        : { className: "is-critical", label: "紧张", fullLabel: "额度即将用尽" };
  const primaryReset = primary?.resetAt ? timeUntil(primary.resetAt) : "等待数据";
  const primaryA11y = primary
    ? `${primary.label}，剩余 ${primaryRemaining ?? "未知"}%，${formatResetTime(primary.resetAt)} 重置`
    : "通用额度，等待数据";

  return (
    <article className={`quota-dock ${health.className}`}>
      <div className="quota-dock-header">
        <div className="quota-dock-title">
          <span className="metric-card-icon"><Gauge weight="duotone" /></span>
          <span>通用额度</span>
        </div>
        <span className="quota-health" aria-label={health.fullLabel} title={health.fullLabel}><i />{health.label}</span>
      </div>

      <div
        className="quota-dial"
        role={primaryRemaining === null ? "status" : "meter"}
        aria-label={primaryA11y}
        aria-valuemin={primaryRemaining === null ? undefined : 0}
        aria-valuemax={primaryRemaining === null ? undefined : 100}
        aria-valuenow={primaryRemaining ?? undefined}
      >
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            data={ringData}
            innerRadius="73%"
            outerRadius="96%"
            startAngle={225}
            endAngle={-45}
            barSize={15}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar
              dataKey="value"
              background={{ fill: "rgba(25, 26, 49, .11)" }}
              cornerRadius={20}
              isAnimationActive={motionEnabled}
              animationDuration={motionEnabled ? motionDuration : 0}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="quota-dial-center">
          <strong>{primaryRemaining ?? "—"}{primaryRemaining !== null ? <small>%</small> : null}</strong>
          <em>本周剩余</em>
        </div>
      </div>

      <span
        className="quota-reset"
        aria-label={primary?.resetAt ? `距重置 ${primaryReset}，${formatResetTime(primary.resetAt)}` : "等待重置时间"}
        title={primary?.resetAt ? `${formatResetTime(primary.resetAt)} 重置` : undefined}
      >
        <ClockCountdown weight="duotone" aria-hidden="true" />
        <small>距重置</small>
        <strong>{primaryReset}</strong>
      </span>
    </article>
  );
}

function AllowanceTimeline({ limits }) {
  const visibleLimits = (limits || []).slice(0, 2);
  const nextReset = visibleLimits
    .filter((limit) => limit.resetAt)
    .sort((a, b) => new Date(a.resetAt) - new Date(b.resetAt))[0];

  return (
    <div className="allowance-timeline">
      <div className="timeline-heading">
        <div><Gauge weight="duotone" /><span>额度明细</span></div>
        <span className="timeline-next-reset"><small>下一次重置</small><strong>{formatResetTime(nextReset?.resetAt)}</strong></span>
      </div>
      <div className="timeline-rows">
        {visibleLimits.length === 0 ? <div className="timeline-empty" role="status">暂未读取到额度明细</div> : null}
        {visibleLimits.map((limit, index) => {
          const remaining = clampPercent(limit.remainingPercent);
          const displayLabel = limit.id === "codex"
            ? "通用额度"
            : limit.label?.toLowerCase().includes("spark")
              ? "Spark 额度"
              : limit.label || "附加额度";
          return (
            <div
              className="timeline-row"
              role={remaining === null ? "status" : "meter"}
              aria-label={`${limit.label}，剩余 ${remaining ?? "未知"}%，${formatResetTime(limit.resetAt)} 重置`}
              aria-valuemin={remaining === null ? undefined : 0}
              aria-valuemax={remaining === null ? undefined : 100}
              aria-valuenow={remaining ?? undefined}
              key={limit.id}
            >
              <span className="timeline-label" title={limit.label}>{displayLabel}</span>
              <span className="timeline-track">
                <i className={index === 0 ? "is-primary" : "is-secondary"} style={{ transform: `scaleX(${(remaining ?? 0) / 100})` }} />
              </span>
              <strong className="timeline-value">{remaining !== null ? `${remaining}%` : "—"}</strong>
              <span className="timeline-reset">{formatResetTime(limit.resetAt)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ViewSwitcher({ activeView, onChange }) {
  const refs = useRef([]);
  const activeIndex = VIEW_ITEMS.findIndex((item) => item.id === activeView);

  const handleKeyDown = (event, index) => {
    let nextIndex = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % VIEW_ITEMS.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + VIEW_ITEMS.length) % VIEW_ITEMS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = VIEW_ITEMS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    onChange(VIEW_ITEMS[nextIndex].id);
    refs.current[nextIndex]?.focus();
  };

  return (
    <div className="view-switcher" role="tablist" aria-label="小组件视图" style={{ "--tab-offset": `${activeIndex * 100}%` }}>
      <span className="tab-indicator" aria-hidden="true" />
      {VIEW_ITEMS.map(({ id, label, icon: Icon }, index) => (
        <button
          type="button"
          role="tab"
          id={`tab-${id}`}
          aria-controls={`panel-${id}`}
          aria-selected={activeView === id}
          tabIndex={activeView === id ? 0 : -1}
          className={activeView === id ? "is-active" : ""}
          onClick={() => onChange(id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          ref={(node) => { refs.current[index] = node; }}
          key={id}
        >
          <Icon weight={activeView === id ? "fill" : "regular"} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

export function App() {
  const { payload, loading, refreshing, error, refresh } = useCodexUsage();
  const {
    appearance,
    applyPreset,
    cssVars,
    motionDuration,
    reducedMotion,
    resetAppearance,
    toggleNightStyle,
    updateControl,
  } = useAppearance();
  const [activeView, setActiveView] = useState("overview");
  const [pinned, setPinned] = useState(false);
  const dashboardRef = useRef(null);
  const summary = useMemo(() => summarizeUsage(payload), [payload]);
  const syncStatus = error ? "上次数据" : loading ? "连接中" : "实时";
  const motionEnabled = appearance.motion !== "off" && !reducedMotion;

  useLiquidPointer(dashboardRef, motionEnabled);

  const togglePinned = async () => {
    const nextPinned = !pinned;
    try {
      await setDesktopPinned(nextPinned);
      setPinned(nextPinned);
    } catch (pinError) {
      console.error("Unable to change desktop widget level.", pinError);
    }
  };

  return (
    <main
      className="dashboard-canvas"
      style={cssVars}
      data-preset={appearance.id}
      data-surface={DESKTOP_RUNTIME ? "desktop" : "web"}
      data-motion={motionEnabled ? appearance.motion : "off"}
      data-density={appearance.density}
      ref={dashboardRef}
    >
      {!DESKTOP_RUNTIME ? <div className="ambient-layer" aria-hidden="true" /> : null}
      <article className="glass-dashboard" aria-label="Codex 实时用量仪表盘" aria-busy={loading || refreshing}>
        <header className="dashboard-header" onMouseDown={startDesktopDrag}>
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true"><Sparkle weight="duotone" /></span>
            <div>
              <strong>codex</strong>
              <small>Realtime usage console</small>
            </div>
          </div>

          <div className="header-actions" data-window-drag="false">
            <span className={`live-status ${error ? "is-stale" : ""}`}>
              <i />{syncStatus}
            </span>
            <span className="plan-pill">{payload?.planType?.toUpperCase() || "—"}</span>
            <div className="icon-button-group">
              <button type="button" aria-label="切换明暗风格" title="切换明暗风格" onClick={toggleNightStyle}><MoonStars /></button>
              <button
                type="button"
                aria-label="打开外观调节"
                title="打开外观调节"
                aria-pressed={activeView === "appearance"}
                onClick={() => setActiveView("appearance")}
              ><Palette /></button>
              <button type="button" aria-label="立即刷新账户数据" title="立即刷新账户数据" disabled={refreshing} onClick={() => refresh()}>
                <ArrowsClockwise className={refreshing ? "is-spinning" : ""} />
              </button>
              {DESKTOP_RUNTIME ? (
                <>
                  <button
                    type="button"
                    aria-label={pinned ? "取消置顶，回到桌面层" : "将小组件置顶"}
                    title={pinned ? "取消置顶，回到桌面层" : "将小组件置顶"}
                    aria-pressed={pinned}
                    onClick={togglePinned}
                  >
                    <PushPin weight={pinned ? "fill" : "regular"} />
                  </button>
                  <button type="button" aria-label="关闭小组件" title="关闭小组件" onClick={closeDesktopWindow}>
                    <X />
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </header>

        <section className="summary-panel">
          <QuotaDock limits={payload?.limits} motionEnabled={motionEnabled} motionDuration={motionDuration} />
          <div className="summary-content">
            <div className="metric-card-grid">
              <MetricCard
                icon={Sparkle}
                label="今日"
                value={formatCompact(summary.todayTokens)}
                detail={formatExact(summary.todayTokens)}
                subtitle="账户统计可能延迟"
              />
              <MetricCard
                icon={ChartLineUp}
                label="近 7 天"
                value={formatCompact(summary.sevenDayTokens)}
                detail={formatExact(summary.sevenDayTokens)}
                subtitle={`日均 ${formatCompact(summary.sevenDayAverage)}`}
                delay={45}
              />
              <MetricCard
                icon={CheckCircle}
                label="累计"
                value={formatCompact(payload?.tokenUsage?.lifetimeTokens)}
                detail={formatExact(payload?.tokenUsage?.lifetimeTokens)}
                subtitle={`峰值 ${formatCompact(payload?.tokenUsage?.peakDailyTokens)}`}
                delay={90}
              />
            </div>
            <AllowanceTimeline limits={payload?.limits} />
          </div>
        </section>

        <section className="detail-panel">
          <div className="detail-panel-header">
            <ViewSwitcher activeView={activeView} onChange={setActiveView} />
            <span className="sync-copy">{error ? `同步失败 · ${error}` : `更新于 ${formatSyncTime(payload?.fetchedAt)}`}</span>
          </div>

          <div className="view-deck">
            {VIEW_ITEMS.map(({ id }) => {
              const active = activeView === id;
              return (
                <section
                  className="view-panel"
                  id={`panel-${id}`}
                  role="tabpanel"
                  aria-labelledby={`tab-${id}`}
                  aria-hidden={!active}
                  inert={active ? undefined : true}
                  data-active={active}
                  key={id}
                >
                  {id === "overview" ? (
                    <OverviewView
                      payload={payload}
                      summary={summary}
                      active={active}
                      motionEnabled={motionEnabled}
                      motionMode={appearance.motion}
                      accentHue={appearance.hue}
                    />
                  ) : null}
                  {id === "trends" ? <TrendsView summary={summary} motionEnabled={motionEnabled} motionDuration={motionDuration} /> : null}
                  {id === "account" ? <AccountView payload={payload} summary={summary} /> : null}
                  {id === "appearance" ? (
                    <AppearancePanel
                      appearance={appearance}
                      applyPreset={applyPreset}
                      resetAppearance={resetAppearance}
                      updateControl={updateControl}
                    />
                  ) : null}
                </section>
              );
            })}
          </div>
        </section>

        <footer className="dashboard-footer">
          <span><i className={error ? "is-stale" : ""} /> Codex app-server</span>
          <span>每分钟自动同步 · 数据不写入浏览器存储</span>
        </footer>
      </article>
    </main>
  );
}
