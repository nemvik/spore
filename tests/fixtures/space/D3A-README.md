# D3a native pirate combat, wreck and rescue exports

These are byte-identical exports from the completed native D3a continuation, assets `index-B_BhlXAK.js` and `index-DDhTxvxv.css`. Its source was the genuinely played D2b campaign SHA `94f06db656b31db2de2fb720668dcfb725b0d25899da87fcd52338bb7d8faa3c`. `evidence/sp-014d3a/browser/result.json` records five successful groups, zero browser errors and the following exact public exports.

| Fixture | Source under `evidence/sp-014d3a/browser/` | SHA-256 |
| --- | --- | --- |
| `native-d3a-campaign.save.json` | `active-campaign.save.json` | `608b238c20d8e7c50fa51069b9b0b84cffae4ea6be8954b9e937ca767c4e3500` |
| `native-d3a-battle.save.json` | `battle-two-pulses.save.json` | `d572fc686757b57f9886940e19e80d7a8c117c79be5c39c2da55f44a55041c37` |
| `native-d3a-wreck.save.json` | `actual-wreck.save.json` | `837191196062db5987a62410734dbc7e5f31bfd385dfdcfe637d1921cd9e8da2` |
| `native-d3a-rescue.save.json` | `rescue-in-progress.save.json` | `2f5a5f780a5a03d4f3cc324527ea909938ea6d2940e28632cb7c67bd78a159b4` |

The first encounter was won with five paid pulses (15 energy), after ordinary movement demonstrated actual range and cadence refusal. The two-pulse export has ship health91, enemy health36, two shots and three received hits. The final first encounter records32 damage and health83. Encounter2 ends by an accepted orbital ascent, without a hit; encounter3 loses those remaining83 health to eleven hits. Actual90-second intervals separate the encounters. There is no financial combat reward.

The wreck is health0 at the original orbit, energy105, account117, no body death, and no rescue yet. The rescue export retains that wreck about0.25 economy seconds into the explicit12-second repair. The native import/rekeys preserve the ongoing combat and timer; they do not create new generation checkpoints. The repair restores25 health without moving the ship or adding energy, followed by paid colony receipts E29–31: 25→65→105→115, each costing5, account117→102. Earlier28 economic receipts, equipment260, alliance40, territory120, original ship creation/purchase, B2 and lineage history remain intact. The colony permission remains title25/founding26. The final export is physically docked, travel serial352.

The native cargo is empty in all four exports. Native idle defeat naturally filled energy to105; this is not a claim that the native run tested rescue with a partial battery. The separately prepared ordinary-manoeuvre regression in `space-combat.test.ts` covers a genuinely depleted battery without an energy setter. Unvisited biospheres remain identical to the D2b source; the visited capital surface legitimately advances during scene roundtrips and later paid service. The three in-space exports preserve the complete domestic projection SHA `8fa61868706e8fd1d6ca102a5be7060f520c9326721cb1b4c04aee1cdba59eff`, excluding live/import IDs exactly as the native driver does. Final docking resumes domestic time, so that hash is not asserted against the final docked state.

All actual internal checkpoints remain the original tick66066 pre-purchase state, with independently activated empty combat and no ship. `space-combat-fixtures.test.ts` explicitly labels its separately prepared full midbattle/rescue/docked checkpoints. Their public runtime continuations and malformed copies are unit regressions, not additional native gameplay. The exact source bytes are never modified.

No live setters, artificial time, injected funds or edited payloads were used by the native run. This historical continuation does not prove a fresh-birth campaign, wars, automatic raids/crises, completion of milestone D, or human playtest/listening acceptance. Screenshots, native performance, final feedback replay and browser artifact cleanup belong to the main report.
