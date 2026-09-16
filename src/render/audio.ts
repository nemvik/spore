import { worldStageFor } from '../game/stage';
import type { Settings, Stage } from '../game/types';
/** Original synthesised score. All oscillators are local Web Audio, no downloads. */
export class Soundscape {
 private context:AudioContext|null=null;private master:GainNode|null=null;private ambient:GainNode|null=null;private tones:OscillatorNode[]=[];private settings:Settings;
 constructor(settings:Settings){this.settings=settings;}
 start(){if(!this.context){this.context=new AudioContext();this.master=this.context.createGain();this.master.connect(this.context.destination);this.ambient=this.context.createGain();this.ambient.connect(this.master);[110,164.81,220,293.66].forEach((hz,i)=>{const o=this.context!.createOscillator(),g=this.context!.createGain();o.type='sine';o.frequency.value=hz;g.gain.value=.016/(i+1);o.connect(g);g.connect(this.ambient!);o.start();this.tones.push(o);});}void this.context.resume();this.update(this.settings);}
 update(s:Settings){this.settings=s;if(this.master){this.master.gain.value=s.muted?0:s.master;this.ambient!.gain.value=s.ambience;}}
 stage(stage:Stage){this.tones.forEach((o,i)=>o.frequency.setTargetAtTime([110,146.83,130.81][worldStageFor(stage)]*[1,1.5,2,2.667][i],this.context!.currentTime,2));}
 pause(paused:boolean){if(this.context){if(paused)void this.context.suspend();else void this.context.resume();}}
 play(event:'eat'|'hurt'|'evolve'|'bond'|'click'|'discover'|'death'|'tend'){
  if(!this.context||!this.master||this.settings.muted)return;
  const c=this.context,t=c.currentTime,notes={eat:[440,660],hurt:[150,70],evolve:[261.63,329.63,392,523.25],bond:[392,587.33,783.99],click:[520],discover:[293.66,440,587.33],death:[220,164,110],tend:[349,523,698]}[event];
  notes.forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain();o.type=event==='hurt'?'triangle':'sine';o.frequency.setValueAtTime(f,t+i*.09);o.frequency.exponentialRampToValueAtTime(f*1.02,t+i*.09+.18);g.gain.setValueAtTime(0,t+i*.09);g.gain.linearRampToValueAtTime(.10*this.settings.effects,t+i*.09+.014);g.gain.exponentialRampToValueAtTime(.001,t+i*.09+.5);o.connect(g);g.connect(this.master!);o.start(t+i*.09);o.stop(t+i*.09+.55);});
 }
}
