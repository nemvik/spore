export function random(source:{rng:number}):number { let t=source.rng += 0x6d2b79f5; source.rng >>>=0; t=Math.imul(t ^ t>>>15,t|1); t ^= t+Math.imul(t ^ t>>>7,t|61); return ((t ^ t>>>14)>>>0)/4294967296; }
export const clamp = (n:number,min:number,max:number) => Math.max(min,Math.min(max,n));
export const distance = (a:{x:number;y:number;z:number},b:{x:number;y:number;z:number}) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export const horizontalDistance = (a:{x:number;z:number},b:{x:number;z:number}) => Math.hypot(a.x-b.x,a.z-b.z);
export function groundHeight(x:number,z:number,stage:number):number { return stage===2 ? 1.3*Math.sin(x*.043)*Math.cos(z*.049)+.7*Math.sin((x+z)*.087) : -6 + .7*Math.sin(x*.056)*Math.cos(z*.049); }
