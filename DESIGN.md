---
name: Seattle Collision Dashboard
description: An evidence graphic you can step inside. A data-desk story about Seattle's collisions that hands the reader the same map and chart to explore.
colors:
  severity-1-straw: "#e9c85e"
  severity-2-amber: "#e5a10e"
  severity-3-marigold: "#dd7800"
  severity-4-vermilion: "#cd4e00"
  severity-5-rust: "#af2f02"
  severity-6-brick: "#88201b"
  slate-accent: "#3e5e7e"
  slate-wash: "#dee9f5"
  paper: "#f8f7f3"
  paper-sunk: "#f1ede7"
  paper-raised: "#fefdfa"
  ink: "#211c17"
  graphite: "#4d4641"
  graphite-light: "#68625d"
  hairline: "#dddad6"
  hairline-strong: "#847f7a"
  night-severity-1: "#554614"
  night-severity-2: "#795200"
  night-severity-3: "#a35a00"
  night-severity-4: "#cb601a"
  night-severity-5: "#ed6b42"
  night-severity-6: "#ff826f"
  night-slate-accent: "#92b5d9"
  night-slate-wash: "#222f3c"
  night-ground: "#16120e"
  night-sunk: "#1d1814"
  night-raised: "#211c18"
  night-ink: "#eeebe5"
  night-graphite: "#c1bdb7"
  night-graphite-light: "#a29e98"
  night-hairline: "#37322e"
  night-hairline-strong: "#6d6863"
typography:
  display:
    fontFamily: "Source Serif 4 Variable, Georgia, serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Source Serif 4 Variable, Georgia, serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.1
  title:
    fontFamily: "Source Serif 4 Variable, Georgia, serif"
    fontSize: "1.625rem"
    fontWeight: 600
    lineHeight: 1.1
  numeral-hero:
    fontFamily: "Libre Franklin Variable, system-ui, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 600
    lineHeight: 1
    fontFeature: "tnum"
  numeral:
    fontFamily: "Libre Franklin Variable, system-ui, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 600
    lineHeight: 1
    fontFeature: "tnum"
  body:
    fontFamily: "Libre Franklin Variable, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  label:
    fontFamily: "Libre Franklin Variable, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
  caption:
    fontFamily: "Libre Franklin Variable, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  control: "6px"
  card: "12px"
  sheet: "18px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  page: "24px"
components:
  panel:
    backgroundColor: "{colors.paper-raised}"
    rounded: "{rounded.card}"
    padding: "20px"
  select:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "46px"
    padding: "0 10px"
  search-field:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "46px"
  segmented-control:
    textColor: "{colors.graphite}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 12px"
  segmented-control-active:
    backgroundColor: "{colors.slate-wash}"
    textColor: "{colors.ink}"
  selection-chip:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "6px 10px"
  note:
    backgroundColor: "{colors.paper-sunk}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
  nav-item-active:
    backgroundColor: "{colors.slate-wash}"
    textColor: "{colors.slate-accent}"
  map-overlay:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.control}"
    padding: "0 10px"
---

# Design System: Seattle Collision Dashboard

## Overview

**Creative North Star: "The Data Desk"**

The dashboard reads like a newspaper data desk explaining Seattle's collisions, then lets the reader handle the evidence directly. The craft bar is the NYT Upshot, The Pudding, Reuters Graphics and the Financial Times' annotation style. We match their discipline (one idea per graphic, annotations that point at data, color that encodes meaning), not their layouts or code.

This system replaced a dark, square-cornered, monochrome-blue panel console. Its zero radius, blue palette and CSS-filtered raster tiles are retired; do not bring them back.

**Surfaces and modes.** Neighborhood Explorer and Citywide Analysis are working surfaces: dense, with stable positions and familiar patterns. The planned citywide story page is a reading surface with generous measure and editorial pacing. The planned ⌘K Ask drawer shares the same world.

**Material.** Warm paper and warm ink. Raised surfaces lift off the paper with soft, warm shadows; hairlines separate everything else. Nothing glows, and nothing is glass.

**Imagery.** The data is the imagery: the map, the trend and the ranks. No stock photography, illustration or decorative icons.

**Motion grammar.** Motion explains change, in one ease-out register (`cubic-bezier(.23, 1, .32, 1)`) with no bounce or overshoot.

