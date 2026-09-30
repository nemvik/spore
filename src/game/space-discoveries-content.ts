import type { DiscoveryAction, RelicId, SpaceDiscoveries, WormholePassage } from './space-discoveries-types';
import type { SpaceState } from './space-types';
import { starSystems, systemDistance } from './galaxy';
import { ownerAt } from './space-expansion-content';
import { atWar } from './space-war-content';

export const RELIC_IDS: RelicId[] = ['passage', 'memory'];
export const RELICS = {
  passage: { name: 'Ulita vzdálených proudů', index: 5, x: 12, z: -12, color: '#91d8ed',
    signal: 'Pravidelný dvojhlas vychází z povrchové ulity.',
    result: 'Přečtená navigace otevřela obousměrný průchod mezi Měděnou ulitou a Kořenem světla.' },
  memory: { name: 'Paměť společných kořenů', index: 20, x: -13, z: 10, color: '#e6c487',
    signal: 'V usazeninách se opakuje obraz společné dílny.',
    result: 'Znalost obnovy můžeš osobně předat mladší společnosti. Relikt zůstává na své planetě.' },
} as const;
export const SOCIETY_NAME = 'Kruh prvních světel';
export const SOCIETY_POSITION = { x: 7, z: 8 };
export const PATRONAGE_PRICE = 40;
export const WORMHOLE_PRICE = 14;
export const WORMHOLE_SECONDS = 6;
export const WORMHOLE_INDICES = [5, 22] as const;
export function allocateYoungSociety(home: string, protectedPlanets: string[], capitals: string[]): SpaceDiscoveries['society'] {
  const systems = starSystems(home), primary = systems[19];
  // End22 stays outside the later inner region; existing diplomatic anchors
  // cannot be silently replaced even in an entirely colonised old campaign.
  const candidates = systems.filter(star => star.living && star.index <= 22 && !capitals.includes(star.planetId))
    .sort((a, b) => systemDistance(primary, a) - systemDistance(primary, b) || a.index - b.index);
  const target = candidates.find(star => !protectedPlanets.includes(star.planetId)) ?? candidates[0];
  return { planetId: target.planetId, enclave: protectedPlanets.includes(target.planetId) };
}
export const relicDiscovery = (d: SpaceDiscoveries | undefined, id: RelicId) => d?.actions.find(a => a.kind === 'relic' && a.relicId === id) ?? null;
export function societyProgress(d: SpaceDiscoveries) {
  return { contact: d.actions.find(a => a.kind === 'contact') ?? null,
    shared: d.actions.find(a => a.kind === 'share') ?? null,
    accepted: d.actions.find((a): a is Extract<DiscoveryAction, { kind: 'accept' }> => a.kind === 'accept') ?? null,
    supported: d.actions.find((a): a is Extract<DiscoveryAction, { kind: 'support' }> => a.kind === 'support') ?? null };
}
/** Finite, ordered progress shared by runtime and parser. No rewards here. */
export function appendDiscovery(d: SpaceDiscoveries, action: DiscoveryAction): void {
  const progress = societyProgress(d);
  const invalid = () => { throw new Error('Neplatná návaznost průzkumu a spolupráce.'); };
  if (action.serial !== d.nextAction || d.actions.length >= 6) invalid();
  if (action.kind === 'relic') { if (!RELIC_IDS.includes(action.relicId) || relicDiscovery(d, action.relicId)) invalid(); }
  else {
    if (action.planetId !== d.society.planetId) invalid();
    if (action.kind === 'contact') { if (progress.contact) invalid(); }
    else if (action.kind === 'share') { if (!progress.contact || progress.shared || !relicDiscovery(d, 'memory')) invalid(); }
    else if (action.kind === 'accept') { if (!progress.shared || progress.accepted || !['patronage', 'ecology'].includes(action.aid)) invalid(); }
    else if (action.kind === 'support') { if (!progress.accepted || progress.supported || progress.accepted.aid !== action.aid || action.aid === 'ecology' && d.scans.length !== 6) invalid(); }
    else invalid();
  }
  d.actions.push(structuredClone(action)); d.nextAction++;
}
export function wormholeTarget(p: SpaceState, planetId: string) {
  const pair = starSystems(p.homePlanetId).filter(star => WORMHOLE_INDICES.some(index => index === star.index));
  return pair.some(star => star.planetId === planetId) ? pair.find(star => star.planetId !== planetId)! : null;
}
export function wormholeProof(p: SpaceState, from: string, to: string, proof: WormholePassage, travelAction: number, acceptedAt: number): boolean {
  const found = relicDiscovery(p.discoveries, 'passage');
  return !!found && proof.kind === 'wormhole' && proof.relicSerial === found.serial
    && wormholeTarget(p, from)?.planetId === to && found.cut.travelAction <= travelAction && found.cut.at <= acceptedAt + 1e-7;
}
/** Discovery never changes political ownership. Occupation still blocks an
 * existing player colony; services are available on an otherwise free world. */
export function societyUnavailable(p: SpaceState): string {
  const d = p.discoveries; if (!d) return 'Zatím nemáš spojení s mladší společností.';
  const owner = ownerAt(p, d.society.planetId);
  if (owner && owner !== 'player' && (atWar(p, owner) || p.economy?.colonies.some(c => c.planetId === d.society.planetId)))
    return 'Sídlo je pod nepřátelskou kontrolou. Nejprve obnov bezpečný přístup.';
  return '';
}
export function societyService(p: SpaceState, planetId: string) {
  const d = p.discoveries, support = d && societyProgress(d).supported;
  return d && support && planetId === d.society.planetId && !societyUnavailable(p) ? { supportSerial: support.serial, travelAction: p.nextSerial } : null;
}
