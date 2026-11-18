// sky.js — the Azahar day arc: a sun that climbs, gilds, sets and gives the
// city to the neon. Owns the lights, the fog, the sky dome and the clock the
// HUD reads. Other systems ask it how dark it is; it tells them.
import * as THREE from 'three';
import { WORLD } from './config.js';
import { clamp, lerp } from './rng.js';

// Keyframed moods across 24 hours: sky zenith, horizon, fog, sun colour,
// sun strength, ambient strength. Dawn and dusk run long and golden — this
// is a postcard town and the light knows it.
const MOODS = [
  { h: 0.0, zen: 0x0a1030, hor: 0x1c2444, fog: 0x131a30, sun: 0x8fa8ff, sunI: 0.12, amb: 0.46 },
  { h: 5.0, zen: 0x0d1434, hor: 0x2a2a4a, fog: 0x1a1e38, sun: 0x8fa8ff, sunI: 0.12, amb: 0.47 },
  { h: 6.5, zen: 0x3a5a9c, hor: 0xff9d5c, fog: 0x8a6a72, sun: 0xffb36a, sunI: 0.85, amb: 0.5 },
  { h: 8.0, zen: 0x4a90d9, hor: 0xcfe4f2, fog: 0xbcd2de, sun: 0xffe3ae, sunI: 1.25, amb: 0.62 },
  { h: 12.0, zen: 0x3d8fe0, hor: 0xd8ecf7, fog: 0xc4dde8, sun: 0xfff3da, sunI: 1.45, amb: 0.7 },
  { h: 16.5, zen: 0x3d84d4, hor: 0xd2e6ee, fog: 0xbcd4dc, sun: 0xffe9bb, sunI: 1.3, amb: 0.64 },
  { h: 18.5, zen: 0x35508f, hor: 0xff8a4d, fog: 0x9c7264, sun: 0xff9a4d, sunI: 0.95, amb: 0.52 },
  { h: 19.8, zen: 0x1c2a5e, hor: 0xd84f7a, fog: 0x4c3550, sun: 0xff7a5c, sunI: 0.4, amb: 0.42 },
  { h: 21.0, zen: 0x0a1030, hor: 0x232048, fog: 0x161a34, sun: 0x8fa8ff, sunI: 0.12, amb: 0.48 },
  { h: 24.0, zen: 0x0a1030, hor: 0x1c2444, fog: 0x131a30, sun: 0x8fa8ff, sunI: 0.12, amb: 0.46 },
];

