# SP-007.B1 — následky sjednocení kmene

Výchozí čistý `main` / `8d009f0d1`, dokončené SP-008.A–F. Přečtené AGENTS.md, roadmapa, progress, oba briefy, smlouva SP-007.A a report SP-008.F. Bez commitu, pushe a deploye.

## Rozhodnutí a rozhraní

Nejmenší úplná změna používá existující `lineageHistory` v1, `tribe` v2 a strojovou simulaci. Nepřidává uložený bonus, měnu, grant ani verzi kampaně. Čistá funkce `tribeInheritance(GameState)` ověří dokončený kmen, přesný roster (historická trojice / nová pětice), jedinečné odpovídající fakty a shodné uzavření allied/conquered/mixed. Původ action i saved je doložený; čas starého výsledku zůstává neznámý.

| Výsledek | Příjem obsazených pramenů | Výkon modulu při připojování regionu |
| --- | --- | --- |
| allied | ×1,20 | ×1 |
| conquered | ×1 | ×1,20 |
| mixed | ×1,10 | ×1,10 |
| nedokončený / chybějící nebo neúplný důkaz | ×1 | ×1 |

Účinek je omezen na etapu strojů (4). Výkon znamená rychlost obnovy půdy, poškození dělem nebo rychlost růstu obchodního vztahu podle původního archetypu. Nemění ceny, rychlost pohybu, odolnost, počet zásobovacích cest, odvetu, zábor pramene ani kulturní a organismové vlastnosti. Dědictví tvora působí pouze v kmeni; kulturní výstroj na kmenových členech. Regionální archetyp a stará schopnost dál vycházejí z pobřežního finále. Terraformace ani budoucí civilizační strategie se nerozšiřují.

`machineIncome(m)` zůstává základním příjmem pro staré spotřebitele včetně terraformace. Nový výpočet skutečného příjmu a regionálního výkonu z GameState sdílí simulace a HUD. Deník ukáže původ/počty/účinky a hranice platnosti. Kmen před dokončením vysvětlí možné následky, dokončený výsledek ukáže náhled. Strojový HUD ukáže aktuální příjem se dvěma desetinnými místy, základ → upravený výkon, účinek a odkaz na deník. Zábor a připojení zachovají animace/odezvu a oznámí uplatněný účinek.

## Kompatibilita a checkpointy

- Parser chybějící historii stále nevytváří. UI load/import ji stejně jako v A doplní z explicitních výsledků; žádná inference z genomu, výstroje, vztahu bez resolved nebo zůstatku zásob.
- Starý rozehraný kmen má částečnou historii. Doložené předchozí výsledky se počítají až při skutečném dokončení celé trojice/pětice.
- Starý dokončený kmen i kampaň již ve strojích dostanou po UI načtení pouze budoucí sazby podle úplných explicitních výsledků. Žádný zpětný příjem ani změna uložené zásoby, designu, regionu nebo těla. Již uložená historie A se použije přímo. Náhled kmene a neznámé výsledky zůstanou neutrální.
- Obnova vrací svět, ekonomiku i historii společně. Kontrola shody uzavřené kmenové historie mezi live/checkpointem se vztáhne i na saved výsledky, protože nyní ovlivňují hru. Neúplné staré historické záznamy nevytvářejí bonus. Opakovaný přechod/import/obnova pouze znovu odvodí tutéž sazbu.

## Kroky a kritéria dokončení

1. Implementovat čisté odvození, zapojit jeden násobek do příjmu a tří regionálních účinků; zachovat ostatní smlouvy.
2. Doplnit čitelnost SP-017, deník a pozorovací textový výstup bez nového zapisovacího browser API.
3. Regrese: tři cesty × oba rostery; odmítnutí neúplných/duplicitních/neshodných důkazů; stejné tělo/finále a skutečně různé příjmy/práce; všechny tři archetypy; přechod, export/import, save/load, checkpoint, všechny historické fixtures a oddělení terraformace.
4. Produkční Chrome průchod skutečným RAF a běžnými vstupy. Připravené dokončené/rozpracované kmenové vstupy se přiznají. Hráč dokončí poslední řešení, přejde, zaplatí návrh, zabere pramen a připojí region. Všechny tři cesty porovnat na stejném organismovém základu. Ověřit export/import a lokální load, prohlédnout finální snímky v 1280×720. Žádný živý setter ani advanceTime.
5. Relevantní a celá testová sada, typecheck/build, vlastní diff review a nezávislé review dokončeného patchu; opravit nálezy. Případné tolerance času uvést, neměnit herní očekávání.
6. Aktualizovat smlouvu dodatkem B1, roadmapu, progress a verzovaný report s důkazy/mezi. Uzavřít pouze B1. Uklidit vlastní dočasné artefakty podle AGENTS.md, uchovat aktivní exporty a malou finální evidenci.

SP-007.B2/D, SP-009/SP-010 a dokončení celé SP-017 jsou mimo rozsah. Automatický browser není lidský playtest ani poslech.

## Výsledek provedení

Všech šest kroků splněno. [Závěrečný report](../../spore/SP-007B1-REPORT.md) uvádí 52 nových regresí, 2 643/2 643 celé sady s původními limity, typecheck/build, tři připravené produkční cesty a finální replay, historickou kampaň již ve strojích, devět prohlédnutých snímků a úklid. Nezávislý nález chybějícího hlášení při regionálním dokončení opraven a znovu zkontrolován. Závod browser ovladače s obnovou HUD odstraněn čekáním na viditelný stav; gameplay ani limity se neměnily. Uzavřena pouze B1, meze lidského/platforemního/vyvažovacího ověření zůstávají výslovné v reportu.
