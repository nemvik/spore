import { bodyCollisionRadius } from './body-shape';
import { stepTribeWildlife } from './tribe-wildlife';
import { activeTribe, createTribe, stepTribe, tribeReady } from './tribe';
import { activeMachines, createMachines, stepMachines } from './machines';
import { MACHINE_COPY } from './machine-copy.cs';
import { activePlanet, createPlanet, stepPlanet } from './planet';
import { PLANET_COPY } from './planet-copy.cs';
import { recordEcologyContact } from './ecology-catalog';
import { TRIBE_COPY } from './tribe-copy.cs';
import { ERA_COPY } from './era-copy.cs';
import { isOrganismStage, LAST_ORGANISM_STAGE, worldStageFor } from './stage';
import type { GameState, Input, Genome, World, Creature, Player, Stats, Stage, FeedSelection } from './types';
import { SELECTION_COPY } from './selection-copy.cs';
import { PROGRESSION_COPY } from './progression-copy.cs';
import { initialGenome, computeStats, functionalProfile, has, validateMutation, cloneGenome } from './genome';
import { createWorld, spawnCreature, surfaceY, WORLD_BOUND } from './world';
import { random, clamp, distance, horizontalDistance, groundHeight } from './random';
import { CHAPTERS, FOOD_LABEL, speciesById, stageSpecies, TEXT } from './content';
import { getClimate, hydrationAt } from './climate';
import { bodyGroundClearance, organismGroundClearance, speciesGroundClearance } from './anatomy';
import { feedTarget, bondTarget, tendTarget, lineBlocked } from './interactions';
import { INTERACTION_COPY } from './interaction-copy.cs';
import { advanceLocomotion } from './locomotion';
import { emptyJourney } from './journey-types';
import { migrationTarget, carrierFearDistance, carrierHealthRate } from './migration';
import { quoteJourneyEvolution } from './journey-evolution';
import { initializeJourneyStage, insight, environmentalFlow, actOnJourney, journeyForageTarget, recordConsumption, recordJourneyHunt, stepJourney, journeyRequirements, journeyFinale, journeyEndingStatus, journeyNotice } from './journey';
import { reproduceAfterMeal } from './demography';
import { hunterThreatening } from './hunter-appetite';
import { stepHunters } from './encounter-ai';
import { locomotionProfile, reefRespiration } from './physiology';
import { steerToward } from './navigation';
import { shareMeal, hasActivePartner } from './symbiosis';
import { CANOPY_COPY, isAttachedCrust, releaseCanopyAfterMeal } from './reef-canopy';
import { resolveObstacleMotion } from './obstacle-geometry';
import { reefWater } from './journey-network';
import { reefBodyProfile, reefBodyRespiration } from './reef-body';
import { emptyCreatureActions } from './creature-actions';
const profileCache=new WeakMap<Genome,ReturnType<typeof functionalProfile>>();
function profileFor(g:Genome){let p=profileCache.get(g);if(!p){p=functionalProfile(g);profileCache.set(g,p);}return p;}
const statCache = new WeakMap<Genome,Stats>();
export function statsFor(g:Genome) { let s=statCache.get(g);if(!s){s=computeStats(g);statCache.set(g,s);}return s; }
export function announce(s:GameState,text:string) { if(s.messages.at(-1)?.text===text&&s.world.time-s.messages.at(-1)!.time<3)return; s.messages.push({id:Math.max(s.tick,s.messages.at(-1)?.id??0)+1,text,time:s.world.time}); if(s.messages.length>6)s.messages.shift(); }
/** Legacy mode preserves the published benchmark fixtures; the UI explicitly starts a journey. */
export function createGame(seed:number,legacy=true,dispersal=false,reefEvolution=false,ecology=false):GameState {
 const world=createWorld(seed,0),genome=initialGenome(),stats=statsFor(genome);
 const s:GameState={version:3,journey:emptyJourney(legacy,dispersal,reefEvolution),id:`line-${seed}-${Date.now()}`,seed,stage:0,tick:0,rng:seed>>>0,world,worlds:[world,null,null],
 player:{pos:{x:0,y:1.1,z:0},velocity:{x:0,y:0,z:0},heading:Math.PI,health:stats.maxHealth,energy:90,oxygen:100,moisture:100,genome,dna:14,totalDna:14,generation:1,meals:0,kills:0,bonds:[],cooldown:0,abilityRecharge:0,scan:0,invulnerable:5,feeding:0,distance:0},
 campaign:{stageMeals:0,stageKills:0,stageBonds:0,stageReproductions:0,discoveries:[],journals:[],drought:0,finale:null,won:false,sandbox:false},
 lineage:[{generation:1,stage:0,time:0,name:genome.name,parts:genome.parts.map(p=>p.kind),event:TEXT.firstLife}],checkpoint:null,messages:[],deathReason:null};
 if(ecology)s.journey.ecology={version:1,contacts:[]};
 initializeJourneyStage(s);announce(s,legacy?TEXT.welcome:'WASD · plavba. Mezerník · potrava. T u živého porostu · poznání. Západně čeká zahrada.'); makeCheckpoint(s);return s;
}
export function makeCheckpoint(s:GameState) { s.checkpoint=JSON.stringify({...s,checkpoint:null}); }
export function recoverGeneration(s:GameState):GameState {
 if(!s.checkpoint)return createGame(s.seed,s.journey.legacy,!!s.journey.rootDispersal,!!s.journey.reefEvolution);
 const restored=JSON.parse(s.checkpoint) as GameState; restored.world=restored.worlds[worldStageFor(restored.stage)]!;restored.checkpoint=s.checkpoint;restored.deathReason=null;restored.player.invulnerable=10;announce(restored,TEXT.restored);return restored;
}
export function nearNest(s:GameState) { return horizontalDistance(s.player.pos,s.world.landmarks.find(l=>l.kind==='nest')!.pos)<11; }
export function evolve(s:GameState,draft:Genome):{ok:boolean;errors:string[];cost:number} {
 if(!isOrganismStage(s.stage))return {ok:false,errors:[ERA_COPY.bodyLocked],cost:0};
 const mutation=s.journey.legacy?validateMutation(s.player.genome,draft,s.stage,s.player.dna-6):quoteJourneyEvolution(s,draft);
 const cost=mutation.cost+(s.journey.legacy?6:0);
 if(!nearNest(s))return {ok:false,errors:[TEXT.tooFarNest],cost};
 if(!mutation.ok)return {...mutation,cost};
 if(s.player.bonds.length&&!has(draft,'symbiote'))return {ok:false,errors:[TEXT.occupiedSymbiote],cost};
 if(s.stage===2&&(!has(draft,'legs')||!has(draft,'lungs')))return {ok:false,errors:[TEXT.needLungs],cost};
 const nextGenome=cloneGenome(draft);
 const nextDna=s.journey.legacy?s.player.dna-cost:(mutation as ReturnType<typeof quoteJourneyEvolution>).remaining;
 const nextHeight=s.stage===2?groundHeight(s.player.pos.x,s.player.pos.z,2)+organismGroundClearance(nextGenome):s.player.pos.y;
 const nextStats=statsFor(nextGenome);
 s.player.dna=nextDna;s.player.genome=nextGenome;
 if(nextGenome.version===2)s.player.creatureActions=emptyCreatureActions();else delete s.player.creatureActions;
 if(s.stage===2){s.player.pos.y=nextHeight;if(nextGenome.version===2)s.player.velocity.y=0;}s.player.generation++;s.campaign.stageReproductions++;
 if(s.journey.reefEvolution)s.journey.reefEvolution.pumping=0;
 s.player.health=nextStats.maxHealth;s.player.energy=Math.max(s.player.energy,75);s.player.oxygen=100;s.player.moisture=100;s.player.invulnerable=6;
 s.lineage.push({generation:s.player.generation,stage:s.stage,time:s.tick/60,name:draft.name,parts:draft.parts.map(p=>p.kind),event:TEXT.reproduction});
 s.world.patches.forEach(p=>{p.fertility=clamp(p.fertility+.02,0.15,1.5);});
 announce(s,TEXT.generationBorn(s.player.generation));makeCheckpoint(s);return {ok:true,errors:[],cost};
}
export function transitionRequirements(s:GameState):{label:string;met:boolean;value:string}[] {
 if(!isOrganismStage(s.stage))return [];
 if(s.stage===LAST_ORGANISM_STAGE)return s.journey.legacy?[]:journeyRequirements(s);
 if(!s.journey.legacy)return [...journeyRequirements(s),...(s.stage===1?[{label:TEXT.requirementLungs,met:has(s.player.genome,'lungs'),value:has(s.player.genome,'lungs')?TEXT.developed:TEXT.missing},{label:TEXT.requirementLegs,met:has(s.player.genome,'legs'),value:has(s.player.genome,'legs')?TEXT.developed:TEXT.missing}]:[])];
 return [
 {label:TEXT.requirementNutrition,met:s.campaign.stageMeals>=CHAPTERS[s.stage].meals,value:TEXT.requirementCount(s.campaign.stageMeals,CHAPTERS[s.stage].meals)},
 {label:TEXT.requirementExploration,met:s.world.patches.every(p=>p.discovered),value:TEXT.requirementCount(s.world.patches.filter(p=>p.discovered).length,3)},
 {label:TEXT.requirementNicheLife,met:fieldProgress(s).every(p=>p.done),value:TEXT.requirementCount(fieldProgress(s).filter(p=>p.done).length,3)},
 {label:TEXT.requirementGenerations,met:s.campaign.stageReproductions>=2,value:TEXT.requirementCount(s.campaign.stageReproductions,2)},
 ...(s.stage===1?[{label:TEXT.requirementLungs,met:has(s.player.genome,'lungs'),value:has(s.player.genome,'lungs')?TEXT.developed:TEXT.missing},{label:TEXT.requirementLegs,met:has(s.player.genome,'legs'),value:has(s.player.genome,'legs')?TEXT.developed:TEXT.missing}]:[])
 ];
}
function legacyMigrationReady(s:GameState) {
 return s.player.bonds.length>=2&&s.player.bonds.every(b=>b.age>=120&&b.loyalty>=35)&&has(s.player.genome,'reservoir')&&s.player.energy>=70&&s.world.patches.every(p=>p.discovered)&&horizontalDistance(s.player.pos,s.world.landmarks[1].pos)<10;
}
/** Shared action readiness: world geometry, current ecology and required anatomy. */
export function transitionStatus(s:GameState) {
 const requirements=transitionRequirements(s),gate=s.world.landmarks.find(l=>l.kind==='gate')??null;
 const gateDistance=gate?horizontalDistance(s.player.pos,gate.pos):Infinity;
 if(!isOrganismStage(s.stage))return {kind:'era' as const,ready:false,nearGate:false,gate,distance:gateDistance,detail:ERA_COPY.unavailable,requirements,routes:[]};
 if(s.stage===2&&!s.journey.legacy){const ending=journeyEndingStatus(s),alive=s.player.health>0&&!s.deathReason;return {kind:s.campaign.won?'sandbox' as const:'ending' as const,ready:!s.campaign.won&&alive&&!!ending.finale,nearGate:false,gate,distance:gateDistance,detail:!s.campaign.won&&!alive?TEXT.transitionNotReady:ending.detail,requirements,routes:ending.routes};}
 if(s.stage===2){const ready=!s.campaign.won&&s.player.health>0&&!s.deathReason&&legacyMigrationReady(s);return {kind:'legacy-ending' as const,ready,nearGate:gateDistance<12,gate,distance:gateDistance,detail:s.campaign.won?PROGRESSION_COPY.sandbox:ready?PROGRESSION_COPY.legacyMigrationReady:TEXT.transitionNotReady,requirements,routes:[]};}
 const missing=requirements.filter(r=>!r.met);
 const ready=!!gate&&gateDistance<=10&&missing.length===0;
 const detail=!gate?PROGRESSION_COPY.noGate:missing.length?PROGRESSION_COPY.missing(missing.map(r=>r.label)):gateDistance>10?PROGRESSION_COPY.approach(gateDistance):PROGRESSION_COPY.ready;
 return {kind:'transition' as const,ready,nearGate:gateDistance<12,gate,distance:gateDistance,detail,requirements,routes:[]};
}
export function tryTransition(s:GameState):boolean {
 if(!isOrganismStage(s.stage))return false;
 const status=transitionStatus(s);
 if(s.stage===2){if(s.journey.legacy)return tryWin(s,'migration');announce(s,status.detail);return false;}
 if(!status.ready){announce(s,s.journey.legacy?status.distance>10?TEXT.approachGate:TEXT.transitionNotReady:status.detail);return false;}
 if(s.journey.reefEvolution)s.journey.reefEvolution.pumping=0;
 s.worlds[worldStageFor(s.stage)]=s.world;s.journey.cargo=null;s.stage=(s.stage+1) as Stage;s.world=s.worlds[worldStageFor(s.stage)]??createWorld(s.seed,s.stage);s.worlds[worldStageFor(s.stage)]=s.world;
 Object.assign(s.campaign,{stageMeals:0,stageKills:0,stageBonds:0,stageReproductions:0});
 s.player.pos={x:0,y:s.stage===2?groundHeight(0,0,2)+organismGroundClearance(s.player.genome):surfaceY(s.stage,0,0),z:0};s.player.velocity={x:0,y:0,z:0};s.player.health=statsFor(s.player.genome).maxHealth;s.player.energy=90;s.player.oxygen=100;s.player.moisture=100;s.player.invulnerable=10;
 s.lineage.push({generation:s.player.generation,stage:s.stage,time:s.tick/60,name:s.player.genome.name,parts:s.player.genome.parts.map(p=>p.kind),event:CHAPTERS[s.stage].title});
 s.messages=[];initializeJourneyStage(s);announce(s,CHAPTERS[s.stage].title);if(s.stage===2){s.campaign.drought=.28;announce(s,TEXT.drought);}makeCheckpoint(s);return true;
}
export function tryWin(s:GameState,path:'restoration'|'predator'|'migration'):boolean {
 if(s.stage!==2||s.campaign.won||s.player.health<=0||s.deathReason)return false;
 let met=false;
 if(!s.journey.legacy)met=journeyFinale(s)===path;
 else if(path==='restoration')met=s.world.landmarks.filter(l=>l.kind==='spring').every(l=>l.charge>=10);
 if(s.journey.legacy&&path==='predator')met=s.campaign.stageKills>=12&&s.player.energy>=60&&s.world.patches.every(p=>p.discovered);
 if(s.journey.legacy&&path==='migration')met=legacyMigrationReady(s);
 if(met){s.campaign.won=true;s.campaign.finale=path;
 if(path==='restoration'){s.campaign.drought=.12;s.world.patches.forEach(p=>{p.fertility=Math.max(p.fertility,1.1);p.pressure*=.25;});}
 if(path==='predator'){s.campaign.drought=Math.min(s.campaign.drought,.4);s.world.landmarks.filter(l=>l.kind==='spring').forEach(l=>l.charge=Math.max(4,l.charge));s.world.patches.forEach(p=>{p.fertility=Math.max(.9,p.fertility);p.pressure*=.4;});}
 if(path==='migration'){s.world.landmarks.find(l=>l.kind==='gate')!.charge=10;}
s.lineage.push({generation:s.player.generation,stage:2,time:s.tick/60,name:s.player.genome.name,parts:s.player.genome.parts.map(p=>p.kind),event:path==='restoration'?TEXT.finaleRestoration:path==='predator'?TEXT.finalePredator:TEXT.finaleMigration});announce(s,TEXT.victory);makeCheckpoint(s);return true;}return false;
}
/** A completed organism campaign stops only until the player chooses its next step. */
export function awaitingOrganismVictory(s:GameState):boolean {
 return isOrganismStage(s.stage)&&s.campaign.won&&!s.campaign.sandbox;
}

