import { has } from '../game/genome';
import { nearNest } from '../game/simulation';
import { reefWater } from '../game/journey-network';
import { distance } from '../game/random';
import type { GameState } from '../game/types';

export function oxygenGuidance(s: GameState, observedRate: number) {
  if (s.stage !== 1) return null;
  const p = s.player, rate = Number.isFinite(observedRate) ? observedRate : 0;
  const trend = p.oxygen >= 99.95 && rate >= 0 ? 'Plná zásoba' : rate < -.05 ? 'Ubývá' : rate > .05 ? 'Doplňuje se' : 'Zásoba se drží';
  const surface = p.pos.y > 10.5, nest = nearNest(s) && p.energy > 15, gills = has(p.genome, 'gills');
  const rootId = !s.journey.legacy ? s.journey.sites.find(site => site.id === 4)?.plantedId : null;
  const root = rootId == null ? null : s.world.resources.find(r => r.id === rootId);
  const byRoot = !!root && distance(root.pos, p.pos) < 6;
  const gas = !s.journey.legacy && reefWater(s, p.pos).oxygenUse > .25;
  const reason = surface ? 'U hladiny dýcháš.' : nest ? 'Kolébka doplňuje dech.' : byRoot ? 'Kořeny pomáhají doplňovat dech.' : gas ? 'Plyn průduchu zhoršuje dýchání.' : gills ? rate < -.05 ? 'Žábry dýchají, ale spotřeba je vyšší.' : 'Žábry získávají kyslík z vody.' : 'Pod vodou spotřebováváš svou zásobu.';
  const help = surface ? 'Před ponorem počkej na doplnění.' : p.oxygen <= 25 ? 'Drž Q a vystoupej k hladině. Při 0 % ztrácíš zdraví.' : gills && gas ? 'Vyplav z plynu do čiré vody, nebo drž Q k hladině.' : 'Drž Q k hladině pro doplnění dechu.';
  return { trend, reason, help, low: p.oxygen <= 25, label: 'ZÁSOBA DECHU' };
}
