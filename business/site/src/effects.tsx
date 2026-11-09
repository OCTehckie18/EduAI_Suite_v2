import { createElement, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** True once the page has scrolled past `offset` pixels. */
export function useScrolled(offset = 12): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > offset);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [offset]);
  return scrolled;
}

/** Moves the card's spotlight (see `.spotlight` in index.css) to the pointer. */
export function trackSpotlight(event: React.MouseEvent<HTMLElement>) {
  const el = event.currentTarget;
  const rect = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${event.clientX - rect.left}px`);
  el.style.setProperty("--my", `${event.clientY - rect.top}px`);
}

/**
 * Pointer position over an element as --px / --py (each -0.5 to 0.5). The hero uses these to tilt
 * the product window and drift the floating cards.
 */
export function usePointerVars<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    let frame = 0;
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        el.style.setProperty("--px", ((event.clientX - rect.left) / rect.width - 0.5).toFixed(3));
        el.style.setProperty("--py", ((event.clientY - rect.top) / rect.height - 0.5).toFixed(3));
      });
    };
    const leave = () => {
      cancelAnimationFrame(frame);
      el.style.setProperty("--px", "0");
      el.style.setProperty("--py", "0");
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, []);
  return ref;
}

/** Fades its children up the first time they scroll into view. */
export function Reveal({ children, delay = 0, className = "", as = "div" }: { children: ReactNode; delay?: number; className?: string; as?: string }) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined" || prefersReducedMotion()) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const style: CSSProperties = { transitionDelay: `${delay}ms` };
  return createElement(as, { ref, className: `reveal ${visible ? "is-visible" : ""} ${className}`, style }, children);
}
