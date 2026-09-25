---
name: "Seattle Collision Dashboard"
description: "A calibrated civic operations console for exploring Seattle street-safety evidence."
colors:
  canvas: "#06111c"
  panel-deep: "#07131f"
  panel: "#0a1826"
  panel-raised: "#0d1d2c"
  panel-active: "#102742"
  text-primary: "#f2f7fb"
  text-secondary: "#b8c7d5"
  text-muted: "#7890a8"
  border: "#203247"
  border-strong: "#36506a"
  selection: "#2f84ff"
  support: "#27d1df"
  caution: "#f3a52b"
  caution-soft: "#2a2111"
  fatal: "#f05252"
  focus: "#79b6ff"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "3.55rem"
    fontWeight: 600
    lineHeight: 0.86
    letterSpacing: "0.02em"
  headline:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(1.7rem, 2.4vw, 2.55rem)"
    fontWeight: 600
    lineHeight: 0.95
    letterSpacing: "0.02em"
  title:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1
  body:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
  label:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "0.65rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.12em"
rounded:
  square: "0px"
  micro: "2px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "18px"
  xl: "22px"
  2xl: "28px"
components:
  nav-item-active:
    backgroundColor: "{colors.panel-active}"
    textColor: "{colors.selection}"
    typography: "{typography.label}"
    rounded: "{rounded.square}"
    height: "72px"
    width: "72px"
  search-field:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.square}"
    padding: "0 10px"
    height: "46px"
  filter-chip:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.square}"
    padding: "0 13px"
    height: "40px"
  filter-chip-selected:
    backgroundColor: "{colors.panel-active}"
    textColor: "{colors.selection}"
    typography: "{typography.label}"
    rounded: "{rounded.square}"
    padding: "0 13px"
    height: "40px"
  layer-tab-selected:
    backgroundColor: "{colors.panel-active}"
    textColor: "{colors.selection}"
    typography: "{typography.label}"
    rounded: "{rounded.square}"
    height: "48px"
    width: "112px"
  metric-cell:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text-primary}"
    typography: "{typography.title}"
    rounded: "{rounded.square}"
    padding: "14px 16px"
    height: "84px"
  warning-banner:
    backgroundColor: "{colors.caution-soft}"
    textColor: "{colors.caution}"
    typography: "{typography.label}"
    rounded: "{rounded.square}"
    padding: "0 14px"
    height: "34px"
  analysis-card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.square}"
    padding: "18px"
---

# Design System: Seattle Collision Dashboard

## Overview

**Creative North Star: "Civic Safety Operations Console"**

The Civic Safety Operations Console treats each screen as a calibrated public instrument rather than a consumer dashboard. A near-black navy field, condensed operational labels, restrained body copy, and tabular numerics give dense evidence a precise control-room cadence while keeping the public data legible.

Panels stay flat and rectilinear, separated by blue-gray hairlines and small tonal steps instead of decorative lift. Electric blue tracks the active selection across controls, maps, and evidence; cyan supports analysis, amber marks caution or partial data, and red appears only for genuine fatal outcomes.

**Key Characteristics:**

- Dense, scan-first civic operations layout.
- Square modules with hairline structural borders.
- Condensed uppercase labels paired with restrained sans-serif body copy.
- Semantic accents whose meanings remain stable across views.
- One synchronized selection pulse, removed under reduced motion.

## Colors

The palette is a low-luminance navy instrument field with cool structural neutrals and four tightly assigned signals.

### Primary

- **Electric Selection:** Marks the active route, selected polygon, selected filters, range track, and primary burden values.
- **Focus Blue:** Draws the globally visible keyboard focus outline without competing with selected state.

### Secondary

- **Analytical Cyan:** Supports comparison lines, live data status, map attribution, and secondary analytical values.
- **Caution Amber:** Marks incomplete periods, serious-injury emphasis, and analytical exclusions.

### Tertiary

- **Fatal Outcome Red:** Reserved for fatality values, error boundaries, and changes that worsen safety outcomes.

### Neutral

- **Midnight Canvas:** The page and application-shell field.
- **Deep Instrument Panel:** The navigation rail and map field.
- **Instrument Panel:** The default container, input, inspector, and state surface.
- **Raised Instrument Panel:** The only elevated menu and tooltip surface.
- **Active Channel Panel:** The tonal ground behind selected navigation, filters, and tabs.
- **Primary Instrument Text:** High-emphasis headings, values, and labels.
- **Secondary Instrument Text:** Supporting readable copy and contextual values.
- **Muted Instrument Text:** Metadata, inactive controls, axes, and helper text.
- **Structural Hairline:** Default panel divisions, grid lines, and quiet boundaries.
- **Strong Structural Hairline:** Interactive control borders and elevated-surface boundaries.
- **Caution Field:** The dark tonal ground used behind amber warnings.

**The Selection Has One Meaning Rule.** Electric blue means active or selected; do not spend it on generic decoration.

**The Severity Color Rule.** Amber communicates caution or incomplete evidence, while red is reserved for fatalities, errors, and worsening safety outcomes.

## Typography

**Display Font:** Barlow Condensed (with Arial Narrow and sans-serif fallback)

**Body Font:** IBM Plex Sans (with system-ui and sans-serif fallback)

**Character:** Condensed display type creates an operational cadence for commands, labels, and tabular evidence. The body face remains restrained and readable so the interface feels like a public instrument, not themed spectacle.

### Hierarchy

