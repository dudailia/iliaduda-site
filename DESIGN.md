---
name: Ilia Duda — working papers
description: A finance student's résumé set as a working paper whose figures are alive.
colors:
  ink: "#16181c"
  paper: "#faf9f7"
  graphite: "#5b6068"
  rule: "#dedcd7"
  indigo: "#2f3a8c"
  indigo-wash: "#e4e6f2"
  ink-night: "#e9e6df"
  paper-night: "#111316"
  graphite-night: "#9ea3ab"
  rule-night: "#2b2e34"
  indigo-night: "#a3adf5"
  indigo-wash-night: "#262b4c"
typography:
  display:
    fontFamily: "Source Serif 4, Georgia, Times New Roman, serif"
    fontSize: "3.5rem"
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Source Serif 4, Georgia, Times New Roman, serif"
    fontSize: "2.75rem"
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: "-0.015em"
  headline-small:
    fontFamily: "Source Serif 4, Georgia, Times New Roman, serif"
    fontSize: "1.9375rem"
    fontWeight: 600
    lineHeight: 1.22
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Source Serif 4, Georgia, Times New Roman, serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Source Serif 4, Georgia, Times New Roman, serif"
    fontSize: "1.1875rem"
    fontWeight: 400
    lineHeight: 1.62
    fontFeature: "onum, pnum"
  body-small:
    fontFamily: "Source Serif 4, Georgia, Times New Roman, serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6
  note:
    fontFamily: "Source Serif 4, Georgia, Times New Roman, serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Source Code Pro, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "lnum, tnum"
rounded:
  focus: "1px"
  sm: "4px"
  full: "9999px"
spacing:
  measure: "44.375rem"
  rail: "15rem"
  gutter: "2.5rem"
  page-x: "1.5rem"
  page-x-wide: "2rem"
components:
  figure-control:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
  figure-control-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
  text-link:
    textColor: "{colors.ink}"
  rail-heading:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
  meta-line:
    textColor: "{colors.graphite}"
    typography: "{typography.label}"
  figure-caption:
    textColor: "{colors.graphite}"
    typography: "{typography.note}"
  running-head:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
---

# Design System: Ilia Duda — working papers

## Overview

**Creative North Star: "A working paper whose figures are alive"**

The site is set as a short journal issue. A masthead carries the front matter, Contents lists five papers, and each paper is a few hundred words of argument around one figure. You can turn, scrub, drag or re-run the figure, and every number in it traces back to a file. The reader is a recruiter at a quantitative, trading or investment firm who gives the first screen thirty seconds, then forwards the link to someone who checks the claims. So the register is the one both of them already trust: the academic paper. It uses serif text, a margin, numbered figures and captions that state what the figure shows.

Density is literary rather than dashboard-like. There is one text column at a fixed measure, a margin to its left that holds headings, figure numbers and readouts, and generous vertical space between sections. Everything is typographic: no cards, no icons, no photographs except one small portrait in the margin of /about. Colour is almost absent, which is what lets the one accent mean something.

It is calm everywhere except once. The home page's implied-volatility surface gets a single orchestrated entrance. Two figures replay once when first seen (the cricket match and the CloseBooks batch). Everything else changes state only in direct response to the reader.

**Key Characteristics:**
- One serif family for all prose and headings, one mono for labels, data and measurement. No third face, no display weight.
- An asymmetric grid: a 15rem rail to the left of a 710px text column; below 64rem the rail folds inline.
- Six colour roles in two themes, following the system setting with no toggle.
- Indigo appears only inside figures, and there it marks the claimed value.
- Figures are real and interactive, labelled "Fig. N", captioned in graphite, and every figure has a prose description and a screen-reader table.
- Print is a first-class medium: every page prints as a document, and /cv prints to exactly one sheet.

## Colors

The palette is near-monochrome and warm: an off-white page, near-black ink, one grey for secondary text and one for hairlines, plus a deep indigo that belongs to the figures. The night set uses the same six role names, redeclared under `prefers-color-scheme: dark`. Print forces the day set with a pure white page.

### Primary
- **Measurement Indigo** (`indigo`; `indigo-night` at night): the value a figure is claiming, such as the chosen day's yield curve, the calibrated probability, the bar being measured or a slider's filled track. It never appears on a heading, a link, a button or body text.
- **Context Wash** (`indigo-wash`; `indigo-wash-night`): the quantity a claim is measured against, such as a baseline bar or the faint full match behind a replay. It is also the text-selection colour.

