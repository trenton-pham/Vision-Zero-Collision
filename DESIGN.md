---
name: Seattle Collision Dashboard
description: An evidence graphic you can step inside. A data-desk story about Seattle's collisions that hands the reader the same map and chart to explore.
---

<!-- SEED: established with the user before implementation; re-run /impeccable document once there's code to capture the actual tokens and components. -->

# Design System: Seattle Collision Dashboard

## Overview

The dashboard should read like a newspaper data desk explaining Seattle's collisions, then let the reader handle the evidence directly. The craft bar is set by the NYT Upshot, The Pudding, Reuters Graphics and the Financial Times' annotation style. We match their discipline (one idea per graphic, annotations that point at data, color that encodes meaning), not their layouts or code.

This direction replaces the previous look outright: a dark, square-cornered, monochrome-blue panel console. Do not carry its zero radius, blue palette or gray inverted map tiles into new work.

**Surfaces and modes.** The citywide story page is a reading surface. Neighborhood Explorer and Citywide Analysis are working surfaces. The planned ⌘K Ask drawer shares the same world. Reading surfaces get generous measure and editorial pacing. Working surfaces get density, stable positions and patterns readers already know.

**Material.** Warm paper and warm ink. Surfaces lift off the paper with soft, warm shadows, and annotations attach to data with hairline leader lines. Nothing glows, and nothing is glass.

**Imagery.** The data is the imagery: the map, the trend and the ranks. Do not use stock photography, illustration or decorative icons.

**Motion grammar.** Motion explains change. Use one expressive register, ease-out, with no bounce and no overshoot:

- **Charts morph** between grains, selections and year ranges. Lines and areas interpolate rather than redraw.
- **The headline count** counts up once on load, in 1000 ms or less, and afterwards rolls only the digits that change.
- **Map state changes** crossfade.
- **Hover and press** answer every control within 150 ms.
- **Animate transform, opacity and color only.** Never animate width, height or layout.
- **No scroll-triggered reveals,** no parallax and no scroll-jacking.
- **Reduced motion:** every transition becomes an instant swap and nothing stays hidden. Playback still steps year by year, without the crossfade.

**Signature: year playback.** A scrubber with a play/pause control drives the whole surface. The choropleth crossfades year by year, the trend chart's cursor travels with it, and the headline count follows. It is user-started, always pausable, and fully operable by keyboard (arrow keys step a year, Space plays or pauses). This is the page's one memorable moment; nothing else competes with it.

**Signature: ⌘K.** One command bar jumps to a neighborhood, a year range or a view. It opens as a right-hand drawer on desktop and a full-height sheet on mobile. It is also the future entry point for natural-language questions, whose answers carry an "Apply to dashboard" action that sets the URL state.

## Colors

The color strategy is **restrained, with one meaningful ramp.** The neutrals are tinted from paper and ink. A single sequential yellow→red ramp is the only saturated color, and it is reserved for severity and burden. A muted slate accent handles interaction. Exact values are `[to be resolved during implementation]`. Validate them with the dataviz palette validator for color-vision-deficiency separation, and for contrast on both paper and ink.

### Primary
- **Severity Ramp** (`[to be resolved during implementation]`): 5 to 7 sequential steps, from pale straw through amber and vermilion to deep brick, perceptually ordered with lightness falling monotonically. It colors choropleth fills, heat layers, burden lines and rank bars. The lowest step must stay visibly distinct from the paper ground; for that reason the ground cannot be cream or yellowed.

### Secondary
- **Slate Accent** (`[to be resolved during implementation]`): a desaturated blue-slate used for selection outlines, focus rings, links, the playback cursor and the active state of controls. It must never be confused with any step of the ramp.

### Neutral
- **Paper** (`[to be resolved during implementation]`): the light ground. Warm off-white leaning neutral, not cream or parchment.
- **Ink** (`[to be resolved during implementation]`): body text on paper, and the ground of the dark theme. A warm near-black, never pure #000.
- **Graphite tints** (`[to be resolved during implementation]`): secondary text, axes, gridlines and hairlines, stepped from ink toward paper.
- **Dark theme ("ink")**: the same roles inverted, with the ramp re-tuned so its steps stay ordered and legible on a dark ground. Paper is the default; ink follows the system preference, and the theme toggle remains.

### Named Rules
**The Ramp Means Burden Rule.** The yellow→red ramp encodes severity or burden and nothing else. It is never brand, decoration, a hover color or an alert.

