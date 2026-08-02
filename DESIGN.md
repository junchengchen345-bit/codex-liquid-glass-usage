# Codex visual direction

## Anchor

The selected source is the purple liquid-glass Codex usage dashboard supplied on 2026-07-18. Recreate its desktop information density and hierarchy without copying unsupported task, project, cost, or token-breakdown data.

## Layout

- 1120–1180px desktop shell with a 36px outer radius and 20–24px internal gutters.
- Quiet 80px brand header, a top summary zone with a left single-Halo quota dock and a right 3-card metric grid plus two-row quota detail rail, then a large tabbed detail zone.
- 8px spacing system. Primary gaps: 16px and 24px.
- Responsive breakpoints must preserve all controls and never introduce horizontal page scrolling.

## Visual tokens

- Default direction: Aurora Purple, with deep violet atmosphere and lavender glass.
- Outer glass: translucent, blurred, saturated, white hairline border, soft inner highlight.
- Child cards: 14–18px radius, calmer and lighter than the shell.
- Typography: SF/Inter/PingFang-style system stack; tabular numbers; 32–36px primary metrics.
- Accent colours are semantic: blue for general usage, violet for Spark, coral for peaks, green for healthy/credit state.

## Motion

- One shared sliding tab indicator using `transform`, 220–320ms depending on the selected motion mode.
- Cross-fade + 6px vertical transition between persistent view panels.
- Buttons press to 0.97 scale, refresh rotates only its icon, cards rise no more than 2px.
- Respect `prefers-reduced-motion` and the in-product motion-off setting.

## Data integrity

- Weekly allowances use server-provided percentages and reset timestamps only.
- The quota dock gives the general allowance one open Halo, a visible health label, and one structured `距重置` row. Spark appears in the comparison rail rather than as a duplicate ring.
- Token activity is separate from allowance consumption.
- Credits stay in native `credits` units unless a supported live pricing source is added.
- Never fabricate task boards, project rankings, model cost, or input/cache/output splits.
- Overview activity uses the real daily Token buckets as a blue-to-violet contribution heatmap: one year by default, with a real 30-day alternate view. Heat levels are relative, while the selected-date readout always exposes the exact Token count.

## Activity interaction

- Contribution cells are small rounded glass data marks with one shared readout, a low-to-high legend, a visible today state, and a click-to-pin state. Arrow keys move through dates with a single roving tab stop.
- The signature effect is a brief Canvas particle wake emitted only while a mouse crosses heat cells. Particle count and brightness follow the real heat level; the effect never obscures typography and immediately disables for reduced motion, motion-off, inactive panels, touch, hidden windows, or native window dragging.
- Activity cells never use nested backdrop filters or continuous animation. Idle activity rendering must consume no animation frames.

## Native desktop behavior

- Browser preview keeps the chromatic-metal art direction; the Tauri runtime removes that image and exposes the real macOS wallpaper.
- The macOS 26 implementation uses native clear Liquid Glass with a system-vibrancy fallback.
- The frameless header is the drag target. Header controls stay interactive and provide refresh, appearance, desktop-layer pinning and close actions.
- The widget starts below ordinary app windows and remains visible across Spaces; pinning explicitly raises it above other windows.
