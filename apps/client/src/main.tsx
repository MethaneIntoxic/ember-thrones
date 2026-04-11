import React from "react";
import { createRoot } from "react-dom/client";
import { AppRouter } from "./app/router";
import "./styles/tokens.css";
import "./styles/theme.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root mount node was not found.");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const base = import.meta.env.BASE_URL;
    const normalizedBase = base.endsWith("/") ? base : `${base}/`;
    const swUrl = `${normalizedBase}sw.js`;

    navigator.serviceWorker
      .register(swUrl, { scope: normalizedBase })
      .then((registration) => {
        if (registration.waiting) {
          window.dispatchEvent(new CustomEvent("sw:update-ready"));
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) {
            return;
          }

          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              window.dispatchEvent(new CustomEvent("sw:update-ready"));
            }
          });
        });

        navigator.serviceWorker.addEventListener("controllerchange", () => {
          window.location.reload();
        });
      })
      .catch((error) => {
        console.error("Service worker registration failed", error);
      });
  });
}
