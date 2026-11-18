// main.js — AZAHAR HEAT. Boots the city, wires every system together, runs
// the state machine (menu → briefing → play → shop/pause/end), processes the
// shared event queue (crimes, hits, pickups, mission beats), handles
// entering and leaving cars, resting, saving, and the ?shot= staging mode
// the screenshot rig uses. Everything game-shaped lives in the modules;
// this file is the conductor, not the orchestra.
import * as THREE from 'three';
import { WORLD, districtAt, groundHeight } from './config.js';
import { Sky } from './sky.js';
import { City, LOCATIONS } from './city.js';
import { Traffic } from './traffic.js';
import { Crowd } from './peds.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { MissionDirector, MISSIONS } from './missions.js';
import { Economy } from './economy.js';
import { AudioEngine } from './audio.js';
import { Effects } from './effects.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { DriveController, findEnterableCar } from './driving.js';
import { Vehicle } from './vehicles.js';
import { loadSave, storeSave, wipeSave, hasSave, defaultSave } from './save.js';
import { clamp, dist2d, live } from './rng.js';
import { setupShot, SHOT_NAMES } from './shots.js';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const canvasHost = document.getElementById('stage');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
canvasHost.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2600);
camera.position.set(-300, 60, 300);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const sky = new Sky(scene);
const city = new City(scene);
const effects = new Effects(scene);
const audio = new AudioEngine();
const input = new Input(renderer.domElement);
const hud = new HUD();
const player = new Player(scene);
const traffic = new Traffic(scene, city);
const crowd = new Crowd(scene, city);
const police = new Police(scene, city);
const director = new MissionDirector(scene);
const economy = new Economy(scene, city);
const driver = new DriveController();
driver.colliders = city.colliders;
traffic.seedParked();

const events = [];
const OFFER_POINTS = {
  'm1-wheels': LOCATIONS.safehouse, 'm2-paper': LOCATIONS.safehouse,
  'm3-rum': LOCATIONS.carShop, 'm4-beach': LOCATIONS.safehouse,
  'm5-tail': LOCATIONS.marketPlaza, 'm6-chase': LOCATIONS.carShop,
  'm7-heat': LOCATIONS.safehouse, 'm8-docks': LOCATIONS.safehouse,
  'm9-faro': LOCATIONS.marketPlaza,
};

const game = {
  state: shotName ? 'play' : 'menu',
  time: 0,
  missionIndex: 0,
  completed: [],
  briefIdx: 0,
  pierCd: 0,
  saveT: 0,
  dirty: false,
  speedKmh: 0,
  menuAngle: 0,
  endKind: null,
  tailWarnT: 0,
};

function allVehicles() {
  const list = [];
  for (const c of traffic.cars) list.push(c.v);
  for (const v of traffic.parked) list.push(v);
  for (const c of police.cars) list.push(c.v);
  for (const v of economy.spawnedOwned) list.push(v);
  if (director.missionCar) list.push(director.missionCar);
  if (director.targetCar) list.push(director.targetCar);
  if (director.giftCar) list.push(director.giftCar);
  return list;
}

function currentSave() {
  return {
    cash: economy.cash,
    missionIndex: game.missionIndex,
    completed: game.completed,
    garage: economy.garage,
    armour: player.armour,
    ammo: player.ammo,
    hasPistol: player.hasPistol,
    position: { x: Math.round(player.x), z: Math.round(player.z), heading: player.heading },
    playSeconds: Math.round(game.time),
  };
}

function applySave(s) {
  economy.cash = s.cash;
  game.missionIndex = s.missionIndex;
  game.completed = s.completed || [];
  economy.garage = s.garage || [];
  player.armour = s.armour || 0;
  player.ammo = s.ammo ?? 24;
  player.hasPistol = !!s.hasPistol;
  if (player.hasPistol) player.weapon = 'pistol';
  player.placeAt(s.position?.x ?? -452, s.position?.z ?? 96, s.position?.heading ?? 2.2);
  // The garage rolls out onto the Casa Ferrer kerb.
  economy.garage.forEach((id, i) => {
    const v = new Vehicle(scene, id, 0xdad4c4, LOCATIONS.safehouse.x - 24 - i * 7, LOCATIONS.safehouse.z + 6, Math.PI / 2);
    v.owned = true;
    economy.spawnedOwned.push(v);
  });
}

