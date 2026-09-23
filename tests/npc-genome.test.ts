import { feedTarget } from '../src/game/interactions';
import { jawContacts } from '../src/game/anatomy';
import { mouthWorldPosition } from '../src/game/locomotion';
import { creatureDiscoveryClassicFixture } from './fixtures/creature-stage';
import { creatureLibraryLandFixture } from './fixtures/creature-library';
import { createTribe } from '../src/game/tribe';
import { stepTribeWildlife } from '../src/game/tribe-wildlife';
import { journeyForageTarget } from '../src/game/journey';
import { groundHeight } from '../src/game/random';
import { describe, expect, it } from 'vitest';
import { buildNpcDesigns, compatibleCreature, generatedNpcGenome, landEligible, validateNpcDesigns, worldSpecies } from '../src/game/npc-genome';
import { newCreation } from '../src/game/creature-library';
import { speciesById } from '../src/game/content';
import { computeStats, initialGenome, validateGenome } from '../src/game/genome';
import { createGame, makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { parseGame, serializeGame } from '../src/game/persistence';
import { createWorld, spawnCreature } from '../src/game/world';
import { initializeCreatureStage, speciesAbilities, startEncounter, stepCreatureStage, performSpeciesAction } from '../src/game/creature-stage';
import { initializeJourneyStage } from '../src/game/journey';
import { speciesGroundClearance } from '../src/game/anatomy';
import { creatureCapabilities } from '../src/game/creature-capabilities';
import { createSpeciesModel, disposeObject } from '../src/render/organism';
import { creatureStageFixture } from './fixtures/creature-stage';
import { creatureStageMarkup } from '../src/ui/creature-stage';
import { EMPTY_INPUT } from '../src/game/types';

describe('genome-backed land population', () => {
  it.each([0, 1, 481516, 4294967295])('generates valid ecological bodies for seed %s', seed => {
    const designs = buildNpcDesigns([], seed); expect(() => validateNpcDesigns(designs)).not.toThrow();
    for (const d of designs) { expect(validateGenome(d.creation.genome, 2)).toEqual([]); expect(d.source).toBe('generated'); expect(compatibleCreature(d.creation.genome, speciesById(d.species))).toBe(true); }
  });
  it('selects compatible saved creatures deterministically without shared mutable ownership', () => {
    const g = generatedNpcGenome(speciesById('bell'), 3); g.name = 'Starý přítel';
    const old = newCreation(g, 'vlastní', 'friend', 10), hunter = newCreation(generatedNpcGenome(speciesById('crest'), 7), '', 'hunter', 10);
    const selected = buildNpcDesigns([old, hunter], 481516);
    expect(selected).toEqual(buildNpcDesigns([hunter, old], 481516));
    expect(selected[0].creation).toEqual(old); expect(selected[3].creation).toEqual(hunter);
    expect(selected[0].creation.genome).not.toBe(old.genome);
    old.genome.name = 'Změna v knihovně'; expect(selected[0].creation.genome.name).toBe('Starý přítel');
  });
  it('does not populate land with aquatic, carnivore-grazer or breathless bodies', () => {
    expect(landEligible(initialGenome())).toBe(false);
    const predator = generatedNpcGenome(speciesById('crest'), 0);
    expect(compatibleCreature(predator, speciesById('bell'))).toBe(false);
    predator.parts = predator.parts.filter(p => p.kind !== 'lungs'); expect(landEligible(predator)).toBe(false);
  });
  it('shares body, diet, movement, armor and bite with the editor and renderer', () => {
    const world = createWorld(43, 2, buildNpcDesigns([], 43)), spec = worldSpecies(world, 'crest'), g = spec.genome!;
    expect(spec.diet).toEqual(computeStats(g).diet); expect(spec.damage).toBe(computeStats(g).damage); expect(spec.armor).toBe(computeStats(g).armor);
    expect(g.version).toBe(2); if (g.version === 2) expect(spec.speed).toBe(creatureCapabilities(g).walk.speed);
    const c = spawnCreature(world, 'crest', 0); expect(c.health).toBe(spec.maxHealth);
    expect(speciesGroundClearance(spec)).toBe(spec.clearance);
    const model = createSpeciesModel(spec); expect(model.getObjectByName('organism-surface')).toBeDefined(); disposeObject(model);
  });
  it('saves a future land snapshot at birth and preserves it through campaign recovery', () => {
    const designs = buildNpcDesigns([], 481516), s = createGame(481516, false, true, true, true, true, true, designs);
    const restored = parseGame(serializeGame(s)); expect(restored.worlds[2]?.creatureDesigns).toEqual(designs);
    expect(recoverGeneration(restored).worlds[2]?.creatureDesigns).toEqual(designs);
    expect(s.world.creatureDesigns).toBeUndefined();
  });
  it('retains old campaign arithmetic and fixed models when the marker is absent', () => {
    const s = createGame(123, false, true, true, true, true, true);
    expect(s.worlds[2]).toBeNull(); expect(worldSpecies(s.world, 'bell')).toBe(speciesById('bell'));
    expect(parseGame(serializeGame(s)).worlds[2]).toBeNull();
  });
  it('encounters and persists saved creatures on land without requiring the library', () => {
    const s = creatureStageFixture(), old = newCreation(generatedNpcGenome(speciesById('bell'), 6), '', 'old', 10); old.genome.name = 'Moje historie';
    s.creatureStage!.nests = []; s.journey.sites = s.journey.sites.filter(site => site.stage !== 2); s.world = createWorld(s.seed, 2, buildNpcDesigns([old], s.seed)); s.worlds[2] = s.world;
    initializeJourneyStage(s); initializeCreatureStage(s);
    const target = s.world.creatures.find(c => s.creatureStage!.nests[0].residents.includes(c.id))!;
    s.player.pos = { ...target.pos }; expect(startEncounter(s, { kind: 'creature', stage: 2, id: target.id })).toBe(true);
    const requested = s.creatureStage!.encounter!.requested;
    expect(speciesAbilities(worldSpecies(s.world, target.species).genome!)[requested].enabled).toBe(true);
    for (let i = 0; i < 120; i++) step(s, EMPTY_INPUT, 1 / 60);
    makeCheckpoint(s); const loaded = parseGame(serializeGame(s));
    expect(worldSpecies(loaded.world, target.species).name).toBe('Moje historie');
    expect(loaded.world.creatureDesigns).toEqual(s.world.creatureDesigns);
    expect(creatureStageMarkup(loaded, false, { kind: 'creature', stage: 2, id: target.id })).toContain('Z knihovny');
  });
  it('rejects forged ecology, malformed genomes and mismatched checkpoint catalogs', () => {
    const s = createGame(44, false, true, true, true, true, true, buildNpcDesigns([], 44));
    const text = serializeGame(s), raw = JSON.parse(text); raw.state.worlds[2].creatureDesigns[0].creation.genome.parts = [];
    expect(() => parseGame(JSON.stringify(raw))).toThrow();
    const mismatch = JSON.parse(text); mismatch.state.worlds[2].creatureDesigns[0].creation.genome.hue = 234;
    expect(() => parseGame(JSON.stringify(mismatch))).toThrow();
    const designs = buildNpcDesigns([], 44); designs[0].creation.genome = generatedNpcGenome(speciesById('crest'), 44);
    expect(() => validateNpcDesigns(designs)).toThrow('roli');
  });
  it('rejects a role whose required ecological food the genome cannot eat', () => {
    const g = generatedNpcGenome(speciesById('bell'), 0); g.parts = g.parts.filter(p=>p.kind!=='proboscis');
    expect(validateGenome(g,2)).toEqual([]); expect(compatibleCreature(g,speciesById('bell'))).toBe(false);
    expect(buildNpcDesigns([newCreation(g)],2).every(d=>d.source==='generated')).toBe(true);
  });
  it.each([false,true])('tall NPC can eat ground food, nest resident=%s', resident => {
    const g = generatedNpcGenome(speciesById('bell'),0), leg=g.parts.find(p=>p.kind==='legs')!;
    leg.scale=1.65; leg.limb!.joints[0].offset.y=-.5; leg.limb!.joints[1].offset.y=-1.8;
    expect(validateGenome(g,2)).toEqual([]);
    const s=creatureLibraryLandFixture(buildNpcDesigns([newCreation(g)],481516));
    const ids=s.creatureStage!.nests[0].residents;
    const c=s.world.creatures.find(c=>c.species==='bell'&&ids.includes(c.id)===resident)!;
    const nest=s.creatureStage!.nests[0]; c.pos={...nest.pos,y:groundHeight(nest.pos.x,nest.pos.z,2)+speciesGroundClearance(worldSpecies(s.world,'bell'))};
    c.hunger=80;c.cooldown=0;c.fear=0;c.velocity={x:0,y:0,z:0};s.world.obstacles=[];
    const food={id:s.world.nextId++,kind:'algae' as const,pos:{...c.pos,y:groundHeight(c.pos.x,c.pos.z,2)+1.2},amount:3,max:3,patch:0,regen:0};
    s.world.resources=[food];c.intent='forage';c.target=food.id;s.tick=1;
    if(resident)stepCreatureStage(s,1/60,()=>{});else step(s,EMPTY_INPUT,1/60);
    expect(c.hunger).toBeLessThan(60); expect(food.amount).toBeLessThan(3);
  });
  it('offers and tribe wildlife use the saved genome diet instead of the fixed species diet', () => {
    const s=creatureLibraryLandFixture(buildNpcDesigns([],481516)), c=s.world.creatures.find(c=>c.species==='bell')!;
    expect(speciesById('bell').diet).not.toContain('mineral'); expect(worldSpecies(s.world,'bell').diet).toContain('mineral');
    const food={id:s.world.nextId++,kind:'mineral' as const,pos:{...c.pos},amount:3,max:3,patch:c.patch,regen:0};
    s.world.resources=[food];s.journey.offerings=[{id:food.id,stage:2,site:6,remaining:30}];c.hunger=80;
    expect(journeyForageTarget(s,c)?.id).toBe(food.id);
    s.campaign.finale='restoration';const tribe=createTribe(s);tribe.members=[];s.stage=3;s.tick=0;s.world.creatures=[c];c.cooldown=0;c.fear=0;
    stepTribeWildlife(s,tribe,1/60);
    expect(c.hunger).toBeLessThan(60);expect(food.amount).toBeCloseTo(2.65);
  });
  it('escapes library species names in the live encounter panel', () => {
    const g=generatedNpcGenome(speciesById('bell'),0);g.name='<img src=x onerror=alert(1)>';
    const s=creatureLibraryLandFixture(buildNpcDesigns([newCreation(g)],481516));
    expect(creatureStageMarkup(s,false,null)).not.toContain('<img');expect(creatureStageMarkup(s,false,null)).toContain('&lt;img');
  });

  it.each([1,2])('bite HUD and action agree on genome-backed body radius, player v%s', version => {
    const s=creatureLibraryLandFixture(buildNpcDesigns([],481516));s.world.obstacles=[];
    if(version===1){s.player.genome=creatureDiscoveryClassicFixture().player.genome;s.player.genome.parts.push({id:'jaw',kind:'jaw',axial:.9,angle:0,scale:1,mirrored:false});}
    const c=s.world.creatures.find(c=>s.creatureStage!.nests[0].residents.includes(c.id))!, spec=worldSpecies(s.world,c.species);
    expect(spec.radius).toBeGreaterThan(.8);s.player.heading=0;s.player.cooldown=0;s.player.energy=100;
    const jaw=jawContacts(s.player.genome)[0],origin=mouthWorldPosition(jaw,s.player.pos,0);
    c.pos={...origin,z:origin.z+jaw.reach+.75};const selection={kind:'creature' as const,id:c.id,stage:2 as const};
    expect(feedTarget(s,selection)?.ready).toBe(true);const health=c.health;
    expect(performSpeciesAction(s,'bite',selection,()=>{})).toBe(true);expect(c.health).toBeLessThan(health);
  });

});
