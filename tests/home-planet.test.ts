import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { currentLocation, enableHomePlanet, locationAddress, locationId, resolveLocationAddress } from '../src/game/home-planet';
import { createGame, makeCheckpoint, recoverGeneration, step, tryTransition, continueToTribeEra, continueToMachinesEra, continueToPlanetEra, returnToCoast, foundTribeFromPreview } from '../src/game/simulation';
import { loadGame, parseGame, saveGame, serializeGame } from '../src/game/persistence';
import { enableLineageHistory, tribeInheritance } from '../src/game/lineage-history';
import { buildNpcDesigns } from '../src/game/npc-genome';
import { effectiveMachineIncome } from '../src/game/machines';
import { EMPTY_INPUT, type GameState } from '../src/game/types';
import { CHAPTERS } from '../src/game/content';
import { campaignHeading, homePlanetMarkup } from '../src/ui/home-planet';

const fixture = (file: string) => parseGame(readFileSync(`tests/fixtures/saves/${file}`, 'utf8'));
const files: string[] = JSON.parse(readFileSync('tests/fixtures/saves/manifest.json', 'utf8')).files.map((f: {file:string}) => f.file);
function withoutIdentity(state: GameState): GameState {
  const copy = structuredClone(state); delete copy.homePlanet;
  if (copy.checkpoint) copy.checkpoint = JSON.stringify(withoutIdentity(JSON.parse(copy.checkpoint)));
  return copy;
}
/** Same storage-only rekey used by the UI; never touches geography. */
function rekey(s: GameState, id: string) {
  s.id = id;
  if (s.checkpoint) { const cp = JSON.parse(s.checkpoint); cp.id = id; s.checkpoint = JSON.stringify(cp); }
}
const raw = (s: GameState) => JSON.stringify({format:'lumavora',version:3,savedAt:1,state:s});
function identityGame() { const s=createGame(42);enableHomePlanet(s);return s; }

