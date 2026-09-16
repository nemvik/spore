# Saved-game regression inputs

These eleven small JSON files are required test inputs. They are byte-for-byte
copies of recorded saves; `manifest.json` records the original local path,
size and SHA256. They belong in Git so a clean checkout can run the tests.
Screenshots, traces, benchmark outputs and full evidence archives stay ignored.

- `earned-reef-entry-v14.json`: genuinely played historical v14 reef arrival;
  the persistence regression checks that migration preserves the earned state.
- `worker-second-retreat.json`, `worker-open-chimney-contact.json`: recorded
  canopy movement/contact states used by the collision regression.
- `legacy-initial.fixture.json`: historical version-2 starting export used to
  characterize organism-editor compatibility.
- `won-current-coast.fixture.json`: deliberately prepared coastal victory,
  including land anatomy, learned DNA, partner and carried culture. It is the
  disclosed starting fixture for tribe browser scenarios.
- `tribe-preview.export.json`, `populated-tribe.fixture.json`: actual P0 exports
  with the historical version-1 tribe preview, based on that prepared coast.
- `alliance-completed.save.json`: normal UI completion of the tribe alliance
  scenario, which started at the prepared coast.
- `machines-restoration-completed.save.json`,
  `machines-restoration-final.save.json`: separate normal UI completions of the
  restoration machine scenario. Both original inputs are retained to preserve
  the exact state used by the editor/planet and fleet-retirement regressions.
- `stable-sandbox.save.json`: normal UI completion of the prepared planet
  scenario, used for the real-time planetary soak.

The prepared inputs are not evidence of fresh campaigns or human play time.
Tests import them through the normal save parser/UI; browser scripts may use
explicit DEV clock stepping. The separate fresh campaign uses ordinary New
Lineage and no imports. Do not regenerate these fixtures to make a regression
pass: intentionally changed historical expectations require review.
