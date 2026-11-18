// missions.js — Marisol Vega's nine favours: the story of AZAHAR HEAT.
// A data-driven director runs each mission as a chain of steps (go, drive,
// deliver, fight, chase, survive, tail) with briefings, objectives, failure
// and retry, cash rewards and heat. Roque's crew are Hostiles: they hold
// ground, shoot back, and drop their wallets when they fall.
import * as THREE from 'three';
import { CAST, groundHeight } from './config.js';
import { LOCATIONS } from './city.js';
import { Vehicle } from './vehicles.js';
import { buildPedMesh } from './peds.js';
import { live, clamp, wrapAngle, dist2d } from './rng.js';

let hostileSeq = 0;
export class Hostile {
  constructor(scene, x, z, tough = false) {
    this.id = hostileSeq++;
    this.mesh = buildPedMesh();
    const kit = new THREE.MeshLambertMaterial({ color: tough ? 0x101418 : 0x14524a });
    const parts = this.mesh.userData.parts;
    parts.torso.material = kit; parts.armL.material = kit; parts.armR.material = kit;
    scene.add(this.mesh);
    this.x = x; this.z = z;
    this.heading = live.float(6.28);
    this.health = tough ? 110 : 55;
    this.dead = false;
    this.shootCd = live.float(0.6, 1.6);
    this.strafeDir = live.chance(0.5) ? 1 : -1;
    this.strafeT = live.float(1, 3);
    this.phase = live.float(6.28);
    this.syncMesh();
  }

  hurt(amount, events) {
    if (this.dead) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.dead = true;
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = groundHeight(this.x, this.z) + 0.25;
      events.push({ kind: 'hostileDown', x: this.x, z: this.z, hostile: this });
    }
  }

  syncMesh() {
    this.mesh.position.set(this.x, groundHeight(this.x, this.z), this.z);
    if (!this.dead) this.mesh.rotation.set(0, this.heading, 0);
    const p = this.mesh.userData.parts;
    const swing = Math.sin(this.phase) * 0.45;
    p.legL.rotation.x = swing; p.legR.rotation.x = -swing;
    p.armR.rotation.x = -1.3;
  }

  update(dt, ctx) {
    if (this.dead) return;
    const P = ctx.playerPos;
    const d = dist2d(this.x, this.z, P.x, P.z);
    this.phase += dt * 8;
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafeT = live.float(1, 3); this.strafeDir *= -1; }
    this.heading = Math.atan2(P.x - this.x, P.z - this.z);
    if (d > 24) { // close the distance
      this.x += Math.sin(this.heading) * 3.6 * dt;
      this.z += Math.cos(this.heading) * 3.6 * dt;
    } else if (d < 10) { // too close: back off while firing
      this.x -= Math.sin(this.heading) * 2.2 * dt;
      this.z -= Math.cos(this.heading) * 2.2 * dt;
    } else { // firing line: strafe
      this.x += Math.cos(this.heading) * this.strafeDir * 1.6 * dt;
      this.z -= Math.sin(this.heading) * this.strafeDir * 1.6 * dt;
    }
    this.shootCd -= dt;
    if (this.shootCd <= 0 && d < 46 && ctx.playerAlive) {
      this.shootCd = live.float(1.0, 1.9);
      ctx.audio.enemyShot();
      ctx.effects.muzzle(this.x + Math.sin(this.heading) * 0.5, groundHeight(this.x, this.z) + 1.35, this.z + Math.cos(this.heading) * 0.5, Math.sin(this.heading), Math.cos(this.heading));
      const hitChance = clamp(0.5 - d * 0.008 - (ctx.playerSpeed > 5 ? 0.14 : 0), 0.06, 0.45);
      if (live.chance(hitChance)) ctx.events.push({ kind: 'hostileHitPlayer', amount: live.float(4, 9) });
    }
    this.syncMesh();
  }

  remove(scene) { scene.remove(this.mesh); }
}

