# Design QA

final result: passed

## Comparison evidence

- Source visual truth: `docs/design-reference.png`, selected third design direction. 1536 × 1024 px concept board; desktop pane roughly 1130 px wide and mobile pane roughly 340 px wide. This is an art-direction reference rather than a pixel-accurate scientific chart specification.
- Browser-rendered implementation: `docs/desktop-overview.png`, 1440 × 1024 CSS/physical px, density 1; `docs/mobile-comparison.png`, 390 × 844 CSS/physical px, density 1.
- Both implementation captures and the source were opened together in one comparison input. State: Xiaomi 18 Pro Max vs iPhone 18 Pro Max, light screen, default privacy, front view, dark outer UI.
- Focused captures: `docs/mobile-svm-overlay.png` (two native SVM curves, shared G255 axes and controls); `docs/mobile-raw-reflectance.png` (SCI/SCE controls, raw-point readout and two curves). Controls and typography are legible at native size in these captures.
- Further checks: 800 px tablet with five dated Find N5 conditions; 1440 px desktop with Huawei's long model name and native triple front holes; 390 px touch scrolling from the angle canvas.

## Findings and comparison history

Earlier P2 findings were fixed before the final source/implementation comparison:

1. Mobile phone bodies were too small. Increased their available display area, kept two phones aligned, moved shared chart tools below the maps. Final mobile capture shows approximately 260 px tall phone bodies.
2. Find N5's five raw measurement conditions overflowed at 800 px (828 px content in a 752 px viewport). Conditions now wrap on wider screens; repeat measurement is 724 px content in 752 px viewport. Narrow screens retain touch scrolling for condition buttons.
3. Cached plots could retain a former view or gray level when a hidden slot reappeared. Re-showing a panel or plot reapplies the current state; two native records share one 2D canvas, while heatmaps retain separate plots.
4. Browser return during a pending gray URL update could lose the prior gray. Pending updates are canceled and the restored state is reapplied. A real browser sequence from G127 to G255 and immediately back restores G127.
5. Reset/return while an angle animation was active could be overwritten by its next frame. Parent updates and pause now cancel both scanning and angle animation. Native button Space behavior is preserved.
6. Reflectance return could retain a previous film condition. Parent set now treats an omitted condition as the actual default sample, without inheriting cached child state.

Final combined visual comparison finds no remaining actionable P0/P1/P2 mismatch.

## Required fidelity surfaces

- **Fonts and typography:** Native system sans fonts, including Chinese system fallback, replace raster mock text. Model identity is blue/orange; headings, selectors and secondary controls have clear size/weight hierarchy. Long Huawei names wrap beside the simulated phone and remain available in selectors. Small native plot labels remain the original visualization text.
- **Spacing and layout:** Minimal dark continuous page, thin section rules, no extra card stack. Desktop phone/map pairs are adjacent; mobile keeps two phones together above two maps. Privacy actions sit immediately below their phone. Shared controls replace duplicate mock controls to avoid conflicting state.
- **Colors and tokens:** Near-black `#101113`, subdued charcoal surfaces, white active buttons, blue/orange phone identities. Original rainbow direction maps and original SVM colors are retained. Watermarks remain low contrast in chart margins.
- **Image quality and assets:** Uses the existing vector brand mark and original live WebGL phone geometry, optics and scientific maps. The selected bitmap is a design reference, not displayed as the product UI. Real model geometry and original maps take precedence over inaccuracies in the generated reference.
- **Copy and content:** Uses the requested site name and short controls. Explanations and source details are behind information buttons. Huawei has only the user-confirmed default mode. Missing ≤500-nit coverage is explicitly labeled; raw reflectance sample state is not falsely described as unfilmed.

## Intentional deviations from the reference

- The mock's G255 control beside the angle map and angle axes on the SVM heatmap are inaccurate. The implementation retains original angle controls and actual gray/brightness SVM axes.
- Original data and native scientific visualizations replace generated mock imagery. No scientific curve, spectrum, geometry or panel behavior is invented to match the bitmap.
- One shared brightness/color, palette and angle control set operates both angle views. SVM 2D comparisons use a single shared native canvas as specifically requested.
- Mobile SVM heatmaps stack vertically for legibility. Desktop heatmaps remain side by side.
- Existing Share/Info controls replace unrequested search/menu placeholders.

## Functional acceptance

- 390 px and 1440 px root horizontal overflow: 0; Find N5 800 px condition layout also fits.
- 390 px actual touch gesture from angle display background scrolls the page (scrollY 100 → 245). Native direction pads retain full directional input. Wheel input no longer changes the fixed angle distance or consumes page scrolling.
- Native two-record SVM G255/G127, mode switching, heatmap → 2D → heatmap, slot-1-only data, privacy Space, scan/reset, raw 31-point spectra, readout snapping and folded measurement information checked.
- CDP frame-navigation observation found no iframe reload during SVM gray/mode/view changes.
- Huawei SVM native 17-record bundle checked with its sole default mode; the shared 2D chart retains the actual iPhone curve and shows the explicit Huawei ≤500-nit missing-range note (`docs/mobile-mate-svm.png`). Separate heatmap frames also mount successfully.
- Browser console error/warning check: none.
- Independent UI review: `../../work/redesign/final-integration-review.md`; independent XML data review: `../../work/redesign/raw-reflectance-review.md`.

## Implementation checklist

- [x] Compare source and final browser captures together.
- [x] Check required fidelity surfaces and responsive layouts.
- [x] Resolve and recheck substantive findings.
- [x] Preserve original visualizations and measurement boundaries.
- [x] Complete browser interaction and console checks.

Residual gap: the generated source board has no exact mobile counterpart for every lower section. Those sections were checked against the requested native behavior and their real data rather than inferred mock pixels.
