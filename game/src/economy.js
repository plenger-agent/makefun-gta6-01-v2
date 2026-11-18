// economy.js — money and what it buys in Puerto Azahar: Salvatore Motors
// sells wheels, armour and ammunition off its forecourt pads; Casa Ferrer
// is where Rico sleeps it off, heals, and the game remembers him.
import { SHOP_STOCK, CAR_TYPES } from './config.js';
import { LOCATIONS } from './city.js';
import { Vehicle } from './vehicles.js';
import { dist2d, live } from './rng.js';

export class Economy {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.cash = 120;
    this.garage = [];
    this.spawnedOwned = [];
  }

  add(amount) { this.cash += amount; }
  spend(amount) {
    if (this.cash < amount) return false;
    this.cash -= amount;
    return true;
  }

  stock() { return SHOP_STOCK; }

  // Buy a stock line: cars roll onto a forecourt pad, armour and ammunition
  // go straight onto Rico. Returns a message for the HUD either way.
  buy(item, ctx) {
    const def = SHOP_STOCK.find(s => s.id === item);
    if (!def) return { ok: false, text: 'Salvatore shrugs. "No tengo."' };
    if (this.cash < def.price) return { ok: false, text: `Not enough cash — the ${def.name} is $${def.price}.` };
    if (def.kind === 'car') {
      const pad = this.city.shopPads.find(p => !this.spawnedOwned.some(v => dist2d(v.x, v.z, p.x, p.z) < 4));
      if (!pad) return { ok: false, text: 'The forecourt is full. Move a car first.' };
      this.spend(def.price);
      const type = CAR_TYPES.find(t => t.id === def.id);
      const v = new Vehicle(this.scene, def.id, live.pick([0xb8402e, 0x2e6fb8, 0xe8e4da, 0x30343c, 0x2a7d5f]), pad.x, pad.z, -Math.PI / 2);
      v.owned = true;
      this.spawnedOwned.push(v);
      this.garage.push(def.id);
      ctx.events.push({ kind: 'garageChanged' });
      return { ok: true, text: `${type.name} is yours. Keys are in it.`, vehicle: v };
    }
    if (def.kind === 'armour') {
      if (ctx.player.armour >= 100) return { ok: false, text: 'Your vest is already whole.' };
      this.spend(def.price);
      ctx.player.armour = 100;
      return { ok: true, text: 'Kevlar vest fitted. Salvatore nods approvingly.' };
    }
    if (def.kind === 'ammo') {
      this.spend(def.price);
      ctx.player.ammo += def.amount;
      ctx.player.hasPistol = true;
      return { ok: true, text: `+${def.amount} rounds of 9mm, and the pistol is yours to keep.` };
    }
    return { ok: false, text: 'Salvatore shrugs.' };
  }

  nearestInteractable(x, z) {
    if (dist2d(x, z, LOCATIONS.safehouse.x - 18, LOCATIONS.safehouse.z) < 5) {
      return { id: 'safehouse', label: 'Rest at Casa Ferrer (heal, save, morning)' };
    }
    if (dist2d(x, z, LOCATIONS.carShop.x - 6, LOCATIONS.carShop.z + 22) < 7) {
      return { id: 'shop', label: 'Salvatore Motors — buy wheels & gear' };
    }
    if (dist2d(x, z, LOCATIONS.pier.x, LOCATIONS.pier.z) < 6) {
      return { id: 'pier', label: 'Muelle Uno — the fishermen pay $40 for a cleared pier shift' };
    }
    return null;
  }
}