/** Explicit opt-in, including migrated old saves. No ecology is regenerated. */
export function continueToTribeEra(s:GameState):boolean {
 if(s.stage!==LAST_ORGANISM_STAGE||!s.campaign.won||!s.campaign.finale||s.tribe||s.player.health<=0||s.deathReason)return false;
 if(s.player.genome.version===2&&s.player.creatureActions)Object.assign(s.player.creatureActions,{jumpRecharge:0,communicationRecharge:0,communicationTime:0});
 s.stage=3;s.tribe=createTribe(s);
 s.lineage.push({generation:s.player.generation,stage:3,time:s.tick/60,name:s.player.genome.name,
  parts:s.player.genome.parts.map(p=>p.kind),event:CHAPTERS[3].title});
 s.messages=[];announce(s,TRIBE_COPY.founded);makeCheckpoint(s);return true;
}

/** P0 saves retain their preview until this explicit decision is made. */
export function foundTribeFromPreview(s:GameState):boolean {
 if(!canReturnToCoast(s)||!s.campaign.finale||s.deathReason||s.player.health<=0)return false;
 s.tribe=createTribe(s);announce(s,TRIBE_COPY.founded);makeCheckpoint(s);return true;
}

export function continueToMachinesEra(s:GameState):boolean {
 if(s.stage!==3||s.machines||s.deathReason||!tribeReady(s)||!activeTribe(s)?.completed)return false;
 s.machines=createMachines(s);s.stage=4;
 s.lineage.push({generation:s.player.generation,stage:4,time:s.tick/60,name:s.player.genome.name,parts:s.player.genome.parts.map(p=>p.kind),event:CHAPTERS[4].title});
 announce(s,MACHINE_COPY.founded);makeCheckpoint(s);return true;
}
export function continueToPlanetEra(s:GameState):boolean {
 const m=activeMachines(s);if(s.stage!==4||s.planet||s.deathReason||!m?.completed||!m.fleet.some(u=>u.health>0))return false;
 s.planet=createPlanet(s);s.stage=5;
 s.lineage.push({generation:s.player.generation,stage:5,time:s.tick/60,name:s.player.genome.name,parts:s.player.genome.parts.map(p=>p.kind),event:CHAPTERS[5].title});
 announce(s,PLANET_COPY.founded);makeCheckpoint(s);return true;
}
export const awaitingPlanetVictory=(s:GameState):boolean=>s.stage===5&&!!activePlanet(s)?.completed&&!activePlanet(s)?.sandbox;

