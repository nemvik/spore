import type { FoodKind, Stage } from './types';
import type { EcologySite } from './journey-types';

/** Authored places, not repeatable errands. All conditions are visible in the world. */
export const SITE_STORIES: readonly {
  title: string; problem: string; choices: [string, string]; result: string; huntResult?: string;
  kind: FoodKind; source: [number, number, number]; refuges: [number, number, number][];
}[] = [
  { title: 'Zahrada a hladoví hosté',
    problem: 'Závojníci se tísní u jediného mateřského porostu. Jejich shluk přitahuje jehloústa.',
    choices: ['Přenes řasu za kamenný oblouk. Závojníci půjdou za skutečnou potravou.', 'Čelistí sniž přetíženou skupinu. Ponech alespoň jednoho původního konzumenta.'],
    result: 'Závojníci mají druhý stůl. Mateřský porost znovu dýchá.', huntResult: 'Lov uvolnil přetíženou skupinu. Ponechaní závojníci mají víc potravy u mateřského porostu.', kind: 'algae', source: [-37, 1.1, -22], refuges: [[-53, 1.1, -6], [-22, 1.1, -36]] },
  { title: 'To, co nese proud',
    problem: 'Minerální kolonie obíhá ve víru. Volný vzorek vysiluje sprint a otevřený proud.',
    choices: ['Vpluj po směru víru, odeber vzorek a vracej se přes klidné kapsy mezi kameny.', 'Delší dosah odebere vzorek z okraje. Štíhlé tělo a zadní bičík snáz drží směr.'],
    result: 'Minerální kolonie vytvořila návratový proud. Sleduj modrou živou stopu od soumraku přes tuto oporu k odtoku.', kind: 'mineral', source: [37, 1.1, -20], refuges: [[54, 1.1, -2], [20, 1.1, -38]] },
  { title: 'Světlo pro potomka',
    problem: 'Soumraková kultura potřebuje živiny ze zahrady i víru. Její světlo prozrazuje nositele lovcům.',
    choices: ['Lucernička rozšíří přehled. Zelená živá stopa vyživí kulturu; modrá ji proudem ponese k odtoku.', 'Použij smysly, kryt a nabídnutou potravu. Výpad lovce se nedokáže otočit za úhybem.'],
    result: 'Živá kultura zakořenila u odtoku. Potomek má kam vplout.', kind: 'detritus', source: [0, 1.1, 40], refuges: [[-8, 1.1, -57], [9, 1.1, -57]] },
  { title: 'Hostina mezi zuby',
    problem: 'Plachtovci se vydávají za nektarem přes otevřené loviště. Korálová klenba nabízí jinou cestu.',
    choices: ['Přenes nektar do korálového krytu a doprovoď plachtovce na bezpečnou pastvu.', 'Vytlač stužkohrota ze zdroje čelistí, toxinem nebo úhybem a protiútokem.'],
    result: 'Plachtovci se živí v korálovém krytu. Jejich nová trasa vede mimo loviště.', huntResult: 'Stužkohrot u mateřského zdroje padl. Původní pastva plachtovců se uvolnila.', kind: 'nectar', source: [-38, 5.5, -24], refuges: [[-53, 3.2, -3], [-20, 8.6, -39]] },
  { title: 'Kořeny nad hlavou',
    problem: 'Spodní kořeny živí stuhy u hladiny. Mezi nízkými kořeny ubývá dech a proud táhne dolů; nad oporami je klidná voda.',
    choices: ['Žábry a vztlaková perla dovolí pracovat v hloubce. Stuhu zasaď nahoře mezi opory.', 'Krátké sestupy od hladiny s dlouhými ústy šetří dech. Vyber vyšší přístupnou oporu.'],
    result: 'Stuha se napjala od kořenů k hladině. Nová mezistanice dává potravu i dech.', kind: 'algae', source: [38, 2.8, -21], refuges: [[50, 10.6, -4], [20, 8.8, -34]] },
  { title: 'Dýchající průduch',
    problem: 'Výdech průduchu vynáší živiny, nádech je táhne zpět. Hluboký střed rychle bere kyslík; kamenné kapsy a horní voda nabízejí oddech.',
    choices: ['Žábry čerpají i plyn. Sleduj částice a využij výdech; mimo rezavý střed najdi čistou vodu.', 'Vzdušné komory drží zásobu pro krátký ponor. Delší ústa a kamenné kapsy dovolí vyhnout se plynu.'],
    result: 'Živý filtr zachycuje výživu na mělčině. Z vody vyrůstá obyvatelný břeh.', kind: 'mineral', source: [0, 2.6, 40], refuges: [[-9, 9, -57], [9, 10.5, -57]] },
  { title: 'Kořeny drží vodu',
    problem: 'Žrouti požírají mladé kořeny dřív, než zadrží vodu. Zbylé stromy vrhají ochranný stín.',
    choices: ['Přenes kulturu do stínu. Detrit odvede žrouty; nektar odláká i zvonkonoše, kteří mají nový sad osídlit.', 'Lov přemnožené žrouty u kořenů. Původní zvonkonoši patří do obnoveného sadu.'],
    result: 'Kořeny drží vláhu. V sadu se znovu dá žít i za vrcholu sucha.', kind: 'nectar', source: [-37, 0, -20], refuges: [[-51, 0, -5], [-23, 0, -34]] },
  { title: 'Komu patří pramen',
    problem: 'Žrouti obsadili terasu, ale korunoplaz loví jinde. Samotná voda neobnoví potravní rovnováhu.',
    choices: ['Detrit na okraji loviště přiláká žrouty, ale ponechá zvonkonoše u kořenů. Sleduj pak korunoplaza.', 'Selektivně lov žrouty a chraň zvonkonoše. Korunoplaz stále brání své teritorium.'],
    result: 'Původní konzumenti zůstali a žrouti už nedusí nový pramen.', kind: 'algae', source: [37, 0, -20], refuges: [[53, 0, -3], [22, 0, -36]] },
  { title: 'Domov po přílivu',
    problem: 'Kořeny samy domov nezaloží. Divocí prachokřídlíci nesou spory; následují světlo kultury, ale cestou je ohrožují lovci a suchý vzduch.',
    choices: ['Doveď divokého prachokřídlíka až na novou pastvu. Stín a živé prameny chrání jeho tělo.', 'Zásobník a sytý partner sdílejí vodu. Maso pro lovce připrav před cestou: E položí celou nesenou kulturu.'],
    result: 'Prachokřídlík se nasytil v novém domově. Kořeny a spory spojily život dvou druhů.', kind: 'detritus', source: [0, 0, 40], refuges: [[-8, 0, -57], [9, 0, -57]] },
];

