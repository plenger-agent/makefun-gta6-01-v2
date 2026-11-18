// traffic.js — the everyday river of cars on the lattice: sedans and cabs
// holding their lane, braking for the car ahead, honking at jaywalkers, and
// quietly recycling themselves around the player so the city never empties.
// Parked cars live here too — they are tomorrow's stolen cars.
import { GRID, CAR_PAINTS, CAR_TYPES, groundHeight } from './config.js';
import { Vehicle } from './vehicles.js';
import { live, clamp, wrapAngle, dist2d } from './rng.js';

const TRAFFIC_TYPES = ['civique', 'meridian', 'civique', 'meridian', 'taxi', 'furgon', 'ranchero', 'solana', 'hauler', 'vipera'];
const LANE = 3.1;

export class Traffic {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.cars = [];       // { v: Vehicle, tx, tz, cruise, wait }
    this.parked = [];
    this.events = [];     // 'honk' events for the audio layer
    this.targetCount = 34;
  }

  lanePoint(x, z, heading) {
    // Offset a road-centre point to the right-hand lane for a heading.
    return { x: x - Math.cos(heading) * LANE, z: z + Math.sin(heading) * LANE };
  }

  spawnOne(px, pz) {
    // Pick an intersection a few blocks away and a direction to leave it in.
    const lines = GRID.lines;
    for (let tries = 0; tries < 12; tries++) {
      const ix = live.pick(lines), iz = live.pick(lines.filter(l => l <= GRID.southLimit));
      const d = dist2d(ix, iz, px, pz);
      if (d < 240 || d > 560) continue;
      const dir = live.int(0, 3);
      const heading = [0, Math.PI / 2, Math.PI, -Math.PI / 2][dir];
      const start = this.lanePoint(ix, iz, heading);
      if (this.city.onRoad(start.x, start.z, -2) === false) { /* still fine */ }
      const typeId = live.pick(TRAFFIC_TYPES);
      const paint = typeId === 'taxi' ? 0xf2b13c : live.pick(CAR_PAINTS);
      const v = new Vehicle(this.scene, typeId, paint, start.x, start.z, heading);
      v.driver = 'traffic';
      v.speed = live.float(6, 10);
      const car = { v, tx: start.x, tz: start.z, cruise: live.float(10.5, 15), wait: 0 };
      this.nextTarget(car, true);
      this.cars.push(car);
      return true;
    }
    return false;
  }

  nextTarget(car, first = false) {
    const v = car.v;
    // From the car's current node-ish position, choose the next intersection
    // along its heading, then (at that corner) a new heading.
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const ahead = 90;
    let nx = Math.round((v.x + fx * ahead) / 90) * 90 - 0; // snap near lattice
    let nz = Math.round((v.z + fz * ahead) / 90) * 90;
    nx = clamp(nx, -630, 630); nz = clamp(nz, -630, 450);
    if (first) { nx = v.x + fx * 120; nz = v.z + fz * 120; }
    const p = this.lanePoint(nx, nz, v.heading);
    car.tx = p.x; car.tz = p.z;
    car.nodeX = nx; car.nodeZ = nz;
  }

  turnAtNode(car) {
    const v = car.v;
    const options = [0, Math.PI / 2, Math.PI, -Math.PI / 2]
      .filter(h => Math.abs(wrapAngle(h - v.heading)) < Math.PI - 0.1); // no U-turns
    const straight = options.includes(v.heading);
    const choice = (straight && live.chance(0.55)) ? v.heading : live.pick(options);
    v.heading = choice;
    this.nextTarget(car);
  }

  addParked(x, z, ry) {
    const typeId = live.pick(TRAFFIC_TYPES);
    const paint = typeId === 'taxi' ? 0xf2b13c : live.pick(CAR_PAINTS);
    const v = new Vehicle(this.scene, typeId, paint, x, z, ry);
    v.driver = null;
    v.syncMesh(0);
    this.parked.push(v);
    return v;
  }

  seedParked() {
    for (const spot of this.city.parkingSpots || []) {
      if (live.chance(0.75)) {
        const n = live.int(2, 5);
        for (let i = 0; i < n; i++) {
          this.addParked(spot.x - 12 + i * 6.4, spot.z + live.float(-6, 6), spot.ry + live.float(-0.05, 0.05));
        }
      }
    }
    // Kerbside parking along a few streets.
    for (let i = 0; i < 26; i++) {
      const along = live.float(-600, 600);
      const line = live.pick(GRID.lines);
      const horiz = live.chance(0.5);
      const x = horiz ? along : line + (live.chance(0.5) ? 5.6 : -5.6);
      const z = horiz ? line + (live.chance(0.5) ? 5.6 : -5.6) : along;
      if (z > GRID.southLimit) continue;
      this.addParked(x, z, horiz ? Math.PI / 2 : 0);
    }
  }

  // The player takes a car: traffic forgets it, parking forgets it.
  claim(vehicle) {
    this.cars = this.cars.filter(c => c.v !== vehicle);
    this.parked = this.parked.filter(v => v !== vehicle);
  }

  update(dt, playerPos, playerVehicle, colliders) {
    // Maintain density around the player.
    if (this.cars.length < this.targetCount) this.spawnOne(playerPos.x, playerPos.z);
    const all = this.cars;
    for (let i = all.length - 1; i >= 0; i--) {
      const car = all[i];
      const v = car.v;
      const d = dist2d(v.x, v.z, playerPos.x, playerPos.z);
      if (d > 640) { v.remove(this.scene); all.splice(i, 1); continue; }

      // Desired heading toward the lane target.
      const dx = car.tx - v.x, dz = car.tz - v.z;
      const distT = Math.hypot(dx, dz);
      if (distT < 9) this.turnAtNode(car);
      const desired = Math.atan2(dx, dz);
      const diff = wrapAngle(desired - v.heading);
      const steer = clamp(diff * 1.7, -1, 1);

      // Follow the car ahead; stop for the player on foot in the road.
      let targetSpeed = car.cruise * (Math.abs(diff) > 0.5 ? 0.45 : 1);
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      const checkAhead = (ox, oz, range, isPlayer) => {
        const rx = ox - v.x, rz = oz - v.z;
        const aheadDist = rx * fx + rz * fz;
        const side = Math.abs(rx * fz - rz * fx);
        if (aheadDist > 0 && aheadDist < range && side < 2.6) {
          targetSpeed = Math.min(targetSpeed, aheadDist < 6 ? 0 : car.cruise * 0.4);
          if (isPlayer && aheadDist < 9 && v.speed > 2 && car.wait <= 0) {
            this.events.push({ kind: 'honk', x: v.x, z: v.z });
            car.wait = live.float(2, 5);
          }
        }
      };
      for (const other of all) {
        if (other === car) continue;
        checkAhead(other.v.x, other.v.z, 15, false);
      }
      if (playerVehicle && playerVehicle !== v) checkAhead(playerVehicle.x, playerVehicle.z, 15, false);
      if (!playerVehicle) checkAhead(playerPos.x, playerPos.z, 13, true);
      car.wait -= dt;

      const throttle = v.speed < targetSpeed ? 0.75 : 0;
      const brake = v.speed > targetSpeed + 1.5;
      v.drive(dt, { throttle, steer, brake, handbrake: false }, colliders);
      // Traffic cars nudge each other apart instead of stacking.
      for (const other of all) {
        if (other === car) continue;
        const dd = dist2d(v.x, v.z, other.v.x, other.v.z);
        if (dd > 0.01 && dd < 3.4) {
          const push = (3.4 - dd) * 0.5;
          v.x += (v.x - other.v.x) / dd * push;
          v.z += (v.z - other.v.z) / dd * push;
        }
      }
    }
  }
}
