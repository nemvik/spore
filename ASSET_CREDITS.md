# Původ obsahu a licence

LUMAVORA používá původní procedurální obsah vytvořený pro tento repozitář při implementaci zadání s pomocí Codexu. Nebyly převzaty modely, textury, hudba, zvukové nahrávky, herní kód ani značky jiných her. Nebylo použito placené generovací API, externí assetové tržiště ani runtime CDN.

## Původní obsah

| Obsah | Zdroj a způsob vzniku |
| --- | --- |
| Hráčův organismus, adaptace a nehráčské druhy | `src/render/organism.ts`: vlastní procedurální geometrie, materiály a animace odvozené z genomu či popisu druhu. |
| Terén, rostliny, korály, diatomy, průduchy a pozemní vegetace | `src/render/habitat.ts`: vlastní seedované tvary, radiální membrány, trubicové větvení, barevný terén a instancované částice. |
| Kolébky, průchody a prameny | `src/render/habitat.ts`: vlastní geometrie a animace reagující na stav světa. |
| Kontaktní stíny | `src/render/contact-shadows.ts`: vlastní radiální textura vytvořená lokálním Canvas2D a instancované roviny. |
| Potrava a herní efekty | `src/render/renderer.ts`: lokálně sestavované geometrie a materiály. |
| Atmosféra a zvukové efekty | `src/render/audio.ts`: vlastní oscilátory, frekvenční průběhy a obálky Web Audio; bez samplů a nahrávek. |
| Rozhraní, ornamenty a barevná paleta | Vlastní HTML/CSS, text a jednoduché grafické prvky v tomto projektu. |
| Názvy, popisy a pravidla světa | Původní obsah projektu; hlavní katalogy v `src/game/content.ts` a `src/game/genome.ts`. |

Písmo využívá systémové fonty dostupné v zařízení. CSS může upřednostnit již nainstalované Inter, Avenir Next, Segoe UI, Georgia či Times New Roman; žádný fontový soubor se nepřibaluje ani nestahuje. Tyto názvy označují lokální alternativy, nikoli převzatá distribuovaná aktiva.

Screenshoty, video a trace v `evidence/`, pokud jsou přítomné, vznikají zachycením běžící hry. Nejde o konceptové obrázky ani externí ilustrační assety.

## Přímé knihovny

Verze a licence níže byly zjištěny z nainstalovaných `package.json` a přiložených licencí. Přesné závislosti včetně tranzitivních balíčků uzamyká `pnpm-lock.yaml`; jejich vlastní licenční podmínky zůstávají v distribuovaných balíčcích.

| Knihovna | Verze | Účel | Licence | Projekt |
| --- | --- | --- | --- | --- |
| Three.js | 0.180.0 | 3D renderer a geometrické nástroje | MIT | [mrdoob/three.js](https://github.com/mrdoob/three.js) |
| @types/three | 0.180.0 | Typy pro TypeScript | MIT | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/three) |
| Vite | 7.1.5 | Vývojový server a statický build | MIT | [vitejs/vite](https://github.com/vitejs/vite) |
| TypeScript | 5.9.2 | Typová kontrola a překlad | Apache-2.0 | [microsoft/TypeScript](https://github.com/microsoft/TypeScript) |
| Vitest | 3.2.4 | Automatické testy pravidel | MIT | [vitest-dev/vitest](https://github.com/vitest-dev/vitest) |
| Playwright | 1.55.0 | Ovládání testovacího prohlížeče a trace | Apache-2.0 | [microsoft/playwright](https://github.com/microsoft/playwright) |

Instalace testovacího prohlížeče přes Playwright přidává externí testovací nástroj s jeho vlastními licencemi. Prohlížeč se nestává assetem ani součástí produkčního buildu hry.

## Licenční oznámení Three.js

Three.js je součástí běžící aplikace. Jeho přiložené oznámení z `three@0.180.0/LICENSE`:

```text
The MIT License

Copyright © 2010-2025 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

Při dalším šíření ponech příslušná licenční oznámení knihoven. Tento přehled sám o sobě neuděluje novou licenci původnímu kódu nebo obsahu LUMAVORA.
