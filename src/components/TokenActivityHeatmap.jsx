import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDots, Pulse } from "@phosphor-icons/react";
import { formatCompact, formatExact } from "../lib/usage";

const RANGE_OPTIONS = [
  { days: 30, label: "30 天" },
  { days: 365, label: "1 年" },
];

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

function parseLocalDate(dateKey) {
  return new Date(`${dateKey}T12:00:00`);
}

function mondayIndex(dateKey) {
  return (parseLocalDate(dateKey).getDay() + 6) % 7;
}

function formatActivityDate(dateKey) {
  if (!dateKey) return "等待日期";
  const date = parseLocalDate(dateKey);
  const monthDay = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(date);
  const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(date);
  return `${monthDay} · ${weekday}`;
}

function formatActivityRange(days) {
  if (!days.length) return "等待活动数据";
  const formatter = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" });
  return `${formatter.format(parseLocalDate(days[0].date))} – ${formatter.format(parseLocalDate(days.at(-1).date))}`;
}

function activityLevel(tokens, peak) {
  if (!Number.isFinite(tokens) || tokens <= 0 || peak <= 0) return 0;
  return Math.max(1, Math.min(5, Math.ceil(Math.sqrt(tokens / peak) * 5)));
}

function buildContributionGrid(days) {
  if (!days.length) return { rows: [], weekCount: 0, monthTicks: [] };

  const padded = Array.from({ length: mondayIndex(days[0].date) }, () => null).concat(days);
  while (padded.length % 7 !== 0) padded.push(null);

  const weekCount = padded.length / 7;
  const rows = Array.from({ length: 7 }, (_, rowIndex) => (
    Array.from({ length: weekCount }, (_, columnIndex) => padded[(columnIndex * 7) + rowIndex] || null)
  ));

  const monthTicks = [];
  let previousMonth = -1;
  for (let columnIndex = 0; columnIndex < weekCount; columnIndex += 1) {
    const firstDay = Array.from({ length: 7 }, (_, rowIndex) => padded[(columnIndex * 7) + rowIndex]).find(Boolean);
    if (!firstDay) continue;
    const month = parseLocalDate(firstDay.date).getMonth();
    if (month !== previousMonth) {
      monthTicks.push({ column: columnIndex + 1, label: `${month + 1}月` });
      previousMonth = month;
    }
  }

  return { rows, weekCount, monthTicks };
}

function createParticleSprite(color) {
  const sprite = document.createElement("canvas");
  const size = 48;
  sprite.width = size;
  sprite.height = size;
  const context = sprite.getContext("2d");
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.28, color.replace(/\/[\s\d.]+\)$/, "/ .64)"));
  gradient.addColorStop(1, color.replace(/\/[\s\d.]+\)$/, "/ 0)"));
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return sprite;
}

