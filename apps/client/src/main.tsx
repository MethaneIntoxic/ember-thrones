import React from "react";
import { createRoot } from "react-dom/client";
import { AppRouter } from "./app/router";
import { resolveRuntimeCapabilities } from "./game/platform/runtimePolicy";
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

const runtimeCapabilities = resolveRuntimeCapabilities();

if ("serviceWorker" in navigator) {
  if (!runtimeCapabilities.serviceWorker.enabled) {
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      void Promise.all(registrations.map((registration) => registration.unregister()));
    });
  }

  window.addEventListener("load", () => {
    if (!runtimeCapabilities.serviceWorker.enabled) {
      return;
    }

    const swUrl = `${runtimeCapabilities.serviceWorker.url}?build=${encodeURIComponent(__APP_BUILD_ID__)}`;

    navigator.serviceWorker
      .register(swUrl, { scope: runtimeCapabilities.serviceWorker.scope })
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