function persist() { storeSave(currentSave()); game.dirty = false; }

// --- starting -----------------------------------------------------------------
function lockPointer() {
  try {
    const p = renderer.domElement.requestPointerLock?.();
    if (p && typeof p.catch === 'function') p.catch(() => { /* a human click re-locks */ });
  } catch { /* pointer lock is a comfort, not a requirement */ }
}

function startGame(mode) {
  document.getElementById('startScreen').style.display = 'none';
  audio.start();
  if (mode === 'new') {
    wipeSave();
    applySave(defaultSave());
  } else if (mode === 'continue') {
    const s = loadSave();
    applySave(s || defaultSave());
  } else {
    const s = loadSave();
    applySave(s || defaultSave());
  }
  game.state = 'play';
  input.wantsLock = true;
  lockPointer();
  hud.toast(mode === 'new' ? 'Puerto Azahar, 1989. Marisol is waiting at Casa Ferrer.' : 'Welcome back to Puerto Azahar.');
}

document.getElementById('btnNew').addEventListener('click', () => startGame('new'));
document.getElementById('btnFree').addEventListener('click', () => startGame('free'));
const btnContinue = document.getElementById('btnContinue');
if (hasSave()) btnContinue.style.display = 'block';
btnContinue.addEventListener('click', () => startGame('continue'));
document.getElementById('btnRespawn').addEventListener('click', () => respawn());
document.getElementById('btnResume').addEventListener('click', () => {
  document.getElementById('pauseScreen').style.display = 'none';
  game.state = 'play';
  lockPointer();
});
document.getElementById('btnSave').addEventListener('click', () => { persist(); hud.toast('Saved. Rico\'s life is on record.'); });
document.getElementById('btnQuit').addEventListener('click', () => {
  persist();
  document.getElementById('pauseScreen').style.display = 'none';
  document.getElementById('startScreen').style.display = 'flex';
  game.state = 'menu';
});
document.getElementById('btnShopClose').addEventListener('click', closeShop);

function respawn() {
  hud.hideEnd();
  hud.fade(false);
  police.clearWanted();
  player.dead = false;
  player.health = 100;
  player.armour = 0;
  if (player.inCar) exitCar(true);
  player.placeAt(LOCATIONS.safehouse.x - 14, LOCATIONS.safehouse.z + 4, 1.4);
  game.state = 'play';
  lockPointer();
  persist();
}

function endSequence(kind) {
  game.state = 'end';
  game.endKind = kind;
  document.exitPointerLock?.();
  const fine = kind === 'busted' ? Math.round(economy.cash * 0.2) : Math.round(economy.cash * 0.15);
  economy.cash = Math.max(0, economy.cash - fine);
  if (kind === 'busted') hud.showEnd('BUSTED', `Inspectora Duarte's Patrulla takes $${fine} in fines. You walk out of the comisaría at dawn, lighter and angrier.`);
  else hud.showEnd('WASTED', `The hospital at Puerto Azahar patches Rico up and bills him $${fine}. The city does not wait — but it remembers.`);
  audio.sting(false);
}

// --- cars: getting in and out ---------------------------------------------------
function enterCar(v) {
  const wasTraffic = v.driver === 'traffic';
  traffic.claim(v);
  const copIdx = police.cars.findIndex(c => c.v === v);
  if (copIdx >= 0) police.cars.splice(copIdx, 1);
  if (director.targetCar === v && director.state === 'active') { /* stealing the target: bold */ }
  v.driver = 'player';
  player.inCar = v;
  player.mesh.visible = false;
  driver.snapBehind(v);
  audio.click();
  if (wasTraffic) {
    events.push({ kind: 'crime', type: 'carTheft', x: player.x, z: player.z });
    // The owner leaps out and runs, screaming for the Patrulla.
    crowd.frightenAround(v.x, v.z, 14);
    hud.toast('Stolen! The owner is screaming for the Patrulla.');
  }
  if (copIdx >= 0) events.push({ kind: 'crime', type: 'carTheft', x: player.x, z: player.z });
}

function exitCar(silent = false) {
  const v = player.inCar;
  if (!v) return;
  v.driver = null;
  player.inCar = null;
  player.mesh.visible = true;
  const side = v.heading + Math.PI / 2;
  player.placeAt(v.x + Math.sin(side) * 2.4, v.z + Math.cos(side) * 2.4, v.heading);
  audio.setEngine(0, false);
  if (!silent) audio.click();
}