**The Never Color Alone Rule.** Partial years and provisional weeks use hatching plus a text label. Selection uses an outline plus a weight change. No state relies on hue alone.

## Typography

**Display and annotation font:** Source Serif 4. **UI and numerals font:** Libre Franklin. Both are self-hosted through `@fontsource`. They replace Barlow Condensed and IBM Plex Sans.

**Character.** This is the newspaper-graphics pairing. The serif carries headlines, the story sentence and chart annotations, giving them an editorial voice. Franklin carries everything a reader operates or scans: controls, axis labels, legends, tables and every number.

### Hierarchy
- **Headline**: Source Serif 4 at a large optical size for the story sentence and page titles. Upright only, with no italic flourishes.
- **Annotation**: Source Serif 4 at text size, attached to data with a hairline leader.
- **Label**: Libre Franklin, medium weight, sentence case, for controls, legends and axis titles. Do not track it out or set it in all caps.
- **Numeral**: Libre Franklin with tabular figures (`font-variant-numeric: tabular-nums`) for every count, rate and table cell, so that counting digits and table columns never jitter.
- **Body**: Libre Franklin for explanatory text, at a 60 to 70 character measure on reading surfaces.

Exact sizes and steps are `[to be resolved during implementation]`.

### Named Rules
**The Numbers Are Franklin Rule.** Every figure a reader might compare is set in tabular Libre Franklin, including figures inside serif sentences.

## Layout

**Reading surface (story page).**
- On desktop, the first viewport splits 5/12 and 7/12. The left column holds the serif headline sentence with the live count, the year range and the partial-year note. The right holds a large choropleth with the playback control under it.
- The annotated trend chart begins at the fold.
- The page then moves through rank-and-compare and into the explorer.
- Pacing varies: a dense graphic earns a quiet passage of text after it.

**Working surfaces (explorer and citywide).**
- The map leads and the inspector sits beside it.
- Controls keep stable positions, so the year, selection and grain never jump between states.
- Rank-and-compare shows a selection against the city median.

**Responsive.**
- Mobile layouts are designed, not squeezed. On phones the inspector becomes a bottom sheet with peek, half and full detents.
- The playback scrubber is touch-draggable with 44 px targets.
- The ⌘K drawer becomes a full-height sheet.
- Fluid columns, with no fixed-pixel grid that collapses abruptly.

**The Keyboard Twin Rule.** Every map interaction (hover readout, click to select, playback) has a keyboard path and an accessible-table equivalent that stays in sync with what the map shows.

## Elevation & Depth

Depth is paper lifting off paper. On the light theme, raised surfaces (map frame, inspector, drawer, sheet) sit on soft, warm-tinted, low-spread shadows in two levels: resting and floating. On the ink theme, elevation comes from slightly lighter surfaces rather than shadow. Exact shadow values are `[to be resolved during implementation]`.

**The Lift Is Earned Rule.** Only surfaces that float over others (drawer, sheet, popover, hover readout) take the floating level. Static content cards stay at rest; never stack shadows for emphasis.

## Shapes

Shapes use gently rounded corners on a consistent scale. Controls are the tightest, cards and the map frame are medium, and sheets and the drawer are the softest. The map is clipped to its frame's radius. Hairline rules and leader lines are 1 px in a graphite tint. Exact radii are `[to be resolved during implementation]`.

## Do's and Don'ts

### Do:
- **Do** generate every annotation from the pinned release by rule (largest change, top-burden areas, partial-year notes) and phrase it as an observation, never a cause.
- **Do** hatch and label partial years and provisional periods everywhere they appear: the chart, the map legend and the tables.
- **Do** morph charts and crossfade the map so readers can see what changed.
- **Do** keep the accessible table, the keyboard path and reduced-motion behavior working for every new interaction.
- **Do** use MapLibre with a free vector basemap styled from the paper and ink tokens, kept quiet so the ramp reads first.

### Don't:
- **Don't** use the ramp's colors for anything but severity and burden.
- **Don't** use a cream or parchment ground, italic display serifs, tracked all-caps micro-labels or a terracotta accent. That combination is the generic editorial cliché, not this product.
- **Don't** add scroll-triggered fades, parallax, scroll-jacking, glows, glass or gradient fills.
- **Don't** let any motion bounce, overshoot or run longer than it explains. Every looping or auto-advancing motion needs a pause control.
- **Don't** show model predictions, risk rates or causal claims in annotations, tooltips or Ask answers.
- **Don't** carry forward the old look's zero radius, blue monochrome or CSS-filtered raster tiles.
