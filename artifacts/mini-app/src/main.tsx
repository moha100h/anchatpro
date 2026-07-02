import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";

const tg = (window as any).Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
