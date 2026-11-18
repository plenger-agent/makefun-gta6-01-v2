// police.js — the Patrulla de Azahar: a wanted ladder from one curious star
// to five with a helicopter, patrol cars that hunt in packs, officers who
// get out and mean it, roadblocks on the avenues, and a bust meter that
// fills when they lay hands on Rico. Crimes arrive as events; heat cools
// only when nobody in uniform can see him.
import * as THREE from 'three';
import { WANTED, groundHeight } from './config.js';
import { Vehicle } from './vehicles.js';
import { buildPedMesh } from './peds.js';
import { live, clamp, wrapAngle, dist2d } from './rng.js';

const CRIME_STARS = {
  assault: 1, carTheft: 1, reckless: 1, carShot: 2, assaultCop: 2,
  gunshot: 2, murder: 3, shotCop: 4, copDown: 5, missionHeat: 3,
};

let officerSeq = 0;
export class Officer {
  constructor(scene, x, z) {
    this.id = officerSeq++;
    this.mesh = buildPedMesh();
    const navy = new THREE.MeshLambertMaterial({ color: 0x22345e });
    const parts = this.mesh.userData.parts;
    parts.torso.material = navy;
    parts.armL.material = navy; parts.armR.material = navy;
    scene.add(this.mesh);
    this.x = x; this.z = z;
    this.heading = live.float(6.28);
    this.health = 60;
    this.dead = false;
    this.shootCd = live.float(0.5, 1.4);
    this.phase = live.float(6.28);
    this.mode = 'chase'; // chase | hold
    this.syncMesh();
  }

  hurt(amount, events) {
    if (this.dead) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.dead = true;
      this.mesh.rotation.x = -Math.PI / 2;
      events.push({ kind: 'crime', type: 'copDown', x: this.x, z: this.z });
    }
  }

  syncMesh() {
    this.mesh.position.set(this.x, groundHeight(this.x, this.z) + (this.dead ? 0.25 : 0), this.z);
    if (!this.dead) this.mesh.rotation.set(0, this.heading, 0);
    const p = this.mesh.userData.parts;
    const swing = Math.sin(this.phase) * 0.5;
    p.legL.rotation.x = swing; p.legR.rotation.x = -swing;
    p.armR.rotation.x = -1.3; // pistol arm up
  }

  update(dt, ctx) {
    if (this.dead) return;
    const P = ctx.playerPos;
    const d = dist2d(this.x, this.z, P.x, P.z);
    this.phase += dt * 9;
    // Movement: close to arresting range on foot, hold a firing line beyond.
    const want = ctx.playerInCar ? 3.2 : 1.7;
    if (d > want) {
      const desired = Math.atan2(P.x - this.x, P.z - this.z);
      this.heading = wrapAngle(this.heading + clamp(wrapAngle(desired - this.heading), -dt * 5, dt * 5));
      const sp = d > 26 ? 5.6 : 4.4;
      this.x += Math.sin(this.heading) * sp * dt;
      this.z += Math.cos(this.heading) * sp * dt;
    } else {
      this.heading = Math.atan2(P.x - this.x, P.z - this.z);
    }
    // Shooting: disciplined bursts when the range is honest.
    this.shootCd -= dt;
    if (this.shootCd <= 0 && d > 5 && d < 42 && ctx.playerAlive) {
      this.shootCd = live.float(0.8, 1.5);
      ctx.audio.enemyShot();
      const hitChance = clamp(0.62 - d * 0.011 - (ctx.playerSpeed > 5 ? 0.16 : 0), 0.08, 0.6);
      if (live.chance(hitChance)) {
        ctx.events.push({ kind: 'officerHitPlayer', amount: live.float(5, 10) });
      }
      ctx.effects.muzzle(this.x + Math.sin(this.heading) * 0.5, groundHeight(this.x, this.z) + 1.35, this.z + Math.cos(this.heading) * 0.5, Math.sin(this.heading), Math.cos(this.heading));
    }
    this.syncMesh();
  }

  remove(scene) { scene.remove(this.mesh); }
}

function buildHelicopter() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x22345e });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.9, 5.2), bodyMat);
  body.castShadow = true;
  g.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 4.6), bodyMat);
  tail.position.set(0, 0.3, -4.4);
  g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.4, 0.8), bodyMat);
  fin.position.set(0, 0.8, -6.6);
  g.add(fin);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.1, 1.6), new THREE.MeshLambertMaterial({ color: 0x9fd4e8 }));
  glass.position.set(0, 0.15, 2.2);
  g.add(glass);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.08, 0.7), new THREE.MeshLambertMaterial({ color: 0x22242a }));
  rotor.position.y = 1.25;
  g.add(rotor);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.3), new THREE.MeshLambertMaterial({ color: 0x22242a }));
  tailRotor.position.set(0.35, 0.8, -6.6);
  g.add(tailRotor);
  const skidL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 3.6), bodyMat);
  skidL.position.set(-1, -1.15, 0); g.add(skidL);
  const skidR = skidL.clone(); skidR.position.x = 1; g.add(skidR);
  g.userData.rotor = rotor;
  g.userData.tailRotor = tailRotor;
  return g;
}

