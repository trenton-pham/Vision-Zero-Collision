---
name: Seattle Collision Dashboard
description: Ink on cool paper. A quiet instrument studio for Seattle's collision record, where the collision field draws itself as ink and the reader steps from the overview into the same map and charts.
colors:
  ramp-1-straw: "#e9c85e"
  ramp-2-amber: "#e5a10e"
  ramp-3-marigold: "#dd7800"
  ramp-4-vermilion: "#cd4e00"
  ramp-5-rust: "#af2f02"
  ramp-6-brick: "#88201b"
  violet: "#5d4dbe"
  violet-wash: "#e8e9ff"
  cool-paper: "#f5f6f9"
  paper-sunk: "#ebeef3"
  surface: "#ffffff"
  indigo-ink: "#0e1d3a"
  ink-2: "#434d61"
  ink-3: "#60697a"
  rule: "#dde0e5"
  rule-strong: "#808693"
  night-ramp-1: "#625114"
  night-ramp-2: "#885c00"
  night-ramp-3: "#b36300"
  night-ramp-4: "#db6b25"
  night-ramp-5: "#f77c56"
  night-ramp-6: "#fe9c8c"
  night-violet: "#aaa7f4"
  night-violet-wash: "#2b294b"
  indigo-night: "#0a1222"
  night-sunk: "#10192a"
  night-surface: "#141e30"
  night-ink: "#e7ebf2"
  night-ink-2: "#b7beca"
  night-ink-3: "#979fad"
  night-rule: "#2a3342"
  night-rule-strong: "#60697b"
typography:
  display:
    fontFamily: "Jost Variable, Avenir Next, system-ui, sans-serif"
    fontSize: "clamp(2.75rem, 3.9vw, 4.25rem)"
    fontWeight: 300
    lineHeight: 1.05
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Jost Variable, Avenir Next, system-ui, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 300
    lineHeight: 1.1
    letterSpacing: "-0.005em"
  title:
    fontFamily: "Jost Variable, Avenir Next, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 300
    lineHeight: 1.2
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
  readout-value:
    fontFamily: "Libre Franklin Variable, system-ui, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 400
    lineHeight: 1.1
    fontFeature: "tnum"
  body:
    fontFamily: "Libre Franklin Variable, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  label:
    fontFamily: "Libre Franklin Variable, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.3
  readout-label:
    fontFamily: "Libre Franklin Variable, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.12em"
  caption:
    fontFamily: "Libre Franklin Variable, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  control: "6px"
  card: "12px"
  circle: "50%"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  page: "24px"
  hero: "32px"
components:
  button-primary:
    backgroundColor: "{colors.indigo-ink}"
    textColor: "{colors.cool-paper}"
    rounded: "{rounded.control}"
    height: "48px"
    padding: "0 20px"
  button-secondary:
    textColor: "{colors.indigo-ink}"
    rounded: "{rounded.control}"
    height: "48px"
    padding: "0 20px"
  nav-item:
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    height: "48px"
    padding: "0 8px"
  nav-item-hover:
    backgroundColor: "{colors.paper-sunk}"
    textColor: "{colors.indigo-ink}"
  nav-icon:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.circle}"
    size: "36px"
  nav-icon-active:
    backgroundColor: "{colors.indigo-ink}"
    textColor: "{colors.cool-paper}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.indigo-ink}"
    rounded: "{rounded.card}"
    padding: "24px"
  card-featured:
    backgroundColor: "{colors.indigo-ink}"
    textColor: "{colors.cool-paper}"
    rounded: "{rounded.card}"
    padding: "24px"
  flow-thumbnail:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.indigo-ink}"
    rounded: "{rounded.control}"
    height: "176px"
    padding: "8px"
  select:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.indigo-ink}"
    rounded: "{rounded.control}"
    height: "46px"
    padding: "0 10px"
  search-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.indigo-ink}"
    rounded: "{rounded.control}"
    height: "46px"
  segmented-control:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 12px"
  segmented-control-active:
    backgroundColor: "{colors.violet-wash}"
    textColor: "{colors.indigo-ink}"
  severity-toggle:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 12px"
  severity-toggle-checked:
    backgroundColor: "{colors.violet-wash}"
    textColor: "{colors.indigo-ink}"
  selection-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.indigo-ink}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "6px 10px"
  note:
    backgroundColor: "{colors.paper-sunk}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
  map-control:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.indigo-ink}"
    rounded: "{rounded.control}"
    size: "44px"
---