### Neutral
- **Warm Paper** (`paper`; `paper-night`): the page, the fill behind labels placed over a plot, and the halo behind value labels in a figure.
- **Ink** (`ink`; `ink-night`): body text, headings, rail headings, link text, focus rings, thresholds and reference lines in figures (key rate, g = 0, the 1% bar), and selected figure controls.
- **Graphite** (`graphite`; `graphite-night`): meta lines, captions, figure subtitles, readout labels, axis ticks and the quieter half of an organisation name.
- **Hairline** (`rule`; `rule-night`): section rules, link underlines at rest, gridlines, and every context curve in a figure.

### Named Rules
**The Indigo Is Evidence Rule.** Indigo appears only inside a `<figure>` and only on the measured value. If you are reaching for indigo to make a link, heading or button stand out, the answer is ink.

**The Two Themes, Six Names Rule.** A new colour is a new role in both themes, and it is added to `tests/contrast.test.ts`, which checks WCAG ratios for both sets from the tokens themselves.

## Typography

**Display, headline and body font:** Source Serif 4, variable, self-hosted (fallbacks Georgia, Times New Roman, metric-adjusted).
**Label font:** Source Code Pro, variable, self-hosted (fallbacks ui-monospace, SFMono-Regular, Menlo, metric-adjusted).

**Character:** A book serif with optical sizing, paired with a quiet mono. The mono is never decoration. It is used only where the text is data, a measurement, a date, a role or a label, which is what a paper's apparatus is.

### Hierarchy
- **Display** (600, 3.5rem, 1.04): the masthead name, once, on the home page.
- **Headline** (600, 2.75rem, 1.12): a paper's title (h1). On narrow screens it drops to headline-small.
- **Headline small** (600, 1.9375rem, 1.22): page titles on narrow screens and the 404.
- **Title** (600, 1.5rem, 1.3): Contents entries.
- **Body** (400, 1.1875rem, 1.62; body-small 1.0625rem, 1.6 below 48rem): prose, at a measure of 44.375rem (68 characters of Source Serif at 19px). Old-style proportional figures in running text.
- **Note** (400, 0.9375rem, 1.5): captions, abstracts, margin notes and contact rows.
- **Label** (400 mono, 0.8125rem, 1.45): rail headings, meta lines (role · place · dates), figure subtitles, readouts and axis ticks. Lining tabular figures.

### Named Rules
**The Measure Is Not in ch Rule.** The measure is in rem (44.375rem), never `ch`. A `ch` measure changes the moment the webfont swaps in, and it once reflowed the whole page for 0.035 CLS on the deployment.

**The Whole Item Rule.** A meta line wraps between items, never inside one. "January 2026 – present" is never split across lines, and no line starts with a "·" (`Items` in `components/Layout.tsx`).

**The Mono Means Data Rule.** Mono is for labels, numbers, dates and code. Prose in mono, or mono to look "technical", is out.

## Layout

The page is a single centred frame, max-width = rail + gutter + measure. It has 1.5rem side padding (2rem from 40rem), and none in print. At 64rem and above, every block is a two-column row: a right-aligned rail of 15rem, a 2.5rem gutter, and the text column. The rail holds section headings, figure numbers ("Fig. 1") and a figure's live readouts, which stick to the top as the figure scrolls. Below 64rem the rail content moves above its block in mono, and readouts move below the figure.

Margin notes are in flow, not absolutely positioned. The note column is pulled left into the rail, so the paragraph keeps its full measure and a long note can never print over the next block. Figures that sit inside an entry rather than a paper (the OFZ curve on /about) keep the narrow arrangement at every width, but their "Fig. N" still hangs in the rail.

Vertical rhythm: sections are 2.5rem apart (3.5rem at lg), figures 3rem (4rem at lg), and the footer 6rem (8rem at lg) below the content. There is more space above a heading than below it. The CV (/cv) is its own grid in em units: a 5.6em rail and the sheet at Letter proportions, so the screen preview is the printed page at scale.

## Elevation & Depth

Flat. There are no shadows anywhere. Depth comes from hairlines (1px `rule`), the rail's offset from the text, and tone: labels over a plot sit on a paper-coloured fill, and value labels in a figure carry a 4px paper halo (`paint-order: stroke`) so they read over a band or a threshold line. The only three-dimensional object is the WebGL implied-volatility surface, and its depth is geometry, not effect.

### Named Rules
**The Hairline Is the Only Edge Rule.** Separation is a 1px rule or white space. No shadow, no card, no raised surface. When two ruled blocks meet, one rule is enough.