export const JOURNEY_COPY = {
  huntRelief: 'Žrouti uvolnili mateřské kořeny. Dokud zůstávají původní konzumenti a hladoví žrouti mimo zdroj, pramen drží vodu.',
  rootLost: 'Žrouti zničili porost. Poznání i DNA zůstávají, živá opora však zanikla. Připrav bezpečné místo a přines nový vzorek.',
  supportLost: 'Poznání zůstalo. Voda mizí.',
  pressureReturned: 'Mateřské kořeny znovu ohrožuje hlad nebo v nice chybějí původní konzumenti. Minulý lov není trvalou ochranou.',
  deadRootHistory: 'Porost už nežije a pramen ztratil jeho oporu. Zapsané poznání se nemaže, ale vodu drží jen skutečné kořeny.',
  recoverSupport: 'Přenes nový vzorek za kryt. Hladové žrouty odveď detritem, nasyť nebo selektivně lov.',
  livingSupport: (vitality: number) => `Živé kořeny · ${vitality} %`,
  liveRootHistory: 'Kořeny právě drží vodu u porostu i v mateřském prameni. Okusování tuto oporu oslabuje.',
  keepNetwork: 'Pro obnovu krajiny musí obě opory žít i při zakořenění poslední kultury.',
  emptyOffer: 'Nejdřív vezmi kulturu nebo sousto u potravy klávesou T. E je potom položí kousek za tebou.',
  takeFood: (name: string) => `Vzít sousto · ${name}`,
  takeFoodHelp: 'T · přenést jedno sousto; E je nabídne místním tvorům',
  foodCarried: (name: string) => `Neseš potravu · ${name}`,
  foodCannotPlant: 'Běžné sousto nezakoření. E je nabídne tvorům; živou kulturu vezmi u mateřského porostu.',
  foodTaken: (name: string) => `${name}: jedno skutečné sousto. E je položí jako potravu pro kompatibilní druhy.`,
  foodHint: (name: string) => `${name} · E položí sousto kousek za tebou. T je uchovává; běžná potrava nevytvoří nový porost.`,
  foodConsumers: (names: string) => names ? `Tuto potravu přijímá: ${names}.` : 'Tuto potravu nepřijímá žádný místní druh.',
  foodPlacement: 'Vyber místo podle druhů, které chceš přivést nebo odvést. Kořeny potřebují živou kulturu.',
  blockedApproach: 'Překážka cloní přístup. Obejdi ji z druhé strany.',
  careCooldown: (seconds: number) => `Dokončuješ předchozí akci · ${seconds.toFixed(1)} s. Potom stiskni znovu.`,
  plantNotDone: (detail: string) => `Nezasazeno — vzorek stále neseš. ${detail}`,
  actionNotDone: (label: string, detail: string) => `Bez změny · ${label}. ${detail}`,
  motherLabel: 'Mateřský porost',
  motherObserve: 'Prozkoumat',
  motherTake: 'Odebrat kulturu',
  motherAwaken: 'Obnovit místní druh',
  cultureTake: (stage: Stage) => stage === 2 ? 'T · přenést živý vzorek; šetři sprint, doplňuj vodu a využij stín.' : 'T · přenést jeden živý vzorek; sprint a otevřený proud jej vysilují',
  cultureCare: (stage: Stage) => stage === 2 ? 'Omez sprint. Při vysychání těla chraň vzorek ve stínu nebo doplň vodu u pramene.' : 'Chraň vzorek před sprintem a otevřeným proudem.',
  cultureLost: (stage: Stage) => `Kultura se rozpadla. Mateřský porost má další vzorek. ${stage === 2 ? 'Zkus krytou trasu, doplň vodu a omez sprint.' : 'Zkus krytou trasu a klidnější plavbu.'}`,
  planted: 'Porost zakořenil',
  unsafePasture: 'Nová pastva je v dosahu lovce. Odveď jej za kryt, nabídni maso nebo použij druhou oporu.',
  rootsUnderAttack: 'Žrouti jsou u mladých kořenů. Nabídni jim potravu stranou nebo zasáhni do lovu.',
  firstFeast: 'Porost čeká na první bezpečnou hostinu. Sleduj konzumenty; jejich cesta k nové potravě je součástí živého světa.',
  approaching: (count: number) => `K novému porostu právě ${count === 1 ? 'míří 1 konzument' : count < 5 ? `míří ${count} konzumenti` : `míří ${count} konzumentů`}.`,
  protectApproach: 'Uvolni cestu konzumentům. Kryt přeruší výhled lovce; E přesměruje tvory skutečnou potravou.',
  title: ['Najdi domov v kapce', 'Nauč se žít ve třech rozměrech', 'Rozhodni, co zůstane'] as const,
  opening: 'První sousto tě nasytí. DNA získáš poznáním a změnou živého světa. Západně od kolébky se něco děje.',
  stage: [
    'Obnov živé vztahy v zahradě a víru. Jejich živiny dovolí soumrakové kultuře založit domov u odtoku.',
    'Zajisti pastvu mezi korály a oporu stuhám. Potom přenes filtr průduchů na mělčinu a připrav tělo pro souš.',
    'Přenesená kultura může zachránit krajinu, potravní rovnováhu nebo tvou symbiotickou linii. Tvá cesta zanechá jiný svět.',
  ] as const,
};

/** The recorded method describes what happened, independently of current support. */
export function siteOutcome(site: Pick<EcologySite, 'id' | 'method'>): string {
  const story = SITE_STORIES[site.id];
  return site.method === 'hunt' ? story.huntResult ?? JOURNEY_COPY.huntRelief : story.result;
}