/** Reversible P0 preview only; never discard a developed tribe or later era. */
export function canReturnToCoast(s:GameState):boolean {
 const tribe=s.tribe;
 return s.stage===3&&tribe?.version===1&&!s.machines&&!s.planet&&tribe.food===0&&tribe.members.length===0&&tribe.huts.length===0&&tribe.unlocked.length===0&&tribe.neighbours.length===0;
}
export function returnToCoast(s:GameState):boolean {
 if(!canReturnToCoast(s))return false;
 s.stage=LAST_ORGANISM_STAGE;delete s.tribe;
 // The preview is not a completed chapter in the organism campaign's history.
 s.lineage=s.lineage.filter(entry=>isOrganismStage(entry.stage));
 s.campaign.sandbox=true;s.messages=[];makeCheckpoint(s);return true;
}

function killCreature(s:GameState,c:Creature,byPlayer:boolean,cause:'combat'|'starvation'|'exposure'='combat') {
 const idx=s.world.creatures.indexOf(c);if(idx<0)return;s.world.creatures.splice(idx,1);s.world.deaths++;
 const patch=s.world.patches[c.patch],spec=speciesById(c.species);patch.hunted++;
 if(spec.role==='invasive'){patch.fertility=clamp(patch.fertility+.05,.15,1.5);if(byPlayer)s.campaign.stageKills++;}
 else if(spec.role==='grazer')patch.pressure+=.07;
 else if(spec.role==='predator')patch.pressure-=.06;
 s.world.resources.push({id:s.world.nextId++,kind:'meat',pos:{...c.pos},amount:3,max:3,patch:c.patch,regen:0});
 recordJourneyHunt(s,c,byPlayer,cause);
 if(byPlayer){recordEcologyContact(s,`species:${c.species}`,'hunt',speciesById(c.species).stage as 0|1|2,c.patch as 0|1|2);learnNiche(s,c.pos,'hunt');s.player.kills++;if(s.journey.legacy){s.player.dna+=5;s.player.totalDna+=5;announce(s,TEXT.huntedSpecies(spec.name));}else insight(s,`hunt:${c.species}`,10,`${spec.name}: lov změnil potravní vztah.`);}
}
function feed(s:GameState,stats:Stats,selection?:FeedSelection|null) {
 const p=s.player,w=s.world;
 if(p.cooldown>0)return;
 const target=feedTarget(s,selection);
 if(!target?.ready){
  if(s.stage===1&&s.journey.reefEvolution&&has(p.genome,'filter'))return;
  p.cooldown=.4;
  const reason=target?.reason==='energy'?TEXT.attackEnergy:target?.detail??(target?INTERACTION_COPY[target.reason]:selection?SELECTION_COPY.missing:TEXT.noFood);
  const food=target?.kind==='food'?w.resources.find(r=>r.id===target.id):undefined;
  const prey=target?.kind==='prey'?w.creatures.find(c=>c.id===target.id):undefined;
  const name=food?FOOD_LABEL[food.kind]:prey?speciesById(prey.species).name:null;
  announce(s,!s.journey.legacy&&name?name+' · '+reason:reason);return;
 }
 const food=target.kind==='food'?w.resources.find(r=>r.id===target.id):undefined;
 const prey=target.kind==='prey'?w.creatures.find(c=>c.id===target.id):undefined;
 if(prey&&(!food||distance(prey.pos,p.pos)<distance(food.pos,p.pos))){
  if(p.energy<1.6){p.cooldown=.4;announce(s,TEXT.attackEnergy);return;}
  prey.health-=stats.damage;
  // An ordinary bite does not cancel a hunter's committed attack or change its
  // victim mid-lunge. Toxin and contact spines retain their explicit deterrence.
  if(s.journey.legacy||speciesById(prey.species).role!=='predator'){prey.fear=5;prey.target=-1;}
  p.energy-=1.6;p.cooldown=.65;p.feeding=.5;if(prey.health<=0)killCreature(s,prey,true);return;
 }
 if(!food){p.cooldown=.4;announce(s,TEXT.noFood);return;}
 learnNiche(s,food.pos,'forage');food.amount-=1;if(releaseCanopyAfterMeal(s,food))journeyNotice(s,CANOPY_COPY.released);const patch=w.patches[food.patch];patch.harvested++;patch.fertility=clamp(patch.fertility-.007,.15,1.5);patch.pressure+=.01;
 const extra=has(p.genome,'recycler')&&food.kind==='detritus';p.energy=clamp(p.energy+(extra?25:17),0,100);p.health=clamp(p.health+4,0,stats.maxHealth);p.moisture=clamp(p.moisture+(food.kind==='nectar'?20:6),0,100);
 const reward=s.journey.legacy?(extra?4:3):0;p.dna+=reward;p.totalDna+=reward;if(!s.journey.legacy)insight(s,`taste:${food.kind}`,6,'Nová potrava otevírá nový způsob života.');p.meals++;s.campaign.stageMeals++;p.cooldown=1.1;p.feeding=.65;
 shareMeal(s,food.kind);
 if(p.meals===1)announce(s,TEXT.firstMeal);
 if(food.amount<1)announce(s,TEXT.depletedSource);
}
function bond(s:GameState) {
 const p=s.player;if(p.cooldown>0){announce(s,INTERACTION_COPY.cooldown);return;}
 if(!has(p.genome,'symbiote')){announce(s,TEXT.needSymbiote);return;}
 if(p.bonds.length>=2){announce(s,TEXT.symbiosisFull);return;}
 const target=bondTarget(s);const c=target?.ready?s.world.creatures.find(c=>c.id===target.id):undefined;
 if(!c){announce(s,target?INTERACTION_COPY[target.reason]:TEXT.noPartner);return;}p.cooldown=1;if(p.energy<25){announce(s,TEXT.bondEnergy);return;}
 recordEcologyContact(s,`species:${c.species}`,'bond',speciesById(c.species).stage as 0|1|2,c.patch as 0|1|2);learnNiche(s,c.pos,'bond');p.energy-=25;p.bonds.push({species:c.species,loyalty:65,hunger:s.journey.legacy?10:c.hunger,benefit:c.species==='lantern'?'light':c.species==='mender'?'shield':'recycle',age:0});s.world.creatures.splice(s.world.creatures.indexOf(c),1);s.campaign.stageBonds++;s.world.patches[c.patch].restored++;s.world.patches[c.patch].fertility=clamp(s.world.patches[c.patch].fertility+.06,.15,1.5);announce(s,TEXT.partnerJoined(speciesById(c.species).name));
}
function tend(s:GameState) {
 const p=s.player;
 // A simultaneous meal can already have reported a discovery in this tick.
 // A rejected care press must not replace that actual event with cooldown text.
 if(!s.journey.legacy&&p.cooldown>0&&s.messages.at(-1)?.time===s.world.time)return;
 if(!s.journey.legacy){if(!actOnJourney(s))journeyNotice(s,'T patří živým kulturám. Hledej mateřský porost nebo nesený vzorek.');return;}
 if(p.cooldown>0)return;
 const target=tendTarget(s);if(target&&!target.ready){announce(s,INTERACTION_COPY[target.reason]);return;}
 const spring=target?.kind==='spring'?s.world.landmarks.find(l=>l.id===target.id):undefined;
 const source=target?.kind==='food'?s.world.resources.find(r=>r.id===target.id):undefined;
 const patch=source?s.world.patches[source.patch]:s.world.patches.reduce((a,b)=>horizontalDistance(a.center,spring?.pos??p.pos)<horizontalDistance(b.center,spring?.pos??p.pos)?a:b);
 if(!spring&&!source){announce(s,TEXT.noTend);p.cooldown=.8;return;}
 if(p.energy<15){announce(s,TEXT.tendEnergy);p.cooldown=.8;return;}
 learnNiche(s,target?.pos??p.pos,'restore');p.energy-=10;p.cooldown=2;p.feeding=.8;patch.fertility=clamp(patch.fertility+.065,.15,1.5);patch.restored++;patch.pressure=Math.max(0,patch.pressure-.05);
 const strength=p.bonds.length?2:1;
 s.world.resources.filter(r=>r.patch===patch.id&&r.kind!=='meat').forEach(r=>r.amount=Math.min(r.max,r.amount+.25*strength));
 if(spring){spring.charge=Math.min(10,spring.charge+strength);announce(s,TEXT.springRestored(spring.name,spring.charge));tryWin(s,'restoration');}
 else announce(s,TEXT.soilRestored);
}
function constrain(pos:{x:number;y:number;z:number},w:World,radius:number,clearance=1.2,previous={...pos},hullClearance=0) {
 pos.x=clamp(pos.x,-WORLD_BOUND,WORLD_BOUND);pos.z=clamp(pos.z,-WORLD_BOUND,WORLD_BOUND);
 if(w.stage===1)Object.assign(pos,resolveObstacleMotion(w,previous,pos,radius));
 else for(const o of w.obstacles){const dx=pos.x-o.pos.x,dz=pos.z-o.pos.z,dist=Math.hypot(dx,dz),bound=o.radius+radius;if(dist<bound){const angle=dist<.001?o.id:Math.atan2(dz,dx);pos.x=o.pos.x+Math.cos(angle)*bound;pos.z=o.pos.z+Math.sin(angle)*bound;}}
 if(w.stage===0)pos.y=Math.max(1.1,hullClearance);
 else if(w.stage===1)pos.y=clamp(pos.y,groundHeight(pos.x,pos.z,1)+Math.max(1.3,hullClearance),12);
 else pos.y=groundHeight(pos.x,pos.z,2)+clearance;
}
function npcStep(s:GameState,dt:number) {
 const w=s.world,p=s.player;const think=s.tick%30===0;
 for(const c of [...w.creatures]){
  const spec=speciesById(c.species);if(!s.journey.legacy&&spec.role==='predator')continue;c.age+=dt;c.cooldown=Math.max(0,c.cooldown-dt);c.fear=Math.max(0,c.fear-dt);c.hunger=clamp(c.hunger+dt*.14,0,100);
  if(think){
   const threats=w.creatures.filter(o=>o.id!==c.id&&hunterThreatening(s,o)&&distance(c.pos,o.pos)<13&&(s.journey.legacy||!lineBlocked(s,c.pos,o.pos)));
   const afraidPlayer=has(p.genome,'jaw')||has(p.genome,'spines')||c.fear>0;
   const threat=afraidPlayer&&distance(c.pos,p.pos)<(c.fear>0?12:carrierFearDistance(s,c))&&(s.journey.legacy||!lineBlocked(s,c.pos,p.pos))?p.pos:threats[0]?.pos;
   if(threat&&(spec.role!=='predator'||c.fear>0)){c.intent='flee';const d=distance(c.pos,threat)||1;c.velocity={x:(c.pos.x-threat.x)/d*spec.speed*1.3,y:w.stage===1?-.6:0,z:(c.pos.z-threat.z)/d*spec.speed*1.3};}
   else if(spec.role==='predator'){
    const candidates=w.creatures.filter(o=>['grazer','invasive'].includes(speciesById(o.species).role)&&distance(c.pos,o.pos)<25).sort((a,b)=>distance(c.pos,a.pos)-distance(c.pos,b.pos));
    const target=candidates[0];const playerRisk=(has(p.genome,'spines')||p.bonds.some(b=>b.benefit==='shield'));
    const targetPos=target?.pos??(!playerRisk&&distance(c.pos,p.pos)<17&&c.hunger>35?p.pos:null);
    if(targetPos){c.intent='hunt';c.target=target?.id??-1;const d=distance(c.pos,targetPos)||1;c.velocity={x:(targetPos.x-c.pos.x)/d*spec.speed,y:(targetPos.y-c.pos.y)/d*spec.speed,z:(targetPos.z-c.pos.z)/d*spec.speed};}
    else{c.intent='rest';c.velocity={x:0,y:0,z:0};}
   }else{
    const carried=migrationTarget(s,c),offered=journeyForageTarget(s,c);const food=offered??w.resources.filter(r=>r.amount>=1&&!isAttachedCrust(s,r.id)&&spec.diet.includes(r.kind)).sort((a,b)=>distance(c.pos,a.pos)-distance(c.pos,b.pos))[0];
    const destination=carried??(food&&(c.hunger>28||!!offered)?food.pos:null);
    if(destination){c.intent='forage';c.target=carried?-1:food!.id;const waypoint=s.journey.legacy?destination:steerToward(w,c.pos,destination,spec.size*.6,c.heading);const d=distance(c.pos,waypoint)||1,gap=distance(c.pos,destination),pace=carried?spec.speed*1.6:spec.speed,travel=s.journey.legacy?pace:Math.min(pace,d/.5,carried?Math.max(0,(gap-5)/.5):Infinity);c.velocity={x:(waypoint.x-c.pos.x)/d*travel,y:(waypoint.y-c.pos.y)/d*travel,z:(waypoint.z-c.pos.z)/d*travel};}
    else{c.intent='rest';if(!s.journey.legacy)c.target=null;c.velocity={x:0,y:0,z:0};}
   }
  }
  const previous={...c.pos};c.pos.x+=c.velocity.x*dt;c.pos.z+=c.velocity.z*dt;if(w.stage===1)c.pos.y+=c.velocity.y*dt;
  if(Math.hypot(c.velocity.x,c.velocity.z)>.1)c.heading=Math.atan2(c.velocity.x,c.velocity.z);
  constrain(c.pos,w,spec.size*.6,speciesGroundClearance(spec),previous);
  if(c.cooldown<=0){
   if(c.intent==='forage'){const r=w.resources.find(r=>r.id===c.target);if(r&&r.amount>=.5&&distance(c.pos,r.pos)<2&&(s.journey.legacy||!lineBlocked(s,c.pos,r.pos))){const hungerBefore=c.hunger;r.amount=Math.max(0,r.amount-.35);recordConsumption(s,c,r);c.hunger=Math.max(0,c.hunger-22);reproduceAfterMeal(s,c,r,hungerBefore);c.cooldown=10;if(spec.role==='invasive')w.patches[c.patch].fertility=clamp(w.patches[c.patch].fertility-.012,.15,1.5);}}
   if(c.intent==='hunt'){
    if(c.target===-1&&distance(c.pos,p.pos)<2.7&&p.invulnerable<=0){const stats=statsFor(p.genome);const shield=p.bonds.some(b=>b.benefit==='shield')? .5:1;const damage=Math.max(2,14*(1-stats.armor))*shield;p.health-=damage;p.invulnerable=1.2;c.cooldown=2.5;c.hunger=Math.max(0,c.hunger-6);if(has(p.genome,'spines')){c.health-=8;c.fear=6;if(c.health<=0)killCreature(s,c,true);}announce(s,TEXT.predatorHit(s.stage));}
    else {const prey=w.creatures.find(o=>o.id===c.target);if(prey&&distance(c.pos,prey.pos)<2.5){prey.health-=9;prey.fear=4;c.cooldown=3;if(prey.health<=0){killCreature(s,prey,false);c.hunger=0;}}}
   }
  }
  if(c.hunger>=100&&c.age>200){c.health-=dt*.08;if(c.health<=0)killCreature(s,c,false,'starvation');}
  const exposure=carrierHealthRate(s,c);if(exposure.health){const nextHealth=c.health+dt*exposure.health;c.health=exposure.health>0?Math.max(c.health,Math.min(32,nextHealth)):nextHealth;if(exposure.sharesWater)p.moisture=Math.max(0,p.moisture-dt*.5);if(c.health<=0)killCreature(s,c,false,'exposure');}
 }
 // V3 births occur at real meals. Historical worlds retain their refill rule.
 if(s.tick%1800===0){
  if(s.journey.version!==3||s.journey.legacy)for(const patch of w.patches){
   for(const spec of stageSpecies(s.stage)){
    if(!s.journey.legacy&&((spec.role==='partner'&&patch.id!==2&&!(s.stage===1&&patch.id===1))||(spec.role==='grazer'&&patch.id===2)))continue;
    const existing=w.creatures.filter(c=>c.species===spec.id&&c.patch===patch.id).length;
    const cap=spec.role==='predator'?1:spec.role==='invasive'?(s.campaign.finale==='predator'?1:Math.max(1,4-Math.floor(patch.hunted/3))):Math.max(1,Math.round(patch.fertility*3));
    if(existing<cap&&w.creatures.length<48&&random(w)<(spec.role==='partner'?.75:patch.fertility*.6)){w.creatures.push(spawnCreature(w,spec.id,patch.id));w.births++;}
   }
  }
  const remains=w.resources.filter(r=>r.kind==='meat'&&r.amount>=.2).slice(-40);w.resources=[...w.resources.filter(r=>r.kind!=='meat'),...remains];
 }
}
function pulse(s: GameState) {
 const p=s.player;
 if((s.journey.legacy?p.cooldown:p.abilityRecharge)>0)return;
 const lock=(duration:number)=>{if(s.journey.legacy)p.cooldown=duration;else {p.abilityRecharge=duration;p.cooldown=Math.max(p.cooldown,.25);}};
 if(has(p.genome,'toxin')&&p.energy>=15){
  const profile=profileFor(p.genome);p.energy-=15;lock(7);p.feeding=1.3;
  for(const c of [...s.world.creatures])if(distance(c.pos,p.pos)<profile.toxinRadius){c.health-=profile.toxinDamage;c.fear=10;if(c.health<=0)killCreature(s,c,true);}
  announce(s,TEXT.toxinPulse);
 }else if(has(p.genome,'sonar')&&p.energy>=3){p.energy-=3;lock(4);p.scan=5;p.feeding=1;announce(s,TEXT.sonarPulse);}
 else if(has(p.genome,'sonar'))announce(s,TEXT.sonarEnergy);
}