// --- the shop -------------------------------------------------------------------
function openShop() {
  game.state = 'shop';
  document.exitPointerLock?.();
  const screen = document.getElementById('shopScreen');
  screen.style.display = 'flex';
  renderShop();
}

function closeShop() {
  document.getElementById('shopScreen').style.display = 'none';
  if (game.state === 'shop') {
    game.state = 'play';
    lockPointer();
  }
  persist();
}

function renderShop() {
  document.getElementById('shopCash').textContent = 'Cash: $' + economy.cash.toLocaleString('en-US');
  const list = document.getElementById('shopList');
  list.innerHTML = '';
  for (const item of economy.stock()) {
    const row = document.createElement('div');
    row.className = 'shopRow';
    const owned = item.kind === 'car' && economy.garage.includes(item.id);
    row.innerHTML = `<span>${item.name}${owned ? ' · owned' : ''}</span><b>$${item.price}</b>`;
    const btn = document.createElement('button');
    btn.textContent = economy.cash >= item.price ? 'Buy' : 'Too dear';
    btn.disabled = economy.cash < item.price;
    btn.addEventListener('click', () => {
      const res = economy.buy(item.id, { player, events });
      hud.toast(res.text, 3800);
      if (res.ok) { audio.cash(); game.dirty = true; }
      else audio.click();
      renderShop();
    });
    row.appendChild(btn);
    list.appendChild(row);
  }
}

// --- interactions -----------------------------------------------------------------
function tryInteract() {
  // Mission offer first.
  if (director.state === 'idle') {
    const m = director.available(game.missionIndex);
    if (m) {
      const offer = OFFER_POINTS[m.id];
      if (offer && dist2d(player.x, player.z, offer.x, offer.z) < 7) {
        director.start(m);
        game.briefIdx = 0;
        game.state = 'brief';
        hud.showMission(m.giver.toUpperCase(), m.title, m.intro[0] + '\n\n[E] Continue');
        audio.click();
        return;
      }
    }
  }
  if (director.state === 'failed') {
    const m = director.mission;
    const offer = m ? OFFER_POINTS[m.id] : null;
    if (offer && dist2d(player.x, player.z, offer.x, offer.z) < 7) {
      director.start(m);
      game.briefIdx = 0;
      game.state = 'brief';
      hud.showMission(m.giver.toUpperCase(), m.title, m.intro[0] + '\n\n[E] Continue');
      return;
    }
  }
  // Then the street's own offers.
  const spot = economy.nearestInteractable(player.x, player.z);
  if (spot) {
    if (spot.id === 'shop') { openShop(); return; }
    if (spot.id === 'safehouse') {
      hud.fade(true);
      setTimeout(() => {
        player.heal(100);
        sky.setHour(8.05);
        police.clearWanted();
        persist();
        hud.fade(false);
        hud.toast('Rested at Casa Ferrer. Morning, fed, saved.');
      }, 650);
      audio.click();
      return;
    }
    if (spot.id === 'pier') {
      if (game.pierCd <= 0) {
        game.pierCd = 60;
        economy.add(40);
        audio.cash();
        hud.toast('Pier shift done: +$40. The fishermen nod at Rico now.');
        game.dirty = true;
      } else hud.toast('The fishermen are set for now. Come back later.');
      return;
    }
  }
  // Otherwise: a car door is an interaction too.
  const car = findEnterableCar(player.x, player.z, allVehicles());
  if (car) enterCar(car);
}

function currentPrompt() {
  if (game.state !== 'play' || player.inCar) return null;
  if (director.state === 'idle' || director.state === 'failed') {
    const m = director.available(game.missionIndex) || (director.state === 'failed' ? director.mission : null);
    if (m) {
      const offer = OFFER_POINTS[m.id];
      if (offer && dist2d(player.x, player.z, offer.x, offer.z) < 7) {
        return director.state === 'failed' ? `[E] Retry: ${m.title}` : `[E] ${m.giver}: “${m.title}”`;
      }
    }
  }
  const spot = economy.nearestInteractable(player.x, player.z);
  if (spot) return '[E] ' + spot.label;
  const car = findEnterableCar(player.x, player.z, allVehicles());
  if (car) return `[F] Drive the ${car.type.name}`;
  return null;
}

