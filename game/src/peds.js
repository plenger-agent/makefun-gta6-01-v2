// peds.js — the people of Puerto Azahar: dockers, tourists, abuelas, hustlers.
// They stroll the sidewalks corner to corner, stop to chat in pairs, carry
// shopping home, and — when the shooting starts or a car mounts the kerb —
// they run screaming. Each is a little articulated figure of boxes and a
// sphere, walked by a two-bone swing.
import * as THREE from 'three';
import { GRID, SKIN_TONES, SHIRT_COLORS, PANTS_COLORS, PED_NAMES, groundHeight, districtAt } from './config.js';
import { live, clamp, wrapAngle, dist2d } from './rng.js';

const _mat = (c) => new THREE.MeshLambertMaterial({ color: c });

export function buildPedMesh(rng = live) {
  const g = new THREE.Group();
  const skin = _mat(rng.pick(SKIN_TONES));
  const shirt = _mat(rng.pick(SHIRT_COLORS));
  const pants = _mat(rng.pick(PANTS_COLORS));
  const mk = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const legGeo = new THREE.BoxGeometry(0.16, 0.78, 0.18);
  legGeo.translate(0, -0.39, 0);
  const legL = mk(legGeo, pants, -0.11, 0.78, 0);
  const legR = mk(legGeo, pants, 0.11, 0.78, 0);
  const torso = mk(new THREE.BoxGeometry(0.46, 0.62, 0.24), shirt, 0, 1.09, 0);
  const armGeo = new THREE.BoxGeometry(0.11, 0.66, 0.13);
  armGeo.translate(0, -0.3, 0);
  const armL = mk(armGeo, shirt, -0.3, 1.36, 0);
  const armR = mk(armGeo, shirt, 0.3, 1.36, 0);
  const head = mk(new THREE.SphereGeometry(0.16, 10, 8), skin, 0, 1.58, 0);
  if (rng.chance(0.4)) { // a hat against the Azahar sun
    const hat = mk(new THREE.CylinderGeometry(0.24, 0.26, 0.09, 10), _mat(rng.pick([0xe8d9a8, 0xd8452e, 0xf5efe0, 0x2a9d8f])), 0, 1.7, 0);
    hat.castShadow = false;
  }
  if (rng.chance(0.3)) { // shopping bag in the right hand
    const bag = mk(new THREE.BoxGeometry(0.2, 0.26, 0.12), _mat(0xe8e0cc), 0.34, 0.72, 0.05);
    bag.castShadow = false;
  }
  g.userData.parts = { legL, legR, armL, armR, head, torso };
  return g;
}

let pedSeq = 0;

export class Ped {
  constructor(scene, x, z) {
    this.id = pedSeq++;
    this.name = live.pick(PED_NAMES);
    this.mesh = buildPedMesh();
    this.x = x; this.z = z;
    this.heading = live.float(Math.PI * 2);
    this.speed = 0;
    this.walkSpeed = live.float(1.1, 1.7);
    this.state = 'walk';
    this.stateT = 0;
    this.phase = live.float(6.28);
    this.tx = x; this.tz = z;
    this.scene = scene;
    scene.add(this.mesh);
    this.pickCornerTarget();
    this.syncMesh(0);
  }

  cornerNear(x, z, far = false) {
    // A random sidewalk corner: an intersection offset to a kerb.
    const lines = GRID.lines;
    const lx = lines.reduce((a, b) => Math.abs(b - x) < Math.abs(a - x) ? b : a, lines[0]);
    const lz = lines.reduce((a, b) => Math.abs(b - z) < Math.abs(a - z) ? b : a, lines[0]);
    const opts = [];
    for (const dx of [-10.6, 10.6]) for (const dz of [-10.6, 10.6]) opts.push([lx + dx, lz + dz]);
    // walk to a neighbouring intersection's corner, not just across the road
    const stepX = live.pick([-90, 0, 90]), stepZ = live.pick([-90, 0, 90]);
    const base = live.pick(opts);
    return {
      x: clamp(base[0] + stepX, -648, 648),
      z: clamp(base[1] + stepZ, -648, 452),
    };
  }

  pickCornerTarget() {
    const t = this.cornerNear(this.x, this.z);
    this.tx = t.x; this.tz = t.z;
  }

  frighten(fromX, fromZ, big = false) {
    if (this.state === 'down') return;
    this.state = 'flee';
    this.stateT = big ? live.float(3.5, 6) : live.float(1.6, 3.2);
    this.fleeX = fromX; this.fleeZ = fromZ;
  }

  knockDown(lethal) {
    if (this.state === 'down') return;
    this.state = 'down';
    this.stateT = lethal ? 9999 : live.float(4, 7);
    this.mesh.rotation.x = -Math.PI / 2;
  }

