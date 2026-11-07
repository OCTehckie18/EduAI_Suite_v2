"""Generate each portal's dark-mode stylesheet from the colour classes its screens actually use.

The screens are written with light Tailwind colours (bg-white, text-slate-900, bg-red-50 ...).
Rather than edit thousands of class lists, this maps every light colour class found in an app's
source to a dark equivalent under `html.dark`. Run it again after adding new screens:

    python scripts/build_dark_css.py
"""
import glob
import os
import re

ROOT = os.path.join(os.path.dirname(__file__), "..", "apps")
APPS = ("teacherbuddy", "edugames", "eduai")

NEUTRALS = ("slate", "gray", "zinc", "neutral", "stone")
HUES = ("red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan", "sky",
        "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose")

# Dark surfaces for light neutral backgrounds.
NEUTRAL_BG = {"white": "var(--dk-card)", "50": "var(--dk-sunken)", "100": "var(--dk-raised)", "200": "#243044", "300": "#2f3b52", "400": "#3c4a63"}
# Light text for dark text classes.
NEUTRAL_TEXT = {"black": "var(--dk-text)", "950": "var(--dk-text)", "900": "var(--dk-text)", "800": "var(--dk-text)",
                "700": "#d3d9e3", "600": "#b4bdcc", "500": "var(--dk-text-sub)", "400": "var(--dk-text-dim)", "300": "#6b7890"}
NEUTRAL_BORDER = {"white": "rgba(148,163,184,.12)", "50": "rgba(148,163,184,.14)", "100": "rgba(148,163,184,.16)",
                  "200": "rgba(148,163,184,.2)", "300": "rgba(148,163,184,.28)", "400": "rgba(148,163,184,.38)"}
HUE_BG = {"50": 14, "100": 20, "200": 28}        # % of the hue's 500 shade mixed into the card colour
HUE_BORDER = {"50": 25, "100": 30, "200": 38, "300": 48}
HUE_TEXT_FROM = 600                               # text-<hue>-600 and darker become the 300 shade

CLASS = re.compile(r"(?<![\w-])((?:[a-z-]+:)*)(bg|text|border|divide|from|to|via)-(white|black|(?:%s)-\d{2,3}|(?:%s)-\d{2,3})(?:/(\d{1,3}))?(?![\w-])"
                   % ("|".join(NEUTRALS), "|".join(HUES)))

PSEUDO = {"hover": ":hover", "focus": ":focus", "focus-within": ":focus-within", "focus-visible": ":focus-visible",
          "active": ":active", "disabled": ":disabled", "checked": ":checked", "placeholder": "::placeholder",
          "first": ":first-child", "last": ":last-child", "odd": ":nth-child(odd)", "even": ":nth-child(even)"}
MEDIA = {"sm": "40rem", "md": "48rem", "lg": "64rem", "xl": "80rem", "2xl": "96rem"}


def css_escape(name):
    return re.sub(r"([:/.\[\]#%()])", r"\\\1", name)


def dark_value(kind, colour, alpha):
    """The dark colour for one light utility, or None to leave it alone."""
    if colour in ("white", "black"):
        family, shade = colour, colour
    else:
        family, shade = colour.rsplit("-", 1)
    value = None
    if kind in ("bg", "from", "to", "via"):
        if family in NEUTRALS or family == "white":
            value = NEUTRAL_BG.get(shade)
        elif family in HUES and shade in HUE_BG:
            value = f"color-mix(in srgb, var(--color-{family}-500) {HUE_BG[shade]}%, var(--dk-card))"
    elif kind == "text":
        if family in NEUTRALS or family == "black":
            value = NEUTRAL_TEXT.get(shade)
        elif family in HUES and shade.isdigit() and int(shade) >= HUE_TEXT_FROM:
            value = f"var(--color-{family}-300)"
    elif kind in ("border", "divide"):
        if family in NEUTRALS or family == "white":
            value = NEUTRAL_BORDER.get(shade)
        elif family in HUES and shade in HUE_BORDER:
            value = f"color-mix(in srgb, var(--color-{family}-500) {HUE_BORDER[shade]}%, transparent)"
    if value and alpha:
        value = f"color-mix(in srgb, {value} {int(alpha)}%, transparent)"
    return value


PROP = {"bg": "background-color", "text": "color", "border": "border-color", "divide": "border-color",
        "from": "--tw-gradient-from", "to": "--tw-gradient-to", "via": "--tw-gradient-via"}


def rule(variants, kind, colour, alpha):
    value = dark_value(kind, colour, alpha)
    if value is None:
        return None
    name = "".join(variants) + f"{kind}-{colour}" + (f"/{alpha}" if alpha else "")
    selector = "." + css_escape(name)
    media = None
    prefix = "html.dark "
    for v in [x.rstrip(":") for x in variants]:
        if v in MEDIA:
            media = MEDIA[v]
        elif v == "dark":
            return None  # already a dark style written by hand
        elif v.startswith("group-") and v[6:] in PSEUDO:
            prefix = f"html.dark .group{PSEUDO[v[6:]]} "
        elif v in PSEUDO:
            selector += PSEUDO[v]
        else:
            return None  # a variant this script does not know; leave it alone
    if kind == "divide":
        selector += " > :not(:last-child)"
    body = f"{prefix}{selector} {{ {PROP[kind]}: {value}; }}"
    return (media, body)


def build(app):
    found = set()
    for path in glob.glob(os.path.join(ROOT, app, "src", "**", "*.tsx"), recursive=True):
        for m in CLASS.finditer(open(path, encoding="utf-8").read()):
            variants = re.findall(r"[a-z-]+:", m.group(1))
            found.add((tuple(variants), m.group(2), m.group(3), m.group(4) or ""))
    plain, media_rules = [], {}
    for variants, kind, colour, alpha in sorted(found):
        made = rule(list(variants), kind, colour, alpha)
        if made is None:
            continue
        media, body = made
        (media_rules.setdefault(media, []) if media else plain).append(body)
    lines = ["/* Generated by scripts/build_dark_css.py. Do not edit by hand: run the script again. */", *plain]
    for width, bodies in sorted(media_rules.items()):
        lines.append(f"@media (min-width: {width}) {{")
        lines.extend("  " + b for b in bodies)
        lines.append("}")
    out = os.path.join(ROOT, app, "src", "dark-utilities.css")
    open(out, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    return len(plain) + sum(len(v) for v in media_rules.values())


if __name__ == "__main__":
    for app in APPS:
        print(app, build(app), "rules")
