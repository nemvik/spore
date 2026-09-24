import { speciesCollisionRadius } from './anatomy';
import { worldSpecies } from './npc-genome';
import { recordEcologyMeal } from './ecology-catalog';
import type { Creature, GameState, Vec3 } from './types';
import type { ActiveTribeState } from './era-types';
import { has } from './genome';
import { clamp, groundHeight, horizontalDistance } from './random';
import { steerToward } from './navigation';
import { resolveObstacleMotion } from './obstacle-geometry';
import { cultureEffects } from './culture';

/** The coast stays populated during command play. Existing creature fields carry
 * its intent/velocity/cooldown through saves; it never targets the retired body. */
export function removeTribePrey(s: GameState, prey: Creature): void {
  const index=s.world.creatures.indexOf(prey);if(index<0)return;
  s.world.creatures.splice(index,1);s.world.deaths++;
  // Carried tissue dies with its actual carrier, just as on the organism coast.
  const dispersal=s.journey.rootDispersal;
  if(dispersal)dispersal.carried=dispersal.carried.filter(fragment=>fragment.carrierId!==prey.id);
  s.world.resources.push({id:s.world.nextId++,kind:'meat',pos:{...prey.pos},amount:5,max:5,patch:prey.patch,regen:0});
  const patch=s.world.patches[prey.patch];patch.hunted++;
  const role=worldSpecies(s.world,prey.species).role;
  if(role==='invasive')patch.fertility=Math.min(1.5,patch.fertility+.03);
  else if(role==='grazer')patch.pressure=Math.min(1,patch.pressure+.03);
}
export function stepTribeWildlife(s: GameState, tribe: ActiveTribeState, dt: number): void {
  const world=s.world,units=tribe.members.filter(u=>u.health>0);
  for(const c of [...world.creatures].sort((a,b)=>a.id-b.id)){
    if(c.health<=0||!world.creatures.includes(c))continue;
    const spec=worldSpecies(s.world,c.species),predator=spec.role==='predator';
    c.age+=dt;c.hunger=Math.min(100,c.hunger+dt*.14);c.cooldown=Math.max(0,c.cooldown-dt);c.fear=Math.max(0,c.fear-dt);
    const near=[...units].filter(u=>u.health>0).sort((a,b)=>horizontalDistance(a.pos,c.pos)-horizontalDistance(b.pos,c.pos)||a.id-b.id)[0];
    if(s.tick%30===0){
      let destination:Vec3|null=null,pace=spec.speed;
      const frightened=near&&horizontalDistance(c.pos,near.pos)<(c.fear>0?14:7)&&(c.fear>0||!predator&&(near.tool==='spear'||has(s.player.genome,'jaw')));
      c.target=null;
      if(frightened){const gap=horizontalDistance(c.pos,near.pos)||1;destination={x:clamp(c.pos.x+(c.pos.x-near.pos.x)/gap*10,-75,75),y:c.pos.y,z:clamp(c.pos.z+(c.pos.z-near.pos.z)/gap*10,-75,75)};c.intent='flee';pace*=1.15;}
      else if(predator&&c.hunger>35){
        const prey=world.creatures.filter(o=>o.id!==c.id&&['grazer','invasive'].includes(worldSpecies(s.world,o.species).role)&&horizontalDistance(o.pos,c.pos)<20).sort((a,b)=>horizontalDistance(a.pos,c.pos)-horizontalDistance(b.pos,c.pos)||a.id-b.id)[0];
        if(near&&horizontalDistance(near.pos,c.pos)<10&&(!prey||horizontalDistance(near.pos,c.pos)<horizontalDistance(prey.pos,c.pos)))destination=near.pos;
        else if(prey){destination=prey.pos;c.target=prey.id;}
        c.intent=destination?'hunt':'rest';
      }else if(!predator&&c.hunger>28){
        const food=world.resources.filter(r=>r.amount>=.5&&spec.diet.includes(r.kind)).sort((a,b)=>horizontalDistance(a.pos,c.pos)-horizontalDistance(b.pos,c.pos)||a.id-b.id)[0];
        if(food){destination=food.pos;c.target=food.id;c.intent='forage';}else c.intent='rest';
      }else c.intent='rest';
      if(destination){const waypoint=steerToward(world,c.pos,destination,speciesCollisionRadius(spec),c.heading),gap=horizontalDistance(c.pos,waypoint)||1;const speed=Math.min(pace,gap/.5);c.velocity={x:(waypoint.x-c.pos.x)/gap*speed,y:0,z:(waypoint.z-c.pos.z)/gap*speed};}
      else c.velocity={x:0,y:0,z:0};
    }
    const previous={...c.pos};c.pos=resolveObstacleMotion(world,previous,{x:clamp(c.pos.x+c.velocity.x*dt,-76,76),y:c.pos.y,z:clamp(c.pos.z+c.velocity.z*dt,-76,76)},speciesCollisionRadius(spec));
    // Preserve the species' physical height offset from the inherited ground.
    c.pos.y=groundHeight(c.pos.x,c.pos.z,2)+Math.max(.25,previous.y-groundHeight(previous.x,previous.z,2));
    if(Math.hypot(c.velocity.x,c.velocity.z)>.01)c.heading=Math.atan2(c.velocity.x,c.velocity.z);
    if(c.cooldown===0&&c.intent==='forage'){
      const food=world.resources.find(r=>r.id===c.target);
      if(food&&food.amount>=.5&&spec.diet.includes(food.kind)&&horizontalDistance(food.pos,c.pos)<2){recordEcologyMeal(s,c,food);food.amount-=.35;c.hunger=Math.max(0,c.hunger-22);c.cooldown=10;}
    }else if(c.cooldown===0&&c.intent==='hunt'){
      if(c.target!==null){const prey=world.creatures.find(o=>o.id===c.target);if(prey&&horizontalDistance(prey.pos,c.pos)<2.7){prey.health=Math.max(0,prey.health-(spec.damage??9)*(1-(worldSpecies(s.world,prey.species).armor??0)));prey.fear=5;c.cooldown=3;if(prey.health===0){removeTribePrey(s,prey);c.hunger=0;}}}
      else if(near&&horizontalDistance(near.pos,c.pos)<2.7){const guarded=tribe.legacyAbility==='predator'&&tribe.abilityTime>0;near.health=Math.max(0,near.health-(spec.damage!==undefined?spec.damage*(guarded?4/9:1):(guarded?4:9))*cultureEffects(near.outfit).damageTaken);c.cooldown=3;c.hunger=Math.max(0,c.hunger-6);}
    }
  }
  if(s.tick%1800===0){
    // Match the organism era's bounded remains; old untouched carcasses must
    // not accumulate beyond the saved-world limit during an open sandbox.
    const remains=world.resources.filter(r=>r.kind==='meat'&&r.amount>=.2).slice(-40);
    world.resources=[...world.resources.filter(r=>r.kind!=='meat'),...remains];
  }
}
