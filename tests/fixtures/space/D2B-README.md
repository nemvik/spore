# D2b native alliance, territory and colony exports

Byte-identical exports from the completed D2b native continuation, assets `index-CUI1rfu6.js` and `index-DDhTxvxv.css`.

| Fixture | Actual source | SHA-256 |
| --- | --- | --- |
| `native-d2b-campaign.save.json` | `evidence/sp-013d2b/browser/active-campaign.save.json` | `94f06db656b31db2de2fb720668dcfb725b0d25899da87fcd52338bb7d8faa3c` |
| `native-d2b-flight.save.json` | `evidence/sp-013d2b/browser/allied-laden-flight.save.json` | `21493206083b9b3e3b1ccc505d5e47d6c1166a50b4b0cc306a55610475ab1a1d` |

Source: actual D2a campaign SHA `a2f91fe0d3123a35c7ecae4672476b01a90ea24268f2d0689cfc11e3a14e61d3`. The browser result contains four successful check groups and zero errors. The export named `allied-laden-flight` is identified by the result's actual public rekey entry, with the matching SHA and a six-second paid leg at0.2seconds. It is not a separately prepared midflight state.

The earned261 account paid E24 alliance40, E25 territory120 and E26 colony40, reaching61. The new resin-capital colony permanently records `{titleSerial:25, foundingSerial:26}`; the embassy, old treaty, pricing, all23 earlier receipts, equipment260, paid ship and B2 history remain intact. E27 loads eight newly produced sun-resin units. The native flight retains those units, the owned title, equipped ship and real companion; the return jump cost9. E28 sells eight at the domestic price7 (56total), leaving117. No foreign-market bonus applies to that domestic sale.

The escort is purchased separately from the title and conserves `12 + generated - delivered = energy`. The actual flight export has generated25.11249999999834, delivered26.025833333333313 and battery11.086666666666686. After returning it is parked, with generated26.23249999999822, delivered28.825833333333453 and battery9.406666666666721. The native run verified local movement, positive transfer, transition stasis and parked stasis. It does not claim native acceptance of all three escort profiles or space combat.

Both internal generation checkpoints remain the historical tick66066 pre-purchase state, with independent empty v4/expansion branches and no ship. Public export/import milestones are not new generation checkpoints. The fixture test explicitly prepares separate full midflight and docked checkpoints, then uses ordinary simulation steps to check continued flight, exact recovery and stasis. Those unit checkpoints and continuations are not native evidence. The native full domestic snapshot remained frozen until docking; the flight fixture preserves its documented projection SHA `c57a53448666faf1e9c7400091ea56d40832486c3af13e3e1f9391c8c7fc54ec`.

No payload edits, live setters, artificial clock or injected funds were used in the native run. These fixtures prove a historical continuation rather than a fresh-birth campaign, all milestone D, or human playtest/listening acceptance. Preserve these byte-identical regression sources; screenshot review, performance and evidence cleanup remain with the main report.
