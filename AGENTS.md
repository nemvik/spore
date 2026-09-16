# Repository working agreements

## Test artifacts and disk use

- Keep browser evidence compact. Save milestone/failure screenshots and small result logs; do not capture every intermediate input.
- Browser trace recording is opt-in with `LUMAVORA_TRACE=1` (the original organism soak uses `SOAK_TRACE=1`). Use it only for a short diagnostic that needs it; do not trace long campaigns or soak runs by default.
- Check available disk space before long runs. Remove your obsolete traces, duplicate screenshots and unused generated working copies after verification.
- Preserve source files, required regression/save fixtures, the active campaign save and a small set of final evidence. Record removed historical artifacts in a compact manifest so old reports are not mistaken for still-present files.
- Do not remove unrelated user data or another active task's artifacts.
