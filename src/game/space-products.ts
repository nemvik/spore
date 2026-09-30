import { planetSystem } from './galaxy';
import type { SpaceProduct } from './space-economy-types';

/** Original LUMAVORA commodities, fixed for galaxy generator1. */
export const SPACE_PRODUCTS: Record<SpaceProduct, { name: string; color: string; basePrice: number }> = {
  'sun-resin': { name: 'Sluneční pryskyřice', color: '#e9b657', basePrice: 5 },
  'moon-salt': { name: 'Měsíční sůl', color: '#9fd4ed', basePrice: 8 },
  'spore-silk': { name: 'Výtrusové vlákno', color: '#d0a8dd', basePrice: 11 },
};
export const SPACE_PRODUCT_KEYS = Object.keys(SPACE_PRODUCTS) as SpaceProduct[];
export function planetProduct(homePlanetId: string, planetId: string): SpaceProduct | null {
  const system = planetSystem(homePlanetId, planetId);
  return system?.index ? SPACE_PRODUCT_KEYS[system.seed % SPACE_PRODUCT_KEYS.length] : null;
}
/** Only populated trading worlds and the original home host this first market.
 * Territorial owners, treaties and their price effects are the following D slice.
 */
export function hasSpaceMarket(homePlanetId: string, planetId: string): boolean {
  const system = planetSystem(homePlanetId, planetId);
  return !!system && (!system.index || system.living);
}
export function spaceMarketPrice(homePlanetId: string, marketPlanetId: string, product: SpaceProduct): number | null {
  const system = planetSystem(homePlanetId, marketPlanetId);
  if (!system || !hasSpaceMarket(homePlanetId, marketPlanetId) || !Object.hasOwn(SPACE_PRODUCTS, product)) return null;
  const key = SPACE_PRODUCT_KEYS.indexOf(product);
  return SPACE_PRODUCTS[product].basePrice + ((system.seed >>> (key * 5)) % 5) * 2;
}
