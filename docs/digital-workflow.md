# Digital workflow (گردش‌کار دیجیتال)

Digital production is a separate template (`DIGITAL_STANDARD`), not a flag on offset.

| Aspect | Offset | Digital |
|---|---|---|
| Plates | CTP plate making + plate stock gate | None |
| Paper preparation | Cutting 70×100 stock to press size | SRA3 stock used directly |
| Make-ready | Plates × colours, make-ready waste per colour | Short setup, minimum waste sheets |
| Cost model | Plates + make-ready + run cost per 1000 sheets per colour | Click cost (colour/black) per side |
| QC | Separate print QC step with rework to printing/plates | Inline QC during printing (checklist at the station); final QC only |
| Drying lag | 4 h before lamination | 20 min cool-down |
| Cutting | Guillotine | Guillotine **or** plotter (shaped stickers/labels) |
| Typical lead time | 5–6 working days | 2 days |

```
DESIGN? ─► FILE_APPROVAL▣ ─► PREPRESS/RIP ─┐
PAYMENT▣ ──────────────────────────────────┼─► PRINTING (+inline QC) ─► LAMINATION? ─► UV? ─┬─► CUTTING? ─┬─► CORNERS? ─► BINDING? ─► FINAL_QC ─► PACKAGING
PAPER▣ ────────────────────────────────────┘                                              └─► PLOTTER? ─┘
```

## Method selection

Each product lists its methods with quantity ranges (e.g. business cards:
digital 100–3,000, offset from 1,000). The pricing engine prices every method
valid for the quantity and picks the **cheapest** or the **priority** method,
per product spec. Staff can force a method in the simulator. The chosen method
determines the workflow template, the machines and the material requirements.