- **Shipped.** Buttons press to 98% scale on `:active` with a 100 ms transition. The neighborhood picker's results enter over 160 ms from 4 px above. The map flies to a selection, and jumps instantly under reduced motion. Reduced motion removes every press transform.
- **Planned, not yet built.** Charts morph between grains, selections and year ranges. The headline count counts up once on load, in 1000 ms or less, and afterwards rolls only the digits that change. The choropleth crossfades between states (MapLibre does not transition feature-state changes, so this needs two fill layers with an opacity swap). Chart animation stays off until morphs land.
- **Always.** Animate transform, opacity and color only; never width, height or layout. No scroll-triggered reveals, parallax or scroll-jacking. Under reduced motion every transition becomes an instant swap and nothing stays hidden.

**Signature, planned: year playback.** A scrubber with play and pause drives the whole surface. The choropleth steps year by year, the trend chart's cursor travels with it, and the headline count follows. It is user-started, always pausable, and keyboard-operable (arrow keys step a year, Space plays or pauses). This is the page's one memorable moment.

**Signature, planned: ⌘K.** One command bar jumps to a neighborhood, a year range or a view. It opens as a right-hand drawer on desktop and a full-height sheet on mobile, and later carries natural-language answers with an "Apply to dashboard" action that sets URL state.

**Key Characteristics:**
- Warm paper ground with warm ink type; a warm-ink dark theme that follows the system setting.
- One six-step yellow-to-brick ramp, and it only ever means burden.
- A desaturated slate accent for selection, focus, links and active controls.
- Serif headlines, Franklin for everything a reader operates or compares.
- Gently rounded surfaces on a three-step radius scale; two shadow levels.

## Colors

Restrained, with one meaningful ramp. Neutrals are tinted from paper and ink. The severity ramp is the only saturated color. The slate accent handles interaction. Each theme's values were validated with the dataviz palette validator: lightness falls monotonically, adjacent steps differ by at least 0.06 in OKLCH lightness, and the slate accent never matches a ramp step. Candidate A ("straw to brick") was chosen on a Figma review board against two alternatives.

### Primary
- **Severity Ramp, paper** (straw → amber → marigold → vermilion → rust → brick): colors choropleth fills, heat and density layers, and the burden line in the trend chart. Steps are assigned by `rampStep`, square-root spaced against the current maximum so low-burden neighborhoods stay distinguishable when a few dominate. Rust (step 5) is the burden line color, at 6.4:1 on raised paper.
- **Severity Ramp, ink** (the `night-severity-*` steps): the same order retuned for the dark ground. Lightness rises with burden, so the highest burden is the most salient on ink; the hue still runs yellow to red. The lowest step clears the ink ground at 2.0:1.

### Secondary
- **Slate Accent** (paper and ink variants): selection outlines on the map, focus rings, links, the year-slider range and thumbs, active navigation, and the downtown series in the comparison chart. 6.3:1 on paper, 8.7:1 on ink.
- **Slate Wash**: the background of active segmented controls, active navigation, hovered and highlighted list rows, and checked severity filters. Slate text on the wash is 5.5:1.

### Neutral
- **Paper**: the page ground and the map basemap's land.
- **Paper Sunk**: notes, warnings, the primary-burden band in the inspector, and parks on the basemap.
- **Paper Raised**: panels, inspector, chart cards, inputs and map overlays.
- **Ink**: body text and every figure (15.8:1 on paper).
- **Graphite**: secondary text and axis labels (8.6:1).
- **Graphite Light**: tertiary text, the collisions series in the trend chart, and basemap place labels (5.6:1).
- **Hairline**: dividers, gridlines, panel borders, water on the basemap, and minor roads.
- **Hairline Strong**: control borders, swatch outlines, the hatch for partial periods, and major roads (3.7:1, so controls clear the 3:1 non-text floor).

### Named Rules
**The Ramp Means Burden Rule.** The yellow-to-red ramp encodes severity or burden and nothing else. It is never brand, decoration, a hover color, an alert or a categorical series. Collision counts are graphite; status and comparison figures are ink.

**The Never Color Alone Rule.** Partial years and provisional weeks use a hatched band or dashed segment plus a text label. Selection uses a slate outline over a paper casing plus a weight change, and keeps its ramp fill. The palest paper step sits near 1.5:1 against paper, so every polygon keeps a hairline edge and every legend swatch keeps an outline.

## Typography

**Display Font:** Source Serif 4 (variable weight, self-hosted through `@fontsource-variable`, Georgia fallback)
**UI and Numerals Font:** Libre Franklin (variable weight, self-hosted, system-ui fallback)

**Character.** The newspaper-graphics pairing. The serif carries headlines and, later, chart annotations, giving them an editorial voice. Franklin carries everything a reader operates or scans: controls, axis labels, legends, tables and every number.

