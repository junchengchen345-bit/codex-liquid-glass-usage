import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export const DESKTOP_RUNTIME = isTauri();

const INTERACTIVE_SELECTOR = [
  "button",
  "input",
  "a",
  "label",
  "select",
  "textarea",
  "[role='tab']",
  "[data-window-drag='false']",
].join(",");

let dragSettleTimer = null;

export function readCodexUsageNative() {
  return invoke("read_codex_usage");
}

export function startDesktopDrag(event) {
  if (!DESKTOP_RUNTIME || event.button !== 0) return;
  if (event.target instanceof Element && event.target.closest(INTERACTIVE_SELECTOR)) return;

  const root = document.documentElement;
  if (dragSettleTimer !== null) {
    window.clearTimeout(dragSettleTimer);
    dragSettleTimer = null;
  }
  root.dataset.windowDragging = "true";

  getCurrentWindow()
    .startDragging()
    .catch((error) => {
      console.error("Unable to drag the desktop widget window.", error);
    })
    .finally(() => {
      // Give native Liquid Glass two frames plus a short settle window to catch up
      // before WebKit resumes its nested panel sampling.
      dragSettleTimer = window.setTimeout(() => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            delete root.dataset.windowDragging;
            dragSettleTimer = null;
          });
        });
      }, 90);
    });
}

export async function setDesktopPinned(pinned) {
  if (!DESKTOP_RUNTIME) return false;

  const currentWindow = getCurrentWindow();
  if (pinned) {
    await currentWindow.setAlwaysOnBottom(false);
    await currentWindow.setAlwaysOnTop(true);
  } else {
    await currentWindow.setAlwaysOnTop(false);
    await currentWindow.setAlwaysOnBottom(true);
  }

  return pinned;
}

export function closeDesktopWindow() {
  if (!DESKTOP_RUNTIME) return Promise.resolve();
  return getCurrentWindow().close();
}