# Design System: Seattle Collision Dashboard

## Overview

**Creative North Star: "Ink on Cool Paper"**

The dashboard reads like a quiet instrument studio for Seattle's collision record: Suimen's frame carrying SeatTime's voice. Cool paper and indigo-navy ink set the ground; a thin rail of instruments frames every view; the collision field draws itself as ink contours computed from the release's KDE grid. The reader starts at the Overview, a two-tone headline beside the ink field and a column of readouts, and steps into the same map and charts in Neighborhood Explorer and Citywide Analysis.

**Surfaces and modes.** The Overview at `/` is a reading surface: generous measure, one headline, one drawing, four readouts, three observation cards. Neighborhood Explorer and Citywide Analysis are working surfaces: dense, with stable control positions, joined map-and-readout cards and hairline structure.

**Material.** Paper, ink and hairlines. Cards are white sheets on cool paper with a whisper of neutral shadow; everything else separates by 1 px rules. The indigo-night dark theme keeps the same structure with lighter ink on deep navy. Nothing is glass.

**Imagery.** The data is the imagery: the ink-flow, the choropleth and the trend chart. The photographs are atmosphere, not content (below). Icons are thin 1.5 px line drawings in circles; the brand is an ink-drop mark (a filled drop over two contour strokes inside a ring).

**Motion grammar.** One ease-out register (`cubic-bezier(.23, 1, .32, 1)`), no bounce or overshoot. Tokens: `--dur-press` 150 ms, `--dur-route` 220 ms, `--dur-enter` 700 ms, `--dur-fade` 150 ms, `--dur-crossfade` 1200 ms; shared `rise` and `fade` keyframes in `global.css`, applied with `[data-enter]` and `--delay`.
- **Overview entrance, once per page load.** The atmosphere fades in over 1200 ms. Headline lines, lede, actions and readouts rise 10 px (readouts 8 px) over 700 ms at 80, 150, 240, 310 and 380 + 50·i ms. The headline count ticks up from zero over 900 ms (quartic ease-out) while the `<h1>`'s `aria-label` carries the final figure. The ink starts drawing at 120 ms: 900 ms per level, staggered 35 ms, low rings first. Year changes remount the page without any of this; only the ink redraws, because its shape changes with the years.
- **Observation cards.** The cards reveal once, when 15% of the row is visible. Each rises 12 px and fades in over 600 ms, 70 ms after the one before. After the first entrance they appear without the reveal.
- **Route entry.** In-app navigation to any route rises 6 px over 220 ms. A hard load gets no route entry.
- **Controls.** Buttons press to 98% on `:active` (100 ms). Hover color and border shifts run 150 ms. Disclosure chevrons rotate 90° in 150 ms. Picker results enter from 4 px above over 160 ms. The map flies to a selection.
- **Atmosphere photos.** Each photo holds for 5 s, then the next eases in over 1200 ms on top of it; the outgoing photo stays at full opacity until it is covered, so paper never shows through mid-change. The app fetches and decodes the next photo halfway through the hold, and the switch waits for it. Auto-advance stops while the tab is hidden and when the viewer pauses it; the pause/play button and six dots sit at the bottom right of the ink figure.
- **Reduced motion.** The atmosphere photos start paused (play still works, with 150 ms fades). Every entrance becomes a 150 ms opacity fade with no movement; the count shows its final value; the ink appears finished; press transforms, map flights and the loader spin stop.
- **Planned, not shipped.** Year playback (a scrubber that steps the whole surface year by year), chart morphs between grains and ranges, and the ⌘K Ask drawer. Charts animate nothing today (`isAnimationActive` is off).
- **Always.** Animate transform, opacity and stroke offset only (color on hover). Nothing loops except the atmosphere photos, which have a pause control. No parallax or scroll-jacking; the only scroll-triggered motion is the Overview's one-shot card reveal.

