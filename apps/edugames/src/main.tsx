import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import "./index.css";
import "./dark-theme.css";
import "./dark-utilities.css";
import { initTheme } from "./shared/theme";
import { BrandingTitle } from "./shared/university";
import { router } from "./router";
import { installAuthFetch } from "./shared/utils/installAuthFetch";

// This is a public OAuth client identifier. Deployments can override it with
// VITE_GOOGLE_CLIENT_ID, but the app remains functional if the frontend env
// file is not injected during the build.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
  if ("caches" in window) {
    caches.keys().then((keys) => {
      keys.forEach((key) => caches.delete(key));
    });
  }
}

installAuthFetch();
initTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrandingTitle app="EduGames" />
      <RouterProvider router={router} />
    </GoogleOAuthProvider>
  </StrictMode>,
);
