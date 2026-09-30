import type { GameState } from './types';
import type { SpaceBattle } from './space-combat-types';
import type { CoreAction, CoreBattleProof } from './space-core-types';
import { eventStamp } from './space-events';
import { planetSystem, starSystems } from './galaxy';
import { activeSpaceBattle, latestBattle, COMBAT_REST, WARDEN_RESULTS } from './space-combat-content';
import { beginSpaceBattle } from './space-combat';
import { livingPlanet, stopClimateTool } from './space-biosphere';
import { societyProgress } from './space-discoveries-content';
import { appendCoreAction, coreProgress, coreRoot, CORE_BOUNDARY, CORE_CENTER, CORE_ENCOUNTER_POSITION, CORE_FRONTIER, CORE_ROOT_ENERGY } from './space-core-content';

export type CoreOrder = 'contact' | 'diplomacy' | 'challenge' | 'encounter' | 'root';
export function enableSpaceCore(s: GameState): void {
  const cp = s.checkpoint ? JSON.parse(s.checkpoint) as GameState : null, states = [s, ...(cp ? [cp] : [])];
  const existing = s.space?.core ?? cp?.space?.core;
  const legacyWorlds = existing?.legacyWorlds ?? [...new Set(states.flatMap(v => {
    const p = v.space; if (!p) return [];
    return [...(p.expedition?.worlds.map(w => w.id) ?? []), ...(p.economy?.colonies.map(c => c.planetId) ?? []),
      ...p.log.flatMap(r => [r.planetId, ...(r.fromPlanetId ? [r.fromPlanetId] : [])]),
      ...(p.location ? [p.location.planetId] : []), ...(p.leg ? [p.leg.from.planetId, p.leg.to.planetId] : [])]
      .filter(id => (planetSystem(p.homePlanetId, id)?.index ?? 0) >= CORE_BOUNDARY);
  }))].sort();
  const enable = (v: GameState) => {
    const p = v.space; if (!p?.discoveries || p.core || p.combat?.version !== 2) return false;
    p.core = { version: 1, activated: { ...eventStamp(v), nextCombatSerial: p.combat.archive.battles + p.combat.battles.length + 1 },
      legacyWorlds: [...legacyWorlds], actions: [], nextAction: 1 };
    p.combat.version = 3; for (const key of WARDEN_RESULTS) p.combat.archive[key] = 0; return true;
  };
  enable(s); if (cp && enable(cp)) s.checkpoint = JSON.stringify(cp);
}
export function coreQuote(s: GameState, order: CoreOrder, revision: number) {
  const p = s.space, core = p?.core, l = p?.location, progress = coreProgress(core), world = livingPlanet(s);
  const stars = p ? starSystems(p.homePlanetId) : [], orbital = ['contact', 'diplomacy', 'challenge'].includes(order);
  const planetId = orbital ? stars[CORE_FRONTIER]?.planetId : order === 'encounter' ? stars[CORE_CENTER]?.planetId : l?.planetId;
  const point = order === 'encounter' ? CORE_ENCOUNTER_POSITION : { x: 0, z: 0 }, radius = orbital ? 24 : order === 'root' ? 12 : 6;
  let reason = !p?.ship || !core || p.ship.health <= 0 || s.stage !== 5 || s.deathReason || s.player.health <= 0 ? 'Cesta k jádru vyžaduje živou vlastní loď.'
    : revision !== core.nextAction ? 'Nabídka se změnila. Vyber ji znovu.'
      : p.leg || activeSpaceBattle(p) ? 'Nejprve dokonči let nebo probíhající boj.'
        : !l || l.scale !== (orbital ? 'orbit' : 'surface') || l.planetId !== planetId || !orbital && l.pos.y > 8
          || Math.hypot(l.pos.x - point.x, l.pos.z - point.z) > radius ? orbital ? 'Přileť na orbitu Horkého jantaru23 k majáku do24 kroků.'
            : order === 'encounter' ? 'Přileť k setkání na povrchu Srdce světla31:9,−8, do6 kroků a pod výšku8.' : 'Kořen zasadíš nad cizím povrchem do12 kroků od majáku a pod výškou8.' : '';
  if (!reason && p && core) {
    if (order === 'contact') reason = progress.contact ? 'Tichý val už zná tvoji loď.' : '';
    else if (order === 'diplomacy' || order === 'challenge') {
      reason = !progress.contact ? 'Nejprve osobně oslov hlídku.' : progress.access || core.legacyWorlds.length ? 'Průchod do vnitřní oblasti už máš zachovaný.' : '';
      if (!reason && order === 'diplomacy' && !societyProgress(p.discoveries!).supported) reason = 'Přivez doporučení skutečně rozvinutého Kruhu prvních světel. Pomoz jeho dílně na označené planetě.';
      const last = latestBattle(p);
      if (!reason && order === 'challenge' && last?.end && p.elapsed < last.end.at + COMBAT_REST - 1e-7) reason = `Před dalším soubojem obnov letovou pohotovost: ještě${Math.ceil(last.end.at + COMBAT_REST - p.elapsed)}s.`;
    } else if (order === 'encounter') reason = progress.encounter ? 'Kořen jasu už neseš. Použij jej na cizí planetě a pokračuj v galaxii.' : !progress.access && !core.legacyWorlds.length ? 'Nejprve vyřeš průchod oblastí Tichého valu.' : '';
    else if (order === 'root') reason = !progress.encounter ? 'Kořen jasu získáš osobním setkáním v jádru.' : !world ? 'Domácí planeta si zachovává vlastní ekologii; Kořen použij na cizí planetě.'
      : coreRoot(core, world.id) ? 'Tento svět už má trvalou klimatickou kotvu.' : p.ship!.energy < CORE_ROOT_ENERGY ? 'Kořen potřebuje30 energie. Zastav a dobij loď.' : '';
    else reason = 'Neznámý krok cesty k jádru.';
  }
  return { ok: !reason, reason, planetId: planetId ?? '' };
}
export function applyCoreOrder(s: GameState, order: CoreOrder, revision: number): boolean {
  const p = s.space, q = coreQuote(s, order, revision); if (!p) return false;
  if (!q.ok) { p.notice = q.reason; return false; }
  const core = p.core!, base = { serial: core.nextAction, planetId: q.planetId, ...eventStamp(s) };
  if (order === 'challenge') {
    beginSpaceBattle(s, 'warden', undefined, { contactSerial: coreProgress(core).contact!.serial });
    p.notice = 'Hlídka Tichého valu:108 odolnosti. Její pulz zasahuje za12 po1,4s. WASD manévruje, Mezerník střílí, R/V dovolí ústup. Vítězství otevře celou vnitřní oblast.'; return true;
  }
  let action: CoreAction;
  if (order === 'diplomacy') action = { ...base, kind: 'access', strategy: 'diplomacy', supportSerial: societyProgress(p.discoveries!).supported!.serial };
  else if (order === 'root') {
    const world = livingPlanet(s)!;
    action = { ...base, kind: 'root', localAt: world.elapsed, before: { temperature: world.temperature, atmosphere: world.atmosphere }, work: structuredClone(world.biosphere.work), energyPaid: CORE_ROOT_ENERGY };
  } else action = { ...base, kind: order };
  appendCoreAction(core, p.homePlanetId, action);
  if (action.kind === 'root') {
    p.ship!.energy -= action.energyPaid; stopClimateTool(s); const world = livingPlanet(s)!; world.temperature = 0; world.atmosphere = 0;
  }
  p.notice = order === 'contact' ? 'Tichý val střeží soustavy24–31. Uzná doporučení mladší společnosti, nebo vítězství v hraničním souboji. Úplné dobytí jeho oblasti nepotřebuješ.'
    : order === 'diplomacy' ? 'Tichý val uznal konkrétní pomoc mladší společnosti. Máš bezpečný průchod k jádru a zpět.'
      : order === 'encounter' ? 'Srdce světla ti svěřilo Kořen jasu. Nad cizí planetou za30 energie okamžitě srovnáš klima a trvale zastavíš drift. Život musíš dál přivézt a chránit. Galaxie pokračuje.'
        : 'Kořen jasu ukotvil klima naT3. Původní život i kolonie zůstaly; skutečné role a10s stability nadále rozhodují o obyvatelnosti.';
  return true;
}
export function coreBattleProof(battle: SpaceBattle): CoreBattleProof {
  if (battle.kind !== 'warden' || battle.end?.outcome !== 'won') throw new Error('Chybí skutečné vítězství nad hlídkou jádra.');
  return { battleSerial: battle.serial, planetId: battle.planetId, start: { ...battle.start }, economyAt: battle.economyAt,
    endedAt: battle.end.at, endedEconomyAt: battle.end.economyAt, startingHealth: battle.startingHealth, health: battle.end.health,
    shots: battle.shots, received: battle.received, damage: battle.damage };
}
export function finishCoreBattle(s: GameState, battle: SpaceBattle): void {
  const p = s.space, core = p?.core;
  if (!p || !core || battle.kind !== 'warden' || !battle.end) return;
  if (battle.end.outcome === 'won') {
    appendCoreAction(core, p.homePlanetId, { serial: core.nextAction, kind: 'access', strategy: 'force', planetId: battle.planetId, ...eventStamp(s, battle.end.economyAt), battle: coreBattleProof(battle) });
    p.notice = 'Hlídka ustoupila a Tichý val uznal tvůj průchod. Soustavy24–31 jsou dosažitelné; pokračuj ke Srdci světla. Odolnost ani náklad se nedoplnily.';
  } else if (battle.end.outcome === 'retreated') p.notice = 'Ustoupil jsi hlídce Tichého valu. Náklad a dosavadní postup zůstaly; můžeš opravit loď, zkusit znovu nebo přivézt diplomatické doporučení.';
}