const _c1 = new THREE.Color(), _c2 = new THREE.Color();
const _focus = new THREE.Vector3();
function mixHex(a, b, t, out) { return out.copy(_c1.setHex(a)).lerp(_c2.setHex(b), t); }

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.hour = WORLD.startHour;
    this.daylight = 1;      // 1 at noon, 0 in the deep night
    this.duskGlow = 0;      // peaks at dawn/dusk — screenshots love it

    this.hemi = new THREE.HemisphereLight(0xbfe3ff, 0x8a6f4d, 0.6);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffe3ae, 1.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -170; sc.right = 170; sc.top = 170; sc.bottom = -170; sc.near = 10; sc.far = 700;
    this.sun.shadow.bias = -0.0006;
    scene.add(this.sun);
    scene.add(this.sun.target);

    scene.fog = new THREE.Fog(0xbcd2de, 240, 1150);

    // Sky dome: a big inverted sphere with a vertex-colour gradient that we
    // repaint as the moods blend.
    const domeGeo = new THREE.SphereGeometry(1600, 24, 12);
    const pos = domeGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    domeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.dome = new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
    }));
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    // Stars: points that fade in after dark.
    const starGeo = new THREE.BufferGeometry();
    const sp = [];
    for (let i = 0; i < 700; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.acos(Math.random() * 0.95);
      const r = 1500;
      sp.push(r * Math.sin(e) * Math.cos(a), r * Math.cos(e) * 0.6 + 60, r * Math.sin(e) * Math.sin(a));
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xcfe0ff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false,
    }));
    scene.add(this.stars);

    // The moon: a pale disc that rides opposite the sun.
    this.moon = new THREE.Mesh(
      new THREE.CircleGeometry(46, 24),
      new THREE.MeshBasicMaterial({ color: 0xe8eeff, fog: false, transparent: true, opacity: 0.9 }),
    );
    scene.add(this.moon);
  }

  moodAt(hour) {
    let i = 0;
    while (i < MOODS.length - 2 && MOODS[i + 1].h <= hour) i++;
    const a = MOODS[i], b = MOODS[i + 1];
    const t = clamp((hour - a.h) / (b.h - a.h), 0, 1);
    return { a, b, t };
  }

  update(dt, focus) {
    this.hour = (this.hour + (dt / WORLD.dayLength) * 24) % 24;
    const { a, b, t } = this.moodAt(this.hour);
    // Callers hand in a flat {x, z} — never copy() it into a Vector3 blind:
    // a missing y turns the sun's position NaN and kills all direct light.
    const F = _focus.set(focus.x || 0, 0, focus.z || 0);

    // Sun path: rises east (+x), sets west, below the horizon at night.
    const ang = ((this.hour - 6) / 12) * Math.PI; // 6h -> 0, 18h -> PI
    const sunDir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0.35).normalize();
    const night = sunDir.y < 0.02;
    const lightDir = night ? new THREE.Vector3(-sunDir.x, 0.4, -0.3).normalize() : sunDir;

    this.sun.position.copy(F).addScaledVector(lightDir, 320);
    this.sun.target.position.copy(F);
    mixHex(a.sun, b.sun, t, this.sun.color);
    this.sun.intensity = lerp(a.sunI, b.sunI, t) * (night ? 0.35 : 1);

    this.hemi.intensity = lerp(a.amb, b.amb, t);
    mixHex(a.zen, b.zen, t, this.hemi.color);
    mixHex(a.hor, b.hor, t, this.hemi.groundColor);

    mixHex(a.fog, b.fog, t, this.scene.fog.color);
    this.scene.fog.near = night ? 170 : 240;
    this.scene.fog.far = night ? 850 : 1150;

    this.daylight = clamp(sunDir.y * 1.6 + 0.25, 0, 1);
    const duskBand = Math.exp(-Math.pow((Math.abs(sunDir.y) - 0.12) * 6, 2));
    this.duskGlow = clamp(duskBand, 0, 1);

    // Repaint the dome gradient: zenith at the crown, horizon at the rim,
    // with a warm smear around the sun's azimuth at low sun.
    const zen = mixHex(a.zen, b.zen, t, new THREE.Color());
    const hor = mixHex(a.hor, b.hor, t, new THREE.Color());
    const pos = this.dome.geometry.attributes.position;
    const col = this.dome.geometry.attributes.color;
    const sunAz = Math.atan2(sunDir.z, sunDir.x);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 1600;
      const az = Math.atan2(pos.getZ(i), pos.getX(i));
      let f = clamp(y * 1.4 + 0.18, 0, 1);
      _c1.copy(hor).lerp(zen, f);
      if (this.duskGlow > 0.03 && y < 0.4) {
        const azDiff = Math.abs(Math.atan2(Math.sin(az - sunAz), Math.cos(az - sunAz)));
        const glow = this.duskGlow * Math.max(0, 1 - azDiff / 1.5) * (1 - y / 0.4);
        _c1.lerp(_c2.setHex(0xff8a4d), glow * 0.55);
      }
      col.setXYZ(i, _c1.r, _c1.g, _c1.b);
    }
    col.needsUpdate = true;
    this.dome.position.copy(F);

    // Moon + stars after dark.
    const moonDir = new THREE.Vector3(-sunDir.x, Math.max(0.15, -sunDir.y + 0.3), -0.4).normalize();
    this.moon.position.copy(F).addScaledVector(moonDir, 1400);
    this.moon.lookAt(F);
    this.moon.material.opacity = night ? 0.9 : 0;
    this.stars.material.opacity = clamp(1 - this.daylight * 1.8, 0, 0.9);
    this.stars.position.copy(F);
  }

  clockText() {
    const hh = Math.floor(this.hour);
    const mm = Math.floor((this.hour - hh) * 60);
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }

  setHour(h) { this.hour = ((h % 24) + 24) % 24; }
}
