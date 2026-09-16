# P2 — audit a charakterizace sdíleného editoru

Audit zdrojů při ověřování P1 dne 2026-09-16. Tento dokument nemění produkci ani testy a není dokladem nově provedeného browser průchodu. Výchozí požadavek: [spec §6](../specs/2026-09-15-lumavora-machine-era-design.md) a [roadmapa P2](2026-09-15-lumavora-machine-era-roadmap.md) vyžadují **jeden editor**, charakterizovaný před refaktorem, staré platné genomy a stejný model stroje v editoru i ve flotile.

## 1. Dnešní datový a cenový kontrakt

Zdroj: [types.ts](../../../src/game/types.ts), [genome.ts](../../../src/game/genome.ts), [journey-evolution.ts](../../../src/game/journey-evolution.ts), `simulation.ts::evolve` a `persistence.ts::validateState`.

```ts
interface Genome {
  version: 1;
  name: string;
  length: number;
  width: number;
  hue: number;
  pattern: number;
  parts: Part[];
}
interface Part {
  id: string;
  kind: AdaptationId;
  axial: number;
  angle: number;
  scale: number;
  mirrored: boolean;
}
```

- `validateGenome` požaduje **přesně** těchto 7/6 klíčů. `kind: 'organism'` dnes není platný klíč genomu. AdaptationId má 21 známých hodnot; strojové díly do něj nepřidávat.
- Jméno: neprázdné po trimu, nejvýše 32 znaků, bez řídicích znaků. Délka `.65–2.4`, šířka `.55–1.8`, hue `0–360`, pattern celé `0–3`. Nejvýše 18 dílů; ID odpovídá `[a-zA-Z0-9_-]{1,64}`, je unikátní. Axial `−1–1`, angle `−π–π`, scale `.55–1.65`, mirrored boolean.
- Validace respektuje odemknutí a počet dílů katalogu. Filtr a čelist se vylučují. Na souši jsou povinné nohy a plíce; validátor genomu přijímá pouze prostředí 0–2, persistence používá `worldStageFor`.
- `genomeCost`: součet `part.cost × scale × (mirrored ? 1.6 : 1)` a `abs(length−1)×12 + abs(width−1)×10`, zaokrouhlený `ceil(value−1e−8)` a zdola na nulu. Počáteční tělo stojí 22.
- **Legacy:** `mutationCost` páruje díly podle ID a druhu, započítá kladnou investici, polovinu odstraněné investice odečte pouze od stejné mutace, připočítá změnu rozměrů. UI i `evolve` přidávají 6 za reprodukci. Žádný peněžní refund; přesun attachmentu, název, hue a pattern jsou zdarma.
- **Současná Journey:** cena je celé navržené tělo; kapacita `22 + player.totalDna`, zbytek `available − cost`. Bez poplatku 6. `player.dna` není zdrojem kapacity. Odstranění vrací alokaci a nemění naučené DNA.
- `evolve` kontroluje místo u kolébky, nabídku ceny, obsazené symbiotické místo a souš. Úspěch klonuje draft, přepočítá DNA, zvýší generaci/reprodukce, obnoví vitální stav, přidá historii, úrodnost a checkpoint; současná reef fyziologie resetuje pumping. Odmítnutí nemá tyto účinky. V etapách ≥3 je tělesná evoluce zamčená.

## 2. Skutečný editor a interakce

Všechny níže uvedené obsluhy jsou v [main.ts](../../../src/main.ts); nejde o samostatný existující editorový modul.

| Oblast | Dnešní chování / místo pro zachování |
|---|---|
| Session | `draft: Genome`, `selected: string|null`, `category`, `undo/redo: Genome[]`, `editorValueEdit`, `editorRangePointer`. `openEditor` klonuje tělo, vybere první díl, vymaže historii, nastaví prostředí. P1 odklání Tab na výstroj kmene. |
| Jedna obrazovka | `editor()` sestavuje katalog, náhled, detail dílu, tělesné/cosmetické vstupy, statistiky a potvrzení; zachovává scroll obou panelů. `refreshEditorValues()` aktualizuje cenu/statistiky/validaci bez nahrazení právě drženého inputu. |
| Akce | `add`, `remove`, `select`, `category`, `undo`, `redo`, `confirm-editor`, `cancel-editor`, `preview`, `medium`. Přidání používá `attachmentDefaults`, stabilní ID `part-generation-serial-tick`, nohy/ploutve standardně párované. Potvrzení volá `evolve`; zrušení nepřenese draft. |
| Historie | `edit` ukládá klon před akcí, omezuje undo na 40 a čistí redo. Undo přesune aktuální draft do redo a opraví zaniklý výběr na poslední díl; redo dnes výběr samostatně neopravuje. |
| Input transaction | Více změn jednoho slideru či textového pole sdílí `editorValueEdit.before`. Commit při přechodu na jiný input, focusout, ukončení range pointeru nebo před akcí. Beze změny nevznikne krok. Pending změna zpřístupní Undo a znepřístupní Redo. |
| 3D tah | Levý pointerdown na organu vybere ID a ihned uloží jednu undo kopii; pointermove mění axial/angle přes `attachmentAt`. Pointerup/cancel/lost capture obnoví editor. I samotný klik na díl dnes uloží krok bez pohybu: případnou změnu řešit vědomě mimo mechanický refaktor. |
| Kamera | Pravý tah otáčí náhled, kolečko mění zoom 5–22; nevytváří historii draftu. Preview idle/move/feed a voda/souš mění náhled, nikoli uloženou etapu. |

