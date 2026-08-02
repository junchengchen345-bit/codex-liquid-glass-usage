import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { DESKTOP_RUNTIME } from "./lib/desktop";
import "./styles.css";

const runtime = DESKTOP_RUNTIME ? "desktop" : "web";
document.documentElement.dataset.runtime = runtime;
document.body.dataset.runtime = runtime;

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