## Shapes

Square and ruled. Text blocks have no containers at all. The one rounded shape is the figure control: small buttons with 4px corners (`rounded.sm`). Data points and bond markers are true circles (7–10px, drawn in HTML so they stay round when a plot stretches). The portrait on /about is a plain rectangle with a hairline border at 4:5.

## Components

### Buttons (figure controls)
*Quiet instruments, not calls to action.*
- **Shape:** gently squared (4px), 1px border.
- **Default:** mono label size, ink text on paper, graphite border, 32–36px tall for touch.
- **Selected:** ink fill, paper text: the state of a radio group ("Both fixed") or the chosen debt amount.
- **Hover / Focus / Active:** the border goes to ink over 150ms ease-out. Focus is the global ring (2px ink outline, 3px offset). Active scales to 0.97 on the settlement controls only.

### Links
- **Style:** inherit the text colour, with a 1px underline in `rule` at 0.22em offset that goes to ink on hover (hover-capable pointers only), over 120ms.
- **Never** indigo, never an arrow glyph. Tap targets gain vertical padding without moving the glyphs.

### Navigation
- **Masthead (home):** name at display size, positioning line, then a definition list (Seeking / Roles / Location / Contact) whose labels hang in the rail. The CV (PDF), email, LinkedIn and GitHub are above the fold at 390×844.
- **Running head (every other page):** name, "Co-op from January 2027", Contents, CV (PDF) and Email, in label type over a hairline. It has its own view-transition name, so it holds still while pages change.
- **Footer:** ends on the ask (availability and contact), then Papers, Pages and a graphite colophon.

### Figures (signature component)
- **Frame** (`FigureFrame`): the number in the rail; a title in note ink over a graphite mono subtitle and a hairline; the plot; readouts (rail on wide screens, a grid below on narrow ones); a mono hint line; a graphite caption; and an sr-only table.
- **Marks:** context in `rule`, claim in indigo, thresholds in ink (dashed where they are references), the previous state as a dashed indigo ghost, and axes as HTML labels in graphite mono.
- **Interaction:** native range inputs (accent indigo, 24px hit height), radio groups with roving tabindex, and keyboard parity everywhere. Values are announced through `aria-valuetext`. A live region speaks only for changes the reader did not make on the control itself.
- **Motion:** nothing moves unless the reader acts, with three exceptions, each once. The hero entrance is a 240ms crossfade and a 900ms tilt at cubic-bezier(0.77, 0, 0.175, 1). The cricket replay is linear over 4.2s. The CloseBooks batch staggers rows 45ms apart and settles each over 240ms ease-out. A figure entered through the Contents morph skips its replay. Reduced motion: everything is static and there is no canvas.

### Contents entry
- A typeset list separated by hairlines, not cards: title (title type), mono byline, note-size abstract, and a 9rem miniature of the paper's Fig. 1. The thumbnail morphs into the paper's figure through a cross-document view transition (380ms, same curve); the page underneath crossfades in 180ms.

### CV sheet
- The résumé as one sheet: name, availability, a contact line, then Education, Experience, Research and Skills with mono headings in a narrow rail and dates right-aligned in mono. Bullets are hairline dashes drawn in flow, so the PDF's text layer stays in reading order. The build prints it to Letter and A4 and fails if it runs past one page.

## Do's and Don'ts

### Do:
- **Do** put every number through `content/facts.ts` with its source, and label synthetic data "synthetic" on the figure that draws it.
- **Do** hang headings, figure numbers and readouts in the 15rem rail, right-aligned, in label type.
- **Do** keep the text column at 44.375rem and let figures narrower than it stay narrower (quiet diagrams are authored at 336px).
- **Do** give every figure a prose `<desc>` with the real values, an sr-only table, and keyboard control of anything a pointer can do.
- **Do** check both themes and print: tokens for night, the light set for paper.

### Don't:
- **Don't** use indigo outside a figure, or for anything in a figure except the claimed value.
- **Don't** add cards, shadows, icons, emoji, gradients, badges or a hero-metric block. This is a paper.
- **Don't** put a label above a heading. The byline goes under the title.
- **Don't** add motion that plays by itself beyond the three existing moments, and never without a reduced-motion path.
- **Don't** position anything absolutely inside the CV sheet. Chromium writes the PDF text layer in paint order, and positioned boxes paint last.
- **Don't** load anything from another origin: no CDN, fonts, analytics or scripts.
