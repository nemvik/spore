import { FixedStepClock } from '../game/input-clock';
import { cloneGenome } from '../game/genome';
import { resolveCreatureAnatomy, type CreatureAnatomy } from '../game/creature-anatomy';
import { emptyCreatureActions } from '../game/creature-actions';
import { creatureCapabilities, queryCreatureBite } from '../game/creature-capabilities';
import { advanceCreature, type CreatureCommand, type CreatureRuntime, type CreatureStepEnvironment } from '../game/creature-motion';
import type { CreatureGenome } from '../game/types';

export interface CreaturePreview {
  genome: CreatureGenome; runtime: CreatureRuntime;
  time: number; feeding: number; interactionRecharge: number;
}
export interface CreaturePreviewCommand extends CreatureCommand { attack: boolean }
export const PREVIEW_ENVIRONMENT: CreatureStepEnvironment = { groundAt: () => 0, obstacles: [], bound: 1_000_000 };

/** A stationary practice target starts within the first jaw's real reach.
 * Walking away or jumping can miss; a filter never acquires a jaw contact. */
export function creaturePreviewTarget(g: CreatureGenome, derived = resolveCreatureAnatomy(g)) {
  const jaw = creatureCapabilities(g, derived).bite.contacts[0];
  return { pos: { x: jaw?.mouthOrigin.x ?? 0, y: derived.groundClearance + (jaw?.mouthOrigin.y ?? 0),
    z: (jaw?.mouthOrigin.z ?? derived.bounds.max.z) + (jaw?.reach ?? .8) * .8 }, radius: .24 };
}

/** Detached ownership, never registered in the installed-generation cache. */
export function createCreaturePreview(g: CreatureGenome, derived = resolveCreatureAnatomy(g)): CreaturePreview {
  return { genome: cloneGenome(g) as CreatureGenome,
    runtime: { pos: { x: 0, y: derived.groundClearance, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, heading: 0, energy: 100, actions: emptyCreatureActions() },
    time: 0, feeding: 0, interactionRecharge: 0 };
}

/** Shares movement/jump/gesture execution; no campaign, RNG or world metabolism. */
export function stepCreaturePreview(preview: CreaturePreview, command: CreaturePreviewCommand, dt: number, derived?: CreatureAnatomy): CreaturePreview {
  if (!Number.isFinite(dt) || dt <= 0) return preview;
  const step = Math.min(.05, dt), g = preview.genome, anatomy = derived ?? resolveCreatureAnatomy(g);
  const runtime = advanceCreature(g, preview.runtime, command, PREVIEW_ENVIRONMENT, step, anatomy);
  const next = { ...preview, runtime, time: preview.time + step,
    feeding: Math.max(0, preview.feeding - step), interactionRecharge: Math.max(0, preview.interactionRecharge - step) };
  const bite = creatureCapabilities(g, anatomy).bite;
  if (command.attack && bite.enabled && !next.interactionRecharge && runtime.energy >= bite.energy &&
      queryCreatureBite(g, runtime.pos, runtime.heading, creaturePreviewTarget(g, anatomy), () => false).ready) {
    runtime.energy -= bite.energy;
    next.feeding = bite.duration;
    next.interactionRecharge = bite.recharge;
  }
  return next;
}

/** Lifecycle owner: content revisions reset practice; selection and panel changes do not. */
export class CreaturePreviewSession {
  preview: CreaturePreview | null = null;
  walking = false;
  private revision = -1;
  private clock = new FixedStepClock();
  private pending = { jump: false, communicate: false, attack: false };
  sync(g: CreatureGenome, revision: number, anatomy: CreatureAnatomy): void {
    if (this.revision === revision) return;
    this.revision = revision;
    this.preview = createCreaturePreview(g, anatomy);
    this.walking = false;
    this.suspend();
  }
  request(action: 'idle' | 'walk' | 'jump' | 'communicate' | 'attack'): void {
    if (action === 'idle' || action === 'walk') this.walking = action === 'walk';
    else this.pending[action] = true;
  }
  suspend(): void { this.clock.reset(); this.pending = { jump: false, communicate: false, attack: false }; }
  clear(): void { this.preview = null; this.revision = -1; this.walking = false; this.suspend(); }
  advance(now: number, active: boolean, anatomy: CreatureAnatomy): void {
    if (!active) { this.suspend(); return; }
    const steps = this.clock.advance(now);
    for (let i = 0; i < steps && this.preview; i++) {
      this.preview = stepCreaturePreview(this.preview, { x: 0, z: this.walking ? 1 : 0, sprint: false, ...this.pending }, this.clock.stepSeconds, anatomy);
      this.pending = { jump: false, communicate: false, attack: false };
    }
  }
}
