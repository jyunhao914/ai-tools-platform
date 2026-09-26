# Shared scene export milestone — 2026-09-26

This is a component milestone, **not full-product acceptance**.

## Implemented

- One scene supplies Qt preview, 1920×1080 raster export, and native PPTX text/image objects.
- Source fingerprints block stale designs after original text changes. Source edits still save when the derived preview is stale.
- Reviewed image assets are bound to their SHA-256. Modified or unreviewed assets are rejected.
- Normal automatic design now composes up to five ordered myth/fact pairs as aligned rows, rebuilding after edits. Manual layout selection removes that generated scene.
- A model layout compiler uses source IDs rather than model-authored copy, checks missing/duplicate text, canvas bounds, font fit, text overlap, and reserved visual regions.
- `scene_acceptance` is a reproducible two-page output/persistence harness, not an alternative end-user UI.

## Actual local evidence

Local output directory:
`/Users/jyunhao/Documents/Codex/2026-09-22/presentation-maker-offline-qwen/outputs/scene-acceptance-20260926-v1`

- Qwen-Image generated a 1024×1024 colon concept illustration in 40 steps (approximately 269 seconds of diffusion). Visually inspected: no fruit or model-written labels. Accepted only as a conceptual cover illustration, not an anatomy reference.
- Asset SHA-256: `25c08555ee7b62a6d8f636bd75452be59b7db285082637f3d58265dd34b450f7`.
- Parsed the supplied outline into 21 pages, persisted it in SQLite, closed/reopened the store, and compared all saved slides with the input document.
- Exported pages 1 and 20 as `representative-editable.pptx` and `representative-image.pptx`.
- Checked native exported text against scene text; checked one 1920×1080 full-page image per raster slide.
- Opened the editable PPTX in installed Keynote. Inspected both slides in the UI and confirmed individual editable text objects and the cover image. The scripted Keynote image-export attempt timed out; **no successful Keynote roundtrip image export is claimed**.
- A real Qwen3.8 local design inference produced the page-17 text layout. Its initial visual brief had no reserved geometry; this exposed a compiler gap, now rejected explicitly. A valid text layout alone is not a finished visual design.
- A second real inference placed the reserved visual region over source text and was rejected. The compiler now returns validation feedback for up to two repair attempts (three total); bounded repair and unchanged source are covered by tests. Successful repaired inference is not yet claimed.

## Still required before product delivery

- The current representative typography is functional, not approved as the requested NotebookLM-like visual quality.
- Complete representative pages 6/17 and the three-route comparison; then validate all 21 designed and illustrated pages.
- Integrate model-directed composition and reviewed visuals into the normal one-click desktop workflow, with cancellation and recoverable failures.
- Verify native desktop paste → design → image generation → edit → save/reopen → both exports using the packaged app.
- Validate visual understanding/OCR and existing-deck reconstruction across real source files.
- No new app package was made for this component milestone; the earlier app bundle does not contain these source changes.
