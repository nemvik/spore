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

## SP-010.C compatibility input

`sp-010c-travel.save.json` is the byte-identical actual C production-browser export
from `evidence/sp-010c/browser/active-campaign.save.json` at commit `a24f2cf06`.
It starts from the documented historical completed tribe, enters machines through
UI, physically surveys one remote station and revisits two fields. It contains
homePlanet v3, atlas generator 1, detailGenerator 1, remote Worlds/visits, original
systems and a checkpoint, but no cities. SP-009.A retains it to verify the empty
registry migration without invented founding, ownership, travel or grants.

SHA-256: `d967d50991850aa312a1032ec58d8d1a406608dc85383851843b9267c660a84f`.

## SP-009.A city compatibility input

`sp-009a-city.save.json` is the byte-identical actual A production-browser export
from `evidence/sp-009a/browser/active-campaign.save.json` at commit `c1b2c75b6`.
It contains the paid city Záře nad údolím (registry v1), real surveys and visits,
earned machine amber and owned springs. No residents, buildings or economy are
prepared. B migrates this city to an explicitly unopened economy, retaining its
identity, owner, LocationAddress, founding receipt and historical checkpoint.

SHA-256: `ab594a3f92456985aced44c2cc28ba3e659b55df21f6411eae189d33a0efe38d`.


## SP-009.B six-resident compatibility input

`sp-009b-economy.save.json` is the byte-identical played B leisure export from
`evidence/sp-009b/leisure/active-campaign.save.json`, at `b550612f4`. It contains
six paid residents, two homes, one grower, one workshop and two leisure gardens,
registry v2/economy v1, actual ledger/cycle/remainder and the historical checkpoint.
C migrates only the appearance schema: exact default B models, no authored
creations/library rows, purchases, history or time. Source remains untouched.

SHA-256: `bb6520f3949acb30e7c33974169cab753b09d80ed5989d7797d0ac355688e71c`.

## SP-009.D state compatibility input

`sp-009d-states.save.json` is the byte-identical actual D production export from
`evidence/sp-009d/browser/active-campaign.save.json`, commit `eb3c05025`.
It contains two independently financed rival states, four real state cities,
played local economy and visits, and the unchanged earlier checkpoint. E migrates
only explicit new schemas; no historical defenses, combat, purchases or captures.
The original D export and older active B/C saves remain untouched.

SHA-256: `e7e6329b53e4d9688a084207b1cbd74add0b2cfec9d20569d860969560fe3bbf`.
