import type { AdaptationId, GameState, Genome, World } from '../game/types';
import { has } from '../game/genome';
import { reefBodyProfile, reefBodyRespiration } from '../game/reef-body';

/** A stated underwater comparison, independent of the editor camera/location. */
export const REEF_COMPARISON_GAS = 5;
const comparisonPosition = { x: 0, y: 0, z: 0 };
const rate = (n: number) => { const rounded = Number(n.toFixed(1)); return `${rounded >= 0 ? '+' : '−'}${Math.abs(rounded).toFixed(1)} %/s`; };

export function reefBodyEnabled(s: GameState, stage = s.stage): boolean {
  return stage === 1 && !s.journey.legacy && s.journey.reefEvolution?.version === 1;
}

export function reefFilterControl(s: GameState) {
  if (!reefBodyEnabled(s) || !has(s.player.genome, 'filter')) return null;
  const active = (s.journey.reefEvolution?.pumping ?? 0) > .05;
  return { ready: s.player.energy > 2, active,
    label: active ? 'Čistíš vodu' : 'Čistit / jíst',
    detail: s.player.energy <= 2 ? 'Filtr potřebuje energii. Uvolni mezerník a doplň potravu.'
      : 'Podrž mezerník: otevřený filtr čistí okolní vodu, brzdí a spotřebovává energii. Potravu v dosahu také jíš.' };
}

/** Observed change includes roots, exertion, surface breathing and the 100% cap. */
export function reefOxygenTrend(s: GameState, observedRate: number): string {
  if (!reefBodyEnabled(s)) return '';
  if (s.player.oxygen >= 99.95 && observedRate >= 0) return 'Dech · zásoba plná';
  if (!Number.isFinite(observedRate) || Math.abs(observedRate) < .05) return 'Dech · zásoba se drží';
  return `Dech ${observedRate > 0 ? '↑' : '↓'} ${rate(observedRate)}`;
}

export function reefBodyComparison(g: Genome, world: World) {
  // Previewing water after reaching land must still compare aquatic respiration.
  const water = world.stage === 1 ? world : { ...world, stage: 1 as const };
  const closed = reefBodyProfile(g), open = reefBodyProfile(g, 1), filter = has(g, 'filter');
  return { filter, closed, open,
    clear: reefBodyRespiration(g, water, comparisonPosition, 1, 0),
    gas: reefBodyRespiration(g, water, comparisonPosition, 1, REEF_COMPARISON_GAS),
    cleanedGas: reefBodyRespiration(g, water, comparisonPosition, 1, REEF_COMPARISON_GAS * (1 - open.purification)),
  };
}

/** Four short comparisons replace, rather than extend, the compact stat strip. */
export function reefBodyComparisonMarkup(g: Genome, world: World): string {
  const c = reefBodyComparison(g, world);
  return `<span>Plavba${c.filter ? ' → čerpání' : ''}<b>${c.closed.motion.speed.toFixed(1)}${c.filter ? ` → ${c.open.motion.speed.toFixed(1)}` : ''} m/s</b><small>Vodorovně · bez sprintu</small></span>`
    + `<span>Dech · čirá voda<b>${rate(c.clear)}</b><small>Při plavání pod hladinou</small></span>`
    + `<span>Plyn${c.filter ? ' → čištění' : ' · zásoba dechu'}<b>${c.filter ? `${rate(c.gas).replace(' %/s', '')} → ${rate(c.cleanedGas)}` : rate(c.gas)}</b><small>Silný plyn · u těla</small></span>`
    + `<span>${c.filter ? 'Otevřený filtr' : 'Výdrž v silném plynu'}<b>${c.filter ? `${c.open.pumpEnergy.toFixed(1)} energie/s` : c.gas < 0 ? `≈ ${Math.floor(100 / -c.gas)} s` : 'Dech se drží'}</b><small>${c.filter ? `Čištění až ${Math.round(c.open.purification * 100)} % · dosah ${c.open.filterRadius.toFixed(1)} m` : 'Z plné zásoby · při plavání'}</small></span>`;
}

/** Contextual editor copy; historical worlds keep their original organ cards. */
export const REEF_ADAPTATION_COPY: Partial<Record<AdaptationId, { description: string; tradeoff: string }>> = {
  filter: { description: 'Otevřený věnec čistí plyn a brzdí plavbu.', tradeoff: 'Větší věnec vpředu zachytí víc plynu, ale víc brzdí. Vzadu je rychlejší a méně účinný. Mezerník jej rozevře. S čelistí se vylučuje.' },
  gills: { description: 'Dýchání v čisté vodě; hustý plyn rychle bere dech.', tradeoff: 'V čisté vodě doplňují dech. Hustý plyn vstřebávají velmi rychle: pomůže čistý přítok nebo otevřený filtr.' },
  lungs: { description: 'Zásoba dechu a vztlak pro krátké ponory.', tradeoff: 'Vzduchová zásoba se doplňuje nad hladinou. Větší komory nadnášejí: usnadní výstup, ztíží sestup. Pod vodou zásoba ubývá.' },
  fins: { description: 'Větší ploutve drží směr, ale kladou vodě odpor.', tradeoff: 'Široké ploutve lépe drží směr, ale brzdí. Vzadu stabilizují, vpředu ostřeji zatáčejí. Rozložení i velikost mění plavbu.' },
  shell: { description: 'Ochrana a zátěž proti vztlaku.', tradeoff: 'Tlumení zásahů a menší nadnášení vzduchových komor. Hmotnost zpomaluje plavbu; zátěž pomůže sestupu.' },
  bladder: { description: 'Silnější vztlak a svislý pohyb.', tradeoff: 'Nadnáší i po puštění Q. Sestup proti vztlaku vyžaduje práci; krunýř jej tlumí.' },
};
