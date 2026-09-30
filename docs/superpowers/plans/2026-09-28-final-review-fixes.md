# Opravy nezávislého review A–D

Review 28. září našlo tři P2. Rozsah A–D ani akceptační kritéria se nemění.

1. **Civilizační kapacita:** po 64 skutečných výpravách musí oba státy stále zaplatit a založit svá města. Vyhradit maximálně čtyři další lokality pouze pro státní města, zachovat navštívené světy a ověřovat původ dodatečné kapacity v parseru. Ověřit platný plný historický save, platby, návštěvu nového města, checkpoint a import/export i odmítnutí nadlimitních výprav bez státních dokladů.
2. **Import kampaně:** opožděné čtení nesmí změnit novější relaci ani vykreslit starou chybu. Invalidovat import při změně režimu a při dalším importu, chránit success i error. Ověřit běžné UI s řízeným zpožděním pouze I/O souboru; neměnit herní stav ani hodiny.
3. **Hlasitost efektů:** společný effects gain musí okamžitě ztlumit i dříve naplánované efekty/hlasy, včetně pauzy a návratu. Zachovat obálky, zabarvení a úklid uzlů. Ověřit unit regresi a skutečné nastavení v prohlížeči pasivním sledováním WebAudio, bez tvrzení o lidském poslechu.

Závěr: cílené regrese, typecheck/build, přiměřená širší kontrola kvůli parseru, nezávislé review změn, finální import/export skutečně dohrané kopie. Původní aktivní kampaň a starší důkazy zachovat. Nové důkazy ukládat do `evidence/final-campaign/review/`; uklidit diagnostické kopie. Sedm lidských scénářů zůstává otevřených do skutečného přijetí.

Výsledek28. září: všechny tři opravy ověřené, navíc opravené zalamování pauzy nalezené prohlídkou snímků. [Finální report](../../spore/FINAL-REVIEW-REPORT.md) obsahuje konkrétní výsledky, hashe a meze. Čeká pouze skutečné lidské přijetí; E odložené.
