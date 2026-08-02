import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "codex-glass-appearance.v1";

export const APPEARANCE_RANGES = {
  hue: { min: 0, max: 359, step: 1 },
  glass: { min: 0, max: 100, step: 1 },
  blur: { min: 0, max: 60, step: 1 },
  saturation: { min: 50, max: 200, step: 1 },
  glow: { min: 0, max: 100, step: 1 },
  dispersion: { min: 0, max: 100, step: 1 },
  radius: { min: 12, max: 48, step: 1 },
  motionSpeed: { min: 50, max: 180, step: 1 },
};

export const APPEARANCE_PRESETS = {
  violet: {
    id: "violet",
    label: "Aurora Purple",
    hue: 268,
    glass: 42,
    blur: 30,
    saturation: 148,
    glow: 62,
    dispersion: 50,
    radius: 36,
    density: "comfortable",
    motion: "fluid",
    motionSpeed: 100,
  },
  pearl: {
    id: "pearl",
    label: "Ice Silver",
    hue: 205,
    glass: 34,
    blur: 34,
    saturation: 90,
    glow: 34,
    dispersion: 15,
    radius: 32,
    density: "comfortable",
    motion: "soft",
    motionSpeed: 92,
  },
  sunset: {
    id: "sunset",
    label: "Sunset Chrome",
    hue: 328,
    glass: 38,
    blur: 26,
    saturation: 185,
    glow: 82,
    dispersion: 85,
    radius: 42,
    density: "comfortable",
    motion: "fluid",
    motionSpeed: 108,
  },
  graphite: {
    id: "graphite",
    label: "Graphite",
    hue: 222,
    glass: 62,
    blur: 10,
    saturation: 60,
    glow: 12,
    dispersion: 0,
    radius: 20,
    density: "compact",
    motion: "soft",
    motionSpeed: 86,
  },
};

const DEFAULT_APPEARANCE = APPEARANCE_PRESETS.violet;

function clamp(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min;
}

function sanitizeAppearance(value) {
  const source = value && typeof value === "object" ? value : DEFAULT_APPEARANCE;
  const valueFor = (key) => source[key] ?? DEFAULT_APPEARANCE[key];
  const sanitized = {
    id: typeof source.id === "string" ? source.id : "custom",
    label: typeof source.label === "string" ? source.label : "Custom",
    hue: clamp(valueFor("hue"), APPEARANCE_RANGES.hue.min, APPEARANCE_RANGES.hue.max),
    glass: clamp(valueFor("glass"), APPEARANCE_RANGES.glass.min, APPEARANCE_RANGES.glass.max),
    blur: clamp(valueFor("blur"), APPEARANCE_RANGES.blur.min, APPEARANCE_RANGES.blur.max),
    saturation: clamp(valueFor("saturation"), APPEARANCE_RANGES.saturation.min, APPEARANCE_RANGES.saturation.max),
    glow: clamp(valueFor("glow"), APPEARANCE_RANGES.glow.min, APPEARANCE_RANGES.glow.max),
    dispersion: clamp(valueFor("dispersion"), APPEARANCE_RANGES.dispersion.min, APPEARANCE_RANGES.dispersion.max),
    radius: clamp(valueFor("radius"), APPEARANCE_RANGES.radius.min, APPEARANCE_RANGES.radius.max),
    density: source.density === "compact" ? "compact" : "comfortable",
    motion: ["off", "soft", "fluid"].includes(source.motion) ? source.motion : "fluid",
    motionSpeed: clamp(valueFor("motionSpeed"), APPEARANCE_RANGES.motionSpeed.min, APPEARANCE_RANGES.motionSpeed.max),
  };

  const savedPreset = APPEARANCE_PRESETS[sanitized.id];
  if (savedPreset) {
    const numericMatches = Object.keys(APPEARANCE_RANGES).every((key) => sanitized[key] === savedPreset[key]);
    const modeMatches = sanitized.density === savedPreset.density && sanitized.motion === savedPreset.motion;
    if (!numericMatches || !modeMatches) {
      sanitized.id = "custom";
      sanitized.label = "Custom";
    }
  }

  return sanitized;
}

