// player.js — Rico Ferrer on foot: third-person movement with a proper
// orbit camera, sprinting and jumping, fists and a 9mm, health and armour.
// Crimes are reported as events; what the city does about them is not his
// problem — it's the police module's.
import * as THREE from 'three';
import { groundHeight, WORLD } from './config.js';
import { buildPedMesh } from './peds.js';
import { clamp, wrapAngle, dist2d, live } from './rng.js';

export class Player {
  constructor(scene) {
    this.mesh = buildPedMesh({ pick: (arr) => arr[0], chance: () => false, float: (a, b) => a });
    // Rico's signature look: coral shirt over dark trousers.
    const parts = this.mesh.userData.parts;
    parts.torso.material = new THREE.MeshLambertMaterial({ color: 0xff5a4e });
    parts.armL.material = parts.torso.material;
    parts.armR.material = parts.torso.material;
    scene.add(this.mesh);
    this.x = -452; this.z = 96;
    this.heading = 2.2;
    this.camYaw = 2.2;
    this.camPitch = 0.32;
    this.vy = 0;
    this.grounded = true;
    this.health = 100;
    this.armour = 0;
    this.weapon = 'fists';       // 'fists' | 'pistol'
    this.hasPistol = false;
    this.ammo = 0;
    this.attackCd = 0;
    this.phase = 0;
    this.speedNow = 0;
    this.inCar = null;
    this.dead = false;
    this.regenT = 0;
  }

  get pos() { return { x: this.x, z: this.z }; }
  get y() { return groundHeight(this.x, this.z); }

  placeAt(x, z, heading) {
    this.x = x; this.z = z;
    if (heading !== undefined) { this.heading = heading; this.camYaw = heading; }
    this.syncMesh();
  }

