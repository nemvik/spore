import { describe, expect, it } from 'vitest';
import { canopyGuidance } from '../src/game/canopy-guidance';
import { createGame } from '../src/game/simulation';
import { createWorld, spawnCreature } from '../src/game/world';
import { initializeJourneyStage, journeyHint } from '../src/game/journey';
import { distance } from '../src/game/random';

/** Explicit live-status scenes. Actor positions, intent and simple visibility
 * are prepared to isolate guidance; these are not gameplay or save fixtures. */
function scene() {
  const s = createGame(20260913, false); s.stage = 1;
  s.world = createWorld(s.seed, 1); s.worlds[1] = s.world; initializeJourneyStage(s);
  const site = s.journey.sites.find(site => site.id === 4)!;
  site.observed = true; site.source = { x: 0, y: 7.8, z: 0 };
  site.refuges = [{ x: 0, y: 10.8, z: 10 }, { x: -10, y: -2.6, z: 10 }];
  s.world.resources.find(r => r.id === site.sourceId)!.pos = { ...site.source };
  s.journey.canopy!.releasedAt = 0;
  const sail = s.world.creatures.find(c => c.patch === 1 && c.species === 'sail')!;
  const hunter = s.world.creatures.find(c => c.patch === 1 && c.species === 'ribbon')!;
  s.world.creatures = [sail]; s.world.obstacles = [];
  const plant = { id: s.world.nextId++, kind: 'algae' as const, pos: { ...site.refuges[0] }, patch: 1, amount: 8, max: 12, regen: .09 };
  s.world.resources.push(plant); site.plantedId = plant.id; site.phase = 3;
  Object.assign(sail, { pos: { x: 0, y: 1, z: 5 }, health: 32, fear: 0, intent: 'forage', target: plant.id, cooldown: 0 });
  Object.assign(hunter, { pos: { x: 5, y: 1, z: 5 }, health: 55, intent: 'hunt', target: sail.id });
  s.player.pos = { x: 0, y: 10.8, z: -5 };
  return { s, site, sail, hunter, plant };
}

