import { useEffect } from "react";

const LIQUID_SELECTOR = [
  ".icon-button-group button",
  ".view-switcher button",
  ".reset-style-button",
  ".preset-card",
  ".mini-segment button",
  ".activity-range-toggle button",
].join(",");

export function useLiquidPointer(rootRef, enabled) {
  useEffect(() => {
    const root = rootRef.current;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (!root || !enabled || !finePointer.matches || reducedMotion.matches) return undefined;

    let animationFrame = 0;
    let latestEvent = null;

    const updateHighlight = () => {
      animationFrame = 0;
      const event = latestEvent;
      const target = event?.target instanceof Element
        ? event.target.closest(LIQUID_SELECTOR)
        : null;

      if (!target || !root.contains(target)) return;

      const bounds = target.getBoundingClientRect();
      target.style.setProperty("--liquid-x", `${event.clientX - bounds.left}px`);
      target.style.setProperty("--liquid-y", `${event.clientY - bounds.top}px`);
    };

    const handlePointerMove = (event) => {
      latestEvent = event;
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(updateHighlight);
    };

    root.addEventListener("pointermove", handlePointerMove, { passive: true });

    return () => {
      root.removeEventListener("pointermove", handlePointerMove);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [enabled, rootRef]);
}
