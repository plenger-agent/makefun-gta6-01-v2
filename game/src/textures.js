// textures.js — every surface in Puerto Azahar is painted at boot on canvases:
// facades with lit windows, asphalt with worn lane paint, awnings, neon signs,
// container corrugation, sand and grass. No image files, no network.
import * as THREE from 'three';
import { Rng } from './rng.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const css = (hex) => '#' + hex.toString(16).padStart(6, '0');

// ---- building facades -------------------------------------------------------
// One texture per (style, wall colour) pair, cached. Windows are drawn as a
// grid; a share of them glow, which doubles as the night look via emissiveMap.
const facadeCache = new Map();

export function facadeTexture(style, wallHex, rng) {
  const key = style + ':' + wallHex;
  if (facadeCache.has(key)) return facadeCache.get(key);
  const [c, g] = canvas(256, 256);
  g.fillStyle = css(wallHex); g.fillRect(0, 0, 256, 256);
  // weather streaks
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(60,50,40,${rng.float(0.02, 0.07)})`;
    const x = rng.float(256); g.fillRect(x, rng.float(40), rng.float(2, 7), rng.float(60, 216));
  }
  const cols = style === 'tower' ? 8 : 5;
  const rows = style === 'tower' ? 10 : 5;
  const cw = 256 / cols, rh = 256 / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = x * cw + cw * 0.24, py = y * rh + rh * 0.2, w = cw * 0.52, h = rh * 0.55;
      // The lit decision is seeded per cell so the night glow map lines up.
      const lit = new Rng(wallHex * 31 + x * 7 + y * 131).chance(style === 'tower' ? 0.42 : 0.3);
      g.fillStyle = lit ? '#ffd98a' : '#2c3644';
      g.fillRect(px, py, w, h);
      g.fillStyle = 'rgba(255,255,255,.28)';
      g.fillRect(px, py, w, 2);
      if (style === 'colonial' || style === 'villa') { // shutters + sill
        g.fillStyle = '#7a4b2a'; g.fillRect(px - 3, py, 3, h); g.fillRect(px + w, py, 3, h);
        g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(px - 3, py + h, w + 6, 3);
      }
      if (style === 'warehouse' && y === rows - 1) { // roller doors on the ground floor
        g.fillStyle = '#5d666e'; g.fillRect(x * cw + 4, py - 4, cw - 8, rh - 2);
        g.fillStyle = 'rgba(0,0,0,.3)';
        for (let s = 0; s < 4; s++) g.fillRect(x * cw + 4, py + s * 7, cw - 8, 1.6);
      }
    }
  }
  if (style === 'market') { // striped awnings along the base
    for (let x = 0; x < cols; x++) {
      g.fillStyle = x % 2 ? '#c33f2e' : '#e8e0cc';
      g.beginPath();
      g.moveTo(x * cw + 2, 236); g.lineTo(x * cw + cw - 2, 236); g.lineTo(x * cw + cw - 8, 256); g.lineTo(x * cw + 8, 256);
      g.fill();
    }
  }
  const tex = toTexture(c);
  facadeCache.set(key, tex);
  return tex;
}

// The glowing-window companion used as an emissive map at night.
const glowCache = new Map();
export function facadeGlowTexture(style, wallHex, rng) {
  const key = 'glow:' + style + ':' + wallHex;
  if (glowCache.has(key)) return glowCache.get(key);
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  const cols = style === 'tower' ? 8 : 5;
  const rows = style === 'tower' ? 10 : 5;
  const cw = 256 / cols, rh = 256 / rows;
  // Replay the same random window pattern as the facade by reseeding per cell.
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell = new Rng(wallHex * 31 + x * 7 + y * 131);
      if (cell.chance(style === 'tower' ? 0.42 : 0.3)) {
        g.fillStyle = '#ffbe6a';
        g.fillRect(x * cw + cw * 0.24, y * rh + rh * 0.2, cw * 0.52, rh * 0.55);
      }
    }
  }
  const tex = toTexture(c);
  glowCache.set(key, tex);
  return tex;
}

// ---- ground surfaces --------------------------------------------------------
export function asphaltTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#33343c'; g.fillRect(0, 0, 256, 256);
  const rng = new Rng(77);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${rng.int(140, 210)},${rng.int(140, 200)},${rng.int(140, 190)},${rng.float(0.03, 0.1)})`;
    g.fillRect(rng.float(256), rng.float(256), 1.6, 1.6);
  }
  for (let i = 0; i < 7; i++) { // patched cracks and oil stains
    g.fillStyle = 'rgba(12,12,16,.25)';
    g.beginPath(); g.ellipse(rng.float(256), rng.float(256), rng.float(14, 44), rng.float(8, 20), rng.float(3), 0, 7); g.fill();
  }
  return toTexture(c, 1, 1);
}