The serif ships as the weight-only variable file (51 KB Latin), not the optical-size file (122 KB). The optical-size axis would sharpen large headlines, but it put first-view font weight 83 KB over the previous fonts; the weight-only file keeps it at +11 KB. Revisit if the story page's hero headline needs it.

### Hierarchy
- **Display** (600, 2.25rem, 1.1, -0.015em, balanced wrapping): page titles. 1.75rem on phones.
- **Headline** (600, 2rem, 1.1): the inspector's neighborhood name. 1.5rem below 960 px.
- **Title** (600, 1.625rem, 1.1): section headings such as "Collision trends".
- **Numeral Hero** (Franklin 600, 2.5rem, 1, tabular): the inspector's severity burden. The citywide shift and downtown mean use the same voice at 2.25rem and 2rem.
- **Numeral** (Franklin 600, 1.625rem, 1, tabular): metric grid values; 1.375rem in the compact citywide strip.
- **Body** (Franklin 400, 0.9375rem, tabular figures throughout): explanatory text. Descriptive lines run at 0.875rem with 1.5 to 1.6 leading.
- **Label** (Franklin 500, 0.8125rem, 1.4, sentence case): control labels, metric names and legend titles.
- **Caption** (Franklin 500, 0.75rem, 1.4): map hints, legend values, panel bars and attribution.

### Named Rules
**The Numbers Are Franklin Rule.** Every figure a reader might compare is set in tabular Libre Franklin, including the hero burden figure and figures inside serif sentences. The body sets `tabular-nums` globally so counts and table columns never jitter.

**The Sentence Case Rule.** Labels are never tracked out or set in all caps. The brand mark's "SCD" is the one short exception, and it is not tracked.

## Layout

**Working surfaces.** A 118 px navigation rail and an 84 px header frame the workspace; the page pads 24 px (16 px on phones). In Explorer, the map panel and a 350 px inspector sit side by side as one joined card: the map takes the left radius, the inspector the right. The trend card follows with a 24 px gap. Citywide uses the same map-plus-rail join with a 350 px analysis rail (310 px below 1100 px).

Controls keep stable positions so year, selection and grain never jump between states. Spacing runs on 6, 8, 12, 16, 20 and 24 px steps: 8 px inside control groups, 12 to 16 px inside cards, 20 to 24 px between cards.

**Responsive.** Breakpoints sit at 1200, 1100, 960, 900, 760, 600 and 540 px. Below 960 px the workspace stacks and the inspector moves above the map as a two-column card. Below 900 px the rail gives way to a top bar with the brand and route links. Below 600 px everything runs in one column, the grain control stretches full width, and the map drops to 390 px tall. Every touch target is at least 44 px, including map zoom buttons.

**Planned.** The story page opens with a 5/12 and 7/12 split, the serif headline sentence on the left and a large choropleth with playback on the right. On phones the inspector becomes a bottom sheet with peek, half and full detents.

**The Keyboard Twin Rule.** Every map interaction has a keyboard path and an accessible equivalent. Today the neighborhood search is the keyboard twin of map selection, the chart's data table mirrors the chart, and the map legend carries a text description of its scale.

## Elevation & Depth

Depth is paper lifting off paper. On paper, raised surfaces sit on soft, warm-tinted shadows in two levels. On ink, resting surfaces lose their shadow and separate by a slightly lighter raised tone; only floating surfaces keep a shadow.

### Shadow Vocabulary
- **Rest** (`0 1px 2px rgb(60 40 20 / .05), 0 2px 8px rgb(60 40 20 / .06)`; none on ink): the inspector, analysis rail, trend card and citywide metric strip.
- **Float** (`0 4px 12px rgb(60 40 20 / .1), 0 12px 32px rgb(60 40 20 / .12)`; `0 8px 24px rgb(0 0 0 / .45)` on ink): the picker's results popup, chart tooltips, and everything that floats over the map (zoom controls, reset, legend, hint).

### Named Rules
**The Lift Is Earned Rule.** Only surfaces that float over others take Float. Static content cards stay at Rest. Never stack shadows for emphasis.

## Shapes

Gently rounded corners on a three-step scale. Controls, chips, notes, list rows and map overlays use 6 px. Cards, panels and the map frame use 12 px; the map clips to its frame. Sheets and the future drawer use 18 px. Circles appear only where the form is a point: slider thumbs, centroid markers and the status dot. Rules and edges are 1 px hairlines; map polygon edges are 0.8 px in the ground color.