// ---------------------------------------------------------------------------
// The nine favours. Steps:
//  goto {x,z,r} · drive {x,z,r,car?} · deliver {x,z,r,minHealth} ·
//  fight {points:[[x,z]..], tough} · chase {car, x, z} · survive {seconds, stars}
//  tail {car, x, z, seconds} · checkpoints {points, seconds}
// ---------------------------------------------------------------------------
const L = LOCATIONS;
export const MISSIONS = [
  {
    id: 'm1-wheels', title: 'First Wheels', giver: 'Marisol Vega',
    intro: [
      'Marisol: "Rico Ferrer. Heard Roque left you with nothing but a bus ticket."',
      '"Tito owes me a Solana. It is parked by the marina workshop — take it, it is yours."',
      '"Then come see me at Casa Ferrer. We are going to take this city back."',
    ],
    steps: [
      { type: 'goto', x: -96, z: 210, r: 6, text: 'Reach the marina workshop.' },
      { type: 'drive', x: L.safehouse.x, z: L.safehouse.z, r: 9, text: 'Drive the Solana home to Casa Ferrer.' },
    ],
    reward: 150,
  },
  {
    id: 'm2-paper', title: 'Paper Trail', giver: 'Marisol Vega',
    intro: [
      'Marisol: "La Contable keeps Roque\'s real books at the Hotel Sol."',
      '"Lift the ledger from the service yard. Quiet hands, fast feet."',
    ],
    steps: [
      { type: 'goto', x: L.hotelSol.x + 14, z: L.hotelSol.z + 16, r: 5, text: 'Slip into the Hotel Sol service yard.' },
      { type: 'goto', x: L.hotelSol.x + 14, z: L.hotelSol.z + 16, r: 5, hold: 3, text: 'Take the ledger…' },
      { type: 'goto', x: L.safehouse.x, z: L.safehouse.z, r: 8, text: 'Bring the ledger back to Casa Ferrer.', heat: 2 },
    ],
    reward: 300,
  },
  {
    id: 'm3-rum', title: 'Rum Run', giver: 'Tito Salva',
    intro: [
      'Tito: "A furgón of my best rum sits at the port gate, and Roque\'s boys are circling."',
      '"Get it to Salvatore Motors in one piece and the cut is yours."',
    ],
    steps: [
      { type: 'goto', x: L.portGate.x, z: L.portGate.z, r: 8, text: 'Reach the port gate.' },
      { type: 'deliver', car: 'furgon', x: L.portGate.x - 12, z: L.portGate.z + 10, dx: L.carShop.x, dz: L.carShop.z, r: 9, minHealth: 35, text: 'Deliver the rum furgón to Salvatore Motors — gently.' },
    ],
    reward: 450,
  },
  {
    id: 'm4-beach', title: 'Beach Party Crashers', giver: 'Marisol Vega',
    intro: [
      'Marisol: "Roque\'s crew are shaking down my fishermen at Muelle Uno."',
      '"Teach them the pier is ours. All of them."',
    ],
    steps: [
      { type: 'fight', points: [[-52, 448], [-30, 455], [-64, 440], [-18, 442]], text: 'Clear Roque\'s crew off Muelle Uno.' },
    ],
    reward: 500, givesPistol: true,
  },
  {
    id: 'm5-tail', title: 'The Accountant\'s Shadow', giver: 'La Contable',
    intro: [
      'La Contable: "I move money for Roque, yes. Tonight I move it for you."',
      '"Follow my Meridian from the market. Close enough to see, far enough to live."',
    ],
    steps: [
      { type: 'goto', x: L.marketPlaza.x, z: L.marketPlaza.z, r: 10, text: 'Reach the market plaza and wait for La Contable.' },
      { type: 'tail', car: 'meridian', x: L.marketPlaza.x - 20, z: L.marketPlaza.z + 24, seconds: 40, text: 'Tail the Meridian. Stay between 14 and 75 metres.' },
    ],
    reward: 650,
  },
  {
    id: 'm6-chase', title: 'Roque\'s Vipera', giver: 'Tito Salva',
    intro: [
      'Tito: "Roque\'s yellow Vipera just left the villa with my engine in it."',
      '"Stop that car, Rico. Whatever it takes."',
    ],
    steps: [
      { type: 'goto', x: L.villaRoque.x + 30, z: L.villaRoque.z + 40, r: 12, text: 'Reach the road below Villa Roque.' },
      { type: 'chase', car: 'vipera', paint: 0xf2c41c, x: L.villaRoque.x + 16, z: L.villaRoque.z + 60, text: 'Stop the yellow Vipera — ram it out or shoot it dead.' },
    ],
    reward: 800,
  },
  {
    id: 'm7-heat', title: 'Five Minutes of Heat', giver: 'Marisol Vega',
    intro: [
      'Marisol: "Duarte is raiding the market stalls at dawn. I need her busy elsewhere."',
      '"Make noise across town. Survive her Patrulla for ninety seconds."',
    ],
    steps: [
      { type: 'goto', x: L.marketPlaza.x, z: L.marketPlaza.z, r: 10, text: 'Reach the market plaza.' },
      { type: 'survive', seconds: 90, stars: 3, text: 'Survive the Patrulla for 90 seconds.' },
    ],
    reward: 1000,
  },
  {
    id: 'm8-docks', title: 'Dockside Reckoning', giver: 'Marisol Vega',
    intro: [
      'Marisol: "Roque is loading his whole operation onto a freighter tonight."',
      '"His best guns are on the container aprons. End it, and the port is ours."',
    ],
    steps: [
      { type: 'fight', points: [[330, -330], [352, -318], [318, -306], [370, -340], [300, -344]], tough: true, text: 'Break Roque\'s dock crew among the containers.' },
    ],
    reward: 1400,
  },
  {
    id: 'm9-faro', title: 'The Lighthouse Pact', giver: 'La Contable',
    intro: [
      'La Contable: "Roque sails at midnight. His last car leaves the villa for the Faro."',
      '"Deliver the ledger\'s copy to my boat at the lighthouse before he sails — and keep the car whole."',
    ],
    steps: [
      { type: 'goto', x: L.villaRoque.x + 24, z: L.villaRoque.z + 30, r: 8, text: 'Take the coupé below Villa Roque.' },
      { type: 'deliver', car: 'solana', x: L.villaRoque.x + 24, z: L.villaRoque.z + 30, dx: L.lighthouse.x, dz: L.lighthouse.z - 24, r: 10, minHealth: 45, text: 'Race the ledger to the Faro Azahar lighthouse.' },
      { type: 'fight', points: [[-332, 492], [-308, 486], [-320, 470]], text: 'Roque\'s last men are waiting at the Faro. Finish this.' },
    ],
    reward: 2500,
  },
];

