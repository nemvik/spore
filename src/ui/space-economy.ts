import { societyService } from '../game/space-discoveries-content';
import { quarantineAt } from '../game/space-events-content';
import { ownerAt } from '../game/space-expansion-content';
import { embargoEmpire } from '../game/space-war';
import { spaceSalePrice } from '../game/space-empires';
import type { GameState } from '../game/types';
import type { EconomyOrder } from '../game/space-economy';
import { colonyCapacity, colonyStock, economyQuote, spaceEconomy, shipCargoCount, COLONY_CYCLE, COLONY_STORAGE_PER_BAND } from '../game/space-economy';
import { SPACE_PRODUCTS, planetProduct, hasSpaceMarket } from '../game/space-products';
import { planetSystem } from '../game/galaxy';
import { shipCapabilities } from '../game/space-outfit-content';
import { escapeHtml as esc } from './creature-library';

export function spaceEconomyPanel(s: GameState): string {
  const e = spaceEconomy(s), p = s.space; if (!e || !p?.ship) return '';
  const id = p.location?.planetId ?? p.homePlanetId, home = id === p.homePlanetId, occupied = ownerAt(p, id) !== 'player', quarantined = !!quarantineAt(p.events?.current, id);
  const colony = e.colonies.find(item => item.planetId === id), product = planetProduct(p.homePlanetId, id), capacity = colony ? colonyCapacity(s, colony) : 0;
  const action = (order: EconomyOrder, label: string) => {
    const q = economyQuote(s, order, e.nextAction), command = `${order.kind}|${e.nextAction}${order.kind === 'sell' ? `|${order.originPlanetId}` : ''}`;
    return `<button class="secondary" data-action="space-economy:${esc(command)}" ${q.ok ? '' : 'disabled'} title="${esc(q.reason)}">${esc(label)}</button>${!q.ok ? `<p class="tiny">${esc(q.reason)}</p>` : ''}`;
  };
  return `<details id="space-economy" class="space-economy" data-preserve-open><summary>${home ? 'Pokladna a domácí trh' : colony ? `Kolonie ${colony.level} · výroba ${capacity}/3` : 'Kolonie a obchod'} · ${e.balance} ◈</summary>
    <p class="tiny">Lodní pokladna <b>${e.balance} ◈</b> · náklad ${shipCargoCount(s)} / ${shipCapabilities(p)!.cargo}. Život a produkce sdílejí místa.</p>
    ${home ? `<p class="tiny">Z domácího jantaru převeď prostředky na výpravu. Vklad stojí stejných 20 ◈ doma.</p>${action({ kind: 'deposit' }, 'Převést 20 ◈ z domova')}`
      : `<p class="tiny">${product ? `<span class="space-product" style="--product-color:${SPACE_PRODUCTS[product].color}">◆</span> ${esc(SPACE_PRODUCTS[product].name)}` : ''}<br>Správa u majáku: do 12 kroků a pod výškou 8.</p>${colony ? `<p><b>Sklad ${colonyStock(colony)} / ${colony.level * COLONY_STORAGE_PER_BAND}${capacity ? '' : ' · zachováno'}</b><br>Výroba ${capacity} ks / ${COLONY_CYCLE} s</p><p class="tiny">${capacity ? `Další cyklus za ${(COLONY_CYCLE - colony.productiveElapsed % COLONY_CYCLE).toFixed(1)} s výroby.` : occupied ? 'Kolonie je obsazená. Výroba a služby čekají na zpětné získání; zásoby zůstávají.' : quarantined ? 'Ekologická karanténa zastavila výrobu i nakládku. Po nápravě prvního pásu zprovozni kolonii v Událostech výpravy; servis zůstává dostupný.' : 'Výroba čeká na obnovu prvního stabilního pásu.'} Pokles stability uchová kolonii i vyrobené zásoby. Výroba běží i během cest a doma, pouze ve spuštěné hře.</p>
        ${action({ kind: 'load' }, 'Naložit volná místa')}${action({ kind: 'upgrade' }, 'Rozšířit úroveň · 20 ◈')}
        <div class="space-service">${action({ kind: 'repair' }, 'Opravit až 40 · 5 ◈')}${action({ kind: 'charge' }, 'Dobít až 60 · 3 ◈')}</div>`
        : `${societyService(p, id) ? `<p class="tiny">Společné sídlo nabízí placený servis bez vlastní kolonie.</p><div class="space-service">${action({ kind: 'repair' }, 'Opravit až 40 · 5 ◈')}${action({ kind: 'charge' }, 'Dobít až 60 · 3 ◈')}</div>` : ''}<p class="tiny">Založení 40 ◈. První stabilní živý pás umožní kolonii; další pásy dovolí rozšíření výroby. Klimatické T samo nestačí.</p>${action({ kind: 'found' }, 'Založit kolonii · 40 ◈')}`}`}
    <h4>${embargoEmpire(s, id) ? 'Válečné embargo' : hasSpaceMarket(p.homePlanetId, id) ? 'Místní odběratelský trh' : 'Produkce k odvozu'}</h4>
    <p class="tiny">Produkci prodáš na jiném obydleném světě nebo doma. Místní ceny najdeš na hvězdné mapě.</p>
    ${e.cargo.map(cargo => { const value = SPACE_PRODUCTS[cargo.product], price = spaceSalePrice(s, id, cargo.product).price; return `<section class="space-product-cargo"><b><span class="space-product" style="--product-color:${value.color}">◆</span> ${esc(value.name)} ×${cargo.amount}</b><p class="tiny">Z ${esc(planetSystem(p.homePlanetId, cargo.planetId)!.name)}${price !== null && id !== cargo.planetId && !embargoEmpire(s, id) ? `<br>Zde ${price} ◈/ks · celkem ${price * cargo.amount} ◈` : ''}</p>${action({ kind: 'sell', originPlanetId: cargo.planetId }, 'Prodat dovezenou zásobu')}</section>`; }).join('') || '<p class="tiny">V lodi zatím není produkce.</p>'}
    <p class="tiny">${e.colonies.length} kolonií · vklady ${e.ledger.deposits} ◈ · tržby ${e.ledger.revenue} ◈<br>Stavby a rozšíření ${e.ledger.construction + e.ledger.upgrades} ◈ · servis ${e.ledger.repairs + e.ledger.charging} ◈${e.ledger.patronage ? `<br>Patronát společnosti ${e.ledger.patronage} ◈` : ''}</p></details>`;
}
