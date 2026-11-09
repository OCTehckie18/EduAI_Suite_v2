/**
 * The front door that lists every portal. Set VITE_LANDING_URL in production; in development it
 * runs on port 5176 of the same host.
 */
export const landingUrl = (): string => {
  const configured = import.meta.env.VITE_LANDING_URL as string | undefined;
  return (configured || `${window.location.protocol}//${window.location.hostname}:5176`).replace(/\/$/, "");
};
