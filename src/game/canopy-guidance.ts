import { bodyCollisionRadius } from './body-shape';
import type { Creature, GameState, Vec3 } from './types';
import type { EcologySite } from './journey-types';
import { hunterThreatening } from './hunter-appetite';
import { has } from './genome';
import { distance } from './random';
import { lineBlocked } from './interactions';
import { livingStreams } from './journey-network';
import { CANOPY_COPY } from './reef-canopy';
import { obstacleSegmentEntry } from './obstacle-geometry';

export interface CanopyGuidance { title: string; text: string; choices: string[] }

const meters = (value: number) => Math.max(1, Math.round(value));
function heightAt(pos: Vec3, reference: Vec3): string {
  const dy = pos.y - reference.y;
  return Math.abs(dy) > 2.2 ? `${meters(Math.abs(dy))} m ${dy > 0 ? 'nad porostem' : 'pod porostem'}` : 'v úrovni porostu';
}
const COMPASS_DIRECTIONS = ['severně', 'severovýchodně', 'východně', 'jihovýchodně', 'jižně', 'jihozápadně', 'západně', 'severozápadně'] as const;
function findAnimal(s: GameState, c: Creature): string {
  const dx = c.pos.x - s.player.pos.x, dz = c.pos.z - s.player.pos.z, dy = c.pos.y - s.player.pos.y;
  const horizontal = Math.hypot(dx, dz);
  // North is -Z on the existing map. Camera orbit and body heading must not
  // reverse a direction while the player searches for the same live animal.
  const direction = (Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) + 8) % 8;
  const where = horizontal < 1.5 ? 'přímo u tebe' : `${meters(horizontal)} m ${COMPASS_DIRECTIONS[direction]} od tebe`;
  const height = dy < -2.2 ? `${meters(-dy)} m níž. C · sestoupit.`
    : dy > 2.2 ? `${meters(dy)} m výš. Q · vystoupat.` : 've stejné výšce.';
  return `Plachtovec: ${where}; ${height}`;
}

function approach(c: Creature, plant: Vec3): string {
  return `Plachtovce od porostu dělí ${meters(distance(c.pos, plant))} m; plave ${heightAt(c.pos, plant)}.`;
}
function nearestPoint(start: Vec3, end: Vec3, point: Vec3): Vec3 {
  const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy + (point.z - start.z) * dz) / Math.max(.001, dx * dx + dy * dy + dz * dz)));
  return { x: start.x + dx * t, y: start.y + dy * t, z: start.z + dz * t };
}

/** Describe live actors and food, never advance an encounter or infer a wait
 * timer. A stale forage target must not hide the animal's current flight. */