export function step(s:GameState,input:Input,dt=1/60) {
 if(s.deathReason||awaitingOrganismVictory(s))return;
 if(!isOrganismStage(s.stage)){
  const tribe=activeTribe(s);
  if(s.stage===3&&tribe){
   dt=clamp(dt,0,1/30);s.tick++;s.world.time+=dt;
   const completed=tribe.completed;
   stepEnvironment(s,dt);
   stepTribeWildlife(s,tribe,dt);
   for(const message of stepTribe(s,dt))announce(s,message);
   if(!completed&&tribe.completed)makeCheckpoint(s);
  }else if(s.stage===5&&activePlanet(s)){
   dt=clamp(dt,0,1/30);s.tick++;s.world.time+=dt;const completed=activePlanet(s)!.completed;
   stepEnvironment(s,dt);if(tribe)stepTribeWildlife(s,{...tribe,members:[]},dt);
   for(const message of stepPlanet(s,input,dt))announce(s,message);
   if(!completed&&activePlanet(s)!.completed){s.lineage.push({generation:s.player.generation,stage:5,time:s.tick/60,name:s.player.genome.name,parts:s.player.genome.parts.map(p=>p.kind),event:PLANET_COPY.ready});makeCheckpoint(s);}
  }else if(s.stage===4&&activeMachines(s)){
   dt=clamp(dt,0,1/30);s.tick++;s.world.time+=dt;
   const machines=activeMachines(s)!,completed=machines.completed;
   stepEnvironment(s,dt);
   if(tribe)stepTribeWildlife(s,{...tribe,members:[]},dt);
   for(const message of stepMachines(s,dt))announce(s,message);
   if(!completed&&machines.completed)makeCheckpoint(s);
  }
  return;
 }
 dt=clamp(dt,0,1/30);s.tick++;s.world.time+=dt;
 const ctx=beginStep(s,input,dt);
 stepEnvironment(s,dt);
 applyPlayerActions(s,input,ctx);
 stepWorld(s,dt,ctx);
 resolveOutcomes(s);
}