- **Display** (600, 3.55rem, 0.86): Singular burden values in the selected-neighborhood inspector.
- **Headline** (600, clamp(1.7rem, 2.4vw, 2.55rem), 0.95): Route commands and major analytical headings, uppercase.
- **Title** (600, 1.75rem, 1): Metric values and compact panel titles; use tabular numerics for measured values.
- **Body** (400, 0.9375rem): Default interface copy; smaller contextual paragraphs may tighten to 0.78rem with a 1.45–1.5 line height.
- **Label** (600, 0.65rem, 0.12em letter spacing): Uppercase control labels, panel coordinates, statuses, and metadata.

**The Condensed Means Operational Rule.** Use the display face for commands, labels, navigation, and numbers; never set explanatory paragraphs in it.

## Layout

Desktop uses a fixed 72px navigation rail, a 68px command header, and a fluid main field. Pages use 22px outer padding and an 18px working gap; Neighborhood Explorer pairs a fluid map with a 370px inspector, while Citywide Analysis pairs its map with a 350px analytical rail. Evidence cells form continuous bordered grids instead of floating cards.

The layout tightens in bounded stages: Neighborhood Explorer narrows its inspector at 1100px, Citywide Analysis narrows its rail at 1000px, and compact metrics collapse to two columns at 900px. At 760px and below, the rail becomes a 108px fixed top command area, page padding becomes 12px, the workspaces stack, and maps use a 390px working height. Touch controls retain 40–44px minimum target heights.

Spacing follows a compact 4px, 8px, 12px, 18px, 22px, and 28px rhythm. Use the smaller steps inside controls and evidence cells; reserve the larger steps for route structure and major separations.

## Elevation & Depth

The system is flat by default. Depth comes from the navy surface ramp, one-pixel blue-gray hairlines, and active tonal fields; resting panels do not cast shadows. The searchable neighborhood list is the one true overlay and uses a deep 0 18px 36px rgba(0,0,0,.38) shadow to separate it from the working field.

**The Flat Instrument Rule.** Use surface tone and hairline structure before shadow; shadow is reserved for content that physically overlays another working layer.

## Shapes

Geometry is rectilinear and precise. Panels, controls, chips, tabs, map controls, metric cells, markers, and buttons use square corners (0px); only compact tooltip surfaces may use a micro radius (2px). One-pixel borders organize the surface, two-pixel rules identify active edges, and square markers reinforce the measured, instrument-like character.

**The Rectilinear Rule.** Keep corners between 0px and 2px in implemented primitives; never soften the console with pill controls or generic rounded cards.

## Components

### Navigation

- **Rail:** A 72px deep-navy column with square 72px items, muted defaults, tonal hover, and an electric-blue active edge.
- **Mobile:** A compact 48px top row; active routes use electric-blue text and a two-pixel bottom rule.
- **Focus:** Every link receives the global two-pixel Focus Blue outline with a three-pixel offset.

### Inputs / Fields

- **Style:** A 46px panel field with a Strong Structural Hairline border, square corners, muted placeholder, and cyan search icon.
- **Focus:** `focus-within` shifts the border to Electric Selection and adds a one-pixel selection ring.
- **Menus:** Search results open on the Raised Instrument Panel, keep 40px rows, and separate rows with quiet hairlines.

### Chips

- **Style:** Severity filters are 40px square chips with a strong hairline, condensed uppercase label, and 13px inline padding.
- **State:** Selected chips use the Active Channel Panel, Electric Selection border and text, and a visible check; keyboard focus uses the global focus outline.

### Cards / Containers

- **Corner Style:** Square and continuously joined.
- **Background:** Default panels use the Instrument Panel; selected or emphasized regions use restrained tonal mixes or the Active Channel Panel.
- **Shadow Strategy:** No shadow at rest; rely on the surface ramp and Structural Hairline.
- **Internal Padding:** Dense evidence cells use 14px by 16px; analytical cards use 18px; inspector headers and primary burden panels use 20px.

### Metric Cells

Metric cells form a continuous two- or five-column definition grid. Labels are muted condensed uppercase; measured values are tabular, high-contrast, and colored only when their semantic role is caution, fatality, or analytical support.

### Tabs

Layer tabs fill a 48px panel bar and begin at 112px wide. The selected tab uses the Active Channel Panel, Electric Selection text, and an inset two-pixel bottom rule; unselected tabs remain transparent and muted.

### Warnings

Warnings are full-width amber-on-dark tonal bars with a structural border, square edges, condensed uppercase copy, and no icon-only dependency. The amber language must explicitly name the partial period or exclusion.

### Selection Pulse

A single neighborhood selection triggers coordinated polygon, inspector-rule, and trend-marker pulses lasting 600–720ms with ease-out timing. These animations confirm synchronization rather than decorate the surface; the global reduced-motion query collapses them to effectively static state.

## Do's and Don'ts

### Do:

- **Do** keep evidence dense, aligned, and divided by one-pixel blue-gray hairlines.
- **Do** use Electric Selection consistently for the active route, filter, polygon, or analytical layer.
- **Do** pair uppercase condensed labels with restrained body copy and tabular numeric values.
- **Do** label partial data and analytical exclusions in text as well as color.
- **Do** preserve 40–44px touch targets and visible keyboard focus at every responsive size.

### Don't:

- **Don't** introduce glassmorphism, backdrop blur, or ambient shadows on resting surfaces.
- **Don't** turn controls into pills or panels into generic rounded cards.
- **Don't** use Fatal Outcome Red for neutral emphasis or decorative heat.
- **Don't** create oversized marketing heroes; the first viewport is a working evidence field.
- **Don't** reintroduce Streamlit styling, friendly dashboard defaults, or ornamental control-room machinery.
