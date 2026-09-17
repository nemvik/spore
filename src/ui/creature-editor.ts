import { resolveCreatureAnatomy, type CreatureAnatomy } from '../game/creature-anatomy';
import { computeStats } from '../game/genome';
import type { Stats } from '../game/types';
import { upgradeCreatureGenome, sampleCreatureSection } from '../game/creature-body';
import { getAdaptation } from '../game/adaptation-catalog';
import type { AdaptationId, CreatureGenome, Genome, LimbGene, Part, Vec3 } from '../game/types';

export type CreatureSelection = {kind:'spine';nodeId:string}|{kind:'part';partId:string}|{kind:'joint';partId:string;jointId:string}|{kind:'end';partId:string};
export interface CreatureEditState {draft:Genome;selection:CreatureSelection|null;undo:Genome[];redo:Genome[];before:Genome|null;}
const copy=(g:Genome)=>structuredClone(g);
const genomeKey=(g:Genome)=>JSON.stringify(g,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
const equal=(a:Genome,b:Genome)=>genomeKey(a)===genomeKey(b);
export const creatureEditChanged=(s:CreatureEditState):boolean=>!!s.before&&!equal(s.before,s.draft);
/** History stores genomes, so selection must be reconciled with each restored snapshot. */
function restoreCreatureDraft(s:CreatureEditState,genome:Genome):void {
 const previous=s.draft,selection=s.selection;s.draft=copy(genome);if(!selection)return;
 if(selection.kind==='spine'){
  if(s.draft.version!==2){s.selection=null;return;}
  const nodes=s.draft.body.spine;if(nodes.some(n=>n.id===selection.nodeId))return;
  const old=previous.version===2?previous.body.spine.find(n=>n.id===selection.nodeId):undefined;
  const nearest=old&&nodes.length?nodes.reduce((a,b)=>Math.abs(a.axial-old.axial)<Math.abs(b.axial-old.axial)?a:b):nodes[0];
  s.selection=nearest?{kind:'spine',nodeId:nearest.id}:null;return;
 }
 const part=s.draft.parts.find(p=>p.id===selection.partId);if(!part){s.selection=null;return;}
 if(selection.kind==='part')return;
 if(!part.limb){s.selection={kind:'part',partId:part.id};return;}
 if(selection.kind==='end'||part.limb.joints.some(j=>j.id===selection.jointId))return;
 const old=previous.parts.find(p=>p.id===selection.partId)?.limb?.joints.find(j=>j.id===selection.jointId);
 const joints=part.limb.joints,nearest=old&&joints.length?joints.reduce((a,b)=>distance(a.offset,old.offset)<distance(b.offset,old.offset)?a:b):joints[0];
 s.selection=nearest?{kind:'joint',partId:part.id,jointId:nearest.id}:{kind:'part',partId:part.id};
}
export function beginCreatureEdit(s:CreatureEditState):void {s.before??=copy(s.draft);}
export function finishCreatureEdit(s:CreatureEditState,cancel=false):void {
 const before=s.before;s.before=null;if(!before)return;
 if(cancel){restoreCreatureDraft(s,before);return;}
 if(equal(before,s.draft))return;
 s.undo.push(before);if(s.undo.length>40)s.undo.shift();s.redo=[];
 // Committed drafts are separate from snapshots and any preview consumer.
 s.draft=copy(s.draft);
}
export function undoCreatureEdit(s:CreatureEditState):void {finishCreatureEdit(s);const g=s.undo.pop();if(g){s.redo.push(copy(s.draft));restoreCreatureDraft(s,g);}}
export function redoCreatureEdit(s:CreatureEditState):void {finishCreatureEdit(s);const g=s.redo.pop();if(g){s.undo.push(copy(s.draft));restoreCreatureDraft(s,g);}}
/** Conversion alone is not an edit. Its snapshot remains the exact legacy genome. */
export function editCreatureSkeleton(s:CreatureEditState,change:(g:CreatureGenome)=>void,finish=true):void {
 beginCreatureEdit(s);
 if(s.draft.version===1){const candidate=upgradeCreatureGenome(s.draft),before=JSON.stringify(candidate);change(candidate);if(JSON.stringify(candidate)!==before)s.draft=candidate;}
 else change(s.draft);
 if(finish)finishCreatureEdit(s);
}
export type CreatureIds=(g:Genome,prefix:string)=>string;
export function createCreatureIds():CreatureIds {
 let serial=0;return(g,prefix)=>{const used=new Set([...g.parts.map(p=>p.id),...g.parts.flatMap(p=>p.limb?.joints.map(j=>j.id)??[]),...(g.version===2?g.body.spine.map(n=>n.id):[])]);let id;do{id=`${prefix}-edit-${++serial}`;}while(used.has(id));return id;};
}
export function insertCreatureSpine(g:CreatureGenome,after:string,ids:CreatureIds):string|null {
 const i=g.body.spine.findIndex(n=>n.id===after),a=g.body.spine[i],b=g.body.spine[i+1];if(!a||!b||g.body.spine.length>=15||b.axial-a.axial<.16-1e-9)return null;
 const axial=(a.axial+b.axial)/2,id=ids(g,'spine');g.body.spine.splice(i+1,0,{id,axial,...sampleCreatureSection(g,axial)});return id;
}
export function removeCreatureSpine(g:CreatureGenome,id:string):boolean {const i=g.body.spine.findIndex(n=>n.id===id);if(i<=0||i>=g.body.spine.length-1||g.body.spine.length<=3)return false;g.body.spine.splice(i,1);return true;}
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export function insertCreatureJoint(p:Part,before:string,ids:CreatureIds,g:Genome):string|null {
 const joints=p.limb?.joints,i=joints?.findIndex(j=>j.id===before)??-1;if(!joints||i<0||joints.length>=4)return null;const a=i?joints[i-1].offset:{x:0,y:0,z:0},b=joints[i].offset;if(distance(a,b)<.4-1e-9)return null;
 const id=ids(g,'joint');joints.splice(i,0,{id,offset:{x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2},radius:joints[i].radius});return id;
}
export function removeCreatureJoint(p:Part,id:string):boolean {const joints=p.limb?.joints,i=joints?.findIndex(j=>j.id===id)??-1;if(!joints||i<0||i>=joints.length-1||joints.length<=2)return false;const a=i?joints[i-1].offset:{x:0,y:0,z:0},length=distance(a,joints[i+1].offset);if(length>1.5||length<.2)return false;joints.splice(i,1);return true;}
export function canAddCreaturePart(g:Genome,kind:AdaptationId):boolean {
 if(g.parts.length>=18)return false;const mouths=['filter','jaw','proboscis'];if(kind==='jaw'&&g.parts.some(p=>p.kind==='filter')||kind==='filter'&&g.parts.some(p=>p.kind==='jaw'))return false;
 if(g.version===1&&kind==='arms')return false;
 const max=g.version===2?(kind==='legs'?3:kind==='arms'?2:mouths.includes(kind)?3:getAdaptation(kind).max):getAdaptation(kind).max;
 return g.parts.filter(p=>p.kind===kind).length<max&&!(g.version===2&&mouths.includes(kind)&&g.parts.filter(p=>mouths.includes(p.kind)).length>=3);
}
export function defaultCreatureLimb(kind:'legs'|'arms'):LimbGene {return kind==='legs'?{joints:[{id:'knee',offset:{x:.48,y:-.34,z:-.14},radius:.135},{id:'ankle',offset:{x:.77,y:-1.14,z:.16},radius:.1}],end:{kind:'foot',style:'pad',scale:1}}:{joints:[{id:'elbow',offset:{x:.3,y:-.2,z:.08},radius:.11},{id:'wrist',offset:{x:.5,y:-.48,z:.2},radius:.08}],end:{kind:'hand',style:'palm',scale:.8}};}

export interface CreaturePreview {revision:number;genome:Genome;anatomy?:CreatureAnatomy;stats:Stats;}
/** Editor-local content revisions: never put the mutable draft in installed runtime caches.
 * Call once from the RAF refresh after input; all consumers share this snapshot.
 */
export function createCreaturePreviewCache():(g:Genome)=>CreaturePreview {
 let key='',revision=0,current:CreaturePreview;
 return g=>{const next=JSON.stringify(g);if(next!==key){key=next;const genome=copy(g),anatomy=genome.version===2?resolveCreatureAnatomy(genome):undefined;current={revision:++revision,genome,anatomy,stats:computeStats(genome,anatomy)};}return current;};
}