**Atmosphere.** The Overview hero sits on an `aria-hidden` backdrop behind the content: six blurred Seattle traffic photographs in rotation, and an 8-level copy of the ink field in violet at 22% opacity, blurred 8 px. In light the photos are inverted, tinted indigo and multiplied at 45%, so the light trails read as faint ink. In dark they are tinted and screened at 50%, so the city glows. A mask keeps the copy column and readouts on bare paper, with worst-case text contrast at 4.60:1 across all six. Below 760 px it fades top to bottom behind the ink figure. Each asset is a 960 × 540 grayscale WebP in `frontend/src/assets/atmosphere/` (about 130 KB for all six), tone-matched to the first so no photo dominates; only the first loads with the page. Photos, all Unsplash License: I-5 at blue hour, Chad Peltola (unsplash.com/photos/_AwXMMw-qOI); I-5 express lanes, Josh Hild (jnKmU80sa0I); I-5 below the skyline, Casey Horner (UNUZ5JdrDBw); downtown at night, Jesse Collins (CKD2uFQOPWc); Fourth Avenue from above, Josh Hild (jXCU5vkbTCI); rainy crosswalk, Josh Hild (sDQHl4AeDzM). Explorer and Citywide have no atmosphere, so nothing sits behind their maps, charts and controls.

**Signature: the ink-flow.** The selected years redraw the collision field everywhere it appears (Overview hero, rail thumbnail, citywide density layer), because every instance is computed from the same release KDE for those years.

**Key Characteristics:**
- Cool paper ground with indigo-navy ink; an indigo-night dark theme that follows the system setting.
- One six-step yellow-to-brick ramp, the only warm color, and it only ever means burden.
- Violet for selection, focus, links and the second headline line.
- Collision density drawn as indigo contour lines, never as a heat blob.
- Jost Light headings; Libre Franklin for everything a reader operates or compares, with tabular numerals.
- Tracked caps for readout labels only.
- Hairlines, soft cards, an outline secondary button, a solid ink primary button and one dark featured card per row.

## Colors

Two inks on cool paper, one violet, and one warm ramp that carries meaning. Both themes passed the dataviz palette validator: each ramp falls monotonically in lightness with adjacent steps at least 0.06 apart in OKLCH, and the violet never matches a ramp step.

### Primary
- **Severity Ramp, paper** (Straw → Amber → Marigold → Vermilion → Rust → Brick): choropleth fills, the rail's ramp widget, the citywide heatmap circles (Amber below the high threshold, Rust above), and the burden line in the trend chart (Rust). Steps are assigned by `sqrtRampStep`, square-root spaced against the current maximum. Unchanged from the previous system on paper.
- **Severity Ramp, night** (the `night-ramp-*` steps): the same yellow-to-red order retuned for indigo night. Lightness rises with burden so the highest burden is the most salient on dark; the lowest step clears the night ground at 2.4:1.

### Secondary
- **Violet** (paper) / **Night Violet**: selection outlines on the map, focus rings, links, the text caret, the year slider's range and thumbs, the second line of the Overview headline, the downtown series and the "after" centroid. 5.9:1 on paper, 8.5:1 on night.
- **Violet Wash** / **Night Violet Wash**: active segmented controls and tabs, checked severity toggles, highlighted picker rows, text selection, and the night theme's featured card.

### Neutral
- **Cool Paper** / **Indigo Night**: the page ground, the rail, the header and the basemap's land.
- **Paper Sunk** / **Night Sunk**: notes and warnings, the inspector's primary-burden band, nav hover, and parks on the basemap.
- **Surface** / **Night Surface**: cards, panels, the inspector, inputs, the flow thumbnail and map controls. Map legends and hints sit on the same tone at 94% opacity.
- **Indigo Ink** / **Night Ink**: headings, figures, the ink contours, the primary button and the featured card (15.5:1 on paper).
- **Ink 2**: secondary text, ledes and axis labels (7.9:1).
- **Ink 3**: readout labels, tertiary text, the collisions series in the trend chart, basemap place labels (5.1:1).
- **Rule**: hairlines, gridlines, card borders, water and minor roads on the basemap.
- **Rule Strong**: control borders, nav icon rings, the slider track, the partial-period hatch and major roads.

### Named Rules
**The Ramp Means Burden Rule.** The yellow-to-brick ramp is the only warm color in the system and encodes severity or burden and nothing else: never brand, decoration, hover, alert or a categorical series. Collision counts are Ink 3; density is Indigo Ink.

**The Two Inks Rule.** Every color in the interface and on the map is read from the CSS tokens, including MapLibre paint and SVG strokes, so a theme change repaints the same layers in place. No hard-coded hues in components.

**The Never Color Alone Rule.** Partial years show as hollow, labeled points and hatched bands with a text note; active controls add an underline or a check icon to the violet wash; selection draws a violet outline over a paper casing. The palest paper ramp step sits near 1.5:1 against paper, a documented deviation offset by paper-colored polygon edges.

## Typography

