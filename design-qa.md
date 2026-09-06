# Design QA: Home and Activation

## Visual truth and render setup

- Home reference: `/Users/kelvin/Desktop/Screenshot 2026-09-01 at 3.49.34 AM.png` (822 × 1722 pixels)
- Activation reference: `/Users/kelvin/Desktop/Screenshot 2026-09-01 at 3.49.49 AM.png` (850 × 1804 pixels)
- Implementation device: iPhone 17 Pro Simulator, iOS 26.5, 402 × 874 points, captured at 1206 × 2622 pixels (3×).
- Reference normalization: the Home reference is approximately 411 × 861 points at 2×; the Activation reference is approximately 425 × 902 points at 2×. Comparisons normalize the native render to the reference width and align from the top.

The supplied images include a presentation frame and mock device chrome. The implementation intentionally uses the native status bar and safe areas instead, as required by the approved screen plan. That presentation-only difference is not a defect.

## Full-view comparison evidence

- Home native render: `/tmp/whoo-called-qa/home-post-build.png`
- Home reference and native comparison: `/tmp/whoo-called-qa/home-final-comparison.png`
- Activation native render: `/tmp/whoo-called-qa/activation-final-render.png`
- Activation reference and native comparison: `/tmp/whoo-called-qa/activation-final-comparison.png`

Both comparison images place the reference and final native render in the same visual input. They were inspected at full view after width and density normalization.

## Focused-region comparison

### Home

- Header: approved owl, wordmark scale, menu control, and safe-area placement align with the source composition.
- Lookup control: input, Paste affordance, and gold lookup call to action retain the source hierarchy, radius, and spacing.
- Summary row: signed-out state intentionally shows `3 of 3`, rather than the populated mock state, and keeps the split credit and upgrade cards.
- Recent area: intentionally renders the approved empty state because no signed-out user history is fabricated.

### Activation

- Hero: owl, close control, title, explanatory copy, and benefit rows match the source hierarchy and wrapped first benefit line.
- Identity controls: the layout, size, and spacing match the design. Apple and Google use their official native controls as required, so their sanctioned brand treatments differ from the illustrative controls in the reference.

## Comparison history

| Iteration | Finding | Resolution | Post-fix evidence |
| --- | --- | --- | --- |
| 1 | P1: missing-glyph boxes appeared in menu, close, and benefit icons when the external icon font was unavailable. | Replaced those icons with native-drawn menu bars and reliable text glyphs. | Final Home and Activation renders show the intended menu, close, and check marks. |
| 2 | P1: iOS resolved every Manrope style to the regular face, weakening title, button, and label hierarchy. | Mapped each iOS family to its bundled Manrope PostScript name. | Final renders show correct ExtraBold, Bold, Medium, and Regular hierarchy. |
| 3 | P2: the opaque source wordmark canvas appeared as a visible dark rectangle in the Home header. | Added a direct alpha export that preserves all approved visible mark pixels while allowing the wordmark to sit on the Night surface. | Final Home comparison has no visible wordmark box. |
| 4 | P2: activation benefit punctuation and wrapping did not match the reference. | Matched the source benefit copy and final wrapped layout. | Final Activation comparison shows the first benefit wrapped to a second line as designed. |

No actionable P0, P1, or P2 visual issues remain in the final comparisons. Intentional differences are limited to native safe areas, real status-bar chrome, the honest signed-out history state, and official Apple and Google control styling.

## Validation

- `npm run typecheck` passed.
- `npm test -- --runInBand` passed: 4 suites and 9 tests.
- iOS Debug Simulator build passed for the iPhone 17 Pro target.
- Android Debug build passed.

final result: passed

---

# Design QA: Lookup progress and result flow

## Visual truth and render setup

- Progress reference: `/Users/kelvin/Desktop/Screenshot 2026-09-01 at 3.49.53 AM.png` (842 × 1820 pixels).
- Result reference: `/Users/kelvin/Desktop/Screenshot 2026-09-01 at 3.49.56 AM.png` (820 × 1806 pixels).
- Implementation device: iPhone 17 Pro Simulator, iOS 26.5, 402 × 874 points at 3×.
- Captured implementation: `/tmp/whoo-called-current.png` (1206 × 2622 pixels), showing the signed-out Home state after the new Debug build was installed.

## Full-view comparison evidence

The supplied source states require a signed-in lookup record in the live-progress and completed-result states. The installed app was captured successfully, but its current render is the signed-out Home state, not either required comparison state. A direct full-view or focused-region comparison would therefore be false evidence.

## Findings

- [P1] Target-state visual comparison is unavailable.
  Location: Lookup progress and lookup result screens.
  Evidence: the source images show lookup-specific states; the only runtime capture is the signed-out Home state above. Local simulator UI control could not enter a signed-in state because the Mac is locked, and no provider credentials or seeded lookup record are available to produce a real terminal run.
  Impact: typography, final spacing, responsive overflow, and dark/light rendering of these target states cannot be visually accepted from source code or a mismatched screenshot.
  Fix: unlock the Mac, sign in to a development account, and use a seeded or provider-configured lookup to capture the two target states at the same viewport. Put each normalized capture beside its source image, resolve any P0-P2 findings, then replace this section with the completed comparison history.

## Open questions

- Should visual acceptance use a seeded emulator lookup record, or a development provider configuration that exercises the actual queue?

## Implementation checklist

1. Unlock the local Mac so the simulator can be controlled.
2. Enter a signed-in account and create or seed a lookup record in `RUNNING` state.
3. Capture the progress screen, then the corresponding `COMPLETE` result screen at 402 × 874 points.
4. Compare each capture with its supplied reference after density normalization, including a light-mode capture using the existing tokens.

final result: blocked
