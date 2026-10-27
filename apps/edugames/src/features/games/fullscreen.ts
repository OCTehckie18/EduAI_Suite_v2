export const requestGameFullscreen = () => {
  if (typeof document === "undefined" || document.fullscreenElement) return;

  void document.documentElement.requestFullscreen().catch(() => {
    // Fullscreen may be denied by browser or device settings.
  });
};