**Display Font:** Jost (variable weight, self-hosted through `@fontsource-variable`, Avenir Next fallback)
**UI and Numerals Font:** Libre Franklin (variable weight, self-hosted, system-ui fallback)

**Character.** A light geometric-humanist sans for headings gives the studio its calm, open voice; Franklin carries controls, tables and every number with tabular figures. First-view fonts total 56 KB (both weight-axis Latin files).

### Hierarchy
- **Display** (Jost 300, clamp(2.75rem, 3.9vw, 4.25rem), 1.05, balanced): the Overview's two-tone headline only. First line in ink, second line in violet.
- **Headline** (Jost 300, 2.5rem, 1.1): route titles. 1.75rem on phones. The inspector's neighborhood name uses the same voice at 2.125rem (1.5rem below 960 px).
- **Title** (Jost 300, 1.75rem, 1.2): section headings ("What the record shows", the trend card).
- **Numeral Hero** (Franklin 600, 2.5rem, tabular): the inspector's severity burden. Observation and shift figures use the same voice at 2rem and 2.25rem.
- **Numeral** (Franklin 600, 1.625rem, tabular): metric grid values; 1.375rem in the compact grid.
- **Readout Value** (Franklin 400, 1.625rem, 1.1, tabular): the Overview's readout column; lighter than metric numerals because it sits beside the display headline.
- **Body** (Franklin 400, 0.9375rem, tabular throughout): explanatory text. Ledes run at 1rem/1.6 capped at 46ch; descriptive lines at 0.875rem/1.5.
- **Label** (Franklin 500, 0.875rem): nav items, buttons (0.9375rem), tabs, control labels (0.8125rem), disclosure summaries.
- **Readout Label** (Franklin 500, 0.6875rem, 0.12em tracking, uppercase, Ink 3): the label above a figure (readouts, metric cells, observation cards, rail widgets). Tracking drops to 0.06em on phones in the metric grid.
- **Caption** (Franklin 400–500, 0.75rem, 1.4): legends, map hints, widget notes, attribution.

### Named Rules
**The Readout Caps Rule.** Tracked caps belong to readout labels only: the short name that sits directly above a figure. Never on headings, buttons, nav, kickers or body text.

**The Numbers Are Franklin Rule.** Every figure a reader might compare is set in tabular Libre Franklin, including figures inside the Jost headline. The body sets `tabular-nums` globally.

**The Light Heading Rule.** Headings are Jost at weight 300. Hierarchy comes from size and the ink/violet split, never from bolding the display face.

## Layout

**Shell.** A 232 px rail spans the full height on the left; an 84 px header carries the theme select and year slider on the right. The rail holds the brand, the circled icon nav (Overview, Neighborhoods, Citywide), and three widgets separated by hairlines: Current flow (ink thumbnail), Data as of (with partial-year note), and Severity ramp. Below 1200 px the rail collapses to an 84 px icon column and the widgets hide. Below 900 px the rail gives way to a header with the brand mark and text links.

**Overview.** A three-column hero (7fr copy, 5fr ink-flow, 200 px readout column divided by a hairline) fills the first viewport, with a 32 px gap and 24/32 px page padding. Observation cards follow in a row of three. Below 1200 px the readouts move under the hero in a four-up row; below 760 px everything stacks, the ink field drops to 420 px tall and readouts run two-up.

**Working views.** Explorer joins its map panel and a 350 px inspector into one card (the map takes the left radius, the inspector the right); the trend card follows 24 px below. Citywide joins its map and a 220 px readout column the same way, then a card row of 1fr and 2fr with the featured card first. Below 960 px joined cards split and stack, and Explorer's inspector moves above the map.

**Rhythm.** Spacing runs 6, 8, 12, 16, 20, 24 and 32 px: 6–8 px inside control groups, 12–20 px inside cards, 16 px between cards in a row, 24 px between sections. Pages pad 24 px (16 px on phones).

**Responsive.** Breakpoints at 1200, 1100, 960, 900, 760, 700, 600 and 540 px. Every touch target is at least 44 px, including map zoom buttons and slider thumbs.

**The Keyboard Twin Rule.** Every map interaction has a keyboard path: the neighborhood search twins map selection, the chart's data table mirrors the chart, the KDE legend and the ink-flow carry text descriptions.

**The Stable Controls Rule.** Year, selection, metric and grain controls hold their positions across states; data loads replace content, never move controls.

## Elevation & Depth