export class MissionDirector {
  constructor(scene) {
    this.scene = scene;
    this.state = 'idle';       // idle | briefing | active | done | failed
    this.mission = null;
    this.stepIdx = 0;
    this.stepT = 0;
    this.holdT = 0;
    this.hostiles = [];
    this.missionCar = null;
    this.targetCar = null;
    this.giftCar = null;
    this.pickups = [];         // { mesh, kind, amount, x, z }
    this.marker = null;
    this.failReason = '';
    this.tail = null;
    this.events = [];
    this._makeMarker();
  }

  _makeMarker() {
    const geo = new THREE.CylinderGeometry(2.2, 2.2, 26, 20, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    this.marker = new THREE.Mesh(geo, mat);
    this.marker.visible = false;
    this.scene.add(this.marker);
  }

  setMarker(x, z, color = 0xffc93c) {
    if (x === null) { this.marker.visible = false; return; }
    this.marker.visible = true;
    this.marker.position.set(x, groundHeight(x, z) + 13, z);
    this.marker.material.color.setHex(color);
  }

  available(index) { return MISSIONS[index] || null; }

  start(mission) {
    this.cleanup();
    this.mission = mission;
    this.state = 'briefing';
    this.stepIdx = 0;
    this.events.push({ kind: 'missionBrief', mission });
  }

  beginSteps() {
    this.state = 'active';
    this.setupStep();
    this.events.push({ kind: 'missionStart', mission: this.mission });
  }

  cleanup() {
    for (const h of this.hostiles) h.remove(this.scene);
    this.hostiles = [];
    for (const p of this.pickups) this.scene.remove(p.mesh);
    this.pickups = [];
    if (this.missionCar) { this.missionCar.remove(this.scene); this.missionCar = null; }
    if (this.targetCar) { this.targetCar.remove(this.scene); this.targetCar = null; }
    this.setMarker(null);
    this.tail = null;
  }

  fail(reason) {
    this.state = 'failed';
    this.failReason = reason;
    this.events.push({ kind: 'missionFailed', mission: this.mission, reason });
    this.cleanup();
  }

  complete() {
    const m = this.mission;
    this.state = 'done';
    this.events.push({ kind: 'missionComplete', mission: m });
    this.cleanup();
  }

  setupStep() {
    const step = this.mission.steps[this.stepIdx];
    this.stepT = 0;
    this.holdT = 0;
    if (!step) return;
    // Tito's gift: the Solana waits by the marina workshop from the first step.
    if (this.mission.id === 'm1-wheels' && this.stepIdx === 0 && !this.giftCar) {
      this.giftCar = new Vehicle(this.scene, 'solana', 0xff5a4e, -100, 204, 0.7);
    }
    if (step.type === 'fight') {
      for (const [x, z] of step.points) this.hostiles.push(new Hostile(this.scene, x, z, step.tough));
      this.setMarker(step.points[0][0], step.points[0][1], 0xff5a4e);
    } else if (step.type === 'deliver') {
      this.missionCar = new Vehicle(this.scene, step.car, 0xe8e4da, step.x, step.z, live.float(6.28));
      this.missionCar.isMissionCar = true;
      this.setMarker(step.dx, step.dz);
    } else if (step.type === 'chase') {
      this.targetCar = new Vehicle(this.scene, step.car, step.paint ?? 0xf2c41c, step.x, step.z, 0);
      this.targetCar.driver = 'flee';
      this.setMarker(step.x, step.z, 0xff5a4e);
    } else if (step.type === 'tail') {
      this.targetCar = new Vehicle(this.scene, step.car, 0xdad4c4, step.x, step.z, 0);
      this.targetCar.driver = 'errand';
      this.tail = { t: 0, lostT: 0, route: this.errandRoute(step.x, step.z) };
      this.setMarker(step.x, step.z);
    } else if (step.type === 'checkpoints') {
      this.setMarker(step.points[0][0], step.points[0][1]);
    } else if (step.type === 'survive') {
      this.events.push({ kind: 'forceWanted', stars: step.stars });
      this.setMarker(null);
    } else {
      this.setMarker(step.x, step.z);
    }
    this.events.push({ kind: 'objective', text: step.text, mission: this.mission });
  }

  errandRoute(x, z) {
    // A lazy loop of road nodes for the car being tailed.
    const nodes = [];
    let cx = Math.round(x / 90) * 90, cz = Math.round(z / 90) * 90;
    const moves = [[90, 0], [0, -90], [-90, 0], [0, 90], [90, 0], [0, -90]];
    for (const [mx, mz] of moves) { cx += mx; cz += mz; nodes.push([clamp(cx, -540, 540), clamp(cz, -540, 360)]); }
    return nodes;
  }

  nextStep() {
    this.stepIdx++;
    if (this.stepIdx >= this.mission.steps.length) this.complete();
    else this.setupStep();
  }

  // ctx: { playerPos, playerVehicle, playerAlive, events, audio, effects, colliders, playerSpeed }
  update(dt, ctx) {
    // Pickups drift toward their moment.
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.mesh.rotation.y += dt * 2.4;
      p.mesh.position.y = groundHeight(p.x, p.z) + 0.8 + Math.sin(performance.now() * 0.004 + p.x) * 0.15;
      if (dist2d(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z) < 2.2) {
        ctx.events.push({ kind: 'pickup', what: p.kind, amount: p.amount });
        this.scene.remove(p.mesh);
        this.pickups.splice(i, 1);
      }
    }
    for (const h of this.hostiles) h.update(dt, ctx);
    this.hostiles = this.hostiles.filter(h => !h.dead || true);

    if (this.state !== 'active') return;
    const step = this.mission.steps[this.stepIdx];
    if (!step) return;
    this.stepT += dt;
    const P = ctx.playerPos;

    switch (step.type) {
      case 'goto': {
        if (dist2d(P.x, P.z, step.x, step.z) < step.r) {
          if (step.hold) {
            this.holdT += dt;
            if (this.holdT >= step.hold) this.nextStep();
          } else this.nextStep();
        } else this.holdT = 0;
        break;
      }
      case 'drive': {
        if (ctx.playerVehicle && dist2d(P.x, P.z, step.x, step.z) < step.r) this.nextStep();
        break;
      }
      case 'deliver': {
        if (!this.missionCar || this.missionCar.dead || this.missionCar.health < step.minHealth - 40) {
          this.fail('The delivery car was wrecked.');
          break;
        }
        if (ctx.playerVehicle === this.missionCar) this.setMarker(step.dx, step.dz);
        else if (this.missionCar) this.setMarker(this.missionCar.x, this.missionCar.z, 0x7fd4ff);
        if (this.missionCar && dist2d(this.missionCar.x, this.missionCar.z, step.dx, step.dz) < step.r) {
          if (this.missionCar.health >= step.minHealth) this.nextStep();
          else this.fail(`The car arrived too battered (${Math.round(this.missionCar.health)}% — needed ${step.minHealth}%).`);
        }
        break;
      }
      case 'fight': {
        if (this.hostiles.every(h => h.dead)) this.nextStep();
        break;
      }
      case 'chase': {
        const car = this.targetCar;
        if (!car) break;
        this.driveFleeCar(dt, car, ctx);
        this.setMarker(car.x, car.z, 0xff5a4e);
        if (car.dead || car.health <= 22) {
          car.driver = null;
          if (dist2d(P.x, P.z, car.x, car.z) < 7) this.nextStep();
        }
        break;
      }
      case 'tail': {
        const car = this.targetCar;
        if (!car || !this.tail) break;
        this.driveErrandCar(dt, car);
        this.setMarker(car.x, car.z);
        const d = dist2d(P.x, P.z, car.x, car.z);
        if (d >= 14 && d <= 75) { this.tail.t += dt; this.tail.lostT = 0; }
        else if (d < 14) { this.events.push({ kind: 'tailWarn', text: 'Too close — she will spot you!' }); }
        else {
          this.tail.lostT += dt;
          if (this.tail.lostT > 10) { this.fail('You lost La Contable in the traffic.'); break; }
        }
        if (this.tail.t >= step.seconds) this.nextStep();
        break;
      }
      case 'survive': {
        this.events.push({ kind: 'objectiveTick', text: `${step.text} — ${Math.ceil(step.seconds - this.stepT)}s` });
        if (this.stepT >= step.seconds) this.nextStep();
        break;
      }
      case 'checkpoints': {
        const [cx, cz] = step.points[Math.min(this.stepIdx, step.points.length - 1)];
        break;
      }
    }
    if (step.heat && this.stepT < 0.1) this.events.push({ kind: 'forceWanted', stars: step.heat });
  }

