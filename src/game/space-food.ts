import { ecologyTaxon } from './ecology-catalog';
import { spaceLifeSpecies, lifeProfile } from './space-life';
import { climaticTier } from './space-climate';
import { clamp } from './random';
import type { LivingExpedition, LivingPlanet, LivingSpecimen } from './space-biosphere-types';

export interface ForeignDeath { life: LivingSpecimen; cause: 'climate' | 'hunger' | 'predation'; }
export interface ForeignFoodStep {
  deaths: ForeignDeath[];
  /** Candidate only. Birth must atomically pay its parent and create a receipt. */
  parents: LivingSpecimen[];
  plantMeals: number; preyMeals: number;
}
export const FOREIGN_FOOD = {
  plantGrowth: .024, metabolism: .018, grazing: .03, grazingNutrition: .04,
  preyDamage: .25, preyNutrition: .04, detritusNutrition: .018,
  hungerDamage: .7, climateDamage: .6, recovery: .2,
  plantBirthSeconds: 40, animalBirthSeconds: 60, targetPerRole: 3,
} as const;

/** Physiology only, called by the atomic C3a2 lifecycle transaction.
 * Concrete biomass and prey are shared within a habitat band. No off-world
 * clocks, cargo, colony account, ID allocation or home random stream changes.
 */
export function stepForeignFood(expedition: LivingExpedition, world: LivingPlanet, duration: number): ForeignFoodStep {
  const result: ForeignFoodStep = { deaths: [], parents: [], plantMeals: 0, preyMeals: 0 };
  if (!Number.isFinite(duration) || duration <= 0) return result;
  const dt = Math.min(duration, 1 / 30), tier = climaticTier(world);
  const causes = new Map<string, ForeignDeath['cause']>();
  const isPlant = (life: LivingSpecimen) => lifeProfile(life.taxonKey)!.role.endsWith('plant');
  const plants = world.life.filter(isPlant), animals = world.life.filter(life => !isPlant(life));
  for (const life of world.life) {
    if (life.health <= 0) continue;
    const supported = life.habitat.band <= tier;
    life.habitat.sinceHunt = Math.min(120, life.habitat.sinceHunt + dt);
    if (!supported) {
      life.health = Math.max(0, life.health - FOREIGN_FOOD.climateDamage * dt);
      causes.set(life.id, 'climate');
    }
    if (isPlant(life)) {
      if (supported) life.nutrition = Math.min(1, life.nutrition + FOREIGN_FOOD.plantGrowth * dt);
    } else life.nutrition = Math.max(0, life.nutrition - FOREIGN_FOOD.metabolism * dt);
  }
  // Grazers consume a real compatible producer. Cargo never refills biomass.
  for (const life of animals) {
    if (life.health <= 0 || life.habitat.band > tier || life.nutrition >= .99) continue;
    const profile = lifeProfile(life.taxonKey)!, diet = spaceLifeSpecies(expedition, life)?.diet ?? [];
    if (profile.role === 'predator') continue;
    const meal = plants.filter(plant => plant.health > 0 && plant.habitat.band === life.habitat.band
      && plant.nutrition > 0 && diet.includes(ecologyTaxon(plant.taxonKey)!.food)).sort((a, b) => b.nutrition - a.nutrition)[0];
    if (!meal) continue;
    const amount = Math.min(meal.nutrition, FOREIGN_FOOD.grazing * dt);
    meal.nutrition -= amount;
    life.nutrition = Math.min(1, life.nutrition + amount * FOREIGN_FOOD.grazingNutrition / FOREIGN_FOOD.grazing);
    result.plantMeals += amount;
  }
  // A jaw's detritus option can sustain it, but never counts as a hunt.
  for (const life of animals) {
    if (life.health <= 0 || life.habitat.band > tier || life.nutrition >= .99 || lifeProfile(life.taxonKey)!.role !== 'predator') continue;
    const diet = spaceLifeSpecies(expedition, life)?.diet ?? [];
    const prey = diet.includes('meat') ? animals.filter(candidate => candidate.health > 0
      && candidate.habitat.band === life.habitat.band && lifeProfile(candidate.taxonKey)!.role.startsWith('herbivore'))
      .sort((a, b) => b.health - a.health)[0] : undefined;
    if (prey) {
      const amount = Math.min(prey.health, FOREIGN_FOOD.preyDamage * dt);
      prey.health -= amount;
      life.nutrition = Math.min(1, life.nutrition + amount * FOREIGN_FOOD.preyNutrition / FOREIGN_FOOD.preyDamage);
      life.habitat.sinceHunt = 0; result.preyMeals += amount;
      if (prey.health <= 0) causes.set(prey.id, 'predation');
    } else if (diet.includes('detritus')) {
      const detritus = plants.filter(plant => plant.health > 0 && plant.habitat.band === life.habitat.band
        && plant.nutrition > 0 && ecologyTaxon(plant.taxonKey)!.food === 'detritus').sort((a, b) => b.nutrition - a.nutrition)[0];
      if (detritus) {
        const amount = Math.min(detritus.nutrition, FOREIGN_FOOD.grazing * dt);
        detritus.nutrition -= amount;
        life.nutrition = Math.min(1, life.nutrition + amount * FOREIGN_FOOD.detritusNutrition / FOREIGN_FOOD.grazing);
        result.plantMeals += amount;
      }
    }
  }
  for (const life of world.life) {
    const supported = life.habitat.band <= tier;
    if (life.nutrition <= .1 && life.health > 0) {
      life.health = Math.max(0, life.health - FOREIGN_FOOD.hungerDamage * dt);
      if (life.health <= 0) causes.set(life.id, 'hunger');
    } else if (supported && life.nutrition >= .4 && life.health > 0) life.health = Math.min(100, life.health + FOREIGN_FOOD.recovery * dt);
    if (life.health <= 0) { result.deaths.push({ life, cause: causes.get(life.id) ?? 'hunger' }); continue; }
    const profile = lifeProfile(life.taxonKey)!;
    const sameRole = world.life.filter(other => other.health > 0 && other.habitat.band === life.habitat.band && other.taxonKey === life.taxonKey).length;
    const canGrow = supported && life.health >= 75 && life.nutrition >= .7 && sameRole < FOREIGN_FOOD.targetPerRole
      && world.life.length < 96 && (profile.role !== 'predator' || life.habitat.sinceHunt < 20);
    const period = isPlant(life) ? FOREIGN_FOOD.plantBirthSeconds : FOREIGN_FOOD.animalBirthSeconds;
    life.habitat.reproduction = canGrow ? clamp(life.habitat.reproduction + dt, 0, period) : 0;
    if (life.habitat.reproduction >= period) result.parents.push(life);
  }
  return result;
}