export function pavementTexture(hex) {
  const [c, g] = canvas(128, 128);
  g.fillStyle = css(hex); g.fillRect(0, 0, 128, 128);
  const rng = new Rng(hex);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(70,60,45,${rng.float(0.04, 0.1)})`;
    g.fillRect(rng.float(128), rng.float(128), 2, 2);
  }
  g.strokeStyle = 'rgba(60,50,40,.4)'; g.lineWidth = 2;
  g.strokeRect(1, 1, 126, 126);
  g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.moveTo(0, 64); g.lineTo(128, 64); g.stroke();
  return toTexture(c, 6, 6);
}

export function groundTexture(hex, seed) {
  const [c, g] = canvas(128, 128);
  g.fillStyle = css(hex); g.fillRect(0, 0, 128, 128);
  const rng = new Rng(seed);
  for (let i = 0; i < 900; i++) {
    const v = rng.float(-14, 14) | 0;
    g.fillStyle = `rgba(${120 + v},${110 + v},${80 + v},${rng.float(0.05, 0.13)})`;
    g.fillRect(rng.float(128), rng.float(128), rng.float(1, 4), rng.float(1, 3));
  }
  return toTexture(c, 10, 10);
}

export function sandTexture() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#e6d29a'; g.fillRect(0, 0, 128, 128);
  const rng = new Rng(4242);
  for (let i = 0; i < 800; i++) {
    g.fillStyle = `rgba(160,130,80,${rng.float(0.05, 0.14)})`;
    g.fillRect(rng.float(128), rng.float(128), 1.6, 1.6);
  }
  g.strokeStyle = 'rgba(190,160,100,.35)';
  for (let y = 8; y < 128; y += 16) { g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(40, y + 5, 90, y - 5, 128, y); g.stroke(); }
  return toTexture(c, 8, 8);
}

// ---- signage ----------------------------------------------------------------
const SIGN_WORDS = ['HOTEL SOL', 'BAR LUNA', 'CAFÉ ORO', 'DISCO FARO', 'CINE MAR', 'TABACO', 'JOYAS REY', 'PIZZA NONA', 'CLUB VELA', 'BANCO AZAHAR', 'FARMACIA', 'MERCADO'];
export function signTexture(word, colorHex, rng) {
  const [c, g] = canvas(512, 128);
  g.fillStyle = '#14101f'; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = css(colorHex); g.lineWidth = 5;
  g.strokeRect(8, 8, 496, 112);
  g.font = '900 62px "Trebuchet MS", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = css(colorHex); g.shadowBlur = 26;
  g.fillStyle = '#fff2df';
  g.fillText(word, 256, 68);
  g.shadowBlur = 10; g.fillStyle = css(colorHex);
  g.fillText(word, 256, 68);
  return toTexture(c);
}

export function shopSignTexture(rng) {
  return signTexture(rng.pick(SIGN_WORDS), rng.pick([0xff4f9a, 0x39d5e8, 0xffb43a, 0x8be26a, 0xff7a4d]), rng);
}

// ---- misc props ---------------------------------------------------------------
export function containerTexture(hex, rng) {
  const [c, g] = canvas(256, 128);
  g.fillStyle = css(hex); g.fillRect(0, 0, 256, 128);
  for (let x = 8; x < 256; x += 18) {
    g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x, 0, 5, 128);
    g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(x + 5, 0, 3, 128);
  }
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.font = '700 26px monospace'; g.fillText('AZAHAR-' + rng.int(100, 999), 18, 40);
  for (let i = 0; i < 12; i++) {
    g.fillStyle = `rgba(60,40,20,${rng.float(0.08, 0.2)})`;
    g.fillRect(rng.float(256), rng.float(90, 128), rng.float(6, 30), rng.float(3, 10));
  }
  return toTexture(c);
}

export function boatHullTexture(hex) {
  const [c, g] = canvas(128, 64);
  g.fillStyle = css(hex); g.fillRect(0, 0, 128, 64);
  g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(0, 8, 128, 7);
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 48, 128, 16);
  return toTexture(c);
}

export function posterTexture(rng) {
  const [c, g] = canvas(128, 160);
  const bg = rng.pick(['#e8483f', '#ffb43a', '#39d5e8', '#ff4f9a', '#8be26a']);
  g.fillStyle = bg; g.fillRect(0, 0, 128, 160);
  g.fillStyle = 'rgba(10,8,20,.88)';
  g.font = '900 25px "Trebuchet MS", sans-serif'; g.textAlign = 'center';
  const lines = rng.pick([['FIESTA', 'DEL MAR'], ['GRAN', 'REGATA'], ['NOCHE', 'LATINA'], ['FERIA', '1989'], ['COPA', 'AZAHAR']]);
  g.fillText(lines[0], 64, 62); g.fillText(lines[1], 64, 92);
  g.fillRect(14, 112, 100, 5);
  g.font = '700 13px "Trebuchet MS", sans-serif';
  g.fillText('PUERTO AZAHAR', 64, 140);
  return toTexture(c);
}