function beginStep(s:GameState,input:Input,dt:number) {
 const w=s.world,p=s.player,stats=statsFor(p.genome),profile=profileFor(p.genome);
 p.cooldown=Math.max(0,p.cooldown-dt);p.abilityRecharge=Math.max(0,p.abilityRecharge-dt);p.scan=Math.max(0,p.scan-dt);p.invulnerable=Math.max(0,p.invulnerable-dt);p.feeding=Math.max(0,p.feeding-dt);
 const len=Math.hypot(input.x,input.z);const sprint=input.sprint&&p.energy>8;
 const reef=s.stage===1?s.journey.reefEvolution:undefined;
 if(reef){const pumping=input.feed&&has(p.genome,'filter')&&p.energy>2;reef.pumping=clamp(reef.pumping+dt*(pumping?4:-6),0,1);}
 const reefBody=reef?reefBodyProfile(p.genome,reef.pumping):undefined;
 const motionProfile=reefBody?.motion??locomotionProfile(p.genome,s.stage,s.journey.legacy);
 const speed=motionProfile.speed*(sprint?(has(p.genome,'jet')&&s.stage===1?2.1:1.55):1)*(p.energy<8?.55:1);
 const previous={...p.pos};
 const motion=advanceLocomotion(p,{x:input.x,z:input.z},speed,motionProfile,dt);p.heading=motion.heading;p.velocity.x=motion.velocity.x;p.velocity.z=motion.velocity.z;
 p.velocity.y=s.stage===1?input.vertical*motionProfile.verticalThrust+(reefBody?.buoyancy??0):0;
 // Currents are local conditions. Tail and fins help sustain a heading through them.
 const current=s.journey.legacy&&s.stage<2&&horizontalDistance(p.pos,w.patches[1].center)<24?(s.stage===1?2.2:1.25)/profile.currentResistance:0;
 const flow=environmentalFlow(s,p.pos);p.pos.x+=(p.velocity.x+current+flow.x/profile.currentResistance)*dt;p.pos.z+=(p.velocity.z+flow.z/profile.currentResistance)*dt;p.pos.y+=(p.velocity.y+flow.y/profile.currentResistance)*dt;
 constrain(p.pos,w,bodyCollisionRadius(p.genome,s.stage),organismGroundClearance(p.genome),previous,p.genome.spine?bodyGroundClearance(p.genome):0);p.distance+=horizontalDistance(previous,p.pos);

 const metabolism=Math.max(.025,stats.metabolism*.035);p.energy-=dt*(metabolism+(len>.1?.07:0)+(sprint?.7:0)+p.bonds.length*.1/Math.max(.5,profile.partnerSupport)+Math.abs(input.vertical)*.05+(reefBody?.pumpEnergy??0));
 if(has(p.genome,'chloroplast')&&w.patches[0].discovered&&horizontalDistance(p.pos,w.patches[0].center)<29)p.energy+=dt*profile.photosynthesis;
 if(s.stage===1){
  if(s.journey.legacy){if(has(p.genome,'gills')||p.pos.y>10.5)p.oxygen=Math.min(100,p.oxygen+dt*(p.pos.y>10.5?6:profile.gillExchange));else p.oxygen-=dt*(has(p.genome,'lungs')?.7:.4)*100/stats.oxygen;}
  else p.oxygen+=dt*(reef?reefBodyRespiration:reefRespiration)(p.genome,w,p.pos,Math.min(1,len+Math.abs(input.vertical)),reefWater(s,p.pos).oxygenUse);
  if(p.oxygen<=0)p.health-=dt*4;
 }
 if(s.stage===2){
  if(!has(p.genome,'lungs'))p.health-=dt*6;
  if(!s.campaign.won||s.campaign.finale==='migration')s.campaign.drought=clamp(s.campaign.drought+dt/240,0,1);
  const moisture=hydrationAt(s,p.pos),drying=(.22+s.campaign.drought*.25)*100/stats.moisture;
  p.moisture=clamp(p.moisture+dt*(moisture>0?moisture:-drying),0,100);if(p.moisture<=0)p.health-=dt*1.5;
  if(s.tick%60===0&&s.campaign.drought>.65&&!s.campaign.journals.includes('drought-peak')){s.campaign.journals.push('drought-peak');announce(s,TEXT.droughtPeak);}
 }
 if(p.energy<=0)p.health-=dt*1.8;p.energy=clamp(p.energy,0,100);p.oxygen=clamp(p.oxygen,0,100);
 if(nearNest(s)&&p.energy>15){p.health=Math.min(stats.maxHealth,p.health+dt*1.5);p.oxygen=Math.min(100,p.oxygen+dt*5);p.moisture=Math.min(100,p.moisture+dt*5);}
 for(const b of [...p.bonds]){b.age+=dt;b.hunger=Math.min(100,b.hunger+dt*.27/Math.max(.5,profile.partnerSupport));if(b.hunger>70)b.loyalty-=dt*.4;else b.loyalty=Math.min(100,b.loyalty+dt*.012);if(b.benefit==='recycle'&&b.hunger<70)p.energy+=dt*.12;if(b.loyalty<=0){p.bonds.splice(p.bonds.indexOf(b),1);announce(s,TEXT.bondLost);}}
 p.energy=clamp(p.energy,0,100);
 for(const patch of w.patches){if(!patch.discovered&&horizontalDistance(p.pos,patch.center)<patch.radius*.7){patch.discovered=true;const label=`${s.stage}:${patch.id}`;s.campaign.discoveries.push(label);p.dna+=8;p.totalDna+=8;announce(s,TEXT.patchDiscovered(patch.name));}patch.pressure=Math.max(0,patch.pressure-dt*.0002);}
 return {p,stats,previous,sprint,reef};
}
type StepContext = ReturnType<typeof beginStep>;

