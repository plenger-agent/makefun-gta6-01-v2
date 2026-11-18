// driving.js — being in a car: finding one worth stealing, the input mapping
// (WASD through the Vehicle's own physics), and a chase camera that leans
// back as the speed climbs. The engine note follows the speedo.
import { clamp, dist2d } from './rng.js';
import { groundHeight } from './config.js';

export function findEnterableCar(x, z, vehicles, maxDist = 4.4) {
  let best = null, bestD = maxDist;
  for (const v of vehicles) {
    if (v.dead) continue;
    const d = dist2d(x, z, v.x, v.z);
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}

export class DriveController {
  constructor() {
    this.camYaw = 0;
    this.camDist = 9.5;
    this.fov = 62;
  }

  snapBehind(vehicle) {
    this.camYaw = vehicle.heading;
  }

  // Returns the speedometer reading in km/h.
  update(dt, vehicle, input, camera, audio) {
    const throttle = input.axis('KeyS', 'KeyW') || input.axis('ArrowDown', 'ArrowUp');
    const steerIn = input.axis('KeyD', 'KeyA') + input.axis('ArrowRight', 'ArrowLeft');
    const handbrake = input.down('Space');
    vehicle.drive(dt, {
      throttle: clamp(throttle, -1, 1),
      steer: clamp(steerIn, -1, 1),
      brake: false,
      handbrake,
    }, this.colliders);

    // Chase camera: ease behind the car; the player can orbit with the mouse
    // and the camera drifts back to the tail when the car moves.
    const mouse = input.takeMouse();
    this.camYaw -= mouse.x * 0.0032;
    if (Math.abs(vehicle.speed) > 3) {
      let diff = vehicle.heading - this.camYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.camYaw += diff * Math.min(1, dt * (Math.abs(vehicle.speed) > 14 ? 2.6 : 1.2));
    }
    const speedNorm = clamp(Math.abs(vehicle.speed) / vehicle.type.topSpeed, 0, 1);
    const dist = 8.6 + speedNorm * 4.5;
    const cx = vehicle.x - Math.sin(this.camYaw) * dist;
    const cz = vehicle.z - Math.cos(this.camYaw) * dist;
    const cy = groundHeight(vehicle.x, vehicle.z) + 3.1 + speedNorm * 0.7;
    camera.position.set(cx, Math.max(cy, groundHeight(cx, cz) + 1.1), cz);
    camera.lookAt(vehicle.x + Math.sin(vehicle.heading) * 4, groundHeight(vehicle.x, vehicle.z) + 1.6, vehicle.z + Math.cos(vehicle.heading) * 4);
    const targetFov = 62 + speedNorm * 13;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4);
      camera.updateProjectionMatrix();
    }
    audio.setEngine(speedNorm, true);
    return Math.round(Math.abs(vehicle.speed) * 3.6);
  }
}