Depth is a white sheet on cool paper. On paper, resting cards carry a faint two-layer neutral shadow; floating layers (picker popup, chart tooltip, map controls, legends and hints) take a deeper one. On indigo night, resting shadows disappear and surfaces separate by tone; only floating layers keep a black shadow.

### Shadow Vocabulary
- **Rest** (`0 1px 2px rgb(0 0 0 / .04), 0 2px 8px rgb(0 0 0 / .04)`; none on night): observation cards, citywide analysis cards, the inspector, the trend card.
- **Float** (`0 4px 12px rgb(0 0 0 / .07), 0 12px 32px rgb(0 0 0 / .08)`; `0 8px 24px rgb(0 0 0 / .5)` on night): the picker results popup, chart tooltips and everything over the map.

### Named Rules
**The Lift Is Earned Rule.** Only surfaces that float over others take Float. Hairlines do the separating everywhere else; never stack shadows for emphasis.

## Shapes

Gently rounded on a two-step scale: 6 px for controls, buttons, chips, notes, list rows, map controls and the flow thumbnail; 12 px for cards, panels, the map frame and the picker popup. Circles mark points and instruments: nav icon rings (36 px), slider thumbs (16 px with a 2 px violet ring), centroid markers, the brand mark's ring. Rules are 1 px hairlines; map polygon edges are 0.8 px in the paper tone. Ink contours use round joins and non-scaling strokes.

## Components

### Ink-flow (signature)
*Collision density drawn as ink.*
- **Engine:** the release KDE grid is upsampled 4×, smoothed with a separable Gaussian pass, and traced with `d3-contour` into 20 levels. The lowest ring starts at 7% of the peak so halos never spill onto water. A full trace computes in about 7 ms median.
- **Stroke:** width and opacity rise with level (`0.35 + 1.4·f^1.6`, opacity `0.18 + 0.72·f`), all in Indigo Ink through `currentColor`; the top level is filled at 90% as the ink drop.
- **Instances:** the Overview hero (20 levels, weight 1.1, draws in), the rail's Current flow thumbnail (14 levels, weight 0.45, static, links to the citywide density layer), and the Citywide KDE map layer (MapLibre lines, top level filled at 85%).
- **Accessibility:** the hero SVG is a labeled image describing the years and what darkness means; the thumbnail is a labeled link.

### Navigation rail
- **Items:** 48 px rows, a 36 px circled line icon beside a 0.875rem label in Ink 2. Hover: Paper Sunk background, ink label.
- **Active:** the circle fills with ink and the icon turns paper; the label turns ink. Fill, not color alone.
- **Widgets:** a readout label, a value (Franklin 600, 1rem) and a caption note, separated by hairlines. The ramp widget shows six 12 px chips with a faint inset outline between "Lower burden" and "Higher".
- **Mobile:** brand mark in violet plus text links; the active link takes violet text and a 2 px violet underline.

### Buttons
- **Shape:** control radius (6 px), 48 px tall, 0 20px, Franklin 500 at 0.9375rem.
- **Primary:** solid Indigo Ink with paper text and a trailing arrow; hover mixes 14% violet into the ink.
- **Secondary:** transparent with a Rule Strong outline and ink text; hover darkens the outline to ink.
- **Press:** 98% scale on `:active`, removed under reduced motion. Focus: 2 px violet ring, 3 px offset.

### Cards
- **Observation card:** Surface, 1 px Rule border, card radius, 24 px padding, Rest shadow. A readout label, a 2rem figure, a 0.875rem body line in Ink 2, and an arrow; the whole card is a link. Hover darkens the border to Rule Strong.
- **Featured card:** one per row, first. On paper it inverts to an Indigo Ink sheet with paper text; on night it becomes Night Violet Wash with a violet border.
- **Analysis card (Citywide):** same sheet at 20 px padding with a sentence-case label, a 2.25rem figure and a small series legend.

### Readouts and Metric Grid
- **Overview readouts:** a hairline-divided column of four figures (severity burden, injuries, serious injuries, fatalities) under readout labels, with a partial-year caption.
- **Metric grid:** a two-column (four in compact) hairline grid; cells 84 px tall (72 px compact), readout label above a Numeral.

### Inputs, Selects and Chips
- **Search field and selects:** Surface, Rule Strong border, control radius, 46 px tall. The search field's border and a 1 px outline turn violet on focus.
- **Selection chips:** Surface, Rule Strong border, 44 px, with a close icon; they wrap below the search.
- **Severity toggles:** outlined 44 px chips; checked adds a violet border, Violet Wash and a check icon.
- **Segmented controls and tabs:** one bordered group split by hairlines, 44–48 px; active takes Violet Wash, ink text and a 6 px-offset underline.
- **Year slider:** a 2 px Rule Strong track with a violet range and two 44 px hit-area thumbs; a partial end year draws its thumb ring dashed.

