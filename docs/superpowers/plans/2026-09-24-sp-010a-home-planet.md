# SP-010.A — identita domovské planety a lokalit

24. září 2026; výchozí čistý `main`, `d90a22e8cbf48c53cfea4bc3e5c346c33d6a17c5`. Navazuje na dokončené SP-008.A–F a SP-007.B1, smlouvu SP-007.A a aktuální brief. Bez commitu, pushe a deploye.

## Zjištěná architektura

`worlds` je trojice fyzických světů, `world` její aktivní alias. Etapy 2–5 používají stejný slot pobřeží. Renderer a místní kamera čtou jeho geometrii; kamera není uložená geografie. `GameState.planet` je verzovaný stav lokální terraformace T0–T3 (nástroj, školka, biomy, populace), nikoli planeta. Historie ukládá doložené výsledky, ne geografii. UI import mění ID slotu kampaně i checkpointu. Pobřeží může být vytvořené dopředu pro NPC knihovnu, což nedokládá návštěvu.

## Nejmenší úplné řešení a rozhraní

1. Volitelné rozšíření kampaně v3 `homePlanet` v1: trvalé `id`, lokality `{id, kind, worldSlot}`, `currentLocationId`. Lokalita zde znamená jeden ze tří existujících fyzických habitatů. Patche, hnízda, osady a regiony zůstávají původními objekty uvnitř jejich světa, nikoli kopiemi v registru. Žádné kontinenty ani příznaky návštěv.
2. ID planety se při první aktivaci odvodí z původního ID kampaně; ukládá se samostatně a dále se nemění ani při importním přejmenování slotu. ID lokalit mají stabilní příponu podle habitatu, nikoli podle herní etapy. Registr obsahuje právě existující nenulové sloty, včetně případného předem připraveného pobřeží.
3. `enableHomePlanet` aktivuje novou UI kampaň i historický UI load/import **před** změnou ID slotu a shodně doplní checkpoint. Parser samotný nepřidává volitelné rozšíření, stejně jako smlouva historie; přítomný model přísně validuje. Opakovaná aktivace je idempotentní. Přechody synchronizují pouze registr a aktuální referenci; nemění svět. Checkpoint obnovuje identitu a svět společně. Obnova bez checkpointu je dosavadní nová linie.
4. Konkrétní rozhraní pro SP-009: `LocationAddress = {planetId, locationId, position: Vec3}`, konstruktor adresy a resolver na původní `World`. Místní souřadnice +X východ, +Y nahoru, +Z jih, X/Z −78 až 78; nejde o globální zeměpis. Resolver odmítá cizí/neznámou planetu/lokalitu a neplatné souřadnice. Město bude vlastnit adresu, ne odvozovat lokaci z etapy nebo kamery. Ekonomika ani ukládaný City typ nyní nevzniká.
5. HUD ve všech etapách ukáže planetu Lumavora a aktuální lokalitu; klávesnicově dostupný detail vypíše uložené lokality s vysvětlením, že existence není návštěva. Přechod má textovou odezvu lokality a zachová existující zvuk evoluce. SP-017: čitelný text bez závislosti na barvě, viditelný fokus a malé desktopové rozlišení.

## Kritéria dokončení a ověření

- Stabilní planetární/lokální ID v nové i historické kampani, odlišná identita samostatných linií; žádná spotřeba RNG, regenerace světů, změna souřadnic, těla nebo výsledků.
- Všechny organismové i pozdější přechody, vratné P0 preview, předehřáté NPC pobřeží, opakovaná migrace, export/import, local save/load, checkpoint a jeho poškození mají cílené regrese. Všech 11 historických fixtures zůstane beze změn.
- Porovnání všech starých dat před/po aktivaci a simulační parity s/bez identity; SP-007.B1 i lokální terraformace mají původní sazby a výsledky. Přísné odmítnutí neznámých polí/verzí/duplicit/neshodného aliasu nebo checkpointu.
- Produkční Chrome: čerstvá linie, historické importy různých etap, připravený přechod, běžné klávesy a UI, export/import/reload/load; bez live setterů, localStorage zápisů nebo zrychlování. Připravené vstupy jsou výslovně doložené. Finální snímky se skutečně prohlédnou.
- Úzké testy → celá sada bez browserové zátěže → typecheck/build; původní limity, případné odchylky vysvětlit. Vlastní diff review a nezávislý subagent dokončené změny, oprava nálezů.
- Aktualizovat roadmapu, progress a verzovaný report s reprodukcí, mezemi a malou finální evidencí; úklid vlastních mezivýstupů s manifestem, aktivní save zachovat, disk před/po.

## Navazující otevřené části

SP-010.B: kontinenty/oceány, návazný terén a zasazení existujících habitatů. SP-010.C: globální kamera, navigace a návraty mezi vzdálenými lokalitami včetně integrace měst. SP-009.A: založení a persistence měst s adresou SP-010.A, potom ekonomika a samostatně volené strategie. SP-007.B2 spotřebuje až skutečné civilizační volby; SP-007.D až vesmírné. Celé SP-010, SP-009 a SP-017 zůstávají otevřené.