describe('SP-010.A historical migration', () => {
  it.each(files)('adds only identity to %s, including checkpoint; repeated import is stable', file => {
    const s=fixture(file), original=structuredClone(s);
    expect(s.homePlanet).toBeUndefined();enableHomePlanet(s);
    expect(withoutIdentity(s)).toEqual(original);
    const identity=structuredClone(s.homePlanet), migratedCheckpoint=s.checkpoint;
    expect(identity!.locations).toHaveLength(s.worlds.filter(Boolean).length);
    expect(identity!.locations.map(l=>l.worldSlot)).toEqual(s.worlds.flatMap((w,i)=>w?[i]:[]));
    expect(resolveLocationAddress(s,locationAddress(s,s.player.pos)!)!.world).toBe(s.world);
    for(let i=0;i<3;i++) {
      enableHomePlanet(s);expect(s.homePlanet).toEqual(identity);expect(s.checkpoint).toBe(migratedCheckpoint);
      const again=fixture(file);enableHomePlanet(again);expect(again.homePlanet).toEqual(identity);
    }
    rekey(s,'imported-other-slot');
    const imported=parseGame(serializeGame(s));enableHomePlanet(imported);
    expect(imported.homePlanet).toEqual(identity);
    const recovered=recoverGeneration(imported);
    if(original.checkpoint) {
      expect(recovered.homePlanet?.id).toBe(identity!.id);
      expect(recovered.world).toBe(recovered.worlds[currentLocation(recovered)!.worldSlot]);
      expect(recovered.homePlanet).toEqual(JSON.parse(imported.checkpoint!).homePlanet);
      const oldRecovery=recoverGeneration(original);rekey(oldRecovery,'imported-other-slot');
      expect(withoutIdentity(recovered)).toEqual(oldRecovery);
    }
    expect(()=>parseGame(serializeGame(recovered))).not.toThrow();
  });

  it('only records existing worlds: prebuilt library coast is not a fabricated visit', () => {
    const s=createGame(42,false,true,true,true,true,true,buildNpcDesigns([],42),true,true,true);
    expect(s.homePlanet!.locations.map(l=>l.kind)).toEqual(['microhabitat','coast']);
    expect(currentLocation(s)!.kind).toBe('microhabitat');
    expect(s.homePlanet).not.toHaveProperty('visited');expect(s.homePlanet).not.toHaveProperty('continents');
    expect(s.lineageHistory!.stages).toHaveLength(1);
    const coast=s.homePlanet!.locations[1], address=locationAddress(s,{x:3,y:4,z:5},coast.id)!;
    expect(resolveLocationAddress(s,address)!.world).toBe(s.worlds[2]);
    expect(resolveLocationAddress(s,address)!.world).not.toBe(s.world);
    expect(homePlanetMarkup(s)).toContain('není doklad návštěvy');
    expect(parseGame(serializeGame(s)).worlds[2]!.creatureDesigns).toEqual(s.worlds[2]!.creatureDesigns);
  });
  it('separate lineages with the same seed have separate identity, independent of body and slot rekey', () => {
    const a=createGame(42),b=createGame(42);a.id='line-a';b.id='line-b';a.checkpoint=b.checkpoint=null;
    enableHomePlanet(a);enableHomePlanet(b);expect(a.homePlanet!.id).not.toBe(b.homePlanet!.id);
    const before=structuredClone(a.homePlanet);a.player.genome.name='New name';rekey(a,'copied-slot');enableHomePlanet(a);
    expect(a.homePlanet).toEqual(before);expect(a.rng).toBe(b.rng);
  });
  it('no-checkpoint recovery retains activation but creates the existing fresh-lineage fallback', () => {
    const s=identityGame();s.checkpoint=null;s.id='lost-lineage';const recovered=recoverGeneration(s);
    expect(recovered.homePlanet).toBeDefined();expect(recovered.homePlanet!.id).toBe(`home-${recovered.id}`);
    expect(recovered.stage).toBe(0);expect(recovered.homePlanet!.locations).toHaveLength(1);
  });
  it.each([1,2] as const)('accepts old envelope v%i without changing the pure parser contract', version => {
    const s=createGame(42);s.checkpoint=null;const old=JSON.parse(raw(s));old.version=old.state.version=version;
    if(version===1)delete old.state.journey;
    const restored=parseGame(JSON.stringify(old));expect(restored.homePlanet).toBeUndefined();enableHomePlanet(restored);
    const next=parseGame(serializeGame(restored));expect(next.homePlanet).toEqual(restored.homePlanet);
  });
});

