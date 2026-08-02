import {
  ArrowCounterClockwise,
  CircleHalfTilt,
  DropHalfBottom,
  Gauge,
  Palette,
  Sparkle,
} from "@phosphor-icons/react";
import { APPEARANCE_PRESETS, APPEARANCE_RANGES } from "../hooks/useAppearance";

const RANGE_CONTROLS = [
  { key: "hue", label: "主色相", suffix: "°", icon: Palette },
  { key: "glass", label: "玻璃透明度", suffix: "%", icon: DropHalfBottom },
  { key: "blur", label: "背景模糊", suffix: "px", icon: CircleHalfTilt },
  { key: "saturation", label: "色彩饱和", suffix: "%", icon: Sparkle },
  { key: "glow", label: "边缘辉光", suffix: "%", icon: Sparkle },
  { key: "dispersion", label: "色散强度", suffix: "%", icon: Palette },
  { key: "radius", label: "圆角尺寸", suffix: "px", icon: Gauge },
  { key: "motionSpeed", label: "动效速度", suffix: "%", icon: Gauge },
];

function SegmentedControl({ label, options, value, onChange }) {
  return (
    <div className="style-segment-row">
      <span>{label}</span>
      <div className="mini-segment" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            type="button"
            className={value === option.value ? "is-selected" : ""}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            key={option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AppearancePanel({ appearance, applyPreset, resetAppearance, updateControl }) {
  const appearanceStatus = appearance.id === "custom" ? "自定义参数" : appearance.label;

  return (
    <div className="appearance-layout">
      <div className="appearance-intro">
        <div className="section-icon"><Palette weight="duotone" /></div>
        <div>
          <p className="eyebrow">LIQUID LAB</p>
          <h2>调出你的玻璃质感</h2>
          <p>参数即时作用于内容玻璃层；原生外框保持系统 Liquid Glass。</p>
        </div>
        <span className="appearance-state" aria-live="polite">{appearanceStatus}</span>
        <button type="button" className="reset-style-button" onClick={resetAppearance}>
          <ArrowCounterClockwise />
          恢复默认
        </button>
      </div>

      <div className="preset-grid" aria-label="风格预设">
        {Object.values(APPEARANCE_PRESETS).map((preset) => (
          <button
            type="button"
            className={`preset-card preset-${preset.id} ${appearance.id === preset.id ? "is-selected" : ""}`}
            aria-pressed={appearance.id === preset.id}
            onClick={() => applyPreset(preset.id)}
            key={preset.id}
          >
            <span className="preset-orb" aria-hidden="true" />
            <span>{preset.label}</span>
            <small>{preset.blur}px blur · {preset.glass}% glass</small>
          </button>
        ))}
      </div>

      <div className="style-controls">
        {RANGE_CONTROLS.map(({ key, label, suffix, icon: Icon }) => {
          const { min, max, step } = APPEARANCE_RANGES[key];
          const progress = ((appearance[key] - min) / (max - min)) * 100;
          const disabled = key === "motionSpeed" && appearance.motion === "off";
          return (
          <label className={`range-control ${disabled ? "is-disabled" : ""}`} key={key} title={disabled ? "启用动效后可调" : undefined}>
            <span className="range-heading">
              <span><Icon />{label}</span>
              <output>{appearance[key]}{suffix}</output>
            </span>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={appearance[key]}
              aria-label={label}
              aria-valuetext={`${appearance[key]}${suffix}`}
              disabled={disabled}
              style={{ "--range-progress": `${progress}%` }}
              onInput={(event) => updateControl(key, Number(event.currentTarget.value))}
              onChange={(event) => updateControl(key, Number(event.currentTarget.value))}
            />
          </label>
          );
        })}
      </div>

      <div className="style-segments">
        <SegmentedControl
          label="界面密度"
          value={appearance.density}
          onChange={(value) => updateControl("density", value)}
          options={[{ value: "compact", label: "紧凑" }, { value: "comfortable", label: "舒适" }]}
        />
        <SegmentedControl
          label="动效模式"
          value={appearance.motion}
          onChange={(value) => updateControl("motion", value)}
          options={[{ value: "off", label: "关闭" }, { value: "soft", label: "柔和" }, { value: "fluid", label: "流体" }]}
        />
      </div>
    </div>
  );
}