### Junction breakdown
- **Shape:** a full-width analysis card, "Where collisions happen", holding a real `<table>`: junction type, an Ink 3 count bar with count and share, and mean severity. Rows keep a fixed registry order so they stay still as filters change; Unknown is last.
- **Color:** count bars are Ink 3 because they are counts. Mean severity is a Rust (`--ramp-5`) bar with a tabular numeral, the same burden color as the trend chart, scaled to the largest named category. Other and Unknown rows take an Ink 2 label, a hatched Rule Strong count bar and a numeral without a severity bar.
- **Phones:** below 480 px the count bars drop and the share stacks under the count; the severity bars stay.
- **Low n:** mean severity shows "—" below 30 collisions, so a category with fewer than 30 collisions never gets a bar. No animation on filter change.

### Map Frame
- **Engine:** MapLibre GL with OpenFreeMap vector tiles. The basemap is five token-painted layers: paper land, sunk parks, rule water, rule minor roads from zoom 12, rule-strong major roads at 55%, and Ink 3 place labels with a paper halo.
- **Choropleth (Explorer):** ramp fill at 78% under the labels, 0.8 px paper edges; selection is a 3 px violet line over a 6 px paper casing.
- **Citywide layers:** ink KDE contours or ramp-colored heat circles, a dashed Ink 2 downtown boundary, and a dashed violet shift path between Ink 3 and violet centroids.
- **Overlays:** 44 px zoom buttons, Reset map, legend and hint on Surface (94% for legend and hint) with control radius and Float.
- **Fallback:** without WebGL, a sunk note points to neighborhood search.

### Trend Chart
- **Series:** collisions as an Ink 3 area at 12% fill; burden as a 2 px Rust line; Rule gridlines; Ink 2 axes.
- **Partial year:** the annual line stops at the last complete year and continues dashed to a hollow 4 px point labeled with its coverage (for example "Jan–Aug"). Partial months and provisional weeks take a 45° Rule Strong hatch band; a single partial period takes a dashed reference line. A caption below names the coverage.
- **Tooltip:** Surface, Rule Strong border, control radius, Float.
- **Accessible table:** a disclosure below the chart that always matches its values and filters.

### Notes, States and Disclosures
- **Notes:** Paper Sunk, Ink 2 text, control radius (full-bleed inside the inspector). No alert hues; the text names the exclusion.
- **Loading and error states:** a Surface card with a 28 px ring loader (violet head on Rule Strong) or an alert icon and an outlined retry button.
- **Disclosures:** a 12 px Ink 3 chevron that rotates 90° when open.

## Do's and Don'ts

### Do:
- **Do** read every color from the CSS tokens, including MapLibre paint and SVG ink, after the theme attribute settles.
- **Do** compute every ink-flow from the release KDE for the selected years, so the hero, the thumbnail and the citywide layer always agree.
- **Do** assign choropleth steps with `sqrtRampStep` and derive legend floors from `sqrtRampStepFloor`, which shares its integer arithmetic.
- **Do** mark partial years with a hollow labeled point, a hatch or dashed segment and a caption, everywhere they appear.
- **Do** generate observation cards by rule from the pinned release and phrase them as observations, never causes.
- **Do** keep one featured card per row, first, and keep the rest as white sheets.
- **Do** keep the accessible table, the keyboard twin and reduced-motion behavior working for every new interaction.

### Don't:
- **Don't** use the ramp for anything but severity and burden, and don't introduce any other warm color.
- **Don't** draw density as a heat blob or gradient; density is indigo contour lines.
- **Don't** set tracked caps anywhere but readout labels, and don't put kickers or eyebrows above headings.
- **Don't** bold Jost headings or swap in a serif display face.
- **Don't** add glows, glass or gradient fills to components, parallax or scroll-jacking. Photography stays in the Overview atmosphere, and the only scroll-triggered motion is its one-shot card reveal.
- **Don't** let motion bounce or overshoot; every looping or auto-advancing motion (the atmosphere photos, future year playback) needs a pause control.
- **Don't** show model predictions, risk rates or causal claims in observations, tooltips or future Ask answers.
- **Don't** document or build year playback, chart morphs or the ⌘K drawer as shipped; they are planned.