function ActivityParticleCanvas({ hostRef, enabled, mode, accentHue }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;

    const context = canvas.getContext("2d", { alpha: true });
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const hue = Number.isFinite(accentHue) ? accentHue : 268;
    const sprites = [
      createParticleSprite(`hsl(${hue - 58} 92% 57% / .88)`),
      createParticleSprite(`hsl(${hue} 88% 68% / .82)`),
      createParticleSprite("hsl(191 96% 72% / .76)"),
    ];
    const particles = [];
    const maximumParticles = mode === "fluid" ? 24 : 12;
    const minimumSpawnGap = mode === "fluid" ? 24 : 34;
    const minimumTravel = mode === "fluid" ? 10 : 14;
    let animationFrame = 0;
    let logicalWidth = 0;
    let logicalHeight = 0;
    let lastFrameAt = 0;
    let lastPaintAt = 0;
    let lastSpawnAt = 0;
    let lastPointerX = -100;
    let lastPointerY = -100;
    let isVisible = true;
    let isDragging = document.documentElement.dataset.windowDragging === "true";

    const clearCanvas = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      particles.length = 0;
      context.clearRect(0, 0, logicalWidth, logicalHeight);
    };

    const canAnimate = () => (
      enabled
      && finePointer.matches
      && isVisible
      && document.visibilityState === "visible"
      && !isDragging
    );

    const resizeCanvas = () => {
      const rect = host.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      logicalWidth = Math.max(1, rect.width);
      logicalHeight = Math.max(1, rect.height);
      canvas.width = Math.round(logicalWidth * dpr);
      canvas.height = Math.round(logicalHeight * dpr);
      canvas.style.width = `${logicalWidth}px`;
      canvas.style.height = `${logicalHeight}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      clearCanvas();
    };

    const drawFrame = (timestamp) => {
      animationFrame = 0;
      if (!canAnimate()) {
        clearCanvas();
        return;
      }

      if (mode === "soft" && timestamp - lastPaintAt < 31) {
        animationFrame = requestAnimationFrame(drawFrame);
        return;
      }

      const elapsed = Math.min(34, Math.max(8, timestamp - (lastFrameAt || timestamp - 16)));
      const frameScale = elapsed / 16.67;
      lastFrameAt = timestamp;
      lastPaintAt = timestamp;
      context.clearRect(0, 0, logicalWidth, logicalHeight);

      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        particle.age += elapsed;
        if (particle.age >= particle.life) {
          particles.splice(index, 1);
          continue;
        }

        const progress = particle.age / particle.life;
        particle.x += particle.velocityX * frameScale;
        particle.y += particle.velocityY * frameScale;
        particle.velocityX *= 0.982;
        particle.velocityY = (particle.velocityY * 0.984) - (0.012 * frameScale);
        const opacity = Math.sin(Math.PI * progress) * particle.opacity;
        const size = particle.size * (0.78 + (progress * 0.62));
        context.globalAlpha = opacity;
        context.drawImage(sprites[particle.sprite], particle.x - size, particle.y - size, size * 2, size * 2);
      }

      context.globalAlpha = 1;
      if (particles.length) animationFrame = requestAnimationFrame(drawFrame);
    };

    const startAnimation = () => {
      if (!animationFrame && particles.length && canAnimate()) {
        lastFrameAt = 0;
        animationFrame = requestAnimationFrame(drawFrame);
      }
    };

    const handlePointerMove = (event) => {
      // Some desktop WebView automation layers omit pointerType even though
      // the device still reports a fine, hover-capable pointer. The media
      // query remains the source of truth; explicit touch/pen events stay out.
      if ((event.pointerType && event.pointerType !== "mouse") || !canAnimate()) return;
      const cell = event.target instanceof Element ? event.target.closest(".activity-cell") : null;
      if (!cell || !host.contains(cell)) return;

      const timestamp = performance.now();
      const distance = Math.hypot(event.clientX - lastPointerX, event.clientY - lastPointerY);
      if (timestamp - lastSpawnAt < minimumSpawnGap || distance < minimumTravel) return;

      const hostRect = host.getBoundingClientRect();
      const cellRect = cell.getBoundingClientRect();
      const level = Math.max(0, Number(cell.dataset.level) || 0);
      const count = mode === "fluid" && level >= 4 ? 2 : 1;
      const originX = event.clientX - hostRect.left;
      const originY = event.clientY - hostRect.top;

      for (let index = 0; index < count; index += 1) {
        if (particles.length >= maximumParticles) particles.shift();
        const angle = ((Math.random() - 0.5) * Math.PI * 1.35) - (Math.PI / 2);
        const speed = 0.28 + (Math.random() * 0.42) + (level * 0.035);
        particles.push({
          x: originX + ((Math.random() - 0.5) * Math.min(14, cellRect.width)),
          y: originY + ((Math.random() - 0.5) * Math.min(10, cellRect.height)),
          velocityX: Math.cos(angle) * speed,
          velocityY: Math.sin(angle) * speed,
          age: 0,
          life: 440 + (Math.random() * 210),
          opacity: Math.min(mode === "fluid" ? 0.44 : 0.34, 0.24 + (level * 0.032)),
          size: 6 + (Math.random() * 4.8) + (level * 0.38),
          sprite: Math.floor(Math.random() * sprites.length),
        });
      }

      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      lastSpawnAt = timestamp;
      startAnimation();
    };

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") clearCanvas();
    };

    const handleMotionCapability = () => {
      if (!canAnimate()) clearCanvas();
    };

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(host);

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
      if (!isVisible) clearCanvas();
    }, { threshold: 0.02 });
    intersectionObserver.observe(host);

    const dragObserver = new MutationObserver(() => {
      isDragging = document.documentElement.dataset.windowDragging === "true";
      canvas.style.opacity = isDragging ? "0" : "1";
      if (isDragging) clearCanvas();
    });
    dragObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-window-dragging"] });

    resizeCanvas();
    host.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);
    finePointer.addEventListener("change", handleMotionCapability);

    if (!enabled) clearCanvas();

    return () => {
      clearCanvas();
      host.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("visibilitychange", handleVisibility);
      finePointer.removeEventListener("change", handleMotionCapability);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      dragObserver.disconnect();
    };
  }, [accentHue, enabled, hostRef, mode]);

  return <canvas className="activity-particle-canvas" ref={canvasRef} aria-hidden="true" role="presentation" />;
}

function ActivityCell({
  day,
  level,
  selected,
  pinned,
  tabIndex,
  onClick,
  onFocus,
  onKeyDown,
  onPointerEnter,
  setRef,
}) {
  const activityCopy = day.tokens > 0 ? `${formatExact(day.tokens)} Token` : "当日无 Token 活动";
  const label = `${formatActivityDate(day.date)}，${activityCopy}，强度 ${level}/5${day.isToday ? "，今天" : ""}`;

  return (
    <button
      type="button"
      role="gridcell"
      className={`activity-cell${selected ? " is-selected" : ""}${pinned ? " is-pinned" : ""}${day.isToday ? " is-today" : ""}`}
      data-level={level}
      aria-label={label}
      aria-current={day.isToday ? "date" : undefined}
      aria-pressed={pinned}
      tabIndex={tabIndex}
      title={`${formatActivityDate(day.date)} · ${formatExact(day.tokens)} Token`}
      onClick={onClick}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onPointerEnter={onPointerEnter}
      ref={setRef}
    />
  );
}

export function TokenActivityHeatmap({ summary, dataReady, active = true, motionEnabled = true, motionMode = "fluid", accentHue }) {
  const [rangeDays, setRangeDays] = useState(365);
  const [hoveredDate, setHoveredDate] = useState(null);
  const [focusedDate, setFocusedDate] = useState(null);
  const [pinnedDate, setPinnedDate] = useState(null);
  const hostRef = useRef(null);
  const cellRefs = useRef(new Map());

  const yearDays = summary.daily365?.length ? summary.daily365 : summary.daily30;
  const days = rangeDays === 365 ? yearDays : summary.daily30;
  const peak = useMemo(() => Math.max(...yearDays.map((day) => day.tokens), 1), [yearDays]);
  const grid = useMemo(() => buildContributionGrid(days), [days]);
  const indexByDate = useMemo(() => new Map(days.map((day, index) => [day.date, index])), [days]);
  const defaultDay = [...days].reverse().find((day) => day.tokens > 0) || days.at(-1) || null;
  const availableDates = indexByDate;
  const rovingDate = availableDates.has(focusedDate) ? focusedDate : defaultDay?.date;
  const displayDate = [hoveredDate, pinnedDate, focusedDate, defaultDay?.date].find((date) => availableDates.has(date));
  const displayDay = displayDate ? days[indexByDate.get(displayDate)] : null;
  const displayLevel = displayDay ? activityLevel(displayDay.tokens, peak) : 0;
  const rangeTotal = days.reduce((total, day) => total + day.tokens, 0);
  const activeDays = days.filter((day) => day.tokens > 0).length;
  const relativeToPeak = displayDay?.tokens > 0 ? Math.round((displayDay.tokens / peak) * 100) : 0;

  const selectRange = (nextRange) => {
    const nextDays = nextRange === 365 ? yearDays : summary.daily30;
    const nextDefault = [...nextDays].reverse().find((day) => day.tokens > 0) || nextDays.at(-1);
    setRangeDays(nextRange);
    setHoveredDate(null);
    setPinnedDate(null);
    setFocusedDate(nextDefault?.date || null);
  };

  const moveFocus = (event, day) => {
    const currentIndex = indexByDate.get(day.date);
    let nextIndex = null;
    if (event.key === "ArrowLeft") nextIndex = rangeDays === 365 ? currentIndex - 7 : currentIndex - 1;
    if (event.key === "ArrowRight") nextIndex = rangeDays === 365 ? currentIndex + 7 : currentIndex + 1;
    if (event.key === "ArrowUp") nextIndex = rangeDays === 365 ? currentIndex - 1 : currentIndex - 7;
    if (event.key === "ArrowDown") nextIndex = rangeDays === 365 ? currentIndex + 1 : currentIndex + 7;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = days.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    nextIndex = Math.min(days.length - 1, Math.max(0, nextIndex));
    const nextDate = days[nextIndex].date;
    setPinnedDate(null);
    setFocusedDate(nextDate);
    cellRefs.current.get(nextDate)?.focus();
  };

  const renderCell = (day, cellKey) => {
    if (!day) return <span className="activity-cell-placeholder" aria-hidden="true" key={cellKey} />;
    const level = activityLevel(day.tokens, peak);
    const isPinned = pinnedDate === day.date;
    return (
      <ActivityCell
        day={day}
        level={level}
        selected={displayDate === day.date}
        pinned={isPinned}
        tabIndex={rovingDate === day.date ? 0 : -1}
        onClick={() => {
          setFocusedDate(day.date);
          setPinnedDate(isPinned ? null : day.date);
        }}
        onFocus={() => setFocusedDate(day.date)}
        onKeyDown={(event) => moveFocus(event, day)}
        onPointerEnter={() => setHoveredDate(day.date)}
        setRef={(node) => {
          if (node) cellRefs.current.set(day.date, node);
          else cellRefs.current.delete(day.date);
        }}
        key={cellKey}
      />
    );
  };

  return (
    <section
      className="token-activity-map"
      aria-label="Token 活动热力图"
      onPointerLeave={() => setHoveredDate(null)}
      ref={hostRef}
    >
      <ActivityParticleCanvas
        hostRef={hostRef}
        enabled={dataReady && active && motionEnabled}
        mode={motionMode}
        accentHue={accentHue}
      />

      <div className="activity-map-content">
        <header className="activity-map-header">
          <div className="activity-map-title">
            <span className="insight-icon tone-activity"><CalendarDots weight="duotone" /></span>
            <div>
              <strong>Token 活动</strong>
              <span>{formatActivityRange(days)}</span>
            </div>
          </div>

          <div className="activity-range-toggle" aria-label="热力图时间范围">
            {RANGE_OPTIONS.map((option) => (
              <button
                type="button"
                className={rangeDays === option.days ? "is-selected" : ""}
                aria-pressed={rangeDays === option.days}
                onClick={() => selectRange(option.days)}
                key={option.days}
              >
                {option.label}
              </button>
            ))}
          </div>
        </header>

        {!dataReady ? (
          <div className="activity-map-empty" role="status"><Pulse weight="duotone" />正在读取 Token 活动…</div>
        ) : (
          <div className="activity-map-stage">
            <div className={`activity-map-plot${rangeDays === 30 ? " is-ribbon" : " is-year"}`}>
              {rangeDays === 365 ? (
                <>
                  <div className="activity-month-axis" style={{ "--week-count": grid.weekCount }} aria-hidden="true">
                    {grid.monthTicks.map((tick) => <span style={{ gridColumn: tick.column }} key={`${tick.column}-${tick.label}`}>{tick.label}</span>)}
                  </div>
                  <div className="activity-contribution-shell">
                    <div className="activity-weekday-axis" aria-hidden="true">
                      {WEEKDAY_LABELS.map((label, index) => <span className={index % 2 === 0 ? "is-visible" : ""} key={label}>{label}</span>)}
                    </div>
                    <div
                      className="activity-contribution-grid"
                      role="grid"
                      aria-label={`近一年 Token 活动，${activeDays} 个活跃日`}
                      aria-rowcount={7}
                      aria-colcount={grid.weekCount}
                      style={{ "--week-count": grid.weekCount }}
                    >
                      {grid.rows.map((row, rowIndex) => (
                        <div role="row" className="activity-grid-row" key={WEEKDAY_LABELS[rowIndex]}>
                          {row.map((day, columnIndex) => renderCell(day, day?.date || `empty-${rowIndex}-${columnIndex}`))}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="activity-ribbon" role="grid" aria-label={`近三十天 Token 活动，${activeDays} 个活跃日`}>
                    <div role="row" className="activity-ribbon-row">
                      {days.map((day) => renderCell(day, day.date))}
                    </div>
                  </div>
                  <div className="activity-ribbon-axis" aria-hidden="true">
                    <span>30 天前</span><span>3 周前</span><span>2 周前</span><span>上周</span><span>今天</span>
                  </div>
                </>
              )}

              <footer className="activity-map-footer">
                <span><strong>{formatCompact(rangeTotal)}</strong> 范围累计 · <strong>{activeDays}</strong> 个活跃日</span>
                <span className="activity-legend" aria-label="热力强度从低到高">
                  <small>低</small>
                  {[0, 1, 2, 3, 4, 5].map((level) => <i data-level={level} key={level} />)}
                  <small>高</small>
                </span>
              </footer>
            </div>

            <aside className="activity-map-readout" aria-live="polite" aria-atomic="true">
              <span>{displayDay ? formatActivityDate(displayDay.date) : "等待活动数据"}</span>
              <strong title={displayDay ? formatExact(displayDay.tokens) : undefined}>
                {displayDay ? formatCompact(displayDay.tokens) : "—"}
                <small>Token</small>
              </strong>
              <em>{displayDay?.tokens ? `近一年峰值的 ${relativeToPeak}%` : "当日无 Token 活动"}</em>
              <div className="activity-readout-scale" aria-label={`热力强度 ${displayLevel}/5`}>
                <small>强度</small>
                <span>
                  {[1, 2, 3, 4, 5].map((level) => (
                    <i className={level <= displayLevel ? "is-active" : ""} key={level} />
                  ))}
                </span>
                <strong>{displayLevel}/5</strong>
              </div>
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}