function stepEnvironment(s:GameState,dt:number) {
 const w=s.world;
 const climate=getClimate(s);
 for(const patch of w.patches)if(s.stage===2)patch.fertility=clamp(patch.fertility-dt*.00075*climate.patchStress[patch.id],.15,1.5);
 for(const r of w.resources){if(r.kind!=='meat'){const patch=w.patches[r.patch],stress=climate.patchStress[r.patch]??0;
  const regrowth=r.regen*patch.fertility*(1-Math.min(.85,patch.pressure))*(1-stress*.9);
  const drying=stress>.4?.008*(stress-.4):0;r.amount=clamp(r.amount+dt*(regrowth-drying),0,r.max);
 }}
}

function applyPlayerActions(s:GameState,input:Input,{p,stats,reef}:StepContext) {
 // A defensive pulse can interrupt eating in a journey. Its own recharge keeps
 // held Space from starving X, and feeding cannot overwrite the ability timer.
 if(input.pulse&&!s.journey.legacy)pulse(s);
 if(input.feed&&!(reef&&input.tend))feed(s,stats,input.feedSelection);if(input.bond)bond(s);if(input.tend)tend(s);if(input.offer&&!s.journey.legacy&&p.cooldown<=0)actOnJourney(s,true);
 if(input.pulse&&s.journey.legacy)pulse(s);
}

