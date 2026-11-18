// vehicles.js — the cars of Puerto Azahar: one factory that builds every kind
// from painted boxes and cylinders, and the Vehicle class whose simple,
// honest physics (throttle, brake, steering that bites with speed, collisions
// that shove and dent) is shared by traffic, police and the player alike.
import * as THREE from 'three';
import { CAR_TYPES, groundHeight } from './config.js';
import { clamp, wrapAngle } from './rng.js';

const _mat = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });

const paintMats = new Map();
function paintMat(hex) {
  if (!paintMats.has(hex)) paintMats.set(hex, _mat(hex));
  return paintMats.get(hex);
}
const glassMat = _mat(0x1c2836, { emissive: 0x0a141f });
const tyreMat = _mat(0x17181c);
const chromeMat = _mat(0xb9c2cc);
const headMat = _mat(0xfff2c8, { emissive: 0xffedb5, emissiveIntensity: 0.7 });
const tailMat = _mat(0xa01616, { emissive: 0x7a0d0d, emissiveIntensity: 0.7 });
const policeRedMat = _mat(0xd82a2a, { emissive: 0xd82a2a, emissiveIntensity: 1 });
const policeBlueMat = _mat(0x2a5ad8, { emissive: 0x2a5ad8, emissiveIntensity: 1 });

const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10);
wheelGeo.rotateZ(Math.PI / 2); // axle along X