describe('SP-010.A progression and retained world state', () => {
  it('both organism passages retain old habitats, use distinct localities and checkpoint their identity', () => {
    const s=identityGame(),planetId=s.homePlanet!.id, ids=[s.homePlanet!.currentLocationId];
    for(const stage of [0,1] as const) {
      s.campaign.stageMeals=CHAPTERS[stage].meals;s.campaign.stageReproductions=2;
      s.world.patches.forEach(p=>p.discovered=true);
      s.campaign.journals.push(...s.world.patches.map(p=>`field:${stage}:${p.id}:forage`));
      s.player.pos={...s.world.landmarks.find(l=>l.kind==='gate')!.pos};
      if(stage===1)for(const kind of ['lungs','legs'] as const)s.player.genome.parts.push({id:kind,kind,axial:0,angle:1,scale:1,mirrored:false});
      const prior=s.world, snapshot=structuredClone(prior);
      expect(tryTransition(s)).toBe(true);expect(s.worlds[stage]).toBe(prior);expect(prior).toEqual(snapshot);
      expect(s.homePlanet!.id).toBe(planetId);ids.push(s.homePlanet!.currentLocationId);
      expect(new Set(ids).size).toBe(ids.length);expect(currentLocation(s)!.worldSlot).toBe(stage+1);
      expect(s.messages.at(-1)!.text).toContain('Lumavora');
      expect(parseGame(serializeGame(s)).homePlanet).toEqual(s.homePlanet);
      expect(recoverGeneration(s).homePlanet).toEqual(s.homePlanet);
      const before=structuredClone(s.homePlanet);expect(tryTransition(s)).toBe(false);expect(s.homePlanet).toEqual(before);
    }
  });
  it.each([
    ['won-current-coast.fixture.json',continueToTribeEra],
    ['alliance-completed.save.json',continueToMachinesEra],
    ['machines-restoration-completed.save.json',continueToPlanetEra],
    ['tribe-preview.export.json',returnToCoast],
    ['tribe-preview.export.json',foundTribeFromPreview],
  ] as const)('%s transition preserves coastal identity and exactly the prior transition effects', (file,transition) => {
    const a=fixture(file),b=fixture(file);enableLineageHistory(a);enableLineageHistory(b);enableHomePlanet(a);
    const identity=structuredClone(a.homePlanet),world=a.world;
    expect(transition(a)).toBe(true);expect(transition(b)).toBe(true);
    expect(a.world).toBe(world);expect(a.homePlanet).toEqual(identity);
    expect(withoutIdentity(a)).toEqual(b);
    expect(tribeInheritance(a)).toEqual(tribeInheritance(b));
    expect(parseGame(serializeGame(a)).homePlanet).toEqual(identity);
  });
  it('an earlier organism checkpoint rolls back its location registry; revisiting reuses the same identity', () => {
    const s=identityGame();s.campaign.stageMeals=CHAPTERS[0].meals;s.campaign.stageReproductions=2;
    s.player.meals=CHAPTERS[0].meals;s.player.generation=3;
    s.world.patches.forEach(p=>p.discovered=true);
    s.campaign.journals.push(...s.world.patches.map(p=>`field:0:${p.id}:forage`));
    s.player.pos={...s.world.landmarks.find(l=>l.kind==='gate')!.pos};makeCheckpoint(s);
    const checkpoint=s.checkpoint;expect(tryTransition(s)).toBe(true);const reef=s.homePlanet!.currentLocationId;
    s.checkpoint=checkpoint;const recovered=recoverGeneration(parseGame(serializeGame(s)));
    expect(recovered.stage).toBe(0);expect(recovered.homePlanet!.locations).toHaveLength(1);
    expect(recovered.homePlanet!.id).toBe(s.homePlanet!.id);expect(tryTransition(recovered)).toBe(true);
    expect(recovered.homePlanet!.currentLocationId).toBe(reef);
  });
  it.each(['legacy-initial.fixture.json','earned-reef-entry-v14.json','won-current-coast.fixture.json','alliance-completed.save.json','machines-restoration-final.save.json','stable-sandbox.save.json'])('simulation parity with/without identity in %s', file => {
    const a=fixture(file),b=fixture(file);enableLineageHistory(a);enableLineageHistory(b);enableHomePlanet(a);
    for(let i=0;i<120;i++){step(a,EMPTY_INPUT);step(b,EMPTY_INPUT);}
    expect(withoutIdentity(a)).toEqual(b);expect(tribeInheritance(a)).toEqual(tribeInheritance(b));
    if(a.stage===4)expect(effectiveMachineIncome(a)).toBe(effectiveMachineIncome(b));
    expect(parseGame(serializeGame(a)).planet).toEqual(b.planet);
  });
  it('save/load/export/import and death rollback preserve identity, history, actual economy and ecology together', () => {
    const slots=new Map<string,string>();vi.stubGlobal('localStorage',{setItem:(k:string,v:string)=>slots.set(k,v),getItem:(k:string)=>slots.get(k)??null});
    try {
      const s=fixture('machines-restoration-final.save.json');enableLineageHistory(s);enableHomePlanet(s);makeCheckpoint(s);
      const before=structuredClone(s);step(s,EMPTY_INPUT);s.deathReason='test branch';
      expect(saveGame(s).ok).toBe(true);const loaded=loadGame(s.id);expect(loaded.homePlanet).toEqual(before.homePlanet);
      const recovered=recoverGeneration(loaded);expect(recovered.homePlanet).toEqual(before.homePlanet);
      expect(recovered.machines).toEqual(before.machines);expect(recovered.worlds).toEqual(before.worlds);expect(recovered.lineageHistory).toEqual(before.lineageHistory);
      expect(tribeInheritance(recovered)).toEqual(tribeInheritance(before));expect(recovered.deathReason).toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('SP-009 address contract', () => {
  it('resolves detached coordinates to authoritative world and never changes it', () => {
    const s=fixture('machines-restoration-final.save.json');enableHomePlanet(s);
    const pos={x:10,y:3,z:-20},before=structuredClone(s),address=locationAddress(s,pos)!;
    pos.x=25;const resolved=resolveLocationAddress(s,address)!;
    expect(resolved.position.x).toBe(10);expect(resolved.world).toBe(s.world);expect(resolved.planet).toBe(s.homePlanet);
    resolved.position.x=50;expect(address.position.x).toBe(10);expect(s).toEqual(before);
    // Read a non-rendered habitat without changing current location, stage or camera.
    const other=s.homePlanet!.locations.find(l=>l.worldSlot!==2)!;
    expect(resolveLocationAddress(s,{...address,locationId:other.id})!.world).toBe(s.worlds[other.worldSlot]);
    expect(currentLocation(s)!.kind).toBe('coast');
  });
  it.each([{x:Infinity,y:0,z:0},{x:0,y:NaN,z:0},{x:0,y:0,z:79},{x:-79,y:0,z:0},{x:0,y:1025,z:0}])('rejects invalid local coordinates %j', position => {
    const s=identityGame();expect(locationAddress(s,position)).toBeNull();
  });
  it('rejects absent, foreign and unknown addresses, permits the local bounds', () => {
    const s=identityGame(),address=locationAddress(s,{x:-78,y:-5,z:78})!;expect(address).not.toBeNull();
    expect(resolveLocationAddress(s,{...address,planetId:'home-other'})).toBeNull();
    expect(resolveLocationAddress(s,{...address,locationId:locationId(s.homePlanet!.id,2)})).toBeNull();
    expect(locationAddress(createGame(1),{x:0,y:0,z:0})).toBeNull();
  });
});

describe('strict home planet persistence', () => {
  it.each([
    ['unknown field',(p:any)=>p.visited=[]], ['unknown version',(p:any)=>p.version=3],
    ['invalid ID',(p:any)=>p.id='bad:planet'], ['null',(p:any,s:any)=>s.homePlanet=null],
    ['extra locality',(p:any)=>p.locations.push({id:locationId(p.id,2),kind:'coast',worldSlot:2})],
    ['missing locality',(p:any)=>p.locations=[]], ['duplicate',(p:any)=>p.locations.push({...p.locations[0]})],
    ['wrong binding',(p:any)=>p.locations[0].worldSlot=1], ['wrong kind',(p:any)=>p.locations[0].kind='coast'],
    ['wrong location ID',(p:any)=>p.locations[0].id='elsewhere'],
    ['wrong current locality',(p:any)=>p.currentLocationId=locationId(p.id,2)],
  ] as const)('rejects %s', (_,mutate) => {const s=identityGame();mutate(s.homePlanet,s);expect(()=>parseGame(raw(s))).toThrow();});
  it.each(['missing','different','world-removed'] as const)('rejects %s checkpoint identity mismatch', change => {
    const s=fixture('machines-restoration-final.save.json');enableHomePlanet(s);
    const cp=JSON.parse(s.checkpoint!);
    if(change==='missing')delete cp.homePlanet;
    if(change==='different') { cp.homePlanet.id='home-other';cp.homePlanet.locations.forEach((l:any)=>l.id=locationId('home-other',l.worldSlot));cp.homePlanet.currentLocationId=locationId('home-other',2); }
    if(change==='world-removed'){s.worlds[0]=null;s.homePlanet!.locations=s.homePlanet!.locations.filter(l=>l.worldSlot!==0);}
    s.checkpoint=JSON.stringify(cp);expect(()=>parseGame(raw(s))).toThrow();
  });
  it('accepts reordered semantic records without renaming them', () => {
    const s=fixture('machines-restoration-final.save.json');enableHomePlanet(s);s.homePlanet!.locations.reverse();
    expect(parseGame(serializeGame(s)).homePlanet).toEqual(s.homePlanet);
  });
  it('renders readable current planet/locality and keyboard-operable journal entry in every era', () => {
    for(const file of files){const s=fixture(file);enableHomePlanet(s);const heading=campaignHeading(s);
      expect(heading).toContain('Planeta Lumavora');expect(heading).toContain('<button');expect(heading).toContain('data-action="journal"');
      expect(homePlanetMarkup(s).match(/právě zde/g)).toHaveLength(1);
    }
  });
});
