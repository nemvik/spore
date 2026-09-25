# SP-009.H — plán v1 před implementací

25. 9. 2026, čistý HEAD `55e8f4ad1`. Bez commitu/pushe/deploye.
Navazuje na přečtené A–G, SP-010.A/B/C a historii SP-007.A/B1.

## Proveditelnost a nejmenší úplný průchod

Existuje skutečný `evidence/sp-009g/browser/active-campaign.save.json`, SHA-256
`ef18ee498054528ab141fd3a69acde110d007fc6188a2e348862f8bbc34b6386`.
Domov má 13,085000000089229 jantaru; dva původní prameny s B1 dávají 1,8/s.
Pokladny pěti měst jsou 32/74/4/30/4. Svaz je poražený, původní rezerva 0,
civilní kupní příjem 203 zmrazený. Liga má dvě města, rezervu 40, civilní účet 0.
Žádné aktivní nasazení, jediný výpad Svazu je zničený. H je tedy možné financovat
skutečným domácím hraním; nepoužije městské ani státní peníze.

Průchod: vydělat doma → navštívit Ligu → fyzicky dojít k existujícím třem
terénním stanovištím → volit obřady podle aktuální námitky → získat tři pečeti
→ dojít na náměstí → výslovně potvrdit závěrečný obřad → převzít město
s konverzním dokladem → hospodařit → uložit/obnovit. Poslední město vyžaduje
čtvrtou pečeť, solventní stát další jednu. Není to nákup souhlasu vlády.
Samostatná [smlouva v1](../../spore/SP-009H-CONTRACT.md) určuje účetnictví,
odpor, přerušení, souběh a migraci.

## Pořadí a soubory

1. Uchovat originály/otisky a přidat byte-identickou G fixture s proveniencí.
2. `conversion.ts`: čistý výhled, odvozovaný postup z omezeného deníku,
   placené obřady, atomické dokončení; CityRegistry v8 a conversion v1.
3. `conversion-validation.ts`, persistence a stávající validátory E/F/G:
   přísná validace, společná historie, live/checkpoint migrace před rekey,
   zachované finanční rovnosti i demobilizace. Žádný nový časový systém.
4. Městské UI/main: cíl/vlastník, námitka a volby, místo/vzdálenost,
   ceny/zdroj, postup a odmítnutí, potvrzení/výsledek/historie, klávesnice/fokus.
5. Regrese v `conversion.test.ts`, úzké původní testy, typecheck/build,
   produkční `conversion-browser.mjs` z G, historie/B1, původní skill klient.
6. Vlastní kontrola a nezávislé review dokončené změny subagentem. Opravit nálezy,
   zopakovat dotčené ověření. Report, roadmapa/progress a úklid vlastních artefaktů.

## Měřitelná kritéria přijetí

- Tentýž vstup a úkony dávají totožná data. Každý obřad spotřebuje přesně 20
  domácích jantarů a uloží jediný doklad; ostatní účty se nezmění. Odmítnutý
  příkaz nic neplatí. Chybná náboženská odpověď je provedený placený neúspěch.
- Bez úkonu žádná pečeť ani vlastník. Tři různé návštěvy stanovišť, situační
  odpor, neúspěch, nedostatek, přerušení/návrat, ztráta postupu a pokračování.
- Dokončení kontroluje současný owner/epoch/revision, práva, místní polohu,
  odpor/počet pečetí, všechny vojenské závazky, finance a limity před mutací.
  Dvojí/zastaralý příkaz nebo souběh G/E/F nevytvoří druhý doklad či platbu.
- Poslední město lze konvertovat i s původní rezervou 40; stát poté nic
  nezakládá/nečerpá. Svaz zachová 203 a porážku. Bez nové jednotky/léčení/odměny.
- Parser odmítne vadné verze, klíče, pořadí, účetnictví, pečeti či checkpoint;
  A–G/původní fixtures byte-identické, migrace opakovatelná a bez minulosti.
- Native produkční browser: skutečný výdělek/konverze/hospodaření/persistence,
  0 console/page errors, pauza/editor/knihovna/globál, kamera/klávesnice/fokus,
  prohlédnuté 1024×640 a 1280×720. Připravenou smrt uvést odděleně.
- 20 návratů a opakovaných otevření historie: odezva p50/p95, heap po GC,
  GPU počty odděleně od timer vzorků se skutečnými draw calls. Bez dlouhých trace.
- Relevantní i úplná regresní sada, typecheck/build/diff-check; nezávislé review
  bez zbývajícího blokujícího nálezu. V reportu konkrétní meze a pokračování.

Celé SP-005.B/SP-009/SP-010/SP-017 zůstávají otevřené. Mimo rozsah rozsáhlé
náboženství/diplomacie/trh/armády, vozidlová/lodní knihovna, moře, vesmír, B2/D.

## Výsledek provedení

Vymezená H část dokončena a ověřena [reportem v1](../../spore/SP-009H-REPORT.md):
3 232 testů, produkční G pokračování 5/5, historické etapy/B1 12/12, typecheck/build,
nezávislé review a opravy, finální snímky, GPU čas s kreslením a diagnostika návratů.
Příprava smrti/checkpointu a meze krátkého měření jsou výslovně oddělené.
Vlastní artefakty uklizené, aktivní i historické save zachované. Bez commitu/pushe/deploye.
