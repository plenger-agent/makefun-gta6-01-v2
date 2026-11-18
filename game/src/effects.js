// effects.js — the juice: pooled particle bursts for muzzle flashes, impact
// sparks, dust, smoke from dying engines and the green rain of a cash pickup.
// One Points cloud per colour family, recycled in a ring, so effects never
// allocate in the middle of a firefight.
import * as THREE from 'three';
import { live } from './rng.js';

class Pool {
  constructor(scene, { color, size, gravity, drag }, count = 420) {
    this.count = count;
    this.gravity = gravity; this.drag = drag;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.head = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      color, size, transparent: true, opacity: 0.85, depthWrite: false, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = -100;
  }

  spawn(x, y, z, vx, vy, vz, life) {
    const i = this.head;
    this.head = (this.head + 1) % this.count;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
  }

  burst(x, y, z, n, speed, spread, life) {
    for (let k = 0; k < n; k++) {
      const a = live.float(Math.PI * 2), e = live.float(-spread, spread);
      const s = live.float(speed * 0.3, speed);
      this.spawn(x, y, z,
        Math.cos(a) * Math.cos(e) * s, Math.abs(Math.sin(e)) * s + speed * 0.25, Math.sin(a) * Math.cos(e) * s,
        live.float(life * 0.5, life));
    }
  }

  update(dt) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -100; continue; }
      this.vel[i * 3 + 1] += this.gravity * dt;
      this.vel[i * 3] *= this.drag; this.vel[i * 3 + 1] *= this.drag; this.vel[i * 3 + 2] *= this.drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene) {
    this.pools = {
      spark: new Pool(scene, { color: 0xffc46a, size: 0.45, gravity: -7, drag: 0.92 }),
      smoke: new Pool(scene, { color: 0x4c4c55, size: 1.9, gravity: 2.4, drag: 0.965 }),
      dust: new Pool(scene, { color: 0xc9b184, size: 1.1, gravity: -1.2, drag: 0.94 }),
      ember: new Pool(scene, { color: 0xff6a2e, size: 0.8, gravity: 1.5, drag: 0.95 }),
      cash: new Pool(scene, { color: 0x8be26a, size: 0.5, gravity: -4, drag: 0.95 }),
    };
  }

  muzzle(x, y, z, dx, dz) {
    this.pools.spark.burst(x, y, z, 4, 6, 0.4, 0.16);
    this.pools.spark.spawn(x, y, z, dx * 9, 0.5, dz * 9, 0.1);
  }
  impact(x, y, z) { this.pools.spark.burst(x, y, z, 7, 5, 0.9, 0.4); }
  crashPuff(x, y, z, big = false) {
    this.pools.dust.burst(x, y, z, big ? 16 : 8, 3.4, 1, 0.8);
    if (big) this.pools.spark.burst(x, y, z, 10, 6, 1, 0.5);
  }
  engineSmoke(x, y, z) { this.pools.smoke.spawn(x, y, z, live.float(-0.4, 0.4), live.float(1.6, 2.6), live.float(-0.4, 0.4), live.float(0.7, 1.3)); }
  fire(x, y, z) {
    this.pools.ember.spawn(x, y, z, live.float(-0.5, 0.5), live.float(1.4, 2.8), live.float(-0.5, 0.5), live.float(0.3, 0.6));
    if (live.chance(0.4)) this.pools.smoke.spawn(x, y + 0.6, z, 0, 1.8, 0, 0.9);
  }
  cashBurst(x, y, z) { this.pools.cash.burst(x, y, z, 12, 2.6, 1.2, 0.8); }
  dustTrail(x, y, z) { this.pools.dust.spawn(x, y, z, live.float(-0.5, 0.5), live.float(0.4, 1), live.float(-0.5, 0.5), live.float(0.4, 0.8)); }

  update(dt) { for (const p of Object.values(this.pools)) p.update(dt); }
}