// --- the event queue ----------------------------------------------------------------
function processEvents() {
  while (events.length) {
    const e = events.shift();
    switch (e.kind) {
      case 'crime': {
        // Quiet crimes need a witness; loud ones carry across the water.
        let witnessed = e.type === 'gunshot' || e.type === 'murder' || e.type === 'shotCop' || e.type === 'copDown';
        if (!witnessed) {
          witnessed = police.officers.some(o => dist2d(o.x, o.z, e.x, e.z) < 55) ||
            police.cars.some(c => dist2d(c.v.x, c.v.z, e.x, e.z) < 55) ||
            crowd.peds.some(p => dist2d(p.x, p.z, e.x, e.z) < 30);
        }
        if (witnessed) police.reportCrime(e.type, e.x, e.z);
        break;
      }
      case 'pedHit':
        if (e.byPlayer) {
          events.push({ kind: 'crime', type: e.speed > 11 ? 'murder' : 'assault', x: player.x, z: player.z });
          hud.toast(e.speed > 11 ? 'You ran them down!' : 'You clipped a pedestrian!');
          audio.thud();
        }
        break;
      case 'officerHitPlayer':
      case 'hostileHitPlayer':
        player.damage(e.amount, 0, 0, events);
        hud.damageFlash();
        break;
      case 'playerHurt': hud.damageFlash(); break;
      case 'wasted': endSequence('wasted'); break;
      case 'busted': endSequence('busted'); break;
      case 'copRam': if (player.inCar) { player.inCar.damage(e.amount * 0.4); hud.damageFlash(); } break;
      case 'wantedUp':
        audio.wantedUp();
        hud.toast(`WANTED — ${e.stars} star${e.stars > 1 ? 's' : ''}. The Patrulla is coming.`);
        break;
      case 'wantedDown':
        if (e.stars > 0) hud.toast(`Heat cooling… ${e.stars} star${e.stars > 1 ? 's' : ''} left.`);
        else hud.toast('You lost them. The city breathes again.');
        break;
      case 'missionBrief': break;
      case 'missionStart': audio.sting(true); break;
      case 'objective': hud.setObjective(e.text, null); break;
      case 'objectiveTick': hud.setObjective(e.text, null); break;
      case 'forceWanted':
        if (police.stars < e.stars) { police.stars = e.stars; events.push({ kind: 'wantedUp', stars: e.stars }); }
        break;
      case 'missionComplete': {
        const m = e.mission;
        economy.add(m.reward);
        game.completed.push(m.id);
        game.missionIndex++;
        if (m.givesPistol && !player.hasPistol) {
          player.hasPistol = true; player.ammo += 30; player.weapon = 'pistol';
          hud.toast('Marisol presses a 9mm into Rico\'s hand. "Now you are dressed."');
        }
        hud.showMission('MISSION COMPLETE', m.title, `+$${m.reward} — the word spreads through Puerto Azahar.`);
        setTimeout(() => hud.hideMission(), 5200);
        hud.setObjective(null);
        audio.sting(true); audio.cash();
        game.dirty = true;
        persist();
        break;
      }
      case 'missionFailed':
        hud.showMission('MISSION FAILED', e.mission.title, e.reason + ' — head back to the giver to try again.');
        setTimeout(() => hud.hideMission(), 5200);
        hud.setObjective(null);
        audio.sting(false);
        break;
      case 'hostileDown':
        if (live.chance(0.55)) director.dropPickup(e.x, e.z, 'cash', live.int(15, 60));
        else if (live.chance(0.3)) director.dropPickup(e.x, e.z, 'ammo', 8);
        break;
      case 'pickup':
        if (e.what === 'cash') { economy.add(e.amount); hud.toast(`+$${e.amount}`); }
        if (e.what === 'ammo') { player.ammo += e.amount; player.hasPistol = true; hud.toast(`+${e.amount} rounds`); }
        if (e.what === 'health') { player.heal(e.amount); hud.toast('Patched up.'); }
        if (e.what === 'armour') { player.armour = Math.min(100, player.armour + e.amount); hud.toast('Vest patched.'); }
        audio.pickup();
        game.dirty = true;
        break;
      case 'tailWarn':
        if (game.time - game.tailWarnT > 4) { game.tailWarnT = game.time; hud.toast(e.text, 1600); }
        break;
      case 'garageChanged': game.dirty = true; break;
    }
  }
  // Director events ride the same queue.
  while (director.events.length) events.push(director.events.shift());
  while (police.events.length) events.push(police.events.shift());
}