function loadAppearance() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? sanitizeAppearance(JSON.parse(saved)) : DEFAULT_APPEARANCE;
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function useAppearance() {
  const [appearance, setAppearance] = useState(loadAppearance);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
      } catch {
        // The widget still works when storage is unavailable.
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [appearance]);

  const updateControl = useCallback((key, value) => {
    setAppearance((current) => {
      if (current[key] === value) return current;
      return sanitizeAppearance({ ...current, id: "custom", label: "Custom", [key]: value });
    });
  }, []);

  const applyPreset = useCallback((presetId) => {
    const preset = APPEARANCE_PRESETS[presetId];
    if (preset) setAppearance({ ...preset });
  }, []);

  const resetAppearance = useCallback(() => setAppearance({ ...DEFAULT_APPEARANCE }), []);

  const toggleNightStyle = useCallback(() => {
    setAppearance((current) => ({ ...(current.id === "graphite" ? APPEARANCE_PRESETS.violet : APPEARANCE_PRESETS.graphite) }));
  }, []);

  const motionDuration = useMemo(() => {
    if (appearance.motion === "off" || reducedMotion) return 0;
    const base = appearance.motion === "soft" ? 820 : 560;
    return Math.round(base * (100 / appearance.motionSpeed));
  }, [appearance.motion, appearance.motionSpeed, reducedMotion]);

  const cssVars = useMemo(() => {
    const motionBase = appearance.motion === "off" || reducedMotion
      ? 1
      : appearance.motion === "soft" ? 320 : 240;
    const motionMs = Math.round(motionBase * (100 / appearance.motionSpeed));
    const motionScale = 100 / appearance.motionSpeed;
    const pressInMs = appearance.motion === "off" || reducedMotion
      ? 1
      : Math.round((appearance.motion === "soft" ? 90 : 75) * motionScale);
    const pressOutMs = appearance.motion === "off" || reducedMotion
      ? 1
      : Math.round((appearance.motion === "soft" ? 400 : 340) * motionScale);
    const tabMs = appearance.motion === "off" || reducedMotion
      ? 1
      : Math.round((appearance.motion === "soft" ? 320 : 280) * motionScale);
    const glassLevel = appearance.glass / 100;
    const glassCurve = Math.pow(glassLevel, 0.85);
    const blurLevel = appearance.blur / APPEARANCE_RANGES.blur.max;
    const saturationLevel = (appearance.saturation - APPEARANCE_RANGES.saturation.min)
      / (APPEARANCE_RANGES.saturation.max - APPEARANCE_RANGES.saturation.min);
    const glowLevel = appearance.glow / 100;
    const dispersionLevel = Math.pow(appearance.dispersion / 100, 1.7);
    const densityScale = appearance.density === "compact" ? 0.78 : 1;
    const panelAlpha = Math.min(0.68, 0.03 + glassCurve * 0.6 + blurLevel * 0.05);
    const cardAlpha = Math.min(0.82, 0.05 + glassCurve * 0.72 + blurLevel * 0.05);
    const controlAlpha = Math.min(0.68, 0.1 + glassCurve * 0.48 + blurLevel * 0.05);
    const lineAlpha = Math.min(0.94, 0.32 + glassCurve * 0.22 + glowLevel * 0.34);
    const lineStrongAlpha = Math.min(0.98, 0.52 + glassCurve * 0.16 + glowLevel * 0.28);
    const cardRadius = Math.round(8 + appearance.radius * 0.3);
    const controlRadius = Math.round(7 + appearance.radius * 0.18);

    return {
      "--accent-hue": appearance.hue,
      "--background-hue-shift": `${appearance.hue - 205}deg`,
      "--glass-alpha": appearance.glass / 100,
      "--panel-alpha": panelAlpha,
      "--drag-panel-alpha": Math.min(0.86, Math.max(0.52, panelAlpha + 0.18)),
      "--card-alpha": cardAlpha,
      "--surface-line-alpha": lineAlpha,
      "--surface-line-strong-alpha": lineStrongAlpha,
      "--surface-control-alpha": controlAlpha,
      "--surface-hover-alpha": Math.min(0.78, controlAlpha + 0.12),
      "--surface-active-alpha": Math.min(0.9, controlAlpha + 0.25),
      "--edge-highlight-alpha": Math.min(0.98, 0.48 + glowLevel * 0.48),
      "--surface-shadow-alpha": 0.04 + glowLevel * 0.2,
      "--edge-glow-alpha": 0.015 + glowLevel * 0.32,
      "--edge-glow-radius": `${Math.round(6 + glowLevel * 30)}px`,
      "--dispersion-alpha": 0.02 + dispersionLevel * 0.24,
      "--accent-color-saturation": `${Math.round(72 + saturationLevel * 28)}%`,
      "--frost-saturation": `${Math.round(18 + saturationLevel * 72)}%`,
      "--frost-brightness": `${Math.round(100 + blurLevel * 8)}%`,
      "--glass-blur": `${appearance.blur}px`,
      "--panel-blur": `${Math.round(appearance.blur * 0.75)}px`,
      "--glass-saturation": `${appearance.saturation}%`,
      "--glow-strength": appearance.glow / 100,
      "--ambient-opacity": 0.42 + (appearance.glow / 100) * 0.48,
      "--shadow-alpha": 0.28 + (appearance.glow / 100) * 0.18,
      "--chromatic-offset": `${(dispersionLevel * 4).toFixed(2)}px`,
      "--shell-radius": `${appearance.radius}px`,
      "--panel-radius": `${appearance.radius}px`,
      "--card-radius": `${cardRadius}px`,
      "--control-radius": `${controlRadius}px`,
      "--density": densityScale,
      "--shell-padding": `${Math.round(20 * densityScale)}px`,
      "--header-height": `${Math.round(70 * densityScale)}px`,
      "--header-bottom-padding": `${Math.round(14 * densityScale)}px`,
      "--panel-gap": `${Math.round(18 * densityScale)}px`,
      "--card-gap": `${Math.round(14 * densityScale)}px`,
      "--card-padding": `${Math.round(15 * densityScale)}px`,
      "--motion-ms": `${motionMs}ms`,
      "--motion-slow-ms": `${Math.max(1, Math.round(motionMs * 2.1))}ms`,
      "--press-in-ms": `${pressInMs}ms`,
      "--press-out-ms": `${pressOutMs}ms`,
      "--tab-ms": `${tabMs}ms`,
    };
  }, [appearance, reducedMotion]);

  return {
    appearance,
    applyPreset,
    cssVars,
    motionDuration,
    reducedMotion,
    resetAppearance,
    toggleNightStyle,
    updateControl,
  };
}
