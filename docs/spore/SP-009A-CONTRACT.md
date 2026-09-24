# SP-009.A — skutečná města, datová smlouva v1

Navazuje na `a24f2cf06` a [A](SP-010A-CONTRACT.md)/[B](SP-010B-CONTRACT.md)/[C](SP-010C-CONTRACT.md). Nové volitelné `GameState.cities` v1 je oddělené od HomePlanet v3, neměnného atlasového generatoru 1, detailGeneratoru 1 i `GameState.planet` (místní terraformace).

```ts
interface CityRegistry { version: 1; entries: City[]; selectedId: string | null }
interface City {
  id: string; // `${address.locationId}:city`, nejvýše jedno město na detail
  name: string; // 1–40 znaků, bez řídicích znaků, oříznuté okraje
  owner: { kind: 'lineage'; id: string }; // neměnné homePlanet.id, nikoli importní slot
  address: LocationAddress; // náměstí, skutečný místní povrch
  founded: { source: 'player'; stage: 4 | 5; tick: number; paidAmber: 60; springId: number };
  local: { version: 1 }; // konkrétní rozvržení náměstí a radnice
}
```

`entries` je autorita vlastnictví a založení, ne kopie World. `selectedId` je pouze globální výběr; aktivní lokalitu dál určuje `homePlanet.currentLocationId`. Název nemění identitu. Samotný import ani výběr nemění vlastnictví. Doklad založení vznikne výhradně úspěšnou hráčskou akcí; validace propojí etapu, dokončený kmen, vlastní původní jantarový pramen, čas, cenu, jedinečnou adresu a skutečně změřenou lokalitu. Tick založení je skutečný tick kampaně, který C během výpravy pozastavuje; nepředstírá absolutní čas. Lokální singleplayer save není kryptograficky ověřený účetní deník.

## Založení a místní rozvržení

Dosažená etapa 4 nebo 5, aktivní strojový model, skutečně dokončený kmen se svým tří/pětikmenovým rosterem, vlastní jantarový pramen, živý hráč. Založení vyžaduje místní vzdálenou pevninskou výpravu, všechna tři naměřená stanoviště, nejméně 60 jantaru v `machines.resource` a vhodné místo. Cena odpovídá pěti existujícím obnovovacím nákladům po 12 nebo šesti opravám po 10. Vlastní pramen je nutný, aby první založení nevyčerpalo počáteční rozpočet bez obnovitelného zdroje. Není to další podmínka původního přechodu etap.

Adresa náměstí je aktuální výpravová poloha. `citySite` používá A/B/C: existující pevninský detail, přesný místní povrch, výšku celé plochy nad vodou, okraj 18 jednotek, převýšení nejvýše 2 jednotky a sklon nejvýše 0,25 (vzorky po 2 jednotkách nad hladkým generátorem 1). Kontroluje stanoviště/příchod/překážky a skutečné dekorace náměstí/radnice. Radnice v layoutu 1 má kruhový obal 2,5 jednotky, střed 14 jednotek východně od adresy. Průchod respektuje obal těla a odstup 0,1; náměstí i současná poloha zůstávají volné. Město není průzkumné stanoviště ani strojová základna.

Akce znovu ověří všechny podmínky a jméno a potom synchronně odečte cenu a vloží jediný záznam. Druhý klik narazí na existující město před platbou. Neexistuje refund, opakovatelný grant, založení při načtení nebo zpětný civilizační výsledek v SP-007.A/B2. Nejsou nové zdroje, populace ani hospodářské tickování. Původní Worlds včetně vzdáleného generovaného World zůstávají nedotčené; renderer a kolize čtou samostatný overlay.

## Cestování, persistence a migrace

`cityAt`, `foundingAvailability`, `citySite`, `foundCity`, `selectCity` a `enterCity` jsou konkrétní rozhraní dalších SP-009. `selectCity` předá skutečné `entries` do `AddressSelection/selectAddress`; vybere adresu a kameru bez změny etapy/aktivní lokality/vlastníka. `enterCity` vstoupí existující cestovní funkcí C do uloženého detailu a zachová poslední bezpečnou polohu. Návrat domů obnoví původní alias World. Řízené jednotky, potřeby hráče, původní tick/RNG/ekonomika/historie/B1 stojí; městský registr se časem nemění. Založení je jediná explicitní hospodářská transakce během této výpravy. Neaktivní města nic nedohánějí, neléčí a nevydělávají.

Parser zachová historickou absenci; přítomné v1 striktně validuje. `enableCities` idempotentně aktivuje C a prázdný registr v live i checkpointu, před importním rekey. Historická města, vlastníky, platby či cesty nevymýšlí. Export/import a save/load ukládají vše společně. Checkpoint smí mít starší podmnožinu měst, ale společná města musejí mít stejné založení, identitu, vlastníka, adresu a místní stav. Obnova nahrazuje celou větev včetně peněz: před založením není město a je původní zůstatek, po založení je město a zaplacený zůstatek. Žádné sloučení ani zvláštní vratka. Fallback bez checkpointu založí novou linii s prázdným registrem.

Limit zůstává 64 detailů / nejvýše 64 měst a 8 MiB save. Na GPU je jen právě aktivní výpravový detail vedle původní scény; overlay se uvolní společně s ním. Změna významu layoutu, registru nebo generátoru vyžaduje novou verzi a explicitní migraci.

Další části SP-009 musí navrhnout verzovaný rozvoj měst, ekonomiku/populaci a následně státy/strategie. Tato smlouva neimplementuje editor budov, dobývání, obchod, konverzi, moře, vesmír nebo SP-007.B2/D.
