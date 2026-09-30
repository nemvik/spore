# D2a · odznaky a placené vybavení

**Stav: implementováno, nezávisle regresně i nativně ověřeno.** [Smlouva](../superpowers/plans/2026-09-26-space-equipment.md). Navazuje na dokončené D1; D2b spojenci/koupě soustavy a celé D–E zůstávají otevřené. Přesné nové hrané fixtures a16 regresí také prošly.

## Změna

Tři druhy skutečně odevzdaných zakázek dávají odznaky Kupec cest, Hvězdný zvěd a Správce života. Kořenová alternativa se počítá podle skutečného průzkumu, ne jako ekologický katalog. Za lodní peníze lze doma nebo u vlastní kolonie koupit nákladní věnec80 (+4 společná místa), skokovou cívku120 (dosah18→32) a fotosyntetické listy60 (+2 energie/s při stání). Každý modul má cenu, důvod dostupnosti, trvalý doklad a vlastní geometrii přidanou k původní lodi.

Ekonomika v3 má skutečný výdaj za výbavu a tři permanentní kopie účtenek. Explicitní aktivace zachová staré řádky i D1 cenový řez. Původní konstrukce/pořizovací cena lodi a aktuální energie se nákupem nemění. Minulé biologické, nákladové a cestovní akce používají tehdejší limity; pořadí ekonomických a biologických akcí se rozlišuje i ve stejném čase. Checkpoint chrání starý zaplacený prefix.

## Dosud provedené ověření

- Typecheck po integraci prošel; první pracovní běh odhalil pouze nezúžený optional economy/pointer po rozšíření verzí. Doplněny skutečné explicitní guardy, nikoli potlačení typů.
- Existující relevantní regrese: **3 soubory /98 testů** (ekonomika, D1, živá ekologie),23,97s,exit0. `evidence/sp-014d2a/verification/compatibility.log`.
- Nezávislé review plánu potvrdilo nutnost dvojího řezu sdíleného nákladu: nákup E,L→load E+1,L používá12 míst, po reverzi nákupu znovu8. Implementace i pozitivní/negativní core regrese to ověřují.
- Main self-review doplnilo zákaz nákupu uprostřed později dokončeného letu: permanentní nákupní čas nepřekročí začátek nejbližšího zachovaného odletu. Žádný pozdější modul nelegalizuje starý skok mimo dosah.
- Nezávislá prezentace **14/14** prošla za1,35s (`presentation.log`). Review opravilo zobrazený původ zaplaceného modulu: pozdější dokončení podobné zakázky už nepřepíše původní `paid.unlock`; regrese to potvrzuje. Další konkrétní blocker review nezjistilo.
- Browser driver prošel main review i `node --check`. Použil přesný D1 home export SHA `b2cf84538fea52c2e243affcbc2e0896507ccabe63d287d68a307e8986f8972e` a skutečný dosavadní účet425.
- Nový core soubor má **33 zelených případů**: skutečně získané D1 peníze/odznaky, nezávislá aktivace starého checkpointu, všechny platby, sdílených8→12 míst, delší placený skok, historické limity, změněný CP prefix a odrolování129 skutečných plateb z výslovně připravené unit pokladny. První31 prošly za10,44s; dvě doplněné review regrese za1,66s. Počáteční chybný unit setup zaměňující domácí čas za `space.elapsed` je zachovaný v diagnostice, produkce kvůli němu neměněna.
- Širší space/ship agregát měl **501/502** za77,11s. Jediná zastaralá kontrola textu byla opravena na ověření konkrétních odznaků a modulů obou cest; příslušných15 testů následně prošlo za1,49s. Finální celá sada pak prošla **184 souborů /4236 testů**,189,94s,exit0; bez vynechání, prodlužování timeoutů nebo opakování celé sady. Typecheck a `pnpm build` prošly;233 modulů, JS `index-0Zausb4N.js`1696,97kB/gzip531,44, CSS `index-DDhTxvxv.css`. Známé upozornění na velký chunk trvá. Logy jsou v `evidence/sp-014d2a/verification`, přesun původních agentových cest zaznamenává `verification-log-moves.json`.