Zdroj renderu: [renderer.ts](../../../src/render/renderer.ts), [organism.ts](../../../src/render/organism.ts), [anatomy.ts](../../../src/game/anatomy.ts).

- `renderEditor` cachuje podle JSON draftu a používá **tentýž `createOrganism` jako svět**. Každá skutečná změna draftu model vymění a předchozí dispose. Animace, náhled rychlosti, podlaha a reef pumping jsou zatím organismální.
- `pickPart` používá nejbližší skutečnou geometrii; zásah těla (`userData.attachmentSurface`) blokuje orgán za ním. Identitu hledá v rodičovském `userData.partId`. Párované modely sdílejí jedno ID.
- `attachmentAt` deleguje na `attachmentOnBody`; z UV zásahu vrací `axial=clamp(uv.y×2−1,−.93,.93)` a angle z `uv.x×2π` přeložený do `−π–π`. Ruční slider má širší axial rozsah `−1–1`. Stroj musí nabídnout vlastní povrch/sokety se stejným výsledným kontraktem, nikoli falešnou rovinu přes scénu.
- `selectOrganismPart` spravuje vlastní kopie zvýrazněných materiálů. Neklonovat celý model přes `Object3D.clone(true)` kvůli animačním referencím a vlastnictví geometrie.

## 3. Již existující pojistky a chybějící charakterizace

| Důkaz ve zdrojích | Co již kontroluje |
|---|---|
| [genome.test.ts](../../../tests/genome.test.ts) | Přesný tvar a rozsahy, neplatné díly, filtr+čelist, povinná souš, fenotyp. Přesné ceny ploutve 16 / pár 26 / scale1.5 24; půl-salvage 12 a zpět3; změna šířky5; kosmetika0; opakované výměny negenerují DNA. |
| [journey-evolution.test.ts](../../../tests/journey-evolution.test.ts) | Počáteční quote `{cost:22,available:36,remaining:14}`, velikost/páry46/61/86, vratnost a invariant celkové kapacity, stale wallet, obsazený symbiont, vadné vstupy. |
| [simulation.test.ts](../../../tests/simulation.test.ts), [journey.test.ts](../../../tests/journey.test.ts) | Skutečný `evolve`, cena, odmítnutí mimo kolébku, zachované přílohy a generace/checkpoint; reálné současné Journey rozpočty. |
| [anatomy.test.ts](../../../tests/anatomy.test.ts), [jaw-attachment.test.ts](../../../tests/jaw-attachment.test.ts) | Fyzicky oddělená symetrie i na švu, připojovací geometrie, anatomie a čelist. Nenahrazují browser test výběru a historie. |
| [fixtures-test.mjs](../../../scripts/fixtures-test.mjs), scénář `editor-interaction` | Připravená **legacy** vodní pozice: skutečný orbit/zoom, raycast výběr a tah orgánu, přidání/odebrání, rozměry, symetrie, undo/redo, cancel, živé ceny/statistiky během tahu, přesná shoda potvrzeného genomu a odečet DNA. |
| [browser-test.mjs](../../../scripts/browser-test.mjs), `editorAdd` | Běžný vstup Tab u kolébky, přidání dílu/jména a potvrzení v průběhu kampaně; není detailním testem historie. |

**Před změnou editoru doplnit a spustit proti dnešnímu UI:**

