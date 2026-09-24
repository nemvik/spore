import { syncAnimalMarker } from './domestication';
import { cellScale, cellCameraZoom, cellFoodScale } from '../game/cell-growth';
import { CellPresentation } from './cell-growth';
import { worldSpecies } from '../game/npc-genome';
import { CreatureStagePresentation, animateSpeciesResponse } from './creature-stage';
import { creaturePreviewTarget, PREVIEW_ENVIRONMENT, type CreaturePreview } from '../ui/creature-preview';
import { creaturePoseContext } from '../game/creature-motion';
import { emptyCreatureActions } from '../game/creature-actions';
import { WORLD_BOUND } from '../game/world';
import type { CreatureCapabilities } from '../game/creature-capabilities';
import type { CreatureAnatomy } from '../game/creature-anatomy';
import { createCreatureHandles, startCreatureDrag, creatureDragDelta, type CreatureHandle, type CreatureDrag } from './creature-handles';
import { upgradeCreatureGenome } from '../game/creature-body';
import type { CreatureSelection } from '../ui/creature-editor';
import { creaturePresentationBounds, poseCreatureLimb } from './creature-body';
import { bodyGroundClearance } from '../game/anatomy';
import { selectBodySection } from './body-selection';
import { bodyWidth, spineIndex, spineAxial } from '../game/body-shape';
import type { Blueprint, VehicleBlueprint } from '../game/blueprint';
import { vehicleStats } from '../game/blueprint';
import { createMachine, animateMachine, machineAttachmentOnBody } from './machine';
import { controlModelFor, isOrganismStage } from '../game/stage';
import * as THREE from 'three';
import { JourneyPresentation } from './journey';
import { RootDispersalPresentation } from './root-dispersal';
import type { FeedSelection, GameState, Genome, Settings, Resource, Stage, Vec3, World } from '../game/types';
import { createHabitat, isElevatedShelf, updateHabitat } from './habitat';
import { createOrganism, animateOrganism, createSpeciesModel, animateSpeciesModel, disposeObject, attachmentOnBody, selectOrganismPart, organismGroundClearance } from './organism';
import { functionalProfile, has } from '../game/genome';
import { bondTarget, feedTarget, primaryInteraction, tendTarget, type InteractionTarget } from '../game/interactions';
import { getClimate } from '../game/climate';
import { groundHeight } from '../game/random';
import { compositionCamera, overheadCamera, keepCameraOutside, smoothCameraOrbit } from '../game/camera';
import { ContactShadows } from './contact-shadows';
import { applyLivingFinish, setLivingDanger, setPartnerActivity, targetBracketGeometry } from './world-style';
import { hunterCue } from '../game/encounter-ai';
import { locomotionProfile } from '../game/physiology';
import { hasActivePartner, partnerActive } from '../game/symbiosis';
import { ObstacleContours } from './obstacle-contours';
import { MigrationCues } from './migration-cues';
import { FoodCues } from './food-cues';
import { reefBodyProfile } from '../game/reef-body';
import { ReefFilterCues, setReefFilterOpening } from './reef-filter-cues';
import { SettlementPresentation, equipment } from './settlement';
import { syncCulturalOutfit } from './culture';
import type { CulturalDesign } from '../game/culture';
import type { ToolId } from '../game/era-types';
import { bodyWidth as culturalBodyWidth } from '../game/body-shape';
import { FleetPresentation } from './fleet';
import { commandRay, pickCommandTarget, selectCommandUnits, terrainDestination } from './command-picking';
import type { CommandPickVolume, CommandTarget, CommandUnitRef, ScreenRect } from './command-picking';
import { activeTribe, tribeHome } from '../game/tribe';
import { planetVehicle } from '../game/planet';
import { PlanetPresentation } from './planet';

export { compositionCamera, keepCameraOutside } from '../game/camera';
const isVehicle=(g:Genome|Blueprint):g is VehicleBlueprint=>'kind' in g&&g.kind==='vehicle';

type Occluder = { node: THREE.Object3D; bounds: THREE.Box3; opacity: number; resource?: true; materials: { source: THREE.MeshStandardMaterial; display: THREE.MeshStandardMaterial }[] | null };

/** Only an actual overhead shelf can constrain the player's soft visual pose. */
export function playerSoftCeiling(s: GameState): number | undefined {
 if(s.stage!==1)return undefined;
 const p=s.player.pos;let ceiling=Infinity;
 for(const rock of s.world.obstacles){
  if(isElevatedShelf(rock,s.stage)&&rock.pos.y>p.y&&Math.hypot(p.x-rock.pos.x,p.z-rock.pos.z)<rock.radius)ceiling=Math.min(ceiling,rock.pos.y);
 }
 return Number.isFinite(ceiling)?ceiling:undefined;
}

/** These timers distinguish active abilities from the shorter feeding/care animation. */
export function abilityPulse(s: GameState): { progress: number; radius: number; color: number } | null {
 const p=s.player,recharge=s.journey.legacy?p.cooldown:p.abilityRecharge;
 if((!s.journey.legacy||p.feeding>0)&&recharge>5.7&&has(p.genome,'toxin'))return {progress:THREE.MathUtils.clamp((7-recharge)/1.3,0,1),radius:functionalProfile(p.genome).toxinRadius*cellScale(s),color:0xc0e39f};
 if(p.scan>4)return {progress:THREE.MathUtils.clamp(5-p.scan,0,1),radius:12,color:0x93def0};
 return null;
}