## Components

### Map Frame (signature)
*A quiet basemap so the ramp reads first.*
- **Engine:** MapLibre GL, loaded lazily so it never weighs on first paint. Vector tiles and glyphs come from OpenFreeMap (no key, attribution added in the compact control).
- **Basemap:** five layers painted from the tokens: paper land, sunk parks, hairline water, hairline minor roads from zoom 12, strong-hairline major roads at 55% opacity, and graphite-light place labels with a paper halo. A theme change repaints these same layers in place.
- **Choropleth:** ramp fill at 78% opacity under the place labels, with paper-colored 0.8 px edges. Selection draws a 3 px slate outline over a 6 px paper casing.
- **Density layers (citywide):** circles sized by weight. Amber below the high threshold, rust above it. Dashed graphite downtown boundary; slate line and markers for the spatial shift.
- **Overlays:** zoom buttons (44 px, no compass, rotation off), "Reset map", legend and hint all float on Paper Raised with the control radius and Float shadow.
- **Legend:** six outlined swatches between "0" and the current maximum, with a text description for screen readers.
- **Fallback:** without WebGL the frame shows a sunk note pointing to neighborhood search. It never throws.
- **Busy state:** the frame reports `aria-busy` until the map is idle and while a click is resolving.

### Panels and Cards
- **Corner Style:** card radius, with joined pairs taking one side each.
- **Background:** Paper Raised, hairline border.
- **Shadow Strategy:** Rest (see Elevation).
- **Internal Padding:** 20 px; 16 px on phones.

### Segmented Controls and Tabs
- **Shape:** one bordered group with control radius; segments split by hairlines, 44 to 48 px tall.
- **Default:** transparent, graphite label.
- **Active:** Slate Wash background, ink label, underline offset 6 px, so the active state is not color alone.

### Inputs and Selects
- **Style:** Paper Raised, Hairline Strong border, control radius, 46 px tall.
- **Focus:** the search field shifts its border to slate and adds a 1 px slate outline. Everything else uses the global 2 px slate focus ring with a 3 px offset.

### Selection Chips
- **Style:** Paper Raised, Hairline Strong border, control radius, 44 px tall, with a × to remove. They wrap below the search field.

### Notes and Warnings
- **Style:** Paper Sunk background, graphite text, control radius (or full-bleed inside the inspector). No colored bars and no alert hues; the text names the exclusion.

### Navigation
- **Rail:** icon over label at 0.75rem. Active items take Slate Wash, slate text and a 2 px slate left edge. Hover lifts the label to ink.
- **Mobile:** brand mark plus text links; the active link takes slate text and a 2 px slate underline.

### Trend Chart
- **Series:** collisions as a graphite-light area at 12% fill; burden as a 2 px rust line. Partial annual points continue as dashed segments with hollow dots.
- **Partial and provisional periods:** a 45° hatch band in Hairline Strong, plus the coverage note below the chart.
- **Tooltip:** Paper Raised, Hairline Strong border, control radius, Float shadow.
- **Accessible table:** a disclosure below the chart that always matches its values and filters.

## Do's and Don'ts

### Do:
- **Do** read every color from the CSS tokens, including canvas and WebGL paint, through `getComputedStyle` after the theme attribute settles.
- **Do** assign choropleth steps with `rampStep`, and keep the legend floors derived from the same function.
- **Do** hatch and label partial years and provisional periods everywhere they appear: the chart, the legend and the tables.
- **Do** keep the accessible table, the keyboard path and reduced-motion behavior working for every new interaction.
- **Do** generate every future annotation from the pinned release by rule (largest change, top-burden areas, partial-year notes) and phrase it as an observation, never a cause.
- **Do** keep the basemap quiet: hairline water and roads, graphite-light labels, no hue.

### Don't:
- **Don't** use the ramp's colors for anything but severity and burden: not for counts, categories, alerts, status or comparison figures.
- **Don't** use a cream or parchment ground, italic display serifs, tracked all-caps micro-labels or a terracotta accent. That combination is the generic editorial cliché, not this product.
- **Don't** add scroll-triggered fades, parallax, scroll-jacking, glows, glass or gradient fills.
- **Don't** let any motion bounce, overshoot or run longer than it explains. Every looping or auto-advancing motion needs a pause control.
- **Don't** show model predictions, risk rates or causal claims in annotations, tooltips or Ask answers.
- **Don't** bring back the old look's zero radius, blue monochrome or CSS-filtered raster tiles.