## Skutečný produkční průchod

`scripts/space-equipment-browser.mjs` dokončil všech5 skupin, exit0,0browser chyb a zavřel browser. Pouze veřejné UI a běžné RAF, bez přepsání stavu, debug času nebo připravených financí. Aktivační import zachoval staré účtenky/D1 pricing cut15 a nezávisle aktivoval prázdný checkpoint. Účtenky19–21 zaplatily80/120/60:425→165; při každém nákupu energie a zdraví beze změny. Veřejný import zachoval namontované moduly.

Dvě měření skutečného času za stání dala2,82/s před montáží a4,82/s po ní (1,25s a1,2667s, pod energetickým stropem). Loď uskutečnila přímé skoky0↔2 vzdálenosti29 při limitu32. Skutečných12 kusů naplnilo společný náklad a fyzicky blízký známý organismus už nešel odebrat. Veřejný save/import/rekey během zaplaceného šestisekundového návratu uchoval celý náklad, platbu i let. Domácí prodej12×8 vydělal96, konečný účet261. Původní konstrukce, kolonijní účty, D1 a plný domácí stav do fyzického přistání zůstaly zachované. Nejde o nativní důkaz smíšeného12místného životního nákladu; ten pokrývají unit regrese.

Aktivní export: `evidence/sp-014d2a/browser/active-campaign.save.json`, SHA **a2f91fe0d3123a35c7ecae4672476b01a90ea24268f2d0689cfc11e3a14e61d3**. Návratový export `laden-long-flight.save.json`, SHA **e1ca13296bba32116b928385e2b7353199b0d7be7892524a8811079fcb3aeb16**. Souhrn `result.json` SHA1f6d8188a4a0a5a2f7e3ef53946003503489d41f87c0e23301846c67e996978a, nezávislé `review.json`.

Oba exporty jsou byte-identické fixtures `tests/fixtures/space/native-d2a-campaign.save.json` a `native-d2a-flight.save.json`; původ vysvětluje `D2A-README.md`. Nových16 regresí v `space-outfit-fixtures.test.ts` prošlo za9,76s a následný typecheck také. Testy oddělují skutečný starý checkpoint od výslovně připraveného plného CP uprostřed letu. První focus měl dva příliš přesné porovnávací testy (2,0000000000000004 oproti2); opravená pouze tolerance na12desetinných míst, původní diagnostika zachovaná. Nový focus je po dřívější4236 plné sadě, nikoli její součástí.

## Obraz, výkon a úklid

Main i browser agent prohlédli všechny3 snímky1024×640: viditelný nákladní věnec/cívka/listy, dosažitelný delší skok a skutečný náklad12/12. Pravý panel a mapa jsou na snímcích záměrně posunuté k relevantní položce; další obsah je dostupný skrolováním. Ovládací prvky se nepřekrývají. Horký svět54organismů:90RAF p50/p9516,7ms,max16,8ms;889drawů/240104trojúhelníků,1667geometrií,1textura,20programů (WebKit WebGL). Čtyři párové návraty493→1498–1502→493; žádné zadržené geometrie. Jde o krátké reprezentativní měření, nikoli dlouhý soak.

`artifact-cleanup.json`: zachováno5 unikátních veřejných saveů a3 finální PNG, původní browser důkazy3,60MB. Nevznikly trace/video/screencast/dočasné kopie, nebylo co mazat;17,67GiB volných. Aktivní kampaň zůstává.

## Čekající lidské přijetí

1. Bez instrukce agenta najít nabídku odznaků, vysvětlit cenu a účinek každého modulu a rozlišit kořenový katalog od alternativního průzkumu.
2. Vzlétnout, najít vzdálenější dosažitelnou hvězdu a z12/12 nákladu odvodit, proč nelze nabrat další organismus.
3. Posoudit čitelnost vlastní vybavené lodi při pohybu a poslechnout montáž/let/prodej bez rušivého opakování zvuků.

Lidské přijetí/poslech se automaticky netvrdí. Žádný commit/push/deploy; goal pokračuje.
