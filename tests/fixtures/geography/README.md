# SP-010.A compatibility input

`sp-010a-fresh.save.json` is the unchanged production-browser export from
`evidence/sp-010a/browser/fresh-active-campaign.save.json`, produced in SP-010.A.
It contains homePlanet v1, a newly born UI lineage, its library-prepared coast and
checkpoint. This is a short UI session, not a completed campaign. Its original
worlds, addresses and history are the input to the explicit v1 → v2 migration test.
The eleven older inputs in `../saves/` remain byte-identical and unchanged.

SHA-256: `d1ab026239c80e0843e379984056c2b9e0b963069051a111cb27b207f5dc8ece`.

## SP-010.B compatibility input

`sp-010b-fresh.save.json` is the unchanged production-browser export from
`evidence/sp-010b/browser/fresh-active-campaign.save.json` at completed SP-010.B
(commit `eed840c65`). It is a short new-lineage UI session, with homePlanet v2,
generator 1 and checkpoint; it does not claim a completed campaign. C tests its
explicit v2 → v3 activation without inferred visits or ownership.

SHA-256: `690c9453718f6275883b11f34315d593099bcd42116c82d91217bcecb9d2d7fd`.