// --- per-frame ----------------------------------------------------------------------
const clockT = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clockT.getDelta(), 0.05);
  const elapsed = clockT.elapsedTime;

  if (game.state === 'menu') {
    game.menuAngle += dt * 0.03;
    const r = 330;
    camera.position.set(Math.sin(game.menuAngle) * r, 95, Math.cos(game.menuAngle) * r);
    camera.lookAt(0, 10, -40);
    sky.update(dt, { x: 0, z: 0 });
    city.update(dt, sky, elapsed);
    renderer.render(scene, camera);
    return;
  }

  if (game.state === 'play' || game.state === 'brief') {
    game.time += dt;
    game.pierCd = Math.max(0, game.pierCd - dt);
    const inCar = !!player.inCar;
    const pPos = inCar ? { x: player.inCar.x, z: player.inCar.z } : player.pos;
    if (inCar) { player.x = player.inCar.x; player.z = player.inCar.z; }

    // World systems.
    sky.update(dt, pPos);
    city.update(dt, sky, elapsed);
    traffic.update(dt, pPos, player.inCar, city.colliders);
    const trafficVehicles = [...traffic.cars.map(c => c.v), ...traffic.parked];
    crowd.update(dt, {
      playerPos: pPos, vehicles: [...trafficVehicles, ...police.cars.map(c => c.v), ...(player.inCar ? [player.inCar] : [])],
      colliders: city.colliders, playerVehicle: player.inCar,
    });
    while (crowd.events.length) events.push(crowd.events.shift());
    for (const t of traffic.events.splice(0)) {
      if (t.kind === 'honk') audio.honk();
      if (t.kind === 'crash') { audio.crash(); effects.crashPuff(t.x, groundHeight(t.x, t.z) + 1, t.z); }
    }

    const playerSpeed = inCar ? Math.abs(player.inCar.speed) : player.speedNow;
    const playerVel = inCar
      ? { x: Math.sin(player.inCar.heading) * player.inCar.speed, z: Math.cos(player.inCar.heading) * player.inCar.speed }
      : { x: 0, z: 0 };
    const shared = {
      playerPos: pPos, playerInCar: inCar, playerSpeed, playerAlive: !player.dead,
      playerHeading: inCar ? player.inCar.heading : player.heading,
      playerVel, playerVehicle: player.inCar,
      colliders: city.colliders, audio, effects, events, darkness: 1 - sky.daylight,
    };
    police.update(dt, shared);
    director.update(dt, shared);
    for (const v of allVehicles()) v.syncMesh(dt);
    if (director.giftCar) director.giftCar.syncMesh(dt);

    // The player himself.
    if (game.state === 'brief') {
      // Briefing: lines advance on E or click; the world idles behind.
      const m = director.mission;
      if (input.justPressed('KeyE') || input.attackClicked) {
        game.briefIdx++;
        if (game.briefIdx >= m.intro.length) {
          hud.hideMission();
          director.beginSteps();
          game.state = 'play';
        } else {
          hud.showMission(m.giver.toUpperCase(), m.title, m.intro[game.briefIdx] + '\n\n[E] Continue');
        }
      }
    } else if (!inCar) {
      player.update(dt, {
        input, camera, colliders: city.colliders, effects, audio, events,
        targets: {
          peds: crowd.peds, officers: police.officers, hostiles: director.hostiles,
          vehicles: allVehicles(),
        },
        crowdFrighten: (x, z, r) => crowd.frightenAround(x, z, r, true),
      });
      game.speedKmh = 0;
      audio.setEngine(0, false);
    } else {
      const before = player.inCar.health;
      game.speedKmh = driver.update(dt, player.inCar, input, camera, audio);
      const v = player.inCar;
      v.syncMesh(dt);
      if (before - v.health > 5) {
        audio.crash();
        effects.crashPuff(v.x, groundHeight(v.x, v.z) + 1, v.z, before - v.health > 14);
        if (before - v.health > 16) { player.damage((before - v.health) * 0.22, 0, 0, events); }
      }
      if (v.health < 45 && live.chance(dt * 6)) effects.engineSmoke(v.x, groundHeight(v.x, v.z) + 1.1, v.z);
      if (v.health <= 0 && !v.dead) { /* vehicle sets dead itself */ }
      // Running someone down in a car is still a crime.
      if (Math.abs(v.speed) > 20 && police.stars < 1 && police.cars.length) {
        events.push({ kind: 'crime', type: 'reckless', x: v.x, z: v.z });
      }
    }

    // Keys that live outside the body.
    if (input.justPressed('KeyF')) {
      if (player.inCar) exitCar();
      else {
        const car = findEnterableCar(player.x, player.z, allVehicles());
        if (car) enterCar(car);
      }
    }
    if (input.justPressed('KeyE') && game.state === 'play') {
      if (player.inCar) exitCar();
      else tryInteract();
    }
    if (input.justPressed('KeyR') && (player.inCar || true)) {
      const st = audio.cycleRadio();
      hud.radio(st.name + (st.style === 'off' ? ' — radio off' : ''));
    }
    if (input.justPressed('KeyM')) {
      if (audio.started) audio.master.gain.value = audio.master.gain.value > 0 ? 0 : 0.55;
    }
    if ((input.justPressed('KeyP') || input.justPressed('Escape')) && game.state === 'play') {
      game.state = 'pause';
      document.getElementById('pauseScreen').style.display = 'flex';
      document.exitPointerLock?.();
    }

    processEvents();
    if (game.state === 'play' || game.state === 'brief') updateHud(pPos);
    // Autosave.
    game.saveT += dt;
    if (game.dirty && game.saveT > 15) { game.saveT = 0; persist(); }
  }

  effects.update(dt);
  audio.update();
  hud.update(dt);
  renderer.render(scene, camera);
  input.endFrame();
}