export function canopyGuidance(s: GameState, site: EcologySite): CanopyGuidance | null {
  if (s.stage !== 1 || s.journey.version !== 3 || s.journey.legacy || !s.journey.canopy || site.id !== 4 || site.stage !== 1 || !site.observed) return null;
  const canopy = s.journey.canopy, plant = s.world.resources.find(r => r.id === site.plantedId);
  const sails = s.world.creatures.filter(c => c.species === 'sail' && c.patch === 1 && c.health > 0);
  if (site.resolved) {
    if (!livingStreams(s).some(stream => stream.id === 'supply-4')) return {
      title: 'Poznání zůstalo, živá stuha chybí',
      text: s.journey.reefEvolution ? 'Zapsaná obnova zůstává. Živý přítok ani výstup teď nepracuje.' : 'Zapsaná obnova zůstává. Nová pastva teď neposílá čistou vodu k průduchu.',
      choices: ['Odeber u mateřské řasy nový vzorek a založ živý porost na zvolené opoře.'],
    };
    const closest = [...site.refuges].sort((a, b) => distance(a, plant!.pos) - distance(b, plant!.pos))[0];
    const upper = closest && closest.y === Math.max(...site.refuges.map(pos => pos.y));
    if (s.journey.reefEvolution) return { title: upper ? 'Průduch táhne vzhůru' : 'Hluboký přítok ožil', text: upper ? 'Horní pastva vytáhla výstupní proud nad průduch. Dole zůstává plyn.' : 'Boční pastva čistí proud do průduchu. Část plynu zůstává; otevřený filtr jej může zachytit.', choices: [upper ? 'Q · vystoupat v jádru proudu. Pro sestup plav mimo jeho střed.' : 'Sleduj čiré částice podél dna. Otevřený filtr čistí více a plave pomaleji.', 'Jinou oporou změníš další cestu. Porost potřebuje živého návštěvníka.'] };
    return { title: upper ? 'Živá stuha z horní opory' : 'Živá stuha z boční zátoky', text: CANOPY_COPY.established,
      choices: [upper ? 'Horní opora drží pastvu nad baldachýnem. Sleduj od ní proud k průduchu.' : 'Boční zátoka kryje pastvu pod okrajem. Sleduj od ní proud k průduchu.', 'U živého porostu doplň dech; v průduchu se drž viditelné stuhy čisté vody.'] };
  }
  if (canopy.releasedAt === null) {
    const crust = s.world.resources.find(r => r.id === canopy.crustId)!;
    const offers = s.journey.offerings.filter(o => o.stage === 1 && o.remaining > 0)
      .map(o => s.world.resources.find(r => r.id === o.id && r.amount >= .5 && ['detritus', 'mineral'].includes(r.kind))).filter(Boolean);
    const workers = s.world.creatures.filter(c => c.species === 'mender' && c.patch === 1 && c.health > 0)
      .sort((a, b) => Number(b.target === crust.id) - Number(a.target === crust.id) || distance(a.pos, crust.pos) - distance(b.pos, crust.pos));
    const worker = workers[0];
    if (worker && (offers.length || worker.target === crust.id)) {
      const gap = meters(distance(worker.pos, crust.pos));
      if (worker.intent === 'flee') return {
        title: 'Štítojem utíká před nebezpečím',
        text: `Nabídka existuje, ale pracovník prchá. Od krusty jej dělí ${gap} m.`,
        choices: ['Odveď hladového lovce na opačnou stranu, nebo jej nasyť masem. Toxin plaší i pracovníka.', 'Štítojem potřebuje doplout ke krustě; nabídnuté sousto samo střechu neotevře.'],
      };
      if (worker.target === crust.id) return {
        title: 'Štítojem našel krustu',
        text: `Pracovník je ${gap} m od jedlé vazby.` + (worker.cooldown > 0 && gap <= 2 ? ' Ještě tráví předchozí sousto.' : ' Připlouvá ji spást.'),
        choices: ['Udrž lovce stranou a nech pracovníkovi volnou cestu.', 'Až krusta povolí, chyť stoupající mateřskou řasu. T · odebrat vzorek.'],
      };
      return {
        title: worker.intent === 'forage' && offers.some(r => r!.id === worker.target) ? 'Štítojem sleduje nabídku' : 'Doveď štítojema pod strop',
        text: `Od krusty jej dělí ${gap} m. Detrit nebo minerály nabídni blíž k vazbě a mimo lovcův výhled.`,
        choices: ['T zvedne i tvé položené sousto; E je nabídne na novém místě.', CANOPY_COPY.approaches],
      };
    }
    return {
    title: 'Krusta drží baldachýn',
    text: CANOPY_COPY.closed + (sails.length ? '' : ' V lese už nezůstal živý plachtovec.'),
    choices: ['Klikni na krustu a mezerníkem ji spas. Nebo T vezmi detrit či minerály a E přiveď štítojema. T přirostlou krustu nevezme.',
      sails.length ? CANOPY_COPY.approaches : 'Až krusta povolí, vrať se k mateřské řase. T · probudit zárodek plachtovce; potřebuje sousto řasy.'],
    };
  }
  if (!sails.length) return {
    title: 'Les přišel o plachtovce',
    text: 'Žádný místní plachtovec nepřežil. Novou pastvu teď nemá kdo ochutnat.',
    choices: ['Vrať se k mateřské řase. T · probudit zárodek plachtovce.', 'Zárodek potřebuje skutečné sousto řasy z mateřského porostu, tvé nabídky nebo nesené potravy.'],
  };
  if (!plant || site.vitality <= 0) {
    const dy = site.source.y - s.player.pos.y;
    const radius = bodyCollisionRadius(s.player.genome,s.stage);
    const blockedAscent = dy > 2.2 && s.world.obstacles.some(o => canopy.roofIds.includes(o.id)
      && s.player.pos.y < o.pos.y
      && obstacleSegmentEntry(s.player.pos, { ...s.player.pos, y: o.pos.y + o.height + radius + .1 }, o, radius) !== null);
    if (blockedAscent) return {
      title: 'Pod okrajem baldachýnu',
      text: 'Řasa je nad tebou, ale přímý výstup cloní okraj střechy. Její světelný stonek ukazuje mateřský porost, nikoli volný průchod pro celé tělo.',
      choices: ['Vpluj doprostřed otvoru mezi čtyřmi laloky. Potom Q · vystoupat; T · odebrat vzorek.', 'Jiná cesta vede kolem vnějšího okraje střechy. Mateřská řasa zůstává dostupná u hladiny.'],
    };
    return { title: site.source.y < 7.75 ? 'Řasa stoupá komínem' : 'Baldachýn se rozevřel',
      text: site.source.y < 7.75 ? CANOPY_COPY.moving : 'Mateřská řasa se vznáší pod hladinou. Odeber z ní živý vzorek a vyber novou pastvu.',
      choices: [Math.abs(dy) > 2.2 ? `Mateřská řasa je ${meters(Math.abs(dy))} m ${dy > 0 ? 'nad tebou. Q · vystoupat' : 'pod tebou. C · sestoupit'}; T · odebrat vzorek.` : 'Přibliž se k mateřské řase a stiskni T · odebrat vzorek.', (s.journey.reefEvolution ? 'Horní kruh → výstup z průduchu. Boční zátoka → hluboký přítok. Obě pastvy musí ochutnat plachtovec.' : CANOPY_COPY.planted)] };
  }

  const predators = s.world.creatures.filter(c => hunterThreatening(s, c));
  const nearbyHunter = (c: Creature) => predators.some(h => distance(h.pos, c.pos) < 13 && !lineBlocked(s, h.pos, c.pos));
  const threateningPlayer = (c: Creature) => (has(s.player.genome, 'jaw') || has(s.player.genome, 'spines') || c.fear > 0) && distance(c.pos, s.player.pos) < 12 && !lineBlocked(s, c.pos, s.player.pos);
  const byDistance = (a: Creature, b: Creature) => distance(a.pos, plant.pos) - distance(b.pos, plant.pos) || a.id - b.id;
  const byReadiness = (a: Creature, b: Creature) => Number(a.health < 32) - Number(b.health < 32) || byDistance(a, b);
  const approaching = sails.filter(c => c.intent === 'forage' && c.target === plant.id).sort(byReadiness);
  const offeredFood = (c: Creature) => c.intent === 'forage' ? s.world.resources.find(r => r.id === c.target && r.amount >= .5
    && (r.kind === 'algae' || r.kind === 'nectar')
    && s.journey.offerings.some(o => o.id === r.id && o.stage === s.stage && o.remaining > 0)) : undefined;
  const followingOffers = sails.filter(c => !!offeredFood(c)).sort(byReadiness);
  // A live approach can finish the pasture while a straggler flees elsewhere.
  // Keep that productive animal in focus, without calling an offer the pasture.
  const focusedForagers = approaching.length ? approaching : followingOffers;
  const fleeing = sails.filter(c => c.intent === 'flee').sort(byDistance)[0];
  if (fleeing && !focusedForagers.length) {
    const fromPlayer = threateningPlayer(fleeing), fromHunter = nearbyHunter(fleeing);
    const reason = fromPlayer ? 'utíká před tebou' : fromHunter ? 'prchá před stužkohrotem' : 'ještě prchá před nebezpečím';
    return { title: 'Plachtovec prchá, nečeká na jídlo',
      text: `${fleeing.health < 32 ? 'Zraněný plachtovec' : 'Plachtovec'} ${reason}. ${approach(fleeing, plant.pos)}`,
      choices: [fromPlayer ? 'Ustup od plachtovce za kryt. Čelist, ostny i čerstvý útok jej plaší; potravu nabídni z odstupu.' : fromHunter ? 'Odveď lovce od hejna nebo mu nabídni maso mimo příchod k porostu. Nenechávej prchajícího plachtovce samotného.' : 'Nech plachtovci volnou cestu k porostu. Nabídnutá řasa jej může přivést k pastvě; přibližuj se z odstupu.', findAnimal(s, fleeing)] };
  }
  const riskFor = (c: Creature) => {
    if (nearbyHunter(c)) return 'animal';
    if (predators.some(h => h.target === c.id && h.intent === 'hunt')) return 'hunt';
    const destination = c.intent === 'forage' && c.target === plant.id ? plant : offeredFood(c);
    if (destination && !lineBlocked(s, c.pos, destination.pos) && predators.some(h => {
      const point = nearestPoint(c.pos, destination.pos, h.pos);
      return distance(h.pos, point) < 12 && !lineBlocked(s, h.pos, point);
    })) return destination.id === plant.id ? 'route' : 'offer-route';
    return null;
  };
  const atRisk = (focusedForagers.length ? focusedForagers : sails).map(c => ({ c, kind: riskFor(c) })).filter(risk => risk.kind !== null).sort((a, b) => byDistance(a.c, b.c))[0];
  const exposedPasture = predators.some(h => distance(h.pos, plant.pos) < 12 && !lineBlocked(s, h.pos, plant.pos));
  if (atRisk || exposedPasture) {
    const c = atRisk?.c ?? focusedForagers[0] ?? [...sails].sort(byDistance)[0];
    const danger = atRisk?.kind === 'hunt' ? 'Stužkohrot pronásleduje plachtovce.' : `Stužkohrot má výhled na ${atRisk?.kind === 'animal' ? 'plachtovce' : atRisk?.kind === 'route' ? 'cestu k porostu' : atRisk?.kind === 'offer-route' ? 'cestu k nabídce' : 'novou pastvu'}.`;
    const count = approaching.length > 1 ? ` K porostu míří ${approaching.length} ${approaching.length < 5 ? 'plachtovci' : 'plachtovců'}.` : '';
    const others = fleeing ? ' Jiný plachtovec prchá.' : '';
    return { title: 'Lovec ohrožuje příchod', text: `${danger}${count} ${approach(c, plant.pos)}${others}`,
      choices: ['Odveď stužkohrota za korál, nebo T vezmi maso a E je nabídni stranou od hejna. Samotná výsadba lovce nezastaví.', findAnimal(s, c)] };
  }
  if (approaching.length) {
    const c = approaching[0], count = approaching.length === 1 ? 'K porostu míří plachtovec.' : `K porostu míří ${approaching.length} ${approaching.length < 5 ? 'plachtovci' : 'plachtovců'}.`;
    const arrived = distance(c.pos, plant.pos) < 2, others = fleeing ? ' Jiný plachtovec prchá; k ochutnání stačí jeden.' : '';
    return { title: arrived ? 'Plachtovec dorazil k pastvě' : 'Plachtovci našli novou pastvu',
      text: (arrived ? c.cooldown > 0 ? 'Plachtovec je u porostu a ještě tráví předchozí sousto.' : 'Plachtovec je přímo u porostu a může jej ochutnat.' : `${count} ${approach(c, plant.pos)}`) + others,
      choices: [findAnimal(s, c), 'Drž lovce mimo jeho příchod. Řasa nebo nektar nabídnuté stranou mohou jeho cestu změnit.'] };
  }
  const c = followingOffers[0] ?? [...sails].sort(byDistance)[0], offer = offeredFood(c);
  const otherFood = c.intent === 'forage' && s.world.resources.some(r => r.id === c.target && r.amount >= .5);
  return { title: offer ? 'Plachtovec sleduje nabídku' : otherFood ? 'Plachtovec míří k jiné potravě' : 'Přiveď plachtovce k porostu',
    text: `${offer ? 'Plachtovec míří k nabídnutému soustu, ještě ne k porostu.' : otherFood ? 'Jiná potrava jej vede mimo novou pastvu.' : 'Živý plachtovec je v lese, ale k nové pastvě právě nemíří.'} ${approach(c, plant.pos)}${fleeing ? ' Jiný plachtovec prchá.' : ''}`,
    choices: ['T vezmi řasu nebo nektar a E nabídni sousto blíž k nové pastvě, mimo lovcův výhled.', findAnimal(s, c)] };
}