describe('live canopy guidance', () => {
  it('describes the actual wild worker and correct local detritus route while the crust stays attached', () => {
    const { s, site } = scene(); s.journey.canopy!.releasedAt = null; site.plantedId = null;
    const crust = s.world.resources.find(r => r.id === s.journey.canopy!.crustId)!; crust.pos = { ...site.source };
    const worker = spawnCreature(s.world, 'mender', 1); worker.pos = { ...crust.pos, x: crust.pos.x + 5 }; s.world.creatures.push(worker);
    const food = { id: s.world.nextId++, patch: 1, kind: 'detritus' as const, pos: { ...crust.pos }, amount: 1, max: 1, regen: 0 };
    s.world.resources.push(food); s.journey.offerings.push({ stage: 1, id: food.id, site: 4, remaining: 60 });
    worker.intent = 'forage'; worker.target = food.id;
    expect(canopyGuidance(s, site)!.title).toBe('Štítojem sleduje nabídku');
    worker.intent = 'flee';
    expect(canopyGuidance(s, site)!.title).toContain('utíká'); expect(canopyGuidance(s, site)!.text).toContain('5 m');
    worker.intent = 'forage'; worker.target = crust.id; worker.pos.x = crust.pos.x + 1; worker.cooldown = 3;
    const before = JSON.stringify(s), hint = canopyGuidance(s, site)!;
    expect(hint.title).toBe('Štítojem našel krustu'); expect(hint.text).toContain('tráví předchozí sousto');
    expect(JSON.stringify(s)).toBe(before); expect(s.journey.canopy!.releasedAt).toBeNull();
  });

  it('does not replace unobserved, other-site, historical or non-reef guidance', () => {
    for (const change of [
      ({ s }: ReturnType<typeof scene>) => { s.journey.version = 2; },
      ({ s }: ReturnType<typeof scene>) => { s.journey.legacy = true; },
      ({ s }: ReturnType<typeof scene>) => { s.journey.canopy = null; },
      ({ s }: ReturnType<typeof scene>) => { s.stage = 2; },
      ({ site }: ReturnType<typeof scene>) => { site.observed = false; },
      ({ site }: ReturnType<typeof scene>) => { site.id = 3; },
    ]) { const fixture = scene(); change(fixture); expect(canopyGuidance(fixture.s, fixture.site)).toBeNull(); }
  });

  it('explains the actual crust bite and worker alternative instead of presenting T as detachment', () => {
    const { s, site } = scene(); site.plantedId = null; s.journey.canopy!.releasedAt = null;
    const guidance = canopyGuidance(s, site)!;
    expect(guidance.title).toContain('Krusta'); expect(guidance.text).toMatch(/Filtr.*recyklátor.*štítojem/);
    expect(guidance.choices.join(' ')).toMatch(/mezerníkem.*T přirostlou krustu nevezme/);
    expect(guidance.text).not.toMatch(/Žábry|žábry|Spodní kořeny/);
  });

  it('states local grazer loss before release without promising an unavailable immediate recovery', () => {
    const { s, site } = scene(); site.plantedId = null; s.journey.canopy!.releasedAt = null; s.world.creatures = [];
    const guidance = canopyGuidance(s, site)!;
    expect(guidance.text).toContain('nezůstal živý plachtovec');
    expect(guidance.choices[1]).toMatch(/Až krusta povolí.*T · probudit zárodek/);
  });

  it('distinguishes the rising source from the settled canopy and gives the actual relative height', () => {
    const { s, site } = scene(); site.plantedId = null; s.player.pos.y = -3; site.source.y = 2;
    let guidance = canopyGuidance(s, site)!;
    expect(guidance.title).toBe('Řasa stoupá komínem'); expect(guidance.choices[0]).toContain('5 m nad tebou');
    expect(guidance.choices[0]).toContain('Q · vystoupat');
    site.source.y = 7.8; s.player.pos.y = 11.4; guidance = canopyGuidance(s, site)!;
    expect(guidance.title).toBe('Baldachýn se rozevřel'); expect(guidance.text).not.toContain('stoupá');
    expect(guidance.choices[0]).toContain('C · sestoupit');
  });

  it('prioritizes actual flight over a stale plant target and describes an injured animal below the upper root', () => {
    const { s, site, sail, hunter, plant } = scene(); s.world.creatures.push(hunter);
    Object.assign(sail, { health: 17, intent: 'flee', fear: 2.4, target: plant.id });
    const guidance = canopyGuidance(s, site)!;
    expect(guidance.title).toBe('Plachtovec prchá, nečeká na jídlo');
    expect(guidance.text).toMatch(/Zraněný plachtovec prchá před stužkohrotem/);
    expect(guidance.text).toContain('10 m pod porostem');
    expect(guidance.choices.join(' ')).toContain('C · sestoupit');
    expect(guidance.text).not.toMatch(/K porostu míří|první.*hostinu/);
  });

  it('identifies player-induced flight without falsely blaming an absent predator', () => {
    const { s, site, sail } = scene(); sail.intent = 'flee'; s.player.pos = { x: 0, y: 1, z: 0 };
    s.player.genome.parts.push({ id: 'guide-jaw', kind: 'jaw', axial: 0, angle: 0, scale: 1, mirrored: false });
    const guidance = canopyGuidance(s, site)!;
    expect(guidance.text).toContain('utíká před tebou'); expect(guidance.text).not.toContain('před stužkohrotem');
    expect(guidance.choices[0]).toContain('Ustup od plachtovce');
  });

  it('does not invent a nearby hunter when a flight persists after the danger has gone', () => {
    const { s, site, sail } = scene(); sail.intent = 'flee'; sail.fear = 1; s.player.pos.x = 60;
    const guidance = canopyGuidance(s, site)!;
    expect(guidance.text).toContain('ještě prchá před nebezpečím');
    expect(guidance.choices[0]).not.toContain('Odveď lovce');
  });

  it('sees danger around the approaching grazer even when the hunter is far from the plant', () => {
    const { s, site, sail, hunter, plant } = scene();
    sail.pos = { x: 0, y: -4, z: -10 }; hunter.pos = { x: 0, y: -3, z: -7 }; s.world.creatures.push(hunter);
    expect(distance(hunter.pos, plant.pos)).toBeGreaterThan(12);
    const guidance = canopyGuidance(s, site)!;
    expect(guidance.title).toBe('Lovec ohrožuje příchod'); expect(guidance.text).toContain('15 m pod porostem');
  });

  it('names the distant grazer when a nearby hunter threatens the pasture, keeping their distances distinct', () => {
    const { s, site, sail, hunter, plant } = scene();
    // Isolated counterpart of the v10b observation119 wording: the hunter is
    // beside the root, while the animal needing guidance is far to the west.
    plant.pos = { x: 0, y: 10.8, z: 10 };
    s.player.pos = { x: -4, y: 7.8, z: 10 };
    sail.pos = { x: -60, y: 7.8, z: 10 }; sail.intent = 'rest'; sail.target = null;
    hunter.pos = { x: 5, y: 10.8, z: 10 }; hunter.intent = 'rest'; hunter.target = null;
    s.world.creatures.push(hunter);
    const before = JSON.stringify(s), hint = canopyGuidance(s, site)!;
    expect(distance(hunter.pos, plant.pos)).toBe(5);
    expect(hint.title).toBe('Lovec ohrožuje příchod');
    expect(hint.text).toContain('Stužkohrot má výhled na novou pastvu.');
    expect(hint.text).toContain('Plachtovce od porostu dělí 60 m; plave 3 m pod porostem.');
    expect(hint.choices.join(' ')).toContain('56 m západně od tebe');
    expect(JSON.stringify(s)).toBe(before);
    // Moving only the grazer changes its distance and height in the warning.
    sail.pos = { x: -40, y: 10.8, z: 10 };
    expect(canopyGuidance(s, site)!.text).toContain('Plachtovce od porostu dělí 40 m; plave v úrovni porostu.');
    expect(distance(hunter.pos, plant.pos)).toBe(5);
  });

  it('describes danger on a clear straight approach but respects a real screen between that route and the hunter', () => {
    const { s, site, sail, hunter, plant } = scene();
    plant.pos = { x: 0, y: 0, z: 20 }; sail.pos = { x: 0, y: 0, z: -20 };
    hunter.pos = { x: 4, y: 0, z: 0 }; hunter.intent = 'rest'; hunter.target = null; s.world.creatures.push(hunter);
    expect(distance(hunter.pos, sail.pos)).toBeGreaterThan(13); expect(distance(hunter.pos, plant.pos)).toBeGreaterThan(12);
    expect(canopyGuidance(s, site)!.title).toBe('Lovec ohrožuje příchod');
    s.world.obstacles.push({ id: s.world.nextId++, kind: 'rock', pos: { x: 2, y: -2, z: 0 }, radius: .8, height: 4 });
    expect(canopyGuidance(s, site)!.title).toBe('Plachtovci našli novou pastvu');
  });

  it('reports actual approaching count, closest distance and height without counting flight or dead actors', () => {
    const { s, site, sail, plant } = scene();
    s.world.creatures.push({ ...sail, id: s.world.nextId++, pos: { ...plant.pos, x: 4 } });
    s.world.creatures.push({ ...sail, id: s.world.nextId++, health: 0, pos: { ...plant.pos } });
    const guidance = canopyGuidance(s, site)!;
    expect(guidance.text).toContain('míří 2 plachtovci'); expect(guidance.text).toContain('4 m');
    expect(guidance.text).toContain('v úrovni porostu');
  });

  it('states arrival and an existing digestion pause separately from an animal still approaching', () => {
    const { s, site, sail, plant } = scene(); sail.pos = { ...plant.pos, x: .8 }; sail.cooldown = 4;
    const guidance = canopyGuidance(s, site)!;
    expect(guidance.title).toBe('Plachtovec dorazil k pastvě'); expect(guidance.text).toContain('tráví předchozí sousto');
  });

  it('does not tell a player beneath the actual roof lip to ascend straight through it', () => {
    const { s, site } = scene(); site.plantedId = null;
    s.player.genome.width = .85; s.player.pos = { x: .5, y: .7, z: -1.5 };
    const id = s.journey.canopy!.roofIds[0];
    s.world.obstacles = [{ id, kind: 'rock', pos: { x: 0, y: 1.5, z: -8 }, radius: 6, height: 1.4 }];
    const before = JSON.stringify(s), hint = canopyGuidance(s, site)!;
    expect(hint.title).toBe('Pod okrajem baldachýnu'); expect(hint.choices[0]).toContain('doprostřed otvoru');
    expect(JSON.stringify(s)).toBe(before);
    s.player.pos.z = 0; expect(canopyGuidance(s, site)!.title).toBe('Baldachýn se rozevřel');
    s.player.pos = { x: .5, y: 4, z: -1.5 }; expect(canopyGuidance(s, site)!.title).toBe('Baldachýn se rozevřel');
  });

  it('shows explicit local extinction despite live grazers in another patch or a dead local grazer', () => {
    const { s, site, sail } = scene(); sail.health = 0;
    s.world.creatures.push({ ...sail, id: s.world.nextId++, health: 32, patch: 0 });
    const guidance = canopyGuidance(s, site)!;
    expect(guidance.title).toBe('Les přišel o plachtovce');
    expect(guidance.choices[0]).toContain('T · probudit zárodek plachtovce');
    expect(guidance.choices[1]).toContain('sousto řasy');
    expect(guidance.choices.join(' ')).not.toMatch(/čekej|sekund|minut/);
  });

  it('explains when another actual food target is diverting the animal', () => {
    const { s, site, sail } = scene(); sail.target = site.sourceId;
    const guidance = canopyGuidance(s, site)!;
    expect(guidance.title).toBe('Plachtovec míří k jiné potravě');
    expect(guidance.choices[0]).toMatch(/T vezmi řasu nebo nektar.*E nabídni/);
  });

  it('recognizes a real nectar invitation from another niche without calling it the planted root', () => {
    const { s, site, sail, plant } = scene();
    const food = { id: s.world.nextId++, kind: 'nectar' as const, pos: { ...sail.pos, x: sail.pos.x + 5 }, amount: 1, max: 1, regen: 0, patch: 0 };
    s.world.resources.push(food); s.journey.offerings.push({ id: food.id, site: 3, stage: 1, remaining: 120 });
    sail.target = food.id;
    const before = JSON.stringify(s), guidance = canopyGuidance(s, site)!;
    expect(guidance.title).toBe('Plachtovec sleduje nabídku');
    expect(guidance.text).toContain('ještě ne k porostu');
    expect(guidance.text).not.toContain('Jiná potrava jej vede mimo');
    expect(food.id).not.toBe(plant.id); expect(site.resolved).toBe(false); expect(JSON.stringify(s)).toBe(before);
    s.journey.offerings[0].remaining = 0;
    expect(canopyGuidance(s, site)!.title).toBe('Plachtovec míří k jiné potravě');
  });

  it('names the chosen upper or sheltered route only when its live stream really exists', () => {
    const { s, site, plant } = scene(); site.resolved = true; site.method = 'cultivate';
    expect(canopyGuidance(s, site)!.title).toBe('Živá stuha z horní opory');
    plant.pos = { ...site.refuges[1] };
    expect(canopyGuidance(s, site)!.title).toBe('Živá stuha z boční zátoky');
    plant.amount = 0;
    expect(canopyGuidance(s, site)!.title).toBe('Poznání zůstalo, živá stuha chybí');
    expect(canopyGuidance(s, site)!.text).not.toContain('teď čistí vodu');
  });

  it.each([
    [0, -12, 'severně'], [12, -12, 'severovýchodně'], [12, 0, 'východně'], [12, 12, 'jihovýchodně'],
    [0, 12, 'jižně'], [-12, 12, 'jihozápadně'], [-12, 0, 'západně'], [-12, -12, 'severozápadně'],
  ] as const)('locates the selected animal from the player at offset(%s,%s), independent of heading', (x, z, direction) => {
    const { s, sail } = scene(); s.player.pos = { x: 2, y: 4, z: 3 };
    sail.pos = { x: 2 + x, y: 4, z: 3 + z };
    const expected = `${Math.round(Math.hypot(x, z))} m ${direction} od tebe`;
    const before = JSON.stringify(s), hint = journeyHint(s)!;
    expect(hint.choices.join(' ')).toContain(expected); expect(hint.choices.join(' ')).toContain('ve stejné výšce');
    expect(JSON.stringify(s)).toBe(before);
    for (const heading of [0, .8, -2, Math.PI]) {
      s.player.heading = heading; expect(journeyHint(s)!.choices).toEqual(hint.choices);
    }
  });

  it('separates player-relative horizontal distance and depth, including an animal directly overhead', () => {
    const { s, sail } = scene(); s.player.pos = { x: 2, y: 4, z: 3 };
    sail.pos = { x: 2, y: -1, z: 13 };
    let text = journeyHint(s)!.choices.join(' ');
    expect(text).toContain('10 m jižně od tebe'); expect(text).toContain('5 m níž. C · sestoupit');
    sail.pos = { x: 2, y: 9, z: 3 };
    text = journeyHint(s)!.choices.join(' ');
    expect(text).toContain('přímo u tebe'); expect(text).toContain('5 m výš. Q · vystoupat');
    expect(text).not.toContain('m severně');
  });

  it('keeps a healthy actual pasture approach in focus instead of sending the player after an injured straggler', () => {
    const { s, sail, plant } = scene(); s.player.pos = { x: 0, y: 1, z: 0 }; sail.pos = { x: 8, y: 1, z: 0 };
    s.world.creatures.push({ ...sail, id: s.world.nextId++, health: 17, intent: 'flee', pos: { x: -20, y: 1, z: 0 }, target: plant.id });
    const before = JSON.stringify(s), hint = journeyHint(s)!;
    expect(hint.title).toBe('Plachtovci našli novou pastvu'); expect(hint.text).toContain('Jiný plachtovec prchá');
    expect(hint.choices.join(' ')).toContain('8 m východně od tebe');
    expect(hint.choices.join(' ')).not.toContain('20 m západně'); expect(JSON.stringify(s)).toBe(before);
    // In this state both really forage; the healthy one still has a stable useful focus.
    s.world.creatures[1].intent = 'forage'; s.world.creatures[1].pos = { ...plant.pos, x: -.2 };
    expect(journeyHint(s)!.choices.join(' ')).toContain('8 m východně od tebe');
  });

  it('still warns about the selected approach and an exposed pasture despite another animal fleeing', () => {
    const { s, sail, hunter, plant } = scene(); s.player.pos = { x: 0, y: 1, z: 0 }; sail.pos = { x: 8, y: 1, z: 0 };
    s.world.creatures.push({ ...sail, id: s.world.nextId++, health: 17, intent: 'flee', pos: { x: -30, y: 1, z: 0 } });
    hunter.hunger = 70; hunter.pos = { x: 10, y: 1, z: 0 }; hunter.target = sail.id; s.world.creatures.push(hunter);
    let hint = journeyHint(s)!;
    expect(hint.title).toBe('Lovec ohrožuje příchod'); expect(hint.choices.join(' ')).toContain('8 m východně od tebe');
    expect(hint.text).toContain('Jiný plachtovec prchá');
    sail.pos = { x: 30, y: -4, z: -20 }; hunter.pos = { ...plant.pos }; hunter.intent = 'rest'; hunter.target = null;
    s.world.obstacles.push({ id: s.world.nextId++, kind: 'rock', pos: { x: 15, y: 0, z: -5 }, radius: 1, height: 8 });
    hint = journeyHint(s)!; expect(hint.title).toBe('Lovec ohrožuje příchod'); expect(hint.text).toContain('novou pastvu');
  });

  it('keeps the v9c diagnostic offer target distinct from the upper root, while locating its healthy follower east of the player', () => {
    // Positions/intent from upper-pasture-search.json. Geometry is isolated here;
    // this checks the public hint's meaning, not a replay of the native route.
    const { s, site, sail, hunter, plant } = scene();
    s.player.pos = { x: 8.203444052076813, y: -4.310247562616958, z: -12.534336775565794 };
    plant.pos = { x: 37, y: 10.8, z: -22 };
    const offer = { id: s.world.nextId++, kind: 'algae' as const, pos: { x: 43.224457119057554, y: -.6631987323670185, z: -16.29541310504592 }, amount: 1, max: 1, regen: 0, patch: 1 };
    s.world.resources.push(offer); s.journey.offerings.push({ id: offer.id, site: site.id, stage: 1, remaining: 94.45 });
    sail.pos = { x: 62.62301692132604, y: -4.145525854651075, z: 2.5208041733696542 }; sail.target = offer.id;
    s.world.creatures.push({ ...sail, id: s.world.nextId++, health: 17, intent: 'flee', pos: { x: 69.4158298855039, y: -4.000828759592952, z: -18.492267876365403 } });
    let hint = journeyHint(s)!;
    expect(hint.title).toBe('Plachtovec sleduje nabídku'); expect(hint.text).toContain('ještě ne k porostu');
    expect(hint.choices.join(' ')).toContain('56 m východně od tebe');
    hunter.pos = { x: 60.30982834377249, y: -3.0934087233907706, z: -11.95260101149772 };
    hunter.hunger = 44.92; hunter.target = s.world.creatures[1].id; s.world.creatures.push(hunter);
    hint = journeyHint(s)!;
    expect(hint.title).toBe('Lovec ohrožuje příchod'); expect(hint.text).toContain('cestu k nabídce');
    expect(hint.choices.join(' ')).toContain('56 m východně od tebe');
    s.journey.offerings[0].remaining = 0; s.world.creatures = s.world.creatures.filter(c => c !== hunter);
    expect(journeyHint(s)!.title).toBe('Plachtovec prchá, nečeká na jídlo');
  });

  it('does not mutate ecology, RNG, actor targets, geometry or progression when repeatedly queried', () => {
    const { s, site, hunter } = scene(); s.world.creatures.push(hunter);
    const before = JSON.stringify(s), first = canopyGuidance(s, site);
    for (let i = 0; i < 30; i++) expect(canopyGuidance(s, site)).toEqual(first);
    expect(JSON.stringify(s)).toBe(before);
  });
});
