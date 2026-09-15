export { INTERACTION_COPY } from '../game/interaction-copy.cs';

export const EDITOR_PREVIEW_COPY = {
  waterMedium: 'Tělo ve vodě', landMedium: 'Tělo na souši',
  idle: 'V klidu', move: 'V pohybu', feed: 'Krmení', label: 'Vyzkoušej pohyb těla',
  swim: 'Plavání', walk: 'Chůze', reach: 'Dosah úst', turn: 'Zatáčení',
  collectionReach: 'Dosah sběru',
  jawContact: 'Lov vyžaduje kontakt čelisti s tělem kořisti. Velikost a poloha čelisti mění místo skusu; sosna prodlouží pouze sběr potravy.',
};

/** Journey HUD, journal and reversible construction instructions. */
export const JOURNEY_UI_COPY = {
  editorControl: 'Editor v kolébce · naučenou DNA lze volně přerozdělit mezi části těla',
  life: 'Život',
  offer: 'Nabídnout',
  offerTooltip: 'E · nabídnout nesený vzorek jako skutečnou potravu',
  journalTitle: 'Paměť živé krajiny',
  progressExplanation: 'Jídlo živí tělo a partnery. DNA přináší první ochutnání, poznání vztahu a jeho skutečná změna. Počet soust ani generací cestu neotevírá.',
  resolved: 'ŽIVÝ NÁSLEDEK',
  observed: 'POZNANÉ MÍSTO',
  unknown: 'STOPY V KRAJINĚ',
  observeInstruction: 'Přibliž se k mateřskému porostu a prozkoumej jej klávesou T.',
  lineageMethod: 'Způsob linie:',
  huntMethod: 'selektivní lov',
  guideMethod: 'spolupráce s potravní sítí',
  cultivateMethod: 'přenesený život',
  inhabitants: 'Obyvatelé',
  hunterInstruction: 'Pulzující zamíření lovce sleduje tvůj pohyb. Když zpevní do světlé zlaté, uhni stranou; výpad už nezatočí. Kámen přeruší výhled, maso odvede přípravu útoku. Skus vyžaduje kontakt čelisti a výpad nepřeruší; sosna prodlužuje jen sběr potravy. Po výpadu je lovec zranitelný. Toxin a ostny jej mohou odehnat.',
  cultureControl: 'U porostu prozkoumat, vzít kulturu a zasadit ji. U běžné potravy vzít jedno sousto; E je nabídne tvorům. Běžná potrava nezakoření.',
  constructionBudget: 'ROZPOČET ŽIVÉ STAVBY',
  constructionNote: (remaining: number) => `Volné poznání: ${remaining} DNA · v kolébce můžeš stavbu bez ztráty přerozdělit.`,
} as const;