  update(dt, ctx) {
    this.stateT -= dt;
    let moveX = 0, moveZ = 0, targetSpeed = 0;

    if (this.state === 'down') {
      if (this.stateT <= 0) { this.state = 'walk'; this.mesh.rotation.x = 0; this.pickCornerTarget(); }
      this.syncMesh(dt);
      return;
    }

    if (this.state === 'flee') {
      const dx = this.x - this.fleeX, dz = this.z - this.fleeZ;
      const d = Math.hypot(dx, dz) || 1;
      moveX = dx / d; moveZ = dz / d;
      targetSpeed = 4.6;
      if (this.stateT <= 0) { this.state = 'walk'; this.pickCornerTarget(); }
    } else if (this.state === 'chat') {
      targetSpeed = 0;
      if (this.stateT <= 0) { this.state = 'walk'; this.pickCornerTarget(); }
    } else { // walk
      const dx = this.tx - this.x, dz = this.tz - this.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.6) {
        if (live.chance(0.14)) { this.state = 'chat'; this.stateT = live.float(3, 9); }
        else this.pickCornerTarget();
      } else {
        moveX = dx / d; moveZ = dz / d;
        targetSpeed = this.walkSpeed;
      }
    }

    // Getting out of the way of cars is a strong local instinct.
    for (const v of ctx.vehicles) {
      const dd = dist2d(this.x, this.z, v.x, v.z);
      if (dd < 7 && Math.abs(v.speed) > 4) {
        const away = Math.atan2(this.x - v.x, this.z - v.z);
        moveX += Math.sin(away) * 1.6; moveZ += Math.cos(away) * 1.6;
        targetSpeed = Math.max(targetSpeed, 4.2);
        if (dd < 4.5) this.frighten(v.x, v.z);
      }
      if (dd < 1.5 && Math.abs(v.speed) > 3.2) {
        this.knockDown(Math.abs(v.speed) > 11);
        ctx.events.push({ kind: 'pedHit', ped: this, byPlayer: v === ctx.playerVehicle, speed: Math.abs(v.speed) });
      }
    }

    const ml = Math.hypot(moveX, moveZ);
    if (ml > 0.01 && targetSpeed > 0) {
      const desired = Math.atan2(moveX / ml, moveZ / ml);
      this.heading = wrapAngle(this.heading + clamp(wrapAngle(desired - this.heading), -dt * 6, dt * 6));
      this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 5);
    } else {
      this.speed += (0 - this.speed) * Math.min(1, dt * 8);
    }
    let nx = this.x + Math.sin(this.heading) * this.speed * dt;
    let nz = this.z + Math.cos(this.heading) * this.speed * dt;
    nx = clamp(nx, -655, 655); nz = clamp(nz, -655, 466);
    // Buildings are solid to people too.
    for (const c of ctx.colliders) {
      if (nx > c.x0 - 0.4 && nx < c.x1 + 0.4 && nz > c.z0 - 0.4 && nz < c.z1 + 0.4) {
        nx = this.x; nz = this.z;
        if (this.state === 'walk') this.pickCornerTarget();
        break;
      }
    }
    this.x = nx; this.z = nz;
    this.phase += dt * (2 + this.speed * 3.4);
    this.syncMesh(dt);
  }

  syncMesh(dt) {
    const y = groundHeight(this.x, this.z);
    this.mesh.position.set(this.x, y, this.z);
    if (this.state !== 'down') this.mesh.rotation.set(0, this.heading, 0);
    else this.mesh.position.y = y + 0.25;
    const p = this.mesh.userData.parts;
    const swing = Math.sin(this.phase) * clamp(this.speed * 0.32, 0, 0.62);
    p.legL.rotation.x = swing;
    p.legR.rotation.x = -swing;
    p.armL.rotation.x = -swing * 0.8;
    p.armR.rotation.x = swing * 0.8;
    p.head.position.y = 1.58 + Math.abs(Math.sin(this.phase)) * 0.02;
  }

  remove() { this.scene.remove(this.mesh); }
}

export class Crowd {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.peds = [];
    this.targetCount = 46;
    this.events = [];
  }

  spawnOne(px, pz) {
    for (let tries = 0; tries < 10; tries++) {
      const x = px + live.float(-320, 320), z = pz + live.float(-320, 320);
      if (x < -650 || x > 650 || z < -650 || z > 452) continue;
      if (this.city.onRoad(x, z, -3)) continue;
      const d = dist2d(x, z, px, pz);
      if (d < 60 || d > 430) continue;
      const ped = new Ped(this.scene, x, z);
      this.peds.push(ped);
      return true;
    }
    return false;
  }

  frightenAround(x, z, r, big = false) {
    for (const p of this.peds) if (dist2d(p.x, p.z, x, z) < r) p.frighten(x, z, big);
  }

  update(dt, ctx) {
    if (this.peds.length < this.targetCount) this.spawnOne(ctx.playerPos.x, ctx.playerPos.z);
    const full = { ...ctx, events: this.events };
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      if (dist2d(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z) > 520) { p.remove(); this.peds.splice(i, 1); continue; }
      p.update(dt, full);
    }
  }
}
