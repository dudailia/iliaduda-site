---
target: /order-book and /iv-surface after milestone M7 (the order book paper, and the IV paper's new Fig. 1)
total_score: 28
max_score: 40
na_heuristics: 0
p0_count: 0
p1_count: 4
target_identity: "route:/order-book + route:/iv-surface"
timestamp: 2026-09-27T19-07-31Z
slug: order-book-iv-surface
---
# Critique — /order-book and /iv-surface (M7), 2026-09-27

Method: dual-agent (A: design review at 390/768/1440 in both themes, 28/40 on Nielsen's ten heuristics, the low end
of "Good"; B: detector and browser pass). The per-heuristic scores stayed in the review session; this record keeps the
total and every finding, with what became of each.

## Trend
- 2026-09-24, home and case studies before the redesign: 20/36 (nine heuristics scored), 1 P0, 2 P1.
- 2026-09-27, /order-book and /iv-surface after M7: 28/40 (ten scored), 0 P0, 4 P1. As shares of the maximum,
  56% → 70%.

## Priority issues (all fixed before M7 closed)
- [P1] The order book's signature played below the fold on laptops (27% of the stage in view at 1440×900): it now
  waits for 60% of the stage, or 45% held 1.2 s, and the stage fits the first screen better.
- [P1] Fig. 2's margin contradicted its title (a share over all six kinds of order): it now reads the market
  orders' own share, against the model's, and the self-excited area carries the indigo.
- [P1] Keyboard focus was invisible on both live 3D figures (the canvas painted over an inset ring): a ring now sits
  over the stage.
- [P1] Hovering the terrain moved the page (CLS 0.046–0.075): the controls keep their own row, and every figure's
  live buttons now arrive in room kept for them (a later pass found the IV's jumped 54 px on phones; fixed).

## P2 and P3 (32 from A, 10 from B)
Every one fixed, or ruled with a reason, in .audit/m7/backlog.md (36 of A's and 10 of B's closed). The larger ones:
indigo now means one thing on the order book (the shares waiting; the price, the threshold, in ink); the IV surface has
a phone framing of its own (its calm surface on a 390 px phone 324 × 223 px, from 245 × 145), a reading tag at the
dot, and a smooth still frame; both still frames can be read by tap; the IV paper's Fig. 2 holds a fixed scale.

## Detector
`impeccable detect --json app components` → []. The URL scan's false positives (a buried raster, a layout-transition
pattern, hint line lengths) are listed in the M7 report.
