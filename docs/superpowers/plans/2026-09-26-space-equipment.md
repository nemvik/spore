# D2a · odznaky a zaplacené vybavení vlastní lodi

Navazuje na D1. Produkce D1 zůstane během jejího hraného ověření neměnná. Tento plán rozděluje D2 na dva hratelné řezy: nejprve výbava a skutečná výprava s ní, potom D2b samostatné spojenectví/doprovod a mírová koupě soustavy. Nemění kritéria SP-011/SP-013/SP-014 ani neoznačuje celé D2 za hotové.

## Ověřitelný výsledek

Hráč vidí tři odznaky odvozené ze skutečně odevzdaných druhů zakázek. Ve své dílně nebo u vlastní kolonie zaplatí za trvalé moduly; původní konstrukce a její pořizovací doklad zůstanou stejné. Větší náklad přepraví a prodá, delším skokem překročí původní dosah18 a solární článek měřitelně rychleji dobije loď při běžném stání. Veřejný save/import a checkpoint zachovají nové moduly i historické limity. Bez vymýšlení peněz, odznaků nebo účinnosti v minulosti.

## Smlouva před editací

- **Odznaky:** Kupec cest odpovídá dokončené misi `trade`, Hvězdný zvěd dokončené `survey`, Správce života dokončené `ecology`. Odvozují se podle skutečného druhu mise, nikoli identity společnosti. Kořenová náhradní průzkumná mise udělí průzkum, nikoli ekologii. Výběr katalogu/průzkumu v D1 vysvětlí i tuto odměnu. Žádná z těchto větví není povinná pro možnost pokračovat základní lodí.
- **Katalog1:** nákladní věnec `hold` stojí80 a přidá4 společná místa organismům/produkci (Kupec); skoková cívka `drive` stojí120 a mění dosah18→32 (Zvěd); fotosyntetické listy `solar` stojí60 a přidají2 energie/s k původnímu solárnímu dobíjení při stání (Správce). Každý modul lze koupit jednou, neodnímá se. Žádný sám nedoplní aktuální energii/zdraví, nepřepočítá původní cenu ani nenásobí B2 dědictví.
- **Místo/platba:** živá loď etapy5, platná ekonomická revize, skutečná domácí dílna nebo vlastní cizí kolonie u majáku do12 a pod výškou8, žádný probíhající let. Odznak, nedostatek prostředků, vlastnictví modulu i aktuální efekt jsou viditelné před nákupem. Platí se skutečná lodní pokladna.
- **Uložení:** optional `space.outfit` v1/katalog1, aktivační `EmpireCut`, nejvýše3 trvalé nákupní doklady. Každý drží pevné ID modulu, ekonomický serial a standardní přesné platební hodnoty/čas/tick/life řez, navíc travel řez a zdroj odznaku `{empireId, completedSerial}`. Je to kopie skutečné účtenky; v zachovaném ekonomickém logu se musí shodovat. Po odrolování zůstane permanentní doklad, přesný počet i součet zaplacené výbavy.
- **Ekonomika v3:** explicitní aktivace po D1 přidá nulové `ledger.equipment` a `counts.equipment`; původní řádky/účty zůstanou beze změny. Nový druh `equipment` je skutečný výdaj a reverzní operace. `pricingActivatedAction` z D1 se zachová přesně; v3 používá stejnou smluvní cenovou politiku v2. Staré v1/v2 parsery neaktivují výbavu ani nedomýšlejí platby. Live a checkpoint mají vlastní aktivační řezy; historické prázdné bootstrap větve se řeší výslovně, již placený prefix je neměnný.
- **Aktuální a historické parametry:** editor/původní doklad používají `shipStats(creation.blueprint)`. Runtime/HUD používají efektivní parametry. Nákup působí na biologické akce od uloženého nextLife, lety od nextTravel, ekonomiku až po vlastním zaplaceném serialu. Limit společného nákladu kombinuje life i ekonomický řez, aby nákup a nakládka ve stejném čase nezměnily pořadí. Biologický rewind kontroluje kapacitu před i po každé akci podle tehdejší výbavy. Zvětšení dnes nesmí legalizovat přetížený starý collect/release/load/sell ani historický skok mimo tehdejší dosah.
- **Validace:** přesné tvary/verze/katalog/ceny/jedinečnost; účetní bilance a počty, časové a seriálové řezy proti sousedním zachovaným událostem; zdroj odznaku skutečně dokončen před nákupem a daného druhu. Trvalý doklad odpovídá zachované účtence, nebo je starší než její omezený log. Checkpoint zachová již zaplacené doklady jako prefix a nové nákupy nesmějí předcházet jeho řezu. Stávající validační větve v1 a biosférav1 zůstávají.
- **Prezentace:** kompaktní panel „Odznaky a výbava“ vedle ekonomiky. Aktuální dosah i kapacita na mapě/HUD, přesný zdroj odznaku a cena. Tři viditelné přídavné části na původním modelu (věnec kontejnerů, skokový prstenec, solární listy), synchronizované bez přestavování scény každý snímek, s reduced-motion a jednorázovým disposal. Zvuk po skutečném zaplacení.

## Implementace a ověření

1. Main: pure katalog/efektivní parametry, typy a explicitní aktivace; v3 ekonomické účtenky a reverzní validace; výbavové validace a CP, pak runtime a UI/render. Žádné souběžné editace těchto souborů.
2. Nezávislé testy v nových oddělených souborech: D1 byte-exact vstup, staré větve, nákup/odmítnutí/stale/remote, stejné časy a historické mezní kapacity, skutečné nové limity/solár/skok, rollover/CP/rekey, ceny v3, model/disposal. Připravené prostředky/souřadnice označit jako unit.
3. Relevantní regrese/typecheck/build, rozšířit na celou sadu podle průřezu persistence. Nezávislé review datové smlouvy a společného nákladu. Teprve stabilní finální build předat browseru bez souběžných těžkých běhů.
4. Native naváže na přesný D1 aktivní export: zaplatí moduly z dosavadního výnosu, veřejně přenese save, přepraví větší náklad, uskuteční skok >18, změří běžné dobíjení a vrátí se. Bez state setters/debug času. Prohlédnout snímky, krátce změřit výkon/návraty, zachovat hlavní kampaň, uklidit vlastní artefakty a aktualizovat tracker/report.
5. Potom D2b: před implementací upřesnit skutečný spojenecký doprovod s již použitelnou pomocí, samostatný trvalý doklad vlastnictví soustavy a nové účetní kategorie. Diplomatické kapitály, doklady D1 ani původní chráněné kolonie se nepřepisují.

## Nezávislé review smlouvy

Read-only review nenašlo blokující změnu. Potvrdilo zejména odlišné hranice: nákup E,L,T platí pro ekonomické řádky >E, biologické >=L a letové >=T. Povinná regrese: plných8 míst → nákup E,L → load4 E+1,L; při reverzi load je limit12, po reverzi nákupu znovu8. Zdroj odznaku `completedSerial` ukazuje na konkrétní D1 `complete` stejného skutečného druhu mise.
