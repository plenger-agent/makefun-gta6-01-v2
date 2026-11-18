// hud.js — everything Rico reads at a glance: wanted stars, cash, the clock,
// the district he is standing in, vitals, weapon and speedo, mission and
// objective banners, prompts and toasts — and the minimap, drawn fresh each
// frame on its own canvas: districts, avenues, the sea, blips for the
// Patrulla, and a gold beacon on the objective.
import { DISTRICTS, GRID, WORLD } from './config.js';
import { clamp, dist2d } from './rng.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.starsEl = $('stars');
    this.cashEl = $('cashRow');
    this.clockEl = $('clockRow');
    this.districtEl = $('districtRow');
    this.healthEl = $('healthFill');
    this.armourEl = $('armorFill');
    this.weaponNameEl = $('weaponName');
    this.weaponAmmoEl = $('weaponAmmo');
    this.speedoEl = $('speedo');
    this.missionBox = $('missionBox');
    this.missionKicker = $('missionKicker');
    this.missionTitle = $('missionTitle');
    this.missionText = $('missionText');
    this.objectiveBox = $('objectiveBox');
    this.objectiveText = $('objectiveText');
    this.objectiveDist = $('objectiveDist');
    this.promptEl = $('prompt');
    this.toastEl = $('toast');
    this.radioEl = $('radioToast');
    this.damageEl = $('damageVin');
    this.fadeEl = $('fadeVin');
    this.crosshair = $('crosshair');
    this.mapCtx = $('minimap').getContext('2d');
    this.toastT = 0;
    this.radioT = 0;
    this.damageT = 0;
    this.lastStars = -1;
    this.objectiveTarget = null;
  }

  setStars(stars, bust) {
    if (stars !== this.lastStars) {
      this.lastStars = stars;
      this.starsEl.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
      this.starsEl.style.opacity = stars === 0 ? '0.25' : '1';
    }
    this.starsEl.style.color = bust > 0.05 ? (Math.sin(performance.now() * 0.02) > 0 ? '#ff5a4e' : '#ffc93c') : '';
  }

  setStatus(cash, clockText, districtName) {
    this.cashEl.textContent = '$' + cash.toLocaleString('en-US');
    this.clockEl.textContent = clockText;
    this.districtEl.textContent = districtName;
  }

  setVitals(health, armour) {
    this.healthEl.style.width = clamp(health, 0, 100) + '%';
    this.healthEl.style.background = health < 30 ? '#ff5a4e' : '#7dd069';
    this.armourEl.style.width = clamp(armour, 0, 100) + '%';
  }

  setWeapon(name, ammoText, speedKmh, inCar) {
    this.weaponNameEl.textContent = name;
    this.weaponAmmoEl.textContent = ammoText;
    this.speedoEl.textContent = inCar ? speedKmh + ' km/h' : '';
    this.crosshair.style.opacity = inCar ? '0' : '1';
  }

  showMission(kicker, title, text) {
    this.missionBox.style.display = 'block';
    this.missionBox.classList.add('show'); // the stylesheet fades plates in via .show
    this.missionKicker.textContent = kicker;
    this.missionTitle.textContent = title;
    this.missionText.textContent = text || '';
  }

  hideMission() { this.missionBox.style.display = 'none'; this.missionBox.classList.remove('show'); }

  setObjective(text, target) {
    if (!text) { this.objectiveBox.style.display = 'none'; this.objectiveBox.classList.remove('show'); this.objectiveTarget = null; return; }
    this.objectiveBox.style.display = 'block';
    this.objectiveBox.classList.add('show');
    this.objectiveText.textContent = text;
    this.objectiveTarget = target;
  }

  updateObjectiveDist(px, pz) {
    if (!this.objectiveTarget) { this.objectiveDist.textContent = ''; return; }
    const d = dist2d(px, pz, this.objectiveTarget.x, this.objectiveTarget.z);
    this.objectiveDist.textContent = d > 12 ? Math.round(d) + ' m' : '';
    // Point the way: rotate a small arrow in the objective box.
    this.objectiveDist.style.transform = '';
  }

  prompt(text) {
    if (text) { this.promptEl.textContent = text; this.promptEl.style.display = 'block'; this.promptEl.classList.add('show'); }
    else { this.promptEl.style.display = 'none'; this.promptEl.classList.remove('show'); }
  }

  toast(text, ms = 3400) {
    this.toastEl.textContent = text;
    this.toastEl.style.display = 'block';
    this.toastEl.classList.add('show');
    this.toastT = ms / 1000;
  }

  radio(text) {
    this.radioEl.textContent = '♪ ' + text;
    this.radioEl.style.display = 'block';
    this.radioEl.classList.add('show');
    this.radioT = 3;
  }

  damageFlash() { this.damageT = 0.55; }

  fade(black) { this.fadeEl.style.opacity = black ? '1' : '0'; }

  showEnd(title, text) {
    $('endTitle').textContent = title;
    $('endText').textContent = text;
    $('endScreen').style.display = 'flex';
  }
  hideEnd() { $('endScreen').style.display = 'none'; }

  update(dt) {
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) { this.toastEl.style.display = 'none'; this.toastEl.classList.remove('show'); } }
    if (this.radioT > 0) { this.radioT -= dt; if (this.radioT <= 0) { this.radioEl.style.display = 'none'; this.radioEl.classList.remove('show'); } }
    if (this.damageT > 0) {
      this.damageT -= dt;
      this.damageEl.style.opacity = String(clamp(this.damageT * 1.4, 0, 0.75));
    } else this.damageEl.style.opacity = '0';
  }

  // --- the minimap -------------------------------------------------------------
  drawMap(state) {
    const c = this.mapCtx;
    const S = 432, half = S / 2, scale = 0.62;
    const { px, pz, heading } = state;
    c.save();
    c.clearRect(0, 0, S, S);
    // sea
    c.fillStyle = '#274b63';
    c.fillRect(0, 0, S, S);
    const toMap = (x, z) => [half + (x - px) * scale, half + (z - pz) * scale];
    // districts
    for (const d of DISTRICTS) {
      const [x0, y0] = toMap(d.x0, d.z0);
      const [x1, y1] = toMap(d.x1, d.z1);
      c.fillStyle = '#' + d.ground.toString(16).padStart(6, '0');
      c.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    // roads
    c.strokeStyle = 'rgba(40,42,48,0.9)';
    c.lineWidth = GRID.roadHalf * 2 * scale;
    c.beginPath();
    for (const l of GRID.lines) {
      const [ax, ay] = toMap(l, -660); const [bx, by] = toMap(l, 460);
      c.moveTo(ax, ay); c.lineTo(bx, by);
      const [cx2, cy2] = toMap(-660, l); const [dx2, dy2] = toMap(660, l);
      if (l <= 450) { c.moveTo(cx2, cy2); c.lineTo(dx2, dy2); }
    }
    c.stroke();
    // the objective beacon
    if (state.marker) {
      const [mx, my] = toMap(state.marker.x, state.marker.z);
      const pulse = 7 + Math.sin(performance.now() * 0.006) * 2.5;
      c.fillStyle = '#ffc93c';
      c.beginPath(); c.arc(clamp(mx, 8, S - 8), clamp(my, 8, S - 8), pulse, 0, 7); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 2; c.stroke();
    }
    // traffic: pale dots
    c.fillStyle = 'rgba(240,240,235,0.75)';
    for (const v of state.traffic) {
      const [x, y] = toMap(v.x, v.z);
      if (x < 0 || x > S || y < 0 || y > S) continue;
      c.fillRect(x - 2, y - 2, 4, 4);
    }
    // police: flashing red/blue
    const flash = Math.sin(performance.now() * 0.014) > 0;
    for (const v of state.police) {
      const [x, y] = toMap(v.x, v.z);
      if (x < 0 || x > S || y < 0 || y > S) continue;
      c.fillStyle = flash ? '#ff4b3e' : '#4b8bff';
      c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill();
    }
    for (const o of state.officers) {
      const [x, y] = toMap(o.x, o.z);
      if (x < 0 || x > S || y < 0 || y > S) continue;
      c.fillStyle = flash ? '#ff4b3e' : '#4b8bff';
      c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill();
    }
    // hostiles
    c.fillStyle = '#ff8a3c';
    for (const h of state.hostiles) {
      if (h.dead) continue;
      const [x, y] = toMap(h.x, h.z);
      if (x < 0 || x > S || y < 0 || y > S) continue;
      c.beginPath(); c.arc(x, y, 4.5, 0, 7); c.fill();
    }
    // Rico: a white arrow that turns with him
    c.translate(half, half);
    c.rotate(Math.PI - heading); // map is north-up with z down-screen
    c.fillStyle = '#ffffff';
    c.strokeStyle = 'rgba(0,0,0,0.65)';
    c.beginPath();
    c.moveTo(0, -11); c.lineTo(7.5, 9); c.lineTo(0, 4.5); c.lineTo(-7.5, 9);
    c.closePath(); c.fill(); c.stroke();
    c.restore();
    // frame
    c.strokeStyle = 'rgba(255,255,255,0.16)';
    c.lineWidth = 3;
    c.strokeRect(1.5, 1.5, S - 3, S - 3);
    // north
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.font = 'bold 22px system-ui';
    c.fillText('N', S - 30, 28);
  }
}