export class GameRenderer {
 readonly renderer:THREE.WebGLRenderer;readonly camera:THREE.PerspectiveCamera;readonly scene=new THREE.Scene();
 private journey = new JourneyPresentation(this.scene);private rootDispersal = new RootDispersalPresentation(this.scene);private worldGroup:THREE.Group|null=null;private lastStage=-1;private worldRef:unknown=null;private creatureMeshes=new Map<number,THREE.Group>();private resources=new Map<number,THREE.Group>();
 private player:THREE.Group|null=null;private playerKey='';private target=new THREE.Vector3();private focus=new THREE.Vector3();private sun:THREE.DirectionalLight;
 private editorScene=new THREE.Scene();private editorCamera=new THREE.PerspectiveCamera(40,1,.1,200);private editorModel:THREE.Group|null=null;private editorKey='';private editorFloor=new THREE.Group();
 private previewTarget=new THREE.Mesh(new THREE.SphereGeometry(.24,16,10),new THREE.MeshStandardMaterial({color:0xeac887,roughness:.6}));
 private editorLights:THREE.Light[]=[];
 private portraitScene=new THREE.Scene();private portraitCamera=new THREE.PerspectiveCamera(36,1,.1,80);private portraitModel:THREE.Group|null=null;private portraitKey='';private portraitTime={value:0};
 private presentationTime=0;private cameraReady=false;private cameraDestination=new THREE.Vector3();private raycaster=new THREE.Raycaster();private pointer=new THREE.Vector2();private occlusionRay=new THREE.Ray();private occlusionPoint=new THREE.Vector3();private occlusionRight=new THREE.Vector3();private occlusionUp=new THREE.Vector3();private occlusionTargets=Array.from({length:5},()=>new THREE.Vector3());private playerOcclusionRadius=2;private occluders:Occluder[]=[];private nextBoundsUpdate=0;
 private obstacleContours:ObstacleContours|null=null;
 private migrationCues:MigrationCues|null=null;
 private cellPresentation=new CellPresentation();private foodCues=new FoodCues();private reefFilterCues:ReefFilterCues|null=null;
 private creatureLife=new CreatureStagePresentation();private settlement=new SettlementPresentation();private fleet=new FleetPresentation();private planet=new PlanetPresentation();
 commandSelection:CommandUnitRef[]=[];commandFocus:Vec3|null=null;
 private bondMeshes:THREE.Group[]=[];private bondKey='';private contact=new ContactShadows();private partnerLight=new THREE.PointLight(0xd6f1b0,0,24,1.7);private pulse:THREE.Mesh;private marker=new THREE.Group();private markerBrackets:THREE.Mesh;private markerStem:THREE.Line;private markerTip:THREE.Mesh;private markerArrow:THREE.Mesh;private settings:Settings;private lastHeading=0;
 private editorDistance=10;
 yaw=0; pitch=.55; zoom=25; editorYaw=.65;editorPitch=.22;editorZoom=10; selectedPart:string|null=null;selectedSpine:number|null=null;previewMode:'idle'|'move'|'feed'='idle';onSelectPart:((id:string)=>void)|null=null;
 constructor(container:HTMLElement,settings:Settings){
  this.settings=settings;this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:true});this.renderer.setClearColor(0x133f49);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.02;
  this.renderer.domElement.id='world';this.renderer.domElement.setAttribute('aria-label','Trojrozměrný svět LUMAVORA');container.append(this.renderer.domElement);
  this.camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.1,260);this.scene.add(new THREE.HemisphereLight(0xd6f2e6,0x274556,1.6));this.sun=new THREE.DirectionalLight(0xffdfb2,2.0);this.sun.position.set(-25,60,25);this.sun.castShadow=true;this.sun.shadow.camera.left=-60;this.sun.shadow.camera.right=60;this.sun.shadow.camera.top=60;this.sun.shadow.camera.bottom=-60;this.sun.shadow.normalBias=.04;this.scene.add(this.sun);
  this.scene.add(this.creatureLife.group,this.settlement.group,this.fleet.group,this.planet.group);
  const rim=new THREE.DirectionalLight(0x5abcc6,1.4);rim.position.set(20,10,-40);this.scene.add(rim);
  this.editorScene.background=new THREE.Color(0x112d38);this.editorScene.fog=new THREE.FogExp2(0x112d38,.045);this.editorScene.add(new THREE.HemisphereLight(0xe4fff7,0x243b4d,1.6));const a=new THREE.DirectionalLight(0xffe9c4,2.4);a.position.set(-6,10,8);this.editorScene.add(a);const b=new THREE.DirectionalLight(0x67ccd9,1.7);b.position.set(5,2,-6);this.editorScene.add(b);this.editorLights=this.editorScene.children.filter((node):node is THREE.Light=>node instanceof THREE.Light);this.previewTarget.visible=false;this.editorScene.add(this.previewTarget);
  const floor=new THREE.Mesh(new THREE.CircleGeometry(18,80),new THREE.MeshStandardMaterial({color:0x16353e,roughness:.92}));floor.rotation.x=-Math.PI/2;this.editorFloor.add(floor);this.editorFloor.position.y=-2;this.editorScene.add(this.editorFloor);
  for(let i=1;i<=3;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(2+i*1.5,.013,4,100),new THREE.MeshBasicMaterial({color:0x386067,transparent:true,opacity:.5}));ring.rotation.x=-Math.PI/2;ring.position.y=.02;this.editorFloor.add(ring);}
  this.portraitScene.background=new THREE.Color(0x102d3b);
  this.portraitScene.add(new THREE.HemisphereLight(0xb4e8da,0x0c2539,1.2));
  const portraitKey=new THREE.DirectionalLight(0xf9e6bd,2.4);portraitKey.position.set(-3,5,6);this.portraitScene.add(portraitKey);
  const portraitRim=new THREE.DirectionalLight(0x64d8d5,2.2);portraitRim.position.set(6,1,-5);this.portraitScene.add(portraitRim);
  const backdrop=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({
   uniforms:{portraitTime:this.portraitTime},depthWrite:false,depthTest:false,toneMapped:false,
   vertexShader:'varying vec2 backdropUV; void main(){backdropUV=uv;gl_Position=vec4(position.xy,1.0,1.0);}',
   fragmentShader:`varying vec2 backdropUV; uniform float portraitTime;
    void main(){vec2 p=backdropUV-vec2(.72,.49);p.x*=1.5;
     float glow=exp(-dot(p,p)*5.0);float veil=sin(backdropUV.y*15.0+sin(backdropUV.x*8.0+portraitTime*.09)*1.4);
     vec3 ink=vec3(.004,.017,.028)+glow*vec3(.010,.052,.051)+max(0.0,veil)*glow*.003;
     gl_FragColor=vec4(ink,1.0);
     #include <colorspace_fragment>
    }`,
  }));backdrop.frustumCulled=false;backdrop.renderOrder=-1000;this.portraitScene.add(backdrop);
  this.pulse=new THREE.Mesh(new THREE.TorusGeometry(1,.05,5,64),new THREE.MeshBasicMaterial({color:0xbaedb7,transparent:true,opacity:.8}));this.pulse.rotation.x=-Math.PI/2;this.scene.add(this.pulse);
  this.markerBrackets=new THREE.Mesh(targetBracketGeometry(),new THREE.MeshBasicMaterial({color:0xd8eab8,side:THREE.DoubleSide,transparent:true,opacity:.9,depthTest:false,depthWrite:false}));this.markerBrackets.position.y=-.38;this.markerBrackets.renderOrder=4;this.marker.add(this.markerBrackets);
  const stemGeometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,0,1,0],3)).setAttribute('lineDistance',new THREE.Float32BufferAttribute([0,1],1));
  this.markerStem=new THREE.Line(stemGeometry,new THREE.LineDashedMaterial({color:0xe8c78f,transparent:true,opacity:.8,dashSize:.3,gapSize:.16,depthTest:false,depthWrite:false}));this.marker.add(this.markerStem);
  const depthMaterial=new THREE.MeshBasicMaterial({color:0xe8c78f,transparent:true,opacity:.85,depthTest:false,depthWrite:false});
  this.markerTip=new THREE.Mesh(new THREE.TorusGeometry(.22,.035,5,20),depthMaterial);this.markerTip.rotation.x=-Math.PI/2;this.marker.add(this.markerTip);
  this.markerArrow=new THREE.Mesh(new THREE.ConeGeometry(.19,.55,4),depthMaterial);this.marker.add(this.markerArrow);this.scene.add(this.marker);
  this.scene.add(this.contact.mesh,this.partnerLight,this.foodCues.group,this.cellPresentation.group);this.resize();this.setQuality(settings);
 }
 setQuality(s:Settings){this.settings=s;this.renderer.setPixelRatio(Math.min(devicePixelRatio,s.quality==='low'?1:s.quality==='medium'?1.5:2));this.renderer.shadowMap.enabled=s.quality==='high';this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.sun.shadow.mapSize.set(1024,1024);this.resize();}
 resize(){this.renderer.setSize(innerWidth,innerHeight);this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.editorCamera.aspect=innerWidth/innerHeight;this.editorCamera.updateProjectionMatrix();this.portraitCamera.aspect=innerWidth/innerHeight;this.portraitCamera.updateProjectionMatrix();}
 private rebuild(s:GameState){
  this.migrationCues?.dispose();this.migrationCues=null;this.reefFilterCues?.dispose();this.reefFilterCues=null;
  if(s.stage===1&&s.journey.reefEvolution&&!s.journey.legacy){this.reefFilterCues=new ReefFilterCues();this.scene.add(this.reefFilterCues.group);}
  if(this.worldGroup){this.scene.remove(this.worldGroup);disposeObject(this.worldGroup);}this.worldGroup=createHabitat(s.world,getClimate(s));this.scene.add(this.worldGroup);this.worldRef=s.world;this.lastStage=s.stage;this.cameraReady=false;
  this.occluders=[];this.nextBoundsUpdate=0;this.worldGroup.updateMatrixWorld(true);this.worldGroup.traverse(node=>{if(node.name.startsWith('flora-')||node.name.startsWith('obstacle-'))this.occluders.push({node,bounds:new THREE.Box3().setFromObject(node),opacity:1,materials:null});});
  this.obstacleContours=new ObstacleContours(s.world);this.worldGroup.add(this.obstacleContours.group);
  if(s.world.stage===2){this.migrationCues=new MigrationCues();this.worldGroup.add(this.migrationCues.mesh);}
  this.creatureMeshes.forEach(m=>{this.scene.remove(m);disposeObject(m);});this.creatureMeshes.clear();this.resources.forEach(m=>{this.scene.remove(m);disposeObject(m);});this.resources.clear();
  const backgrounds=[0x1a4d57,0x134556,0x8bafaa],fogs=[0x2b646b,0x24586a,0xabc4b1];this.scene.background=new THREE.Color(backgrounds[s.world.stage]);this.scene.fog=new THREE.FogExp2(fogs[s.world.stage],s.world.stage===2?.008:.012);this.focus.set(s.player.pos.x,s.player.pos.y,s.player.pos.z);this.sun.intensity=s.world.stage===2?2.6:1.9;
 }
 private resourceMesh(r:Resource){
  const g=new THREE.Group();const colors={algae:0xaff0b5,mineral:0xabdcea,nectar:0xf4c285,meat:0xe4969e,detritus:0xc3afe2};const mat=new THREE.MeshStandardMaterial({color:colors[r.kind],emissive:colors[r.kind],emissiveIntensity:.25,roughness:.42,metalness:.12});
  if(r.kind==='mineral'){for(let i=0;i<3;i++){const m=new THREE.Mesh(new THREE.OctahedronGeometry(.55),mat);m.position.set((i-1)*.35,i===1?.6:.2,0);m.scale.y=1.8;g.add(m);}}
  else if(r.kind==='nectar'){const stem=new THREE.Mesh(new THREE.CylinderGeometry(.08,.14,1.3,6),mat);stem.position.y=.3;g.add(stem);for(let i=0;i<5;i++){const m=new THREE.Mesh(new THREE.SphereGeometry(.4,8,5),mat);const a=i*Math.PI*2/5;m.position.set(Math.cos(a)*.4,.95,Math.sin(a)*.4);m.scale.set(.8,.5,1.1);g.add(m);}}
  else if(r.kind==='detritus'){const m=new THREE.Mesh(new THREE.TorusKnotGeometry(.43,.12,32,5,2,3),mat);g.add(m);}
  else if(r.kind==='meat'){const m=new THREE.Mesh(new THREE.IcosahedronGeometry(.7,1),mat);m.scale.set(1,.5,.8);g.add(m);}
  else{for(let i=0;i<3;i++){const m=new THREE.Mesh(new THREE.SphereGeometry(.43,10,6),mat);m.scale.set(.52,1.6,.4);m.position.x=(i-1)*.32;m.rotation.z=(i-1)*-.5;g.add(m);}}
  g.position.set(r.pos.x,r.pos.y-.25,r.pos.z);return g;
 }
 render(s:GameState,dt:number,mode:'game'|'menu'|'editor',draft?:Genome|Blueprint,selection?:FeedSelection|null){
  const campaignState=s,control=controlModelFor(s.stage),climate=getClimate(s);
  const tribe=activeTribe(s),commanding=control==='command'&&!!tribe,vehicle=control==='vehicle'?planetVehicle(s):null,remote=commanding||!!vehicle;
  this.presentationTime+=Math.max(0,Math.min(.1,dt));
  if(mode==='editor'&&draft){this.renderEditor(draft,this.previewStage??s.stage,s.journey.legacy,!!s.journey.reefEvolution&&!s.journey.legacy);return;}
  if(mode==='menu'){this.renderPortrait(s.player.genome);return;}
  if(this.worldRef!==s.world||this.lastStage!==s.stage)this.rebuild(s);else this.syncObstacles(s.world);
  this.settlement.update(s,this.commandSelection,s.world.time,this.settings.reducedMotion);
  this.fleet.update(s,vehicle?[{kind:'machine',id:vehicle.id}]:this.commandSelection,s.world.time,this.settings.reducedMotion);
  this.planet.update(s,s.world.time,this.settings.reducedMotion);
  this.creatureLife?.update(s,this.settings.reducedMotion);
  if(commanding&&!this.commandFocus)this.commandFocus={...tribeHome(tribe!)};
  // Render the retained ecology in its own habitat; the control model still
  // belongs to the campaign stage. This view never changes the saved state.
  if(!isOrganismStage(s.stage))s={...s,stage:s.world.stage};
  const key=JSON.stringify(s.player.genome);if(key!==this.playerKey){if(this.player){this.scene.remove(this.player);disposeObject(this.player);}this.player=createOrganism(s.player.genome);applyLivingFinish(this.player,'player');this.scene.add(this.player);this.playerKey=key;if(s.player.genome.version===2){const bounds=creaturePresentationBounds(this.player.userData.creatureAnatomy.bounds);this.playerOcclusionRadius=bounds.radius+bounds.center.length();}else this.playerOcclusionRadius=Math.max(1.5,s.player.genome.length*1.76,bodyWidth(s.player.genome)*.9)+.5;}
  const p=s.player,t=s.world.time;const model=this.player!;model.visible=!remote;model.scale.setScalar(cellScale(s));model.position.set(p.pos.x,p.pos.y,p.pos.z);model.rotation.y=p.heading;const speed=Math.hypot(p.velocity.x,p.velocity.z);animateOrganism(model,t,speed,p.heading-this.lastHeading,s.stage,p.feeding,p.invulnerable>0&&p.invulnerable<1?1:0,playerSoftCeiling(s),p.genome.version===2?creaturePoseContext(p.genome,{...p,actions:p.creatureActions??emptyCreatureActions()},{groundAt:(x,z)=>groundHeight(x,z,s.world.stage),obstacles:s.world.obstacles,bound:WORLD_BOUND},model.userData.creatureAnatomy):undefined);this.lastHeading=p.heading;
  const reefOpening=s.stage===1&&s.journey.reefEvolution&&!s.journey.legacy?s.journey.reefEvolution.pumping:null;setReefFilterOpening(model,reefOpening);this.reefFilterCues?.update(s,this.settings.reducedMotion?0:t,model);
  const existing=new Set(s.world.creatures.map(c=>c.id));this.creatureMeshes.forEach((m,id)=>{if(!existing.has(id)){this.scene.remove(m);disposeObject(m);this.creatureMeshes.delete(id);}});
  for(const c of s.world.creatures){let m=this.creatureMeshes.get(c.id);const spec=worldSpecies(s.world,c.species);if(!m){m=createSpeciesModel(spec);if(spec.role==='predator')applyLivingFinish(m,'predator');this.creatureMeshes.set(c.id,m);this.scene.add(m);}m.position.set(c.pos.x,c.pos.y,c.pos.z);m.rotation.y=c.heading;m.rotation.z=0;m.scale.setScalar(spec.size);spec.genome?animateOrganism(m,t,Math.hypot(c.velocity.x,c.velocity.z),0,2,c.intent==='forage'&&c.cooldown>9?.5:0,0,undefined,{position:c.pos,heading:c.heading,groundAt:(x,z)=>groundHeight(x,z,2)}):animateSpeciesModel(m,t,Math.hypot(c.velocity.x,c.velocity.z),spec);animateSpeciesResponse(m,s,c.id,this.settings.reducedMotion);syncAnimalMarker(m,campaignState,c,t,this.settings.reducedMotion);if(spec.role==='predator')setLivingDanger(m,hunterCue(s,c.id));}
  this.updateResources(s,t);
  updateHabitat(this.worldGroup!,s.world,this.settings.reducedMotion?0:t,climate);this.contact.update(s,!remote);
  this.migrationCues?.update(s,this.settings.reducedMotion?0:t);
  this.cellPresentation.update(s,this.settings.reducedMotion);this.foodCues.update(s,this.settings.reducedMotion?0:t);
  const bondKey=p.bonds.map(b=>b.species).join('|');if(bondKey!==this.bondKey){this.bondMeshes.forEach(m=>{this.scene.remove(m);disposeObject(m);});this.bondMeshes=p.bonds.map(b=>{const m=createSpeciesModel(worldSpecies(s.world,b.species));m.scale.multiplyScalar(.45);this.scene.add(m);return m;});this.bondKey=bondKey;}
  this.bondMeshes.forEach((m,i)=>{const bond=p.bonds[i],spec=worldSpecies(s.world,bond.species);const phase=t*.8+i*Math.PI;const side=bond.benefit==='shield'?1:bond.benefit==='recycle'?-.6:Math.cos(phase)*1.6;const behind=bond.benefit==='shield'?.2:bond.benefit==='recycle'?-1:Math.sin(phase)*1.6;
   m.visible=!remote;m.position.set(p.pos.x+side*Math.cos(p.heading)+behind*Math.sin(p.heading),p.pos.y+(bond.benefit==='light'?1.1:bond.benefit==='recycle'?.85:.15),p.pos.z-side*Math.sin(p.heading)+behind*Math.cos(p.heading));m.rotation.y=p.heading;animateSpeciesModel(m,t,speed*.3,spec);const strength=.7+bond.loyalty*.003;m.scale.setScalar(spec.size*.45*strength);setPartnerActivity(m,s.journey.legacy?bond.loyalty>0:partnerActive(bond));
  });
  this.partnerLight.position.set(p.pos.x,p.pos.y+2,p.pos.z);this.partnerLight.intensity=!remote&&hasActivePartner(s,'light')?3.3:0;
  const pulse=abilityPulse(s);this.pulse.visible=!!pulse&&!this.settings.reducedMotion;if(pulse){this.pulse.position.set(p.pos.x,p.pos.y-.7,p.pos.z);this.pulse.scale.setScalar(1+pulse.progress*(pulse.radius-1));const material=this.pulse.material as THREE.MeshBasicMaterial;material.color.setHex(pulse.color);material.opacity=(1-pulse.progress)*.5;}
  if(remote)this.pulse.visible=false;
  // The HUD and action handlers use this same pure selection, including depth and obstruction.
  this.updateInteractionMarker(control==='body'?(selection?feedTarget(s,selection):primaryInteraction([feedTarget(s),bondTarget(s),tendTarget(s)])):null,p.pos);
  const focus=vehicle?{...vehicle.pos,y:Math.min(vehicle.pos.y,groundHeight(vehicle.pos.x,vehicle.pos.z,2)+5)}:(commanding&&this.commandFocus?this.commandFocus:p.pos);
  this.target.set(focus.x,focus.y+.5,focus.z);this.focus.lerp(this.target,1-Math.exp(-dt*7));
  const desired=control==='command'?overheadCamera(this.target,this.yaw,THREE.MathUtils.clamp(this.zoom,18,60),s.world):compositionCamera(this.target,this.yaw,this.pitch,cellCameraZoom(s,this.zoom),s.world);this.cameraDestination.set(desired.x,desired.y,desired.z);
  if(!this.cameraReady){this.camera.position.copy(this.cameraDestination);this.focus.copy(this.target);this.cameraReady=true;}
  else{const smoothed=smoothCameraOrbit(this.camera.position,this.cameraDestination,this.target,dt);this.camera.position.set(smoothed.x,smoothed.y,smoothed.z);}
  if(control!=='command'){const safe=keepCameraOutside(this.camera.position,this.target,s.world);this.camera.position.set(safe.x,safe.y,safe.z);}this.camera.lookAt(this.focus);
  this.updateOcclusion(dt);
  this.journey.update(s,this.settings.reducedMotion?0:s.world.time,dt);
  this.rootDispersal.update(s,this.settings.reducedMotion?0:s.world.time);
  this.renderer.render(this.scene,this.camera);
 }
 panCommand(x:number,z:number,dt:number){if(!this.commandFocus)return;const f=this.commandFocus,speed=26;f.x=THREE.MathUtils.clamp(f.x+(x*Math.cos(this.yaw)+z*Math.sin(this.yaw))*dt*speed,-70,70);f.z=THREE.MathUtils.clamp(f.z+(z*Math.cos(this.yaw)-x*Math.sin(this.yaw))*dt*speed,-70,70);f.y=groundHeight(f.x,f.z,2);}
 focusCommand(pos:Vec3){this.commandFocus={...pos};}
 commandScreenTargets(s:GameState){return this.commandVolumes(s).map(v=>{const p=new THREE.Vector3(v.center.x,v.center.y,v.center.z).project(this.camera);return {target:v.target,screen:p.z>=-1&&p.z<=1?{x:(p.x+1)*50,y:(1-p.y)*50}:null};});}
 private commandVolumes(s:GameState):CommandPickVolume[]{if(s.stage===4&&s.machines?.version===2)return [...this.fleet.pickTargets()];return [...this.settlement.pickTargets(),...s.world.resources.filter(r=>r.amount>=1).map(r=>({target:{kind:'food' as const,id:r.id},center:r.pos,radius:1.5})),...s.world.creatures.filter(c=>c.health>0).map(c=>({target:{kind:'creature' as const,id:c.id},center:c.pos,radius:Math.max(1,worldSpecies(s.world,c.species).size)}))];}
 pickCommand(s:GameState,x:number,y:number):CommandTarget|null{const ray=commandRay(this.camera,x,y,this.renderer.domElement.getBoundingClientRect());return ray?pickCommandTarget(ray,this.commandVolumes(s)):null;}
 selectCommand(s:GameState,rect:ScreenRect):CommandUnitRef[]{return selectCommandUnits(this.camera,this.renderer.domElement.getBoundingClientRect(),rect,this.commandVolumes(s));}
 commandGround(s:GameState,x:number,y:number):Vec3|null{const ray=commandRay(this.camera,x,y,this.renderer.domElement.getBoundingClientRect());return ray?terrainDestination(ray,s.world):null;}
 creaturePreview:CreaturePreview|null=null;editorCapabilities:CreatureCapabilities|undefined;editorAnatomy:CreatureAnatomy|undefined;creatureSelection:CreatureSelection|null=null;creatureConstruction=false;private creatureHandles:THREE.Group|null=null;private creatureHandleKey='';
 previewStage:Stage|null=null;
 culturePreview: { design: CulturalDesign; tool: ToolId | null } | null = null;
 private renderEditor(g:Genome|Blueprint,stage:Stage,legacy=false,reefEvolution=false){
  const vehicle=isVehicle(g),key=JSON.stringify([g,this.culturePreview?.tool??null]);
  if(key!==this.editorKey){if(this.editorModel){this.editorScene.remove(this.editorModel);disposeObject(this.editorModel);}this.editorModel=isVehicle(g)?createMachine(g):createOrganism(g,this.editorAnatomy);this.editorModel.userData.blueprintKind=vehicle?'vehicle':'organism';this.editorScene.add(this.editorModel);this.editorKey=key;}
  const trial=!vehicle&&g.version===2&&!this.creatureConstruction?this.creaturePreview:null;
  if (!vehicle) {
   syncCulturalOutfit(this.editorModel!,g,this.culturePreview?.design);
   const tool=this.culturePreview?.tool;
   if(tool&&!this.editorModel!.getObjectByName(`tool-${tool}`)){
    const node=equipment(tool);node.position.set(culturalBodyWidth(g)*.85,.35,.2);node.scale.setScalar(.82);this.editorModel!.add(node);
   }
  }
  const time=this.settings.reducedMotion&&this.previewMode==='idle'?0:this.presentationTime;
  this.editorModel!.position.set(0,0,0);this.editorModel!.rotation.y=0;this.previewTarget.visible=!!trial;
  const neutral=!vehicle&&g.version===2;
  this.editorLights.forEach((light,index)=>light.color.setHex(neutral?0xffffff:[0xe4fff7,0xffe9c4,0x67ccd9][index]));
  const fill=this.editorLights[0] as THREE.HemisphereLight;fill.groundColor.setHex(neutral?0x404040:0x243b4d);
  if(isVehicle(g)){animateMachine(this.editorModel!,time,this.previewMode==='move'?vehicleStats(g).speed:0,this.previewMode==='feed');this.editorFloor.position.y=-this.editorModel!.userData.groundClearance;}
  else{
   const phase=time%1.8,feeding=this.previewMode==='feed'&&phase<.72?Math.sin(phase/.72*Math.PI):0;
   const reef=reefEvolution&&stage===1,pumping=reef&&this.previewMode==='feed'?1:0;
   const motion=reef?reefBodyProfile(g,pumping).motion:g.version===2&&stage>=2&&this.editorCapabilities?{...this.editorCapabilities.walk,verticalThrust:0}:locomotionProfile(g,stage,legacy,this.editorAnatomy);
   if(this.creatureConstruction&&g.version===2){animateOrganism(this.editorModel!,0,0,0,stage,0,0,undefined,undefined,this.editorAnatomy);const anatomy=this.editorAnatomy??this.editorModel!.userData.creatureAnatomy as CreatureAnatomy;(this.editorModel!.userData.creatureLimbs as THREE.Group[]).forEach((limb,i)=>poseCreatureLimb(limb,anatomy.limbs[i].points));}
   else if(trial&&g.version===2){
    const a=this.editorAnatomy!,r=trial.runtime,stationary=Math.hypot(r.velocity.x,r.velocity.z)<.001&&r.velocity.y===0&&!r.actions.communicationTime&&!trial.feeding;
    this.editorModel!.position.y=r.pos.y-a.groundClearance;this.editorModel!.rotation.y=r.heading;
    animateOrganism(this.editorModel!,this.settings.reducedMotion&&stationary?0:trial.time,Math.hypot(r.velocity.x,r.velocity.z),0,stage,trial.feeding,0,undefined,creaturePoseContext(g,r,PREVIEW_ENVIRONMENT,a),a);
    const target=creaturePreviewTarget(g,a);this.previewTarget.position.set(target.pos.x-r.pos.x,target.pos.y-a.groundClearance,target.pos.z-r.pos.z);
    this.previewTarget.material.color.setHex(trial.feeding>0?0xd6ffb1:0xeac887);
    this.previewTarget.material.emissive.setHex(trial.feeding>0?0x426020:0x000000);
   }else animateOrganism(this.editorModel!,time,this.previewMode==='move'?motion.speed:0,0,stage,feeding,0,undefined,undefined,this.editorAnatomy);
   setReefFilterOpening(this.editorModel!,reef?pumping:null);
   this.editorFloor.position.y=stage===2?-(this.editorAnatomy?.groundClearance??organismGroundClearance(g)):-Math.max(2,bodyGroundClearance(g)+.2);
  }
  selectOrganismPart(this.editorModel!,trial?null:this.selectedPart);
  if(!vehicle)selectBodySection(this.editorModel!,trial?null:this.selectedSpine,!isVehicle(g)&&g.version===2?g.body.spine.map(n=>n.axial):undefined);
  this.editorCamera.position.set(Math.sin(this.editorYaw)*this.editorZoom,2.5+Math.sin(this.editorPitch)*this.editorZoom,Math.cos(this.editorYaw)*this.editorZoom);this.editorCamera.lookAt(0,.1,0);
  if(!isVehicle(g)&&g.version===2){
   const bounds=creaturePresentationBounds(this.editorModel!.userData.creatureAnatomy.bounds);
   const halfFov=Math.atan(Math.tan(THREE.MathUtils.degToRad(this.editorCamera.fov/2))*Math.min(1,this.editorCamera.aspect));
   const fittedDistance=Math.max(10,bounds.radius/Math.sin(halfFov)*1.08);
   const distance=fittedDistance*this.editorZoom/10*(trial?1.3:1);
   this.editorDistance=distance;
   // Keep the action/status row above the trial, including raised organs.
   if(trial)bounds.center.y+=bounds.radius*.15;
   this.editorCamera.position.set(Math.sin(this.editorYaw),.25+Math.sin(this.editorPitch),Math.cos(this.editorYaw)).normalize().multiplyScalar(distance).add(bounds.center);
   this.editorCamera.lookAt(bounds.center);
  }
  const handleKey=this.creatureConstruction&&!vehicle?JSON.stringify([g,this.creatureSelection]):'';
  if(handleKey!==this.creatureHandleKey){if(this.creatureHandles){this.creatureHandles.traverse(n=>{if(n instanceof THREE.Sprite){n.material.map?.dispose();n.material.dispose();}});disposeObject(this.creatureHandles);this.creatureHandles.removeFromParent();this.creatureHandles=null;}if(handleKey&&!isVehicle(g)){this.creatureHandles=createCreatureHandles(g.version===2?g:upgradeCreatureGenome(g),this.creatureSelection,this.editorAnatomy);this.editorScene.add(this.creatureHandles);}this.creatureHandleKey=handleKey;}
  if(this.creatureHandles)for(const node of this.creatureHandles.children){node.children[0].quaternion.copy(this.editorCamera.quaternion);}
  this.renderer.render(this.editorScene,this.editorCamera);
 }
 private renderPortrait(g:Genome){const key=JSON.stringify(g);if(key!==this.portraitKey){if(this.portraitModel){this.portraitScene.remove(this.portraitModel);disposeObject(this.portraitModel);}this.portraitModel=createOrganism(g);this.portraitScene.add(this.portraitModel);this.portraitKey=key;}
  const time=this.settings.reducedMotion?0:this.presentationTime;this.portraitTime.value=time;
  const model=this.portraitModel!;model.scale.setScalar(1.6);model.position.set(2.35,.12+Math.sin(time*.6)*.055,0);model.rotation.y=-.95+Math.sin(time*.18)*.06;
  animateOrganism(model,time,.3,0,0,0);this.portraitCamera.position.set(0,2.1,10.4);this.portraitCamera.lookAt(0,.15,0);
  if(g.version===2){
   const bounds=creaturePresentationBounds(model.userData.creatureAnatomy.bounds);model.updateMatrixWorld(true);bounds.center.applyMatrix4(model.matrixWorld);
   const halfFov=Math.atan(Math.tan(THREE.MathUtils.degToRad(this.portraitCamera.fov/2))*Math.min(1,this.portraitCamera.aspect));
   const distance=bounds.radius*model.scale.x/Math.sin(halfFov)*1.08;
   this.portraitCamera.position.set(-.15,.18,1).normalize().multiplyScalar(distance).add(bounds.center);this.portraitCamera.lookAt(bounds.center);
  }
  this.renderer.render(this.portraitScene,this.portraitCamera);
 }
 private editorRay(x:number,y:number):boolean{const rect=this.renderer.domElement.getBoundingClientRect();if(!rect.width||!rect.height)return false;this.pointer.set((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2);this.editorCamera.updateMatrixWorld(true);this.raycaster.setFromCamera(this.pointer,this.editorCamera);return true;}
 pickCreatureHandle(x:number,y:number):CreatureHandle|null {if(!this.creatureHandles||!this.editorRay(x,y))return null;this.creatureHandles.updateMatrixWorld(true);for(const hit of this.raycaster.intersectObject(this.creatureHandles,true)){let n:THREE.Object3D|null=hit.object;while(n){if(n.userData.creatureHandle)return n.userData.creatureHandle as CreatureHandle;n=n.parent;}}return null;}
 beginCreatureDrag(x:number,y:number,h:CreatureHandle):CreatureDrag|null {if(!this.editorRay(x,y))return null;return startCreatureDrag(this.raycaster.ray,new THREE.Vector3(h.point.x,h.point.y,h.point.z),this.editorCamera.getWorldDirection(new THREE.Vector3()),new THREE.Matrix4(),h.side);}
 creatureHandleDelta(drag:CreatureDrag,x:number,y:number){return this.editorRay(x,y)?creatureDragDelta(drag,this.raycaster.ray):null;}
 creatureHandleTargets(){if(!this.creatureHandles)return [];const rect=this.renderer.domElement.getBoundingClientRect();return this.creatureHandles.children.map(n=>{const p=n.getWorldPosition(new THREE.Vector3()).project(this.editorCamera);return {...n.userData.creatureHandle,x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2};});}
 attachmentAt(x:number,y:number):{axial:number;angle:number}|null{if(!this.editorModel||!this.editorRay(x,y))return null;return this.editorModel.userData.blueprintKind==='vehicle'?machineAttachmentOnBody(this.editorModel,this.raycaster):attachmentOnBody(this.editorModel,this.raycaster);}
 /** Read-only visible pick locations for the seven editor sections. */
 editorSectionTargets():({index:number;x:number;y:number}|null)[]{
  const body=this.editorModel?.userData.attachmentSurface as THREE.Mesh|undefined;
  if(!body)return [];
  const uv=body.geometry.getAttribute('uv'),position=body.geometry.getAttribute('position'),rect=this.renderer.domElement.getBoundingClientRect();
  this.editorModel!.updateMatrixWorld(true);
  return Array.from({length:7},(_,index)=>{
   const candidates=Array.from({length:uv.count},(_,i)=>i).filter(i=>Math.abs(uv.getY(i)*2-1-spineAxial(index))<.055);
   const points=candidates.map(i=>new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(body.matrixWorld).project(this.editorCamera)).sort((a,b)=>a.z-b.z);
   for(const p of points){const x=rect.left+(p.x+1)*rect.width/2,y=rect.top+(1-p.y)*rect.height/2;if(this.pickPart(x,y))continue;const hit=this.attachmentAt(x,y);if(hit&&spineIndex(hit.axial)===index)return {index,x,y};}
   return null;
  });
 }
 /** Screen projection for a small contextual label; it cannot select or reach a source. */
 worldLabelPosition(pos:Vec3){
  const point=new THREE.Vector3(pos.x,pos.y+3.2,pos.z).project(this.camera);
  if(point.z < -1 || point.z > 1)return null;
  const x=(point.x+1)*.5,y=(1-point.y)*.5;
  // Reserve the objective, vitals and controls so a world label cannot cover them.
  return x>.18&&x<.79&&y>.18&&y<.74?{x:x*100,y:y*100}:null;
 }
 pickPart(x:number,y:number):string|null{if(!this.editorModel||!this.editorRay(x,y))return null;this.editorModel.updateMatrixWorld(true);for(const hit of this.raycaster.intersectObject(this.editorModel,true)){if(hit.object===this.editorModel.userData.attachmentSurface&&this.editorModel.userData.blueprintKind!=='vehicle')return null;let obj:THREE.Object3D|null=hit.object;while(obj){if(obj.userData.partId)return obj.userData.partId as string;obj=obj.parent;}}return null;}
 /** Pick rendered geometry only; input identity cannot alter or bypass world rules. */
 pickWorld(s:GameState,x:number,y:number):FeedSelection|null{
  const rect=this.renderer.domElement.getBoundingClientRect();if(!rect.width||!rect.height)return null;
  this.pointer.set((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2);this.camera.updateMatrixWorld(true);this.scene.updateMatrixWorld(true);this.raycaster.setFromCamera(this.pointer,this.camera);
  const targets=new Map<THREE.Object3D,FeedSelection>();
  for(const c of s.world.creatures){const node=this.creatureMeshes.get(c.id);if(node&&c.health>0)targets.set(node,{kind:'creature',id:c.id,stage:s.stage});}
  for(const r of s.world.resources){const node=this.resources.get(r.id);if(node&&r.amount>=.2)targets.set(node,{kind:'food',id:r.id,stage:s.stage});}
  for(const node of this.journey.group.children){const role=node.userData.journeyRole,site=s.journey.sites.find(site=>site.stage===s.stage&&site.id===node.userData.siteId);const id=role==='source'?site?.sourceId:role==='growth'?site?.plantedId:null;if(id&&s.world.resources.some(r=>r.id===id&&r.amount>=.2))targets.set(node,{kind:'food',id,stage:s.stage});}
  const roots=[...targets.keys(),...(this.worldGroup?[this.worldGroup]:[]),...(this.player?[this.player]:[])];
  for(const hit of this.raycaster.intersectObjects(roots,true)){
   let visible=true,identity:FeedSelection|null=null;
   for(let node:THREE.Object3D|null=hit.object;node;node=node.parent){if(!node.visible)visible=false;identity??=targets.get(node)??null;}
   if(!visible)continue;
   const material=(hit.object as THREE.Mesh).material;
   // Camera transparency must not turn selectable food into click-through space.
   // Use that food's original opacity, while retaining explicit material hiding.
   const food=identity?.kind==='food'?this.resources.get(identity.id):undefined;
   const foodFade=food?this.occluders.find(item=>item.resource&&item.node===food):undefined;
   if(material&&(Array.isArray(material)?material:[material]).every(m=>{
    const original=foodFade?.materials?.find(pair=>pair.display===m)?.source??m;
    return !m.visible||!original.visible||original.transparent&&original.opacity<.6;
   }))continue;
   // Solid foreground terrain/scenery blocks a click; faded canopy and water do not.
   return identity;
  }
  return null;
 }
 private updateInteractionMarker(target:InteractionTarget|null,player:Vec3){
  this.marker.visible=!!target;this.marker.userData.targetId=target?.id??null;this.marker.userData.action=target?.action??null;if(!target)return;
  this.marker.position.set(target.pos.x,target.pos.y,target.pos.z);const material=this.markerBrackets.material as THREE.MeshBasicMaterial;
  material.color.setHex(target.ready?(target.kind==='prey'?0xf0a98f:0xe1f7bd):target.reason==='blocked'?0xe9b18d:0xe8d5ae);material.opacity=target.ready?.95:.72;
  this.markerBrackets.scale.setScalar(target.kind==='culture'||target.kind==='spring'?2.1:target.kind==='prey'||target.kind==='partner'?1.4:1);
  const depth=player.y-target.pos.y;this.markerStem.visible=this.markerTip.visible=this.markerArrow.visible=Math.abs(depth)>1.4;
  if(this.markerStem.visible){const positions=this.markerStem.geometry.getAttribute('position') as THREE.BufferAttribute;positions.setY(1,depth);positions.needsUpdate=true;const distances=this.markerStem.geometry.getAttribute('lineDistance') as THREE.BufferAttribute;distances.setX(1,Math.abs(depth));distances.needsUpdate=true;this.markerTip.position.y=depth;this.markerArrow.position.y=Math.sign(depth)*.8;this.markerArrow.rotation.x=depth>0?Math.PI:0;}
 }
 /** Floating food can cross the lens too; its geometry and gameplay identity stay intact. */
 private updateResources(s:GameState,t:number){
  const resourceIds=new Set(s.world.resources.map(r=>r.id));
  const rootlets=new Set(s.stage===2?s.journey.rootDispersal?.roots.map(root=>root.resourceId):[]);
  this.resources.forEach((m,id)=>{if(!resourceIds.has(id)){this.occluders=this.occluders.filter(item=>item.node!==m);this.scene.remove(m);disposeObject(m);this.resources.delete(id);}});
  for(const r of s.world.resources){
   let m=this.resources.get(r.id);
   if(!m){m=this.resourceMesh(r);this.resources.set(r.id,m);this.scene.add(m);this.occluders.push({node:m,bounds:new THREE.Box3(),opacity:1,resource:true,materials:null});this.nextBoundsUpdate=0;}
   m.position.x=r.pos.x;m.position.z=r.pos.z;m.visible=r.amount>=.2;m.scale.setScalar((.3+.7*Math.min(1,r.amount/r.max))*(rootlets.has(r.id)?.35:1)*cellFoodScale(s,r));m.rotation.y=t*.12+r.id;
   if(s.stage<2)m.position.y=r.pos.y+Math.sin(t*.8+r.id)*.12;else m.position.y=groundHeight(r.pos.x,r.pos.z,2)+(r.kind==='algae'?.69:r.kind==='nectar'?.37:r.kind==='detritus'?.58:.4)*m.scale.x;
  }
 }
 /** Ecological openings remove only their scenery; the orbit and habitat stay live. */
 private syncObstacles(world:World){
  if(!this.worldGroup)return;
  const ids=new Set(world.obstacles.map(obstacle=>obstacle.id));
  const removed=this.occluders.filter(item=>typeof item.node.userData.obstacleId==='number'&&!ids.has(item.node.userData.obstacleId));
  if(!removed.length)return;
  const removedNodes=new Set(removed.map(item=>item.node)),detached=new THREE.Group();
  this.occluders=this.occluders.filter(item=>!removedNodes.has(item.node));
  for(const item of removed){detached.add(item.node);this.obstacleContours?.remove(item.node.userData.obstacleId);}
  // Fading owns a display copy while the original material is held by habitat.
  // Transfer originals that have no surviving users so both copies retire now.
  const retained=new Set<THREE.Material>();
  for(const item of this.occluders)for(const pair of item.materials??[])retained.add(pair.source);
  this.worldGroup.traverse(node=>{if(node instanceof THREE.Mesh)for(const material of Array.isArray(node.material)?node.material:[node.material])retained.add(material);});
  const retired=new Set<THREE.Material>(removed.flatMap(item=>(item.materials??[]).map(pair=>pair.source)).filter(source=>!retained.has(source)));
  const owned=this.worldGroup.userData.ownedMaterials as THREE.Material[]|undefined;
  if(owned)this.worldGroup.userData.ownedMaterials=owned.filter(material=>!retired.has(material));
  detached.userData.ownedMaterials=[...retired];disposeObject(detached);
  this.nextBoundsUpdate=0;
 }
 private updateOcclusion(dt:number){
  if(!this.worldGroup)return;
  if(this.presentationTime>=this.nextBoundsUpdate){this.worldGroup.updateMatrixWorld(true);for(const item of this.occluders)item.bounds.setFromObject(item.node);this.nextBoundsUpdate=this.presentationTime+.25;}
  // Check the visible body, not just a needle-thin ray to its centre. Offset rays
  // form a view cone, so foliage beside the camera does not fade the whole world.
  this.occlusionRight.set(1,0,0).applyQuaternion(this.camera.quaternion).multiplyScalar(this.playerOcclusionRadius);
  this.occlusionUp.set(0,1,0).applyQuaternion(this.camera.quaternion).multiplyScalar(this.playerOcclusionRadius*.65);
  this.occlusionTargets[0].copy(this.target);this.occlusionTargets[1].copy(this.target).add(this.occlusionRight);this.occlusionTargets[2].copy(this.target).sub(this.occlusionRight);this.occlusionTargets[3].copy(this.target).add(this.occlusionUp);this.occlusionTargets[4].copy(this.target).sub(this.occlusionUp);
  this.occlusionRay.origin.copy(this.camera.position);
  for(const item of this.occluders){let obscures=false;
   if(item.resource&&!item.node.visible){item.node.userData.cameraOccluded=false;continue;}
   for(const target of this.occlusionTargets){this.occlusionRay.direction.copy(target).sub(this.camera.position);const distance=this.occlusionRay.direction.length();this.occlusionRay.direction.multiplyScalar(1/Math.max(.001,distance));const hit=this.occlusionRay.intersectBox(item.bounds,this.occlusionPoint);
    if(item.bounds.containsPoint(target)||!!hit&&hit.distanceTo(this.camera.position)<distance-.15){obscures=true;break;}
   }
   // Mineral pillars need a visible silhouette at the micro swimming plane.
   // Stacked land/reef branches need the deeper fade to keep the body legible;
   // their floor contours still explain the solid footing.
   const fadedOpacity=this.lastStage===0&&item.node.userData.obstacleId!==undefined?.3:.1;
   item.opacity+=((obscures?fadedOpacity:1)-item.opacity)*(1-Math.exp(-dt*(obscures?16:5)));
   this.obstacleContours?.setFade(item.node.userData.obstacleId,item.opacity);
   item.node.userData.cameraOccluded=obscures;
   // Food retires independently of the habitat, so it owns its original material.
   if(!item.materials&&item.opacity<.995){item.materials=[];const copies=new Map<THREE.MeshStandardMaterial,THREE.MeshStandardMaterial>();const owned=((item.resource?item.node:this.worldGroup).userData.ownedMaterials??=[]) as THREE.Material[];
    item.node.traverse(node=>{if(!(node instanceof THREE.Mesh))return;const clone=(source:THREE.Material)=>{if(!(source instanceof THREE.MeshStandardMaterial))return source;let display=copies.get(source);if(!display){display=source.clone();display.transparent=true;display.forceSinglePass=true;copies.set(source,display);item.materials!.push({source,display});owned.push(source);}return display;};node.material=Array.isArray(node.material)?node.material.map(clone):clone(node.material);});
   }
   for(const pair of item.materials??[]){pair.display.color.copy(pair.source.color);pair.display.emissive.copy(pair.source.emissive);pair.display.emissiveIntensity=pair.source.emissiveIntensity;pair.display.opacity=pair.source.opacity*item.opacity;pair.display.depthWrite=item.opacity>.98&&pair.source.depthWrite;}
  }
 }
 editorProjection(){return {distance:this.editorDistance,zoom:this.editorZoom,yaw:this.editorYaw,pitch:this.editorPitch,fov:this.editorCamera.fov,aspect:this.editorCamera.aspect,quaternion:this.editorCamera.quaternion.toArray()};}
 metrics(){let editorMeshes=0;const editorMaterials=new Set<THREE.Material>();this.editorScene.traverse(node=>{if(node instanceof THREE.Mesh){editorMeshes++;for(const material of Array.isArray(node.material)?node.material:[node.material])editorMaterials.add(material);}});return {editorMeshes,editorMaterials:editorMaterials.size,drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,programs:this.renderer.info.programs?.length??0,pixelRatio:this.renderer.getPixelRatio(),renderer:this.renderer.getContext().getParameter(this.renderer.getContext().RENDERER)};}
}
