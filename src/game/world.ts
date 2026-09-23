import { worldSpecies, type NpcDesign } from './npc-genome';
import { worldStageFor } from './stage';
import { speciesGroundClearance } from './anatomy';
import type { World, Stage, Vec3, FoodKind, Creature } from './types';
import { random, horizontalDistance, groundHeight } from './random';
import { PATCH_NAMES, stageSpecies } from './content';
export const WORLD_BOUND=78;
export function surfaceY(stage:Stage,x:number,z:number) { return stage===0 ? 1.1 : stage===1 ? groundHeight(x,z,stage)+2.2 : groundHeight(x,z,stage)+1.2; }
export function spawnCreature(w:World,species:string,patch:number):Creature {
 const p=w.patches[patch]; const a=random(w)*Math.PI*2,r=6+random(w)*16;
 const x=p.center.x+Math.cos(a)*r,z=p.center.z+Math.sin(a)*r;
 return {id:w.nextId++,species,pos:{x,y:w.stage===2?groundHeight(x,z,2)+speciesGroundClearance(worldSpecies(w,species)):surfaceY(w.stage,x,z)+(w.stage===1?random(w)*5:0),z},velocity:{x:0,y:0,z:0},heading:a,health:worldSpecies(w,species).maxHealth??(worldSpecies(w,species).role==='predator'?55:32),hunger:40+random(w)*40,age:0,fear:0,intent:'forage',target:null,cooldown:0,patch};
}
export function createWorld(seed:number,campaignStage:Stage,designs?:NpcDesign[]):World {
 const stage=worldStageFor(campaignStage);
 const w:World={...(stage===2&&designs?{creatureDesigns:structuredClone(designs)}:{}),seed,stage,rng:(seed+stage*77237)>>>0,time:0,resources:[],creatures:[],patches:[],obstacles:[],landmarks:[],nextId:1,births:0,deaths:0};
 const centers=[{x:-37,z:-20},{x:37,z:-20},{x:0,z:39}];
 const colors=[[0x95dfb8,0xa2cdd6,0xaaa2d2],[0xe8a9b6,0x75bdaa,0x9b8ace],[0xbcbd7f,0xd4a77b,0x9ba6cd]][stage];
 w.patches=centers.map((p,i)=>({id:i,name:PATCH_NAMES[stage][i][0],subtitle:PATCH_NAMES[stage][i][1],center:{...p,y:surfaceY(stage,p.x,p.z)},radius:29,fertility:1,pressure:0,hunted:0,harvested:0,restored:0,color:colors[i],discovered:false}));
 const pos=(x:number,z:number):Vec3=>({x,y:surfaceY(stage,x,z),z});
 w.landmarks=[{id:'nest',kind:'nest',name:'Kolébka linie',pos:pos(0,0),charge:0},{id:'gate',kind:'gate',name:stage===0?'Proud do útesů':stage===1?'Cesta na souš':'Svatyně deště',pos:pos(0,-66),charge:0}];
 if(stage===2) w.patches.forEach((p,i)=>w.landmarks.push({id:`spring-${i}`,kind:'spring',name:`Pramen ${i+1}`,pos:pos(p.center.x,p.center.z),charge:0}));
 for (const p of w.patches) {
   for(let i=0;i<9;i++) {
     const a=random(w)*Math.PI*2,r=11+random(w)*17,x=p.center.x+Math.cos(a)*r,z=p.center.z+Math.sin(a)*r;
     if(w.landmarks.some(l=>horizontalDistance(l.pos,{x,z})<8)) continue;
     w.obstacles.push({id:w.nextId++,pos:{x,y:groundHeight(x,z,stage),z},radius:1.6+random(w)*2.2,height:3+random(w)*6,kind:stage===2?(i%3?'tree':'rock'):stage===1?'coral':'rock'});
   }
   for(let i=0;i<30;i++) {
     const a=random(w)*Math.PI*2,r=3+random(w)*22,x=p.center.x+Math.cos(a)*r,z=p.center.z+Math.sin(a)*r;
     if(w.obstacles.some(o=>horizontalDistance(o.pos,{x,z})<o.radius+2)) continue;
     const kinds:FoodKind[] = stage===2?['nectar','algae','detritus']:stage===1?['nectar','algae','mineral']:['algae','mineral','detritus'];
     const kind = i%5===0?'detritus':i%5===1?'algae':kinds[p.id];
     const max=4+Math.floor(random(w)*5);
     w.resources.push({id:w.nextId++,kind,pos:{x,y:surfaceY(stage,x,z)+(stage===1&&i%3===0?4:0),z},amount:max,max,patch:p.id,regen:.004});
   }
   for(const spec of stageSpecies(stage)) {
     const count=spec.role==='predator'?1:spec.role==='invasive'?4:3;
     for(let i=0;i<count;i++)w.creatures.push(spawnCreature(w,spec.id,p.id));
   }
 }
 // Guaranteed accessible nursery resource fan, independent of random obstacles.
 for(let i=0;i<9;i++){const a=i*.75,x=Math.sin(a)*(6+i*.9),z=-Math.cos(a)*(6+i*.9);w.resources.push({id:w.nextId++,kind:i%3===0?'detritus':'algae',pos:pos(x,z),amount:5,max:5,patch:i%3,regen:.002});}
 w.obstacles=w.obstacles.filter(o=>!w.resources.some(r=>horizontalDistance(o.pos,r.pos)<o.radius+1.2));
 return w;
}
