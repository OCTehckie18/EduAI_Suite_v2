import { describe, expect, it } from "vitest";
import { brandPalette } from "./brand";

const light = { primary_color: "#0b4a87", secondary_color: "#e8792b", tertiary_color: "#0f766e" };

describe("brandPalette in dark mode", () => {
  it("works out lighter shades automatically when no dark colours are chosen", () => {
    const auto = brandPalette(light, true);
    expect(auto["--color-brand-blue"]).not.toBe("#0b4a87");
    expect(brandPalette({ ...light, primary_color_dark: "" }, true)).toEqual(auto);
  });

  it("uses the colours the university chose for dark mode exactly as given", () => {
    const palette = brandPalette({ ...light, primary_color_dark: "#7da2ff", secondary_color_dark: "#f2c94c", tertiary_color_dark: "#56ccf2" }, true);
    expect(palette["--color-brand-blue"]).toBe("#7da2ff");
    expect(palette["--color-brand-blue-fill"]).toBe("#7da2ff");
    expect(palette["--color-brand-gold"]).toBe("#f2c94c");
    expect(palette["--color-brand-accent"]).toBe("#56ccf2");
    expect(palette["--color-brand-accent-fill"]).toBe("#56ccf2");
  });

  it("can change one colour and leave the others automatic", () => {
    const auto = brandPalette(light, true);
    const palette = brandPalette({ ...light, secondary_color_dark: "#f2c94c" }, true);
    expect(palette["--color-brand-gold"]).toBe("#f2c94c");
    expect(palette["--color-brand-blue"]).toBe(auto["--color-brand-blue"]);
  });

  it("never uses the dark colours in light mode", () => {
    const withDark = brandPalette({ ...light, primary_color_dark: "#7da2ff" }, false);
    expect(withDark).toEqual(brandPalette(light, false));
    expect(withDark["--color-brand-blue"]).toBe("#0b4a87");
  });

  it("ignores a dark colour that is not a valid #rrggbb value", () => {
    const auto = brandPalette(light, true);
    expect(brandPalette({ ...light, primary_color_dark: "blue" }, true)).toEqual(auto);
  });
});