function updateHud(pPos) {
  hud.setStars(police.stars, police.bust);
  const district = districtAt(pPos.x, pPos.z);
  hud.setStatus(economy.cash, sky.clockText(), district.name);
  hud.setVitals(player.health, player.armour);
  if (player.inCar) {
    hud.setWeapon(player.inCar.type.name.toUpperCase(), '', game.speedKmh, true);
  } else {
    hud.setWeapon(
      player.weapon === 'pistol' ? '9MM PISTOL' : 'FISTS',
      player.weapon === 'pistol' ? String(player.ammo) : '—',
      0, false
    );
  }
  // Objective marker + prompt + mission offer beacon.
  let markerPos = null;
  if (director.state === 'active' && director.marker.visible) {
    markerPos = { x: director.marker.position.x, z: director.marker.position.z };
  } else if (director.state === 'idle' || director.state === 'failed') {
    const m = director.available(game.missionIndex) || (director.state === 'failed' ? director.mission : null);
    if (m) {
      const offer = OFFER_POINTS[m.id];
      if (offer) {
        director.setMarker(offer.x, offer.z, 0x7fd4ff);
        markerPos = offer;
        if (director.state === 'idle') hud.setObjective(`Story: ${m.title} — meet ${m.giver}`, offer);
      }
    }
  } else if (director.marker.visible) {
    markerPos = { x: director.marker.position.x, z: director.marker.position.z };
  }
  if (director.state === 'active') hud.updateObjectiveDist(pPos.x, pPos.z);
  hud.objectiveTarget = markerPos;
  hud.prompt(game.state === 'play' ? currentPrompt() : null);
  hud.drawMap({
    px: pPos.x, pz: pPos.z, heading: player.inCar ? player.inCar.heading : player.heading,
    traffic: traffic.cars.map(c => c.v), police: police.cars.map(c => c.v),
    officers: police.officers, hostiles: director.hostiles, marker: markerPos,
  });
}

// --- shot mode: staged frames for the dossier ---------------------------------------
const api = {
  scene, camera, sky, city, player, police, traffic, crowd, director, economy,
  effects, hud, events, LOCATIONS, enterCar, input,
  setHour: (h) => sky.setHour(h),
  getState: () => game.state,
  allVehicles,
};
window.__game = api;
if (shotName) {
  document.getElementById('startScreen').style.display = 'none';
  applySave(defaultSave());
  player.hasPistol = true; player.ammo = 60; player.weapon = 'pistol';
  Promise.resolve(setupShot(shotName, api)).then(() => {
    // Let the staged world settle and animate for a few frames.
    let frames = 0;
    const settle = () => {
      frames++;
      if (frames > 45) { window.__shotReady = true; return; }
      requestAnimationFrame(settle);
    };
    requestAnimationFrame(settle);
  });
}

frame();