  driveFleeCar(dt, car, ctx) {
    // Roque's driver runs for the far side of town, roads only, full throttle.
    const away = Math.atan2(car.x - ctx.playerPos.x, car.z - ctx.playerPos.z);
    const tx = clamp(car.x + Math.sin(away) * 200, -600, 600);
    const tz = clamp(car.z + Math.cos(away) * 200, -600, 420);
    const lines = [-630, -540, -450, -360, -270, -180, -90, 0, 90, 180, 270, 360, 450, 540, 630];
    const nearRoad = (v) => lines.reduce((m, l) => Math.abs(l - v) < Math.abs(m - v) ? l : m, lines[0]);
    const gx = Math.abs(nearRoad(tx) - tx) < Math.abs(nearRoad(tz) - tz) ? nearRoad(tx) : car.x;
    const gz = gx === car.x ? nearRoad(tz) : car.z;
    const desired = Math.atan2((gx || tx) - car.x, (gz || tz) - car.z);
    const diff = wrapAngle(desired - car.heading);
    car.drive(dt, { throttle: 1, steer: clamp(diff * 1.8, -1, 1), brake: false, handbrake: false }, ctx.colliders);
  }

  driveErrandCar(dt, car) {
    if (!this.tail) return;
    const nodes = this.tail.route;
    const [tx, tz] = nodes[this.tail.node || 0];
    const d = dist2d(car.x, car.z, tx, tz);
    if (d < 12) this.tail.node = ((this.tail.node || 0) + 1) % nodes.length;
    const desired = Math.atan2(tx - car.x, tz - car.z);
    const diff = wrapAngle(desired - car.heading);
    const throttle = Math.abs(car.speed) > 9 ? 0.1 : 0.55;
    car.drive(dt, { throttle, steer: clamp(diff * 1.8, -1, 1), brake: false, handbrake: false }, []);
  }

  dropPickup(x, z, kind, amount) {
    const colors = { cash: 0x8be26a, ammo: 0xffc93c, health: 0xff5a6a, armour: 0x7fd4ff };
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.55, 0.55),
      new THREE.MeshLambertMaterial({ color: colors[kind] || 0xffffff, emissive: (colors[kind] || 0xffffff), emissiveIntensity: 0.35 })
    );
    mesh.position.set(x, groundHeight(x, z) + 0.8, z);
    this.scene.add(mesh);
    this.pickups.push({ mesh, kind, amount, x, z });
  }
}