function box(parent, w, h, d, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// Builds a car group facing +Z (forward is +Z in local space; heading math
// treats heading 0 as +Z). Returns { group, wheels, lightBar? }.
export function buildCarMesh(type, paintHex) {
  const g = new THREE.Group();
  const paint = paintMat(paintHex);
  const kind = type.kind;
  let L = 4.3, W = 1.85, bodyH = 0.62, bodyY = 0.55, cabinL = 2.0, cabinH = 0.55, cabinBack = -0.2;
  if (kind === 'hatch') { L = 3.8; cabinL = 1.9; cabinBack = -0.5; }
  if (kind === 'sport') { L = 4.5; W = 1.95; bodyH = 0.5; bodyY = 0.46; cabinL = 1.7; cabinH = 0.42; cabinBack = -0.35; }
  if (kind === 'van') { L = 4.9; bodyH = 1.5; bodyY = 1.05; cabinL = 0; }
  if (kind === 'truck') { L = 6.4; bodyH = 0.7; }
  if (kind === 'pickup') { L = 4.9; cabinL = 1.5; cabinBack = 0.35; }
  if (kind === 'policeSuv') { L = 4.8; bodyH = 0.95; bodyY = 0.8; cabinL = 2.4; cabinH = 0.6; }

  const wheels = [];
  const wheelAt = (x, z) => {
    const w = new THREE.Mesh(wheelGeo, tyreMat);
    w.position.set(x, 0.36, z);
    g.add(w); wheels.push(w);
  };

  if (kind === 'truck') {
    box(g, 1.95, 1.5, 1.7, 0, 1.15, L / 2 - 0.95, paint);                    // cab
    box(g, 1.8, 0.62, 0.9, 0, 1.62, L / 2 - 0.75, glassMat);                 // cab glass
    box(g, 2.1, 2.0, L - 2.2, 0, 1.45, -L / 2 + (L - 2.2) / 2 + 0.1, _mat(0xd8d2c2)); // cargo
    box(g, 2.0, 0.5, 0.3, 0, 0.45, L / 2 + 0.05, chromeMat);
    wheelAt(-0.95, L / 2 - 1.1); wheelAt(0.95, L / 2 - 1.1);
    wheelAt(-0.95, -L / 2 + 1.0); wheelAt(0.95, -L / 2 + 1.0);
  } else if (kind === 'van') {
    box(g, W, bodyH + 0.75, L, 0, bodyY + 0.35, 0, paint);
    box(g, W - 0.15, 0.55, 0.9, 0, bodyY + 0.95, L / 2 - 0.42, glassMat);
    box(g, W + 0.04, 0.34, L * 0.5, 0, bodyY + 0.28, -L * 0.18, _mat(0xf0ead8)); // side panel stripe
    wheelAt(-W / 2, L / 2 - 0.85); wheelAt(W / 2, L / 2 - 0.85);
    wheelAt(-W / 2, -L / 2 + 0.85); wheelAt(W / 2, -L / 2 + 0.85);
  } else {
    box(g, W, bodyH, L, 0, bodyY, 0, paint);                                  // body
    box(g, W + 0.06, 0.2, L * 0.94, 0, bodyY - 0.22, 0, _mat(0x22242a));      // skirt
    if (cabinL > 0) {
      const cabin = box(g, W - 0.28, cabinH, cabinL, 0, bodyY + bodyH / 2 + cabinH / 2 - 0.04, cabinBack, glassMat);
      box(g, W - 0.2, 0.07, cabinL * 0.82, 0, bodyY + bodyH / 2 + cabinH + 0.02, cabinBack, paint); // roof
      cabin.castShadow = true;
    }
    if (kind === 'pickup') {
      box(g, W - 0.1, 0.42, L * 0.34, 0, bodyY + 0.32, -L / 2 + L * 0.19, paint); // bed walls hint
    }
    if (kind === 'sport') {
      box(g, W * 0.92, 0.07, 0.42, 0, bodyY + 0.52, -L / 2 + 0.16, _mat(0x17181c)); // spoiler
      box(g, 0.08, 0.22, 0.3, -W * 0.4, bodyY + 0.38, -L / 2 + 0.3, _mat(0x17181c));
      box(g, 0.08, 0.22, 0.3, W * 0.4, bodyY + 0.38, -L / 2 + 0.3, _mat(0x17181c));
    }
    if (kind === 'taxi') {
      box(g, 0.85, 0.24, 0.4, 0, bodyY + bodyH / 2 + cabinH + 0.18, cabinBack, _mat(0xffe9a8, { emissive: 0xffd76a, emissiveIntensity: 0.5 }));
      box(g, W + 0.07, 0.16, L * 0.7, 0, bodyY + 0.05, 0, _mat(0x22242a));     // checker band hint
    }
    if (kind === 'police' || kind === 'policeSuv') {
      box(g, W + 0.07, bodyH * 0.52, L * 0.52, 0, bodyY - 0.02, 0.1, _mat(0x1c2432)); // dark band
      const bar = new THREE.Group();
      const red = box(bar, 0.5, 0.16, 0.34, -0.3, 0, 0, _mat(0xd82a2a, { emissive: 0xd82a2a, emissiveIntensity: 1 }));
      const blue = box(bar, 0.5, 0.16, 0.34, 0.3, 0, 0, _mat(0x2a5ad8, { emissive: 0x2a5ad8, emissiveIntensity: 1 }));
      bar.position.set(0, bodyY + bodyH / 2 + cabinH + 0.14, cabinBack);
      g.add(bar);
      g.userData.lightBar = { red, blue };
    }
    wheelAt(-W / 2, L / 2 - 0.8); wheelAt(W / 2, L / 2 - 0.8);
    wheelAt(-W / 2, -L / 2 + 0.8); wheelAt(W / 2, -L / 2 + 0.8);
  }
  // lamps
  box(g, 0.34, 0.14, 0.06, -W / 2 + 0.3, bodyY + 0.08, L / 2 + 0.01, headMat);
  box(g, 0.34, 0.14, 0.06, W / 2 - 0.3, bodyY + 0.08, L / 2 + 0.01, headMat);
  box(g, 0.34, 0.12, 0.06, -W / 2 + 0.3, bodyY + 0.08, -L / 2 - 0.01, tailMat);
  box(g, 0.34, 0.12, 0.06, W / 2 - 0.3, bodyY + 0.08, -L / 2 - 0.01, tailMat);
  g.userData.wheels = wheels;
  g.userData.length = L;
  g.userData.width = W;
  return g;
}

export class Vehicle {
  constructor(scene, typeId, paintHex, x, z, heading = 0) {
    this.type = CAR_TYPES.find(t => t.id === typeId) || CAR_TYPES[1];
    this.mesh = buildCarMesh(this.type, paintHex);
    this.mesh.position.set(x, groundHeight(x, z), z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.x = x; this.z = z; this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.dead = false;
    this.driver = null;      // 'traffic' | 'police' | 'player' | null (parked)
    this.flashPhase = Math.random() * 6;
    this.smokeAcc = 0;
  }

  get pos() { return this.mesh.position; }
  get radius() { return (this.mesh.userData.length || 4.3) * 0.42; }

  forwardX() { return Math.sin(this.heading); }
  forwardZ() { return Math.cos(this.heading); }

  // input: {throttle -1..1, steer -1..1, brake bool, handbrake bool}
  drive(dt, input, colliders) {
    if (this.dead) { this.speed = 0; this.syncMesh(dt); return; }
    const t = this.type;
    const accel = input.throttle > 0 ? t.accel : t.accel * 0.62;
    if (input.throttle !== 0) this.speed += accel * input.throttle * dt;
    // drag + rolling resistance
    this.speed -= this.speed * 0.55 * dt;
    if (input.brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 26 * dt);
    if (input.handbrake) this.speed -= this.speed * 2.6 * dt;
    if (input.throttle === 0 && !input.brake) { // engine braking to a stop
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 2.2 * dt);
    }
    const top = input.throttle < 0 ? t.topSpeed * 0.42 : t.topSpeed;
    this.speed = clamp(this.speed, -top, t.topSpeed);
    if (Math.abs(this.speed) < 0.02 && input.throttle === 0) this.speed = 0;

    // steering: authority grows a little with speed, then fades for stability
    const target = input.steer * 0.55;
    this.steer += (target - this.steer) * Math.min(1, dt * 7);
    const grip = t.grip * (input.handbrake ? 0.45 : 1);
    const yaw = this.steer * this.speed * 0.32 * grip;
    this.heading = wrapAngle(this.heading + yaw * dt * 3.1);

    let nx = this.x + this.forwardX() * this.speed * dt;
    let nz = this.z + this.forwardZ() * this.speed * dt;
    // keep cars out of the sea and inside the island
    nx = clamp(nx, -672, 672);
    nz = clamp(nz, -672, 520);
    // building collisions: circle vs AABB, shove out along the smaller axis
    if (colliders) {
      for (const c of colliders) {
        if (nx > c.x0 - 1.1 && nx < c.x1 + 1.1 && nz > c.z0 - 1.1 && nz < c.z1 + 1.1) {
          const dxl = nx - (c.x0 - 1.1), dxr = (c.x1 + 1.1) - nx;
          const dzl = nz - (c.z0 - 1.1), dzr = (c.z1 + 1.1) - nz;
          const m = Math.min(dxl, dxr, dzl, dzr);
          if (m === dxl) nx = c.x0 - 1.1; else if (m === dxr) nx = c.x1 + 1.1;
          else if (m === dzl) nz = c.z0 - 1.1; else nz = c.z1 + 1.1;
          this.hitWall(Math.abs(this.speed));
        }
      }
    }
    this.x = nx; this.z = nz;
    this.syncMesh(dt);
  }

  hitWall(speed) {
    if (speed > 7) this.damage((speed - 6) * 1.5);
    this.speed *= -0.18;
  }

  damage(amount) {
    if (this.dead) return;
    this.health -= amount;
    if (this.health <= 0) { this.health = 0; this.dead = true; }
  }

  syncMesh(dt) {
    const y = groundHeight(this.x, this.z);
    // pitch/roll from the ground slope sells the hilltop ramps
    const ahead = groundHeight(this.x + this.forwardX() * 2, this.z + this.forwardZ() * 2);
    const pitch = Math.atan2(y - ahead, 2) * 0.8;
    this.mesh.position.set(this.x, y + 0.05, this.z);
    this.mesh.rotation.set(pitch, this.heading, 0, 'YXZ');
    const spin = this.speed * dt / 0.36;
    for (const w of this.mesh.userData.wheels || []) {
      w.rotation.x += spin;
      w.rotation.y = this.steer * 0.7;
    }
    // police light bar strobes
    const bar = this.mesh.userData.lightBar;
    if (bar) {
      const ph = Math.sin(performance.now() * 0.02 + this.flashPhase) > 0;
      bar.red.material.emissiveIntensity = ph ? 2.2 : 0.1;
      bar.blue.material.emissiveIntensity = ph ? 0.1 : 2.2;
    }
  }

  remove(scene) { scene.remove(this.mesh); }
}