1. Nechat stávající ekonomické testy i legacy editor fixture beze změny; uložit výsledek jako baseline před refaktorem. Doplnit browser scénář současné Journey s přesnou cenou/alokací a ověřením, že do UI nepronikne legacy poplatek6.
2. Jediný krok pro dlouhý slider tah a více znaků ve stejném poli; oddělené kroky pro dvě pole; pending edit → Undo; nová změna po Undo zneplatní Redo; no-op input historii nepřidá; kapacita40. Ověřit před extrakcí, ne až na nově napsaném reduceru.
3. 3D klik bez pohybu versus skutečný tah; cancel/lost capture; změna výběru po remove/undo/redo. Zaznamenat dnešní asymetrii redo, pokud se má později opravit.
4. Po překročení rozpočtu / filtr+čelist tlačítko neumožní commit; cancel ponechá celý save beze změny. Preview médium nemění validaci skutečné etapy a neumožní odstranit povinnou suchozemskou anatomii.
5. Reálný historický export v2 → načtení → otevření editoru → potvrzení → znovunačtení zachová kompatibilní genom. Kontrolovat rovněž kopii v checkpointu.

## 4. Nejmenší zavedení adapteru a migrace

**Doporučení:** přidat `game/blueprint.ts` s interním diskriminovaným unionem. Organismus je v editoru `Genome & {kind:'organism'}`; `VehicleBlueprint` má vlastní typ dílů a třídu nosiče tank/letoun. Historický `Genome` v `player.genome` a jeho strict validátor ponechat. `fromGenome` přidá interní diskriminátor nad hlubokou kopií; `toGenome` vrací explicitně vyjmenovaných původních sedm polí, takže do persistence neprosákne `kind`.

To splňuje společný interní Blueprint i starý uložený tvar bez plošného přepisu světa, NPC a stovek příloh. Stroje ukládat pouze v nově verzovaném `machines` řezu s vlastním strict validátorem; starý prázdný machine v1 nechat rozpoznatelný. Root verzi save neměnit automaticky jen kvůli internímu UI wrapperu. Nesmí vzniknout konverze původního genomu na tank.

Navržené malé kontrakty, které se konkretizují v prováděcím P2 plánu:

```ts
type Blueprint = (Genome & { kind: 'organism' }) | VehicleBlueprint;
interface EditorQuote {
  ok: boolean; errors: string[];
  cost: number; available: number; remaining: number;
}
interface EditorAdapter<B extends Blueprint> {
  catalog(state: GameState): readonly EditorPartSpec[];
  bodyFields(draft: B): readonly EditorField[];
  newPart(draft: B, kind: B['parts'][number]['kind'], id: string): B['parts'][number];
  quote(state: GameState, draft: B): EditorQuote;
  stats(state: GameState, draft: B): readonly EditorStatRow[];
  commit(state: GameState, draft: B): { ok: boolean; errors: string[] };
}
```

- Sdílený `EditorSession` nese `Blueprint` draft, klonování, selected, undo/redo a transakci inputu. Přesunout existující historii mechanicky až po baseline; používat **jeden** `editor()`/`refreshEditorValues`, event routing a náhled. `EditorPartSpec/EditorField/EditorStatRow` jsou malé datové popisy dnešních karet, polí a řádků, nikoli nový formulářový framework.
- Adapter organismu volá beze změny dnešní `editorQuote`, fyziologii a `evolve(toGenome(draft))`. Adapter vozidla dodá jantar, nosnost, trup/kabinu/pohon/jeden modul, tři skutečné staty a atomickou herní akci; žádná přímá mutace flotily v kliknutí. Původní tělesné zvláštnosti zůstávají za adapterem.
- `GameRenderer` ponechá jednu `editorScene`, kameru, `pickPart` a pointer flow. Malý render adapter zvolí `createOrganism` / `createMachine`, animaci, výběrové materiály, `attachmentAt` a výšku podlahy. `createMachine(blueprint)` používá editor **i** skutečná flotila. Modely obou druhů označují attachment surface a `partId` jednotně.
- Sdílet existující `attachmentAngles` a konvenci ID/transformací; případnou malou extrakci mount helperu z organismu provést beze změny jeho výsledku. Nekopírovat celý `organism.ts` a nevnucovat podvozku organickou geometrii.
- Uložení konstrukce a zaplacená výroba musí mít výslovný kontrakt. Doporučený výchozí model: draft se potvrzuje jako nová neměnná konstrukce, flotila odkazuje na její stabilní ID; pozdější editace vytváří novou revizi. Změna draftu nikdy zdarma nepřestaví existující stroje. Rozpočtové zobrazení i výrobní akce používají stejný quote.

Dokončení refaktoru se prokazuje stejnými původními charakterizačními výsledky a novými paralelními scénáři pro tank i letoun, ne pouze shodnou CSS třídou dvou oddělených editorů.
