# Repository working agreements

## Test artifacts and disk use

- Keep browser evidence compact. Save milestone/failure screenshots and small result logs; do not capture every intermediate input.
- Browser trace recording is opt-in with `LUMAVORA_TRACE=1` (the original organism soak uses `SOAK_TRACE=1`). Use it only for a short diagnostic that needs it; do not trace long campaigns or soak runs by default.
- Clean up artifacts created by every test or diagnostic run once verification or failure investigation is complete, before reporting task completion. Delete unneeded traces, screencast frames, videos, ZIP archives, intermediate/duplicate screenshots and temporary generated working copies; do not leave them accumulating between tasks.
- Check available disk space before long runs and after cleanup. Include `.playwright-mcp/traces/`, `evidence/` and any temporary output directories used by the run in the cleanup review.
- Preserve source files, required regression/save fixtures, the active campaign save and a small set of final evidence. Record removed historical artifacts in a compact manifest so old reports are not mistaken for still-present files.
- Do not remove unrelated user data or another active task's artifacts.