  damage(amount, fromX, fromZ, events) {
    if (this.dead) return;
    const soaked = Math.min(this.armour, amount * 0.6);
    this.armour -= soaked;
    this.health -= (amount - soaked);
    events.push({ kind: 'playerHurt', amount });
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      events.push({ kind: 'wasted' });
    }
  }

  heal(amount) { this.health = clamp(this.health + amount, 0, 100); }

  syncMesh() {
    const y = this.y;
    this.mesh.position.set(this.x, y, this.z);
    this.mesh.rotation.set(0, this.heading, 0);
    const p = this.mesh.userData.parts;
    const swing = Math.sin(this.phase) * clamp(this.speedNow * 0.16, 0, 0.6);
    p.legL.rotation.x = swing;
    p.legR.rotation.x = -swing;
    p.armL.rotation.x = -swing * 0.7;
    p.armR.rotation.x = this.weapon === 'pistol' ? -1.25 : swing * 0.7;
  }

  // ctx: { input, camera, colliders, effects, audio, events, targets, dt }
  update(dt, ctx) {
    const { input, events } = ctx;
    this.attackCd -= dt;
    this.regenT += dt;
    if (this.regenT > 6 && this.health > 0 && this.health < 100) {
      this.health = Math.min(100, this.health + dt * 2.2); // slow street recovery
    }

    // Camera orbit from the mouse.
    const mouse = input.takeMouse();
    this.camYaw -= mouse.x * 0.0026;
    this.camPitch = clamp(this.camPitch + mouse.y * 0.0022, -0.12, 1.05);

    // Weapons on the number keys.
    if (input.justPressed('Digit1')) this.weapon = 'fists';
    if (input.justPressed('Digit2') && this.hasPistol) { this.weapon = 'pistol'; ctx.audio.click(); }

    // Movement in camera space.
    const fwd = input.axis('KeyS', 'KeyW');
    const strafe = input.axis('KeyA', 'KeyD');
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const inWater = this.y < WORLD.seaLevel + 0.4 && this.z > 440;
    const maxSpeed = inWater ? 2.2 : sprint ? 7.4 : 4.6;
    let mx = 0, mz = 0;
    if (fwd || strafe) {
      const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
      mx = sin * fwd + cos * strafe;
      mz = cos * fwd - sin * strafe;
      const l = Math.hypot(mx, mz) || 1;
      mx /= l; mz /= l;
      this.heading = Math.atan2(mx, mz);
    }
    const targetSpeed = (fwd || strafe) ? maxSpeed : 0;
    this.speedNow += (targetSpeed - this.speedNow) * Math.min(1, dt * 9);
    let nx = this.x + mx * this.speedNow * dt;
    let nz = this.z + mz * this.speedNow * dt;
    nx = clamp(nx, -668, 668); nz = clamp(nz, -668, 560);

    // Buildings push back; the sea slows but does not stop a determined man.
    for (const c of ctx.colliders) {
      if (nx > c.x0 - 0.45 && nx < c.x1 + 0.45 && nz > c.z0 - 0.45 && nz < c.z1 + 0.45) {
        const dxl = nx - (c.x0 - 0.45), dxr = (c.x1 + 0.45) - nx;
        const dzl = nz - (c.z0 - 0.45), dzr = (c.z1 + 0.45) - nz;
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl) nx = c.x0 - 0.45; else if (m === dxr) nx = c.x1 + 0.45;
        else if (m === dzl) nz = c.z0 - 0.45; else nz = c.z1 + 0.45;
      }
    }
    this.x = nx; this.z = nz;

    // Jumping and gravity against the ground height field.
    const gy = this.y;
    if (this.grounded && input.justPressed('Space')) { this.vy = 5.4; this.grounded = false; }
    if (!this.grounded) {
      this.vy -= 15 * dt;
      this._airY = (this._airY ?? gy) + this.vy * dt;
      if (this._airY <= gy) { this._airY = gy; this.grounded = true; this.vy = 0; }
    } else this._airY = gy;

    this.phase += dt * (2.2 + this.speedNow * 1.55);
    this.syncMesh();
    this.mesh.position.y = this._airY ?? gy;

    this.updateCamera(ctx.camera, dt);
    this.updateCombat(dt, ctx);
    return { moving: this.speedNow > 0.4, sprinting: sprint && this.speedNow > 5 };
  }

  updateCamera(camera, dt) {
    const dist = 7.2, height = 2.6;
    const cx = this.x - Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cz = this.z - Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cy = (this._airY ?? this.y) + height + Math.sin(this.camPitch) * dist;
    const groundAtCam = groundHeight(cx, cz) + 0.7;
    camera.position.set(cx, Math.max(cy, groundAtCam), cz);
    camera.lookAt(this.x, (this._airY ?? this.y) + 1.7, this.z);
    this.aimPoint = {
      x: this.x + Math.sin(this.camYaw) * 40,
      z: this.z + Math.cos(this.camYaw) * 40,
      y: (this._airY ?? this.y) + 1.55 - Math.sin(this.camPitch) * 6,
    };
  }

  updateCombat(dt, ctx) {
    const { input, events, effects, audio } = ctx;
    const wantAttack = input.attackHeld || input.attackClicked;
    if (!wantAttack || this.attackCd > 0) return;
    const eyeY = (this._airY ?? this.y) + 1.55;

    if (this.weapon === 'fists') {
      this.attackCd = 0.38;
      audio.punch();
      const fx = this.x + Math.sin(this.heading) * 1.5;
      const fz = this.z + Math.cos(this.heading) * 1.5;
      // A swing connects with the nearest soft target in front.
      let hitSomething = false;
      for (const p of ctx.targets.peds) {
        if (p.state !== 'down' && dist2d(p.x, p.z, fx, fz) < 1.5) {
          p.knockDown(false);
          p.frighten(this.x, this.z, true);
          events.push({ kind: 'crime', type: 'assault', x: this.x, z: this.z });
          hitSomething = true;
        }
      }
      for (const o of ctx.targets.officers) {
        if (!o.dead && dist2d(o.x, o.z, fx, fz) < 1.6) {
          o.hurt(16, events);
          events.push({ kind: 'crime', type: 'assaultCop', x: this.x, z: this.z });
          hitSomething = true;
        }
      }
      if (hitSomething) effects.impact(fx, eyeY, fz);
      return;
    }

    // Pistol: hitscan along the camera's aim.
    if (this.ammo <= 0) { audio.click(); this.attackCd = 0.3; return; }
    this.attackCd = 0.23;
    this.ammo--;
    audio.shot();
    const dirX = Math.sin(this.camYaw), dirZ = Math.cos(this.camYaw);
    const gx = this.x + dirX * 0.5, gz = this.z + dirZ * 0.5;
    effects.muzzle(gx, eyeY, gz, dirX, dirZ);
    events.push({ kind: 'crime', type: 'gunshot', x: this.x, z: this.z });
    ctx.crowdFrighten(this.x, this.z, 26);

    // Find the closest thing the bullet meets: ped, officer, car, wall.
    let bestT = 90, bestHit = null;
    const testPoint = (tx, tz, ty, r, ref, kind) => {
      const rx = tx - this.x, rz = tz - this.z;
      const t = rx * dirX + rz * dirZ;
      if (t < 1 || t > bestT) return;
      const px = this.x + dirX * t, pz = this.z + dirZ * t;
      if (Math.hypot(tx - px, tz - pz) < r) { bestT = t; bestHit = { ref, kind, x: tx, y: ty, z: tz }; }
    };
    for (const p of ctx.targets.peds) if (p.state !== 'down') testPoint(p.x, p.z, this.y + 1.1, 0.85, p, 'ped');
    for (const o of ctx.targets.officers) if (!o.dead) testPoint(o.x, o.z, this.y + 1.1, 0.85, o, 'officer');
    for (const v of ctx.targets.vehicles) testPoint(v.x, v.z, this.y + 0.9, v.radius + 0.4, v, 'car');
    for (const h of ctx.targets.hostiles) if (!h.dead) testPoint(h.x, h.z, this.y + 1.1, 0.85, h, 'hostile');

    if (bestHit) {
      effects.impact(bestHit.x, bestHit.y, bestHit.z);
      if (bestHit.kind === 'ped') {
        bestHit.ref.knockDown(true);
        events.push({ kind: 'crime', type: 'murder', x: this.x, z: this.z });
      } else if (bestHit.kind === 'officer') {
        bestHit.ref.hurt(30, events);
        events.push({ kind: 'crime', type: 'shotCop', x: this.x, z: this.z });
      } else if (bestHit.kind === 'hostile') {
        bestHit.ref.hurt(30, events);
      } else if (bestHit.kind === 'car') {
        bestHit.ref.damage(9);
        if (bestHit.ref.driver === 'traffic') events.push({ kind: 'crime', type: 'carShot', x: this.x, z: this.z });
      }
    }
  }
}
