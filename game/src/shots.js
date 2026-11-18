// shots.js — staged frames for the dossier's screenshots. Each setup places
// Rico, the light and the trouble exactly where the camera wants them, then
// the live simulation takes over: traffic rolls, rotors spin, light-bars
// strobe. The rig (?shot=<name>) waits for the settle flag and captures.
import { Vehicle } from './vehicles.js';
import { Hostile } from './missions.js';
import { LOCATIONS } from './city.js';

export const SHOT_NAMES = ['cover', 'chase', 'mission', 'night'];

export function setupShot(name, api) {
  const { player, police, traffic, director, hud, scene } = api;
  if (name === 'cover') {
    // Golden hour on the coast road: Rico stands in the shore lane looking
    // west along the bay — traffic rolling past him both ways, palms and
    // marina towers on his right, sailboats and the low sun on his left.
    api.setHour(17.25);
    player.placeAt(120, 446, -1.62);
    player.camYaw = -1.62; player.camPitch = 0.13;
    traffic.addParked(104, 437.5, 0.1);
    traffic.addParked(150, 455.5, -0.2);
    traffic.addParked(64, 437.5, 0.4);
    const cab = new Vehicle(scene, 'taxi', 0xf2b13c, 210, 447, -Math.PI / 2);
    cab.driver = 'traffic';
    traffic.cars.push({ v: cab, tx: -400, tz: 447, cruise: 10, wait: 0 });
    const sedan = new Vehicle(scene, 'meridian', 0x2e6fb8, 30, 453.5, Math.PI / 2);
    sedan.driver = 'traffic';
    traffic.cars.push({ v: sedan, tx: 620, tz: 453.5, cruise: 11, wait: 0 });
    hud.setObjective('Story: First Wheels — meet Marisol Vega', LOCATIONS.safehouse);
  }

  if (name === 'chase') {
    // Four stars on the north avenue: a yellow Vipera at full throttle (the
    // rig holds W for the whole settle), two interceptors on its tail, a
    // roadblock ahead, and the helicopter swinging in over the rooftops.
    api.setHour(16.9);
    const car = new Vehicle(scene, 'vipera', 0xf2c41c, 90, 150, Math.PI);
    car.speed = 17;
    api.enterCar(car);
    api.input.keys.add('KeyW'); // the driver keeps his foot down for the camera
    police.stars = 4;
    const cop1 = police.spawnCopCar(90, 150);
    if (cop1) { cop1.x = 85; cop1.z = 178; cop1.heading = Math.PI; cop1.speed = 16; }
    const cop2 = police.spawnCopCar(90, 150);
    if (cop2) { cop2.x = 96; cop2.z = 194; cop2.heading = Math.PI; cop2.speed = 15; }
    police.makeRoadblock(90, 150, Math.PI);
    for (const c of police.cars) {
      if (c.role === 'block') { c.v.z = 96 + (c.v.x - 90); c.v.x = c.v.x < 90 ? 85.5 : 94.5; }
    }
    hud.toast('WANTED — 4 stars. The Patrulla is coming.');
  }

  if (name === 'mission') {
    // Muelle Uno at mid-morning: Rico at the pier's root looking south down
    // its length — Roque's crew holds the boards ahead of him, and beyond
    // them the bay, the boats and the Faro lighthouse.
    api.setHour(10.4);
    player.placeAt(-38, 433, 0);
    player.camYaw = 0; player.camPitch = 0.18;
    player.weapon = 'pistol';
    director.hostiles.push(new Hostile(scene, -44, 444));
    director.hostiles.push(new Hostile(scene, -31, 447));
    director.hostiles.push(new Hostile(scene, -52, 449));
    traffic.addParked(-22, 427, 0.3);
    hud.showMission('MARISOL VEGA', 'Beach Party Crashers', '"Teach them the pier is ours. All of them."');
    hud.setObjective('Clear Roque\'s crew off Muelle Uno', { x: -40, z: 448 });
  }

  if (name === 'night') {
    // The neon strip after dark: Rico mid-avenue where the lamp pools
    // spill across the tarmac, tower walls of lit windows on both sides,
    // and a patrol car idling ahead with two stars of interest in him.
    api.setHour(22.3);
    player.placeAt(-90, -438, Math.PI);
    player.camYaw = Math.PI; player.camPitch = 0.2;
    player.weapon = 'pistol';
    police.stars = 2;
    const cop = police.spawnCopCar(-90, -438);
    if (cop) { cop.x = -83; cop.z = -406; cop.heading = 2.9; cop.speed = 0; }
    traffic.addParked(-99, -470, 0.05);
    traffic.addParked(-80, -478, -0.15);
    hud.setObjective('Lose the Patrulla — or reach Casa Ferrer', LOCATIONS.safehouse);
  }
}
