import type { Bond } from '../game/types';

export const ECOLOGY_COPY = {
  partner: (name: string, bond: Bond, diet: string) => `${name} · ${bond.hunger >= 70 ? 'hladový, schopnost slábne' : 'sytý'} · potrava: ${diet}`,
  depth: (depth: number) => `Pod hladinou ${depth.toFixed(1)} m`,
  water: (gas: number, gills = true) => gas > 2 ? ` · Plyn průduchu${gills ? ': žábry jej vstřebávají' : ''}` : gas > .25 ? ' · Voda chudá na kyslík' : ' · Čirá voda',
  approach: (horizontal: number, vertical: number) => `Vodorovně ${horizontal.toFixed(1)} m · ${Math.abs(vertical) < 1 ? 've stejné výšce' : `${vertical > 0 ? 'Q ↑' : 'C ↓'} ${Math.abs(vertical).toFixed(1)} m`}`,
};