export class Police {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.stars = 0;
    this.heat = 0;          // fractional pressure toward the next star
    this.cars = [];         // { v, role: 'pursue'|'block', officerSpawned }
    this.officers = [];
    this.hideT = 0;         // time since anyone in uniform saw Rico
    this.spawnT = 0;
    this.bust = 0;          // 0..1 arrest meter
    this.heli = null;
    this.heliAngle = 0;
    this.events = [];
    this.blockT = 0;
  }

  reportCrime(type, x, z) {
    const target = CRIME_STARS[type] || 1;
    if (target > this.stars) {
      this.stars = target;
      this.events.push({ kind: 'wantedUp', stars: this.stars });
    }
    this.heat = Math.min(0.99, this.heat + 0.25);
    this.hideT = 0;
  }

  clearWanted() {
    this.stars = 0; this.heat = 0; this.bust = 0;
    for (const c of this.cars) c.v.remove(this.scene);
    for (const o of this.officers) o.remove(this.scene);
    this.cars = []; this.officers = [];
    if (this.heli) { this.scene.remove(this.heli); this.heli = null; }
  }

  penalise(amount) { // fines/bail when busted or wasted, handled by caller via events
    this.events.push({ kind: 'penalty', amount });
  }

  spawnCopCar(px, pz, role = 'pursue') {
    // Enter from a road a couple of blocks out, lights already hot.
    for (let tries = 0; tries < 8; tries++) {
      const a = live.float(Math.PI * 2), r = live.float(120, 210);
      let x = clamp(px + Math.sin(a) * r, -640, 640);
      let z = clamp(pz + Math.cos(a) * r, -640, 450);
      // Snap to the nearest road centre so they arrive on tarmac.
      const lines = [-630, -540, -450, -360, -270, -180, -90, 0, 90, 180, 270, 360, 450, 540, 630];
      const nearX = lines.reduce((m, l) => Math.abs(l - x) < Math.abs(m - x) ? l : m, lines[0]);
      const nearZ = lines.reduce((m, l) => Math.abs(l - z) < Math.abs(m - z) ? l : m, lines[0]);
      if (Math.abs(nearX - x) < Math.abs(nearZ - z)) x = nearX; else z = nearZ;
      const type = live.chance(0.7) ? 'patrol' : 'patrolSuv';
      const v = new Vehicle(this.scene, type, 0xf0f2f4, x, z, live.float(6.28));
      v.driver = 'police';
      this.cars.push({ v, role, officerSpawned: false });
      return v;
    }
    return null;
  }

  makeRoadblock(px, pz, headingHint) {
    // Two interceptors angled across the road ahead of the player's travel.
    const bx = px + Math.sin(headingHint) * 95;
    const bz = pz + Math.cos(headingHint) * 95;
    for (const off of [-4.5, 4.5]) {
      const x = clamp(bx - Math.cos(headingHint) * off, -645, 645);
      const z = clamp(bz + Math.sin(headingHint) * off, -645, 455);
      const v = new Vehicle(this.scene, 'patrol', 0xf0f2f4, x, z, headingHint + Math.PI / 2 + (off > 0 ? 0.35 : -0.35));
      v.driver = 'police';
      v.syncMesh(0);
      this.cars.push({ v, role: 'block', officerSpawned: false });
      this.officers.push(new Officer(this.scene, x + live.float(-3, 3), z + live.float(3, 6)));
    }
  }

  anyEyesOn(P) {
    for (const c of this.cars) if (dist2d(c.v.x, c.v.z, P.x, P.z) < 85) return true;
    for (const o of this.officers) if (!o.dead && dist2d(o.x, o.z, P.x, P.z) < 60) return true;
    if (this.heli) return true;
    return false;
  }

  update(dt, ctx) {
    const P = ctx.playerPos;
    const table = WANTED[this.stars];
    // --- heat and decay -------------------------------------------------------
    if (this.stars > 0) {
      if (this.anyEyesOn(P)) this.hideT = 0; else this.hideT += dt;
      const coolAfter = 7 + this.stars * 2.2;
      if (this.hideT > coolAfter) {
        this.stars--;
        this.hideT = 0;
        this.events.push({ kind: 'wantedDown', stars: this.stars });
        if (this.stars === 0) this.clearWanted();
      }
    }
    if (!table) { this.updateBust(dt, ctx); return; }

    // --- reinforcements ---------------------------------------------------------
    this.spawnT -= dt;
    const wantCars = table.cops;
    if (this.cars.filter(c => c.role === 'pursue').length < wantCars && this.spawnT <= 0) {
      this.spawnT = table.spawnEvery;
      this.spawnCopCar(P.x, P.z);
    }
    this.blockT -= dt;
    if (table.roadblocks > 0 && this.blockT <= 0 && ctx.playerSpeed > 8) {
      this.blockT = live.float(16, 26);
      this.makeRoadblock(P.x, P.z, ctx.playerHeading);
    }
    // --- helicopter ---------------------------------------------------------------
    if (table.heli && !this.heli) {
      this.heli = buildHelicopter();
      this.scene.add(this.heli);
      this.heliSpot = new THREE.SpotLight(0xfff2c8, 0, 90, 0.32, 0.5);
      this.heli.add(this.heliSpot);
      this.heli.add(this.heliSpot.target);
    }
    if (!table.heli && this.heli) { this.scene.remove(this.heli); this.heli = null; }
    if (this.heli) {
      this.heliAngle += dt * 0.45;
      const hx = P.x + Math.sin(this.heliAngle) * 34;
      const hz = P.z + Math.cos(this.heliAngle) * 34;
      const hy = groundHeight(P.x, P.z) + 30;
      this.heli.position.set(hx, hy, hz);
      this.heli.rotation.y = this.heliAngle + Math.PI / 2;
      this.heli.userData.rotor.rotation.y += dt * 28;
      this.heli.userData.tailRotor.rotation.x += dt * 30;
      this.heliSpot.intensity = ctx.darkness > 0.4 ? 900 : 0;
      this.heliSpot.position.set(0, 0, 0);
      this.heliSpot.target.position.set(P.x - hx, -30, P.z - hz);
    }

    // --- cars ---------------------------------------------------------------------
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      const v = c.v;
      const d = dist2d(v.x, v.z, P.x, P.z);
      if (d > 700 || v.dead) {
        if (v.dead) this.events.push({ kind: 'copCarDead', x: v.x, z: v.z });
        v.remove(this.scene);
        this.cars.splice(i, 1);
        continue;
      }
      if (c.role === 'block') continue; // roadblocks hold their ground
      // Officers bail out when the chase comes to the player on foot.
      if (!ctx.playerInCar && d < 11 && Math.abs(v.speed) < 2 && !c.officerSpawned) {
        c.officerSpawned = true;
        c.role = 'parked';
        v.driver = null;
        this.officers.push(new Officer(this.scene, v.x + 2, v.z + 1));
        this.officers.push(new Officer(this.scene, v.x - 2, v.z - 1));
        continue;
      }
      if (c.role === 'parked') continue;
      // Pursuit: aim at a lead point, with aggression scaling the commitment.
      const lead = table.aggression * 0.7;
      const tx = P.x + (ctx.playerVel?.x || 0) * lead * 10;
      const tz = P.z + (ctx.playerVel?.z || 0) * lead * 10;
      const desired = Math.atan2(tx - v.x, tz - v.z);
      const diff = wrapAngle(desired - v.heading);
      const steer = clamp(diff * 1.9, -1, 1);
      let throttle = 1;
      if (d < 7) throttle = 0.25;                 // riding the bumper, not through it
      if (Math.abs(diff) > 2.2) throttle = -0.6;  // turned around: reverse out
      v.drive(dt, { throttle, steer, brake: false, handbrake: Math.abs(diff) > 1.2 && d < 20 }, ctx.colliders);
      // Ramming hurts everyone.
      if (ctx.playerVehicle && d < 3.4 && Math.abs(v.speed) > 6) {
        ctx.events.push({ kind: 'copRam', amount: Math.abs(v.speed) * 0.7 });
        v.damage(4);
      }
    }

    // --- officers -------------------------------------------------------------------
    for (let i = this.officers.length - 1; i >= 0; i--) {
      const o = this.officers[i];
      if (dist2d(o.x, o.z, P.x, P.z) > 640) { o.remove(this.scene); this.officers.splice(i, 1); continue; }
      o.update(dt, ctx);
    }

    this.updateBust(dt, ctx);
    // Siren distance for the audio layer.
    let nearest = null;
    for (const c of this.cars) {
      const d = dist2d(c.v.x, c.v.z, P.x, P.z);
      if (nearest === null || d < nearest) nearest = d;
    }
    ctx.audio.setSiren(this.stars > 0 ? nearest : null);
  }

  updateBust(dt, ctx) {
    if (this.stars === 0 || !ctx.playerAlive) { this.bust = 0; return; }
    let hands = 0;
    for (const o of this.officers) {
      if (!o.dead && dist2d(o.x, o.z, ctx.playerPos.x, ctx.playerPos.z) < 2.3) hands++;
    }
    const carStopped = ctx.playerInCar && ctx.playerSpeed < 1.2 &&
      this.cars.some(c => dist2d(c.v.x, c.v.z, ctx.playerPos.x, ctx.playerPos.z) < 6);
    if ((hands > 0 && ctx.playerSpeed < 2.4) || carStopped) {
      this.bust += dt / 1.5;
      if (this.bust >= 1) {
        this.bust = 0;
        this.events.push({ kind: 'busted' });
        this.clearWanted();
      }
    } else {
      this.bust = Math.max(0, this.bust - dt * 0.7);
    }
  }
}