/** Unit and planet simulation belongs here when those eras become playable. */
function stepWorld(s:GameState,dt:number,{previous,sprint}:StepContext) {
 if(!s.journey.legacy)stepHunters(s,dt,(c,byPlayer,cause)=>killCreature(s,c,byPlayer,cause));
 npcStep(s,dt);stepJourney(s,dt,previous,sprint);
}

function resolveOutcomes(s:GameState) {
 const p=s.player;
 const finale=!s.journey.legacy?journeyFinale(s):null;if(finale)tryWin(s,finale);
 if(s.stage===2&&s.campaign.stageKills>=12)tryWin(s,'predator');
 if(p.health<=0){p.health=0;s.deathReason=p.energy<=0?TEXT.deathEnergy:p.oxygen<=0?TEXT.deathOxygen:p.moisture<=0?TEXT.deathMoisture:TEXT.deathPredator;announce(s,TEXT.death);}
}
export function summary(s:GameState) { return {stage:s.stage,...(s.tribe?{tribe:s.tribe}:{}),...(s.machines?{machines:s.machines}:{}),...(s.planet?{planet:s.planet}:{}),tick:s.tick,seed:s.seed,player:s.player,campaign:s.campaign,...(s.journey.rootDispersal?{rootDispersal:s.journey.rootDispersal}:{}),world:{time:s.world.time,patches:s.world.patches,landmarks:s.world.landmarks,resources:s.world.resources.filter(r=>r.amount>=1),creatures:s.world.creatures,obstacles:s.world.obstacles,births:s.world.births,deaths:s.world.deaths},requirements:transitionRequirements(s),deathReason:s.deathReason,climate:getClimate(s),field:fieldProgress(s),stats:statsFor(s.player.genome)}; }

export function senseRange(s:GameState):number { const p=s.player;return statsFor(p.genome).sense+(hasActivePartner(s,'light')?16:0)+(has(p.genome,'sonar')&&p.scan>0?35:0); }

export function fieldProgress(s:GameState){return s.world.patches.map(p=>({patchId:p.id,name:p.name,done:s.campaign.journals.some(j=>j.startsWith(`field:${s.stage}:${p.id}:`))}));}
function learnNiche(s:GameState,pos:{x:number;z:number},method:'forage'|'hunt'|'bond'|'restore'){
 if(!s.journey.legacy)return;
 const patch=s.world.patches.find(p=>horizontalDistance(p.center,pos)<p.radius);if(!patch)return;
 const prefix=`field:${s.stage}:${patch.id}:`;if(s.campaign.journals.some(j=>j.startsWith(prefix)))return;
 s.campaign.journals.push(prefix+method);s.player.dna+=5;s.player.totalDna+=5;announce(s,TEXT.nicheLearned(patch.name));
}
