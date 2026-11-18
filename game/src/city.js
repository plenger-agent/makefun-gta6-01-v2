// city.js — Puerto Azahar itself: six districts of batched buildings, the road
// lattice, palms and lamps, the marina with its boats, the port cranes, the
// market stalls. Static geometry is merged into a handful of meshes so the
// world stays light; every solid registers an AABB the physics steps use.
import * as THREE from 'three';
import { DISTRICTS, GRID, WORLD, groundHeight, districtAt } from './config.js';
import { Rng, clamp } from './rng.js';
import {
  facadeTexture, facadeGlowTexture, asphaltTexture, pavementTexture,
  groundTexture, sandTexture, shopSignTexture, containerTexture, boatHullTexture, posterTexture,
} from './textures.js';

// ---- geometry batching ------------------------------------------------------
// Many small geometries, transformed and tinted, merged into one mesh.
export class Batch {
  constructor(withColor = true) { this.geoms = []; this.withColor = withColor; }
  add(geom, matrix, colorHex = 0xffffff) {
    const g = geom.index ? geom.toNonIndexed() : geom;
    g.applyMatrix4(matrix);
    if (this.withColor) {
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      const c = new THREE.Color(colorHex);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    this.geoms.push(g);
    return this;
  }
  box(w, h, d, x, y, z, colorHex, ry = 0) {
    const m = new THREE.Matrix4().makeRotationY(ry);
    m.setPosition(x, y, z);
    return this.add(new THREE.BoxGeometry(w, h, d), m, colorHex);
  }
  build(material, shadows = true) {
    let total = 0;
    for (const g of this.geoms) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
    const uv = new Float32Array(total * 2);
    const col = this.withColor ? new Float32Array(total * 3) : null;
    let o = 0;
    for (const g of this.geoms) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      if (col && g.attributes.color) col.set(g.attributes.color.array, o * 3);
      o += n;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = shadows; mesh.receiveShadow = true;
    return mesh;
  }
}

const M4 = (x, y, z, ry = 0, rx = 0, rz = 0) => {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
  m.setPosition(x, y, z);
  return m;
};

// Named places the missions and economy point at.
export const LOCATIONS = {
  safehouse: { x: -470, z: 60, name: 'Casa Ferrer' },
  carShop: { x: 420, z: 330, name: 'Salvatore Motors' },
  pier: { x: -40, z: 452, name: 'Muelle Uno' },
  marketPlaza: { x: 430, z: 20, name: 'Plaza del Mercado' },
  portGate: { x: 470, z: -420, name: 'Puerto Gate' },
  lighthouse: { x: -320, z: 520, name: 'Faro Azahar' },
  hotelSol: { x: -60, z: -470, name: 'Hotel Sol' },
  villaRoque: { x: -470, z: -470, name: 'Villa Roque' },
};

export class City {
  constructor(scene) {
    this.scene = scene;
    this.rng = new Rng(WORLD.seed);
    this.colliders = [];        // {x0,x1,z0,z1,y0,y1}
    this.facadeMaterials = [];  // emissive intensity driven at night
    this.neonMaterials = [];
    this.lampGlows = [];
    this.waterMats = [];
    this.boats = [];
    this.buildGround();
    this.buildRoads();
    this.buildBlocks();
    this.buildMarina();
    this.buildPortProps();
    this.buildVegetation();
    this.buildStreetFurniture();
  }

  addCollider(x0, x1, z0, z1, y0, y1) { this.colliders.push({ x0, x1, z0, z1, y0, y1 }); }

  // ---- ground, shelf, beach, sea -------------------------------------------
  buildGround() {
    const scene = this.scene;
    // The sea under everything: any gap in the land reads as water.
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(5200, 5200),
      new THREE.MeshLambertMaterial({ color: 0x1d6f8e, transparent: true, opacity: 0.94 }),
    );
    sea.rotation.x = -Math.PI / 2; sea.position.y = WORLD.seaLevel;
    sea.receiveShadow = true;
    scene.add(sea);
    this.sea = sea;

    for (const d of DISTRICTS) {
      const w = d.x1 - d.x0, dep = d.z1 - d.z0;
      const g = new THREE.Mesh(
        new THREE.PlaneGeometry(w, dep),
        new THREE.MeshLambertMaterial({ map: groundTexture(d.ground, d.x0 * 7 + d.z0) }),
      );
      g.rotation.x = -Math.PI / 2;
      g.position.set(d.x0 + w / 2, d.y - 0.02, d.z0 + dep / 2);
      g.receiveShadow = true;
      scene.add(g);
      if (d.y > 0) { // the shelf's cliff skirts
        const skirt = new THREE.Mesh(
          new THREE.BoxGeometry(w, d.y + 4, dep),
          new THREE.MeshLambertMaterial({ color: 0x9a8a72 }),
        );
        skirt.position.set(d.x0 + w / 2, d.y / 2 - 2.02, d.z0 + dep / 2);
        scene.add(skirt);
      }
    }
    // The beach: a sand apron along the whole south shore.
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(1340, 200),
      new THREE.MeshLambertMaterial({ map: sandTexture() }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, -0.35, 560);
    sand.receiveShadow = true;
    scene.add(sand);
  }

  // ---- roads -----------------------------------------------------------------
  buildRoads() {
    const asphalt = new THREE.MeshLambertMaterial({ map: asphaltTexture() });
    const roads = new Batch(false);
    const pave = new Batch(false);
    const paveMat = new THREE.MeshLambertMaterial({ map: pavementTexture(0xb8ac90) });
    const lines = GRID.lines;

    const ribbon = (x0, z0, x1, z1, w) => {
      // A road strip following the ground height in segments.
      const len = Math.hypot(x1 - x0, z1 - z0);
      const segs = Math.max(1, Math.round(len / 12));
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs, t1 = (i + 1) / segs;
        const ax = x0 + (x1 - x0) * t0, az = z0 + (z1 - z0) * t0;
        const bx = x0 + (x1 - x0) * t1, bz = z0 + (z1 - z0) * t1;
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        const y = groundHeight(mx, mz);
        const segLen = Math.hypot(bx - ax, bz - az) + 0.4;
        const ry = Math.atan2(bx - ax, bz - az);
        const m = new THREE.Matrix4().makeRotationY(ry);
        m.setPosition(mx, y + 0.04, mz);
        roads.add(new THREE.BoxGeometry(w, 0.08, segLen), m);
      }
    };

    for (const x of lines) ribbon(x, -648, x, GRID.southLimit, GRID.roadHalf * 2);
    for (const z of lines) { if (z <= GRID.southLimit) ribbon(-648, z, 648, z, GRID.roadHalf * 2); }
    // The shore road and the boardwalk run east-west along the marina.
    ribbon(-648, 458, 648, 458, 13);

    // Sidewalk frames around each block.
    for (let i = 0; i < lines.length - 1; i++) {
      for (let j = 0; j < lines.length - 1; j++) {
        const x0 = lines[i] + GRID.roadHalf, x1 = lines[i + 1] - GRID.roadHalf;
        const z0 = lines[j] + GRID.roadHalf, z1 = lines[j + 1] - GRID.roadHalf;
        if (z0 > GRID.southLimit) continue;
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        const y = groundHeight(cx, cz);
        pave.box(x1 - x0 + 3.4, 0.14, z1 - z0 + 3.4, cx, y + 0.05, cz, 0xffffff);
      }
    }
    const roadMesh = roads.build(asphalt, false);
    roadMesh.receiveShadow = true;
    this.scene.add(roadMesh);
    const paveMesh = pave.build(paveMat, false);
    paveMesh.receiveShadow = true;
    this.scene.add(paveMesh);

    // Dashed centre lines: one long thin emissive-free strip per road, drawn
    // with a repeating dash texture.
    const dashTex = (() => {
      const c = document.createElement('canvas'); c.width = 16; c.height = 128;
      const g = c.getContext('2d');
      g.clearRect(0, 0, 16, 128);
      g.fillStyle = '#e8d98a'; g.fillRect(6, 8, 4, 56);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    })();
    const dashMat = new THREE.MeshBasicMaterial({ map: dashTex, transparent: true, depthWrite: false });
    const dashBatch = new Batch(false);
    const dashStrip = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const geo = new THREE.PlaneGeometry(0.5, len);
      geo.attributes.uv.array.forEach((v, i, arr) => { if (i % 2 === 1) arr[i] = v * (len / 8); });
      const ry = Math.atan2(x1 - x0, z1 - z0);
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-Math.PI / 2, 0, ry, 'YXZ'));
      m.setPosition(mx, groundHeight(mx, mz) + 0.1, mz);
      dashBatch.add(geo, m);
    };
    for (const x of lines) dashStrip(x, -648, x, GRID.southLimit);
    for (const z of lines) if (z <= GRID.southLimit) dashStrip(-648, z, 648, z);
    const dashMesh = dashBatch.build(dashMat, false);
    dashMesh.receiveShadow = false;
    this.scene.add(dashMesh);
  }

  // ---- buildings -------------------------------------------------------------
  facadeMat(style, wallHex) {
    const key = style + ':' + wallHex;
    if (!this._facadeMats) this._facadeMats = new Map();
    if (this._facadeMats.has(key)) return this._facadeMats.get(key);
    const rng = new Rng(wallHex * 13 + style.length);
    const mat = new THREE.MeshLambertMaterial({
      map: facadeTexture(style, wallHex, rng),
      emissiveMap: facadeGlowTexture(style, wallHex, rng),
      emissive: 0xffc98a, emissiveIntensity: 0,
    });
    this._facadeMats.set(key, mat);
    this.facadeMaterials.push(mat);
    return mat;
  }

  buildBlocks() {
    const rng = this.rng;
    const lines = GRID.lines;
    const facadeBatches = new Map(); // material -> Batch (no vertex colour)
    const solid = new Batch(true);   // roofs, parapets, props in vertex colour
    const solidMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fd4e8, transparent: true, opacity: 0.55 });
    const glassBatch = new Batch(false);

    const batchFor = (mat) => {
      if (!facadeBatches.has(mat)) facadeBatches.set(mat, new Batch(false));
      return facadeBatches.get(mat);
    };

    const reserved = [
      { point: LOCATIONS.safehouse, build: (cx, cz, d) => this.buildSafehouse(cx, cz, solid, batchFor) },
      { point: LOCATIONS.carShop, build: (cx, cz, d) => this.buildCarShop(cx, cz, solid, batchFor, glassBatch) },
      { point: LOCATIONS.villaRoque, build: (cx, cz, d) => this.buildVillaRoque(cx, cz, solid, batchFor) },
      { point: LOCATIONS.hotelSol, build: (cx, cz, d) => this.buildHotelSol(cx, cz, solid, batchFor) },
    ];
    this.parkingSpots = [];

    for (let i = 0; i < lines.length - 1; i++) {
      for (let j = 0; j < lines.length - 1; j++) {
        const x0 = lines[i] + GRID.roadHalf + 2, x1 = lines[i + 1] - GRID.roadHalf - 2;
        const z0 = lines[j] + GRID.roadHalf + 2, z1 = lines[j + 1] - GRID.roadHalf - 2;
        if (z0 > GRID.southLimit + 20) continue;
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        const d = districtAt(cx, cz);
        const y = groundHeight(cx, cz);
        const special = reserved.find(r => cx >= x0 - 40 && r.point.x >= x0 && r.point.x <= x1 && r.point.z >= z0 && r.point.z <= z1);
        if (special) { special.build(cx, cz, d); continue; }
        if (!rng.chance(d.density)) { // open lot: parking or plaza
          if (d.id === 'market') this.buildStalls(cx, cz, y, solid);
          else this.parkingSpots.push({ x: cx, z: cz, y, ry: rng.pick([0, Math.PI / 2]) });
          continue;
        }
        const wall = rng.pick(d.wall);
        const mat = this.facadeMat(d.style, wall);
        const batch = batchFor(mat);
        const roof = rng.pick(d.roof);
        const bw = x1 - x0, bd = z1 - z0;

        const put = (w, h, dep, px, pz, ry = 0) => {
          const m = M4(px, y + h / 2, pz, ry);
          batch.add(new THREE.BoxGeometry(w, h, dep), m);
          solid.box(w + 1.2, 0.7, dep + 1.2, px, y + h + 0.3, pz, roof, ry);
          this.addCollider(px - w / 2, px + w / 2, pz - dep / 2, pz + dep / 2, y, y + h);
          return h;
        };

        if (d.style === 'tower') {
          const w = rng.float(30, 46), dep = rng.float(30, 46);
          const h = rng.float(d.minH, d.maxH);
          put(w, h, dep, cx, cz);
          if (rng.chance(0.6)) put(w * 0.62, h * rng.float(0.18, 0.3), dep * 0.62, cx, cz); // stepped crown — sits on ground visually merged
          solid.box(4, 2.2, 4, cx + rng.float(-8, 8), y + h + 1.4, cz + rng.float(-8, 8), 0x8a8f96); // roof plant
          if (rng.chance(0.55)) this.addSign(cx, cz, y, h, w, dep, rng);
        } else if (d.style === 'warehouse') {
          put(rng.float(44, 56), rng.float(d.minH, d.maxH), rng.float(24, 34), cx, cz);
          solid.box(3, 5, 3, cx - 14, y + 2.5, cz + 14, 0x707a72); // dock block
        } else if (d.style === 'villa') {
          const w = rng.float(15, 22), dep = rng.float(12, 18), h = rng.float(5.5, 8);
          put(w, h, dep, cx, cz);
          // gable roof: a three-sided prism laid across the house
          const prism = new THREE.CylinderGeometry(w * 0.36, w * 0.36, dep + 1.5, 3, 1);
          const pm = M4(cx, y + h + w * 0.16, cz, 0, 0, Math.PI / 2);
          pm.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
          solid.add(prism, pm, rng.pick(d.roof));
          if (rng.chance(0.5)) { // a turquoise pool in the garden
            solid.box(9, 0.5, 5, cx + rng.float(-14, 14), y + 0.26, cz + rng.float(12, 16), 0x2fb9d8);
          }
        } else if (d.style === 'marina') {
          const n = rng.int(1, 2);
          for (let k = 0; k < n; k++) {
            const px = cx + (k - (n - 1) / 2) * (bw / n) * 0.8;
            put(rng.float(16, 24), rng.float(d.minH, d.maxH), rng.float(14, 20), px, cz);
          }
          if (rng.chance(0.4)) this.addSign(cx, cz, y, 10, 20, 16, rng);
        } else { // colonial & market: attached rows of two or three
          const n = rng.int(2, 3);
          for (let k = 0; k < n; k++) {
            const px = x0 + (k + 0.5) * (bw / n);
            put(bw / n - rng.float(1, 4), rng.float(d.minH, d.maxH), rng.float(20, 34), px, cz);
          }
          if (rng.chance(0.3)) this.addSign(cx, cz, y, 12, 22, 18, rng);
        }
      }
    }

    for (const [mat, batch] of facadeBatches) {
      const mesh = batch.build(mat);
      this.scene.add(mesh);
    }
    this.scene.add(solid.build(solidMat));
    const glassMesh = glassBatch.build(glassMat, false);
    this.scene.add(glassMesh);
  }

  addSign(x, z, y, topY, w, dep, rng) {
    const tex = shopSignTexture(rng);
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    this.neonMaterials.push(mat);
    const face = rng.int(0, 3);
    const sw = Math.min(26, w * 0.9), sh = sw / 4;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), mat);
    const off = (face < 2 ? dep : w) / 2 + 0.4;
    if (face === 0) { plane.position.set(x, y + topY - sh, z + off); }
    else if (face === 1) { plane.position.set(x, y + topY - sh, z - off); plane.rotation.y = Math.PI; }
    else if (face === 2) { plane.position.set(x + off, y + topY - sh, z); plane.rotation.y = Math.PI / 2; }
    else { plane.position.set(x - off, y + topY - sh, z); plane.rotation.y = -Math.PI / 2; }
    this.scene.add(plane);
  }

  buildSafehouse(cx, cz, solid, batchFor) {
    const y = groundHeight(cx, cz);
    const d = districtAt(cx, cz);
    const mat = this.facadeMat('colonial', 0xeed9a8);
    const batch = batchFor(mat);
    const m = M4(cx - 6, y + 4, cz, 0);
    batch.add(new THREE.BoxGeometry(20, 8, 15), m);
    solid.box(21.4, 0.7, 16.4, cx - 6, y + 8.3, cz, 0xb45a35);
    this.addCollider(cx - 16, cx + 4, cz - 7.5, cz + 7.5, y, y + 8);
    // the garage Rico actually uses
    solid.box(10, 4.4, 9, cx + 12, y + 2.2, cz, 0x8a8f96);
    solid.box(10.6, 0.5, 9.6, cx + 12, y + 4.6, cz, 0x5d666e);
    this.addCollider(cx + 7, cx + 17, cz - 4.5, cz + 4.5, y, y + 4.4);
    const tex = shopSignTexture(new Rng(5));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(13, 3.2),
      new THREE.MeshBasicMaterial({ map: tex }));
    sign.position.set(cx - 6, y + 9.6, cz + 8.4);
    this.scene.add(sign);
    this.neonMaterials.push(sign.material);
  }

  buildCarShop(cx, cz, solid, batchFor, glassBatch) {
    const y = groundHeight(cx, cz);
    const mat = this.facadeMat('marina', 0xf0e9da);
    const batch = batchFor(mat);
    const m = M4(cx, y + 3.6, cz - 16);
    batch.add(new THREE.BoxGeometry(46, 7.2, 16), m);
    solid.box(47.4, 0.7, 17.4, cx, y + 7.5, cz - 16, 0x3c4250);
    this.addCollider(cx - 23, cx + 23, cz - 24, cz - 8, y, y + 7.2);
    // glass showroom front
    const gm = M4(cx, y + 2.6, cz - 7.6);
    glassBatch.add(new THREE.BoxGeometry(40, 5.2, 0.4), gm);
    // forecourt pads where the stock sits
    solid.box(56, 0.16, 30, cx, y + 0.06, cz + 12, 0x3a3b44);
    this.shopPads = [];
    for (let i = 0; i < 5; i++) this.shopPads.push({ x: cx - 22 + i * 11, z: cz + 12, y, ry: 0.3 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(30, 7.4),
      new THREE.MeshBasicMaterial({ map: shopSignTexture(new Rng(9)) }));
    sign.position.set(cx, y + 10.5, cz - 14);
    this.scene.add(sign);
    this.neonMaterials.push(sign.material);
  }

  buildVillaRoque(cx, cz, solid, batchFor) {
    const y = groundHeight(cx, cz);
    const mat = this.facadeMat('villa', 0xf5efe0);
    const batch = batchFor(mat);
    const m = M4(cx, y + 5.5, cz - 6);
    batch.add(new THREE.BoxGeometry(30, 11, 20), m);
    solid.box(31.4, 0.8, 21.4, cx, y + 11.4, cz - 6, 0xdcc7a8);
    this.addCollider(cx - 15, cx + 15, cz - 16, cz + 4, y, y + 11);
    solid.box(14, 0.5, 7, cx + 4, y + 0.26, cz + 14, 0x2fb9d8); // the famous pool
    solid.box(34, 2.6, 1, cx, y + 1.3, cz + 22, 0xcfc4a5);      // garden wall
    this.addCollider(cx - 17, cx + 17, cz + 21.5, cz + 22.5, y, y + 2.6);
  }

  buildHotelSol(cx, cz, solid, batchFor) {
    const y = groundHeight(cx, cz);
    const mat = this.facadeMat('tower', 0xd0c4b2);
    const batch = batchFor(mat);
    const m = M4(cx, y + 26, cz);
    batch.add(new THREE.BoxGeometry(38, 52, 38), m);
    solid.box(39.4, 0.8, 39.4, cx, y + 52.4, cz, 0x3c4250);
    this.addCollider(cx - 19, cx + 19, cz - 19, cz + 19, y, y + 52);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(30, 7.4),
      new THREE.MeshBasicMaterial({ map: shopSignTexture(new Rng(3)) }));
    sign.position.set(cx, y + 46, cz + 19.6);
    this.scene.add(sign);
    this.neonMaterials.push(sign.material);
  }

  // ---- market stalls (called from buildBlocks for open market lots) ---------
  buildStalls(cx, cz, y, solid) {
    const rng = new Rng(cx * 3 + cz * 7);
    const awningCols = [0xc33f2e, 0xe8b04b, 0x39d5e8, 0x8be26a, 0xff7a4d];
    const n = rng.int(4, 7);
    for (let i = 0; i < n; i++) {
      const px = cx + rng.float(-22, 22), pz = cz + rng.float(-22, 22);
      const ry = rng.float(Math.PI);
      const col = rng.pick(awningCols);
      solid.box(5.4, 1.1, 2.6, px, y + 0.55, pz, 0x8a6a42, ry);            // counter
      solid.box(5.8, 0.18, 3.4, px, y + 2.6, pz, col, ry);                 // awning
      for (const [ox, oz] of [[-2.5, -1.4], [2.5, -1.4], [-2.5, 1.4], [2.5, 1.4]]) {
        const wx = px + ox * Math.cos(ry) - oz * Math.sin(ry);
        const wz = pz + ox * Math.sin(ry) + oz * Math.cos(ry);
        solid.box(0.18, 2.6, 0.18, wx, y + 1.3, wz, 0x6a5136);
      }
      // crates of produce on the counter
      solid.box(0.8, 0.5, 0.8, px + rng.float(-1.6, 1.6), y + 1.35, pz, rng.pick([0xe86a2e, 0x8be26a, 0xd8452e]));
      this.addCollider(px - 2.7, px + 2.7, pz - 1.7, pz + 1.7, y, y + 2.6);
    }
  }

  // ---- the marina: boardwalk, piers, boats, the lighthouse -------------------
  buildMarina() {
    const rng = new Rng(2024);
    const solid = new Batch(true);
    const solidMat = new THREE.MeshLambertMaterial({ vertexColors: true });

    // Boardwalk along the shore road.
    solid.box(1296, 0.5, 10, 0, 0.1, 466, 0x9a744c);
    // Three piers reaching into the bay.
    for (const px of [-160, -40, 120]) {
      solid.box(7, 0.5, 64, px, 0.05, 500, 0x8a6a42);
      for (let i = 0; i < 5; i++) {
        solid.box(0.6, 2.4, 0.6, px - 3, -1, 476 + i * 14, 0x6a5136);
        solid.box(0.6, 2.4, 0.6, px + 3, -1, 476 + i * 14, 0x6a5136);
      }
    }
    this.scene.add(solid.build(solidMat));

    // Boats: low-poly hulls with cabins and masts, moored off the piers.
    const hullCols = [0xe8e4da, 0xd8452e, 0x2e6ad8, 0xf2b13c, 0x3fae6a, 0xe8e4da, 0x39b8c9];
    for (let i = 0; i < 16; i++) {
      const boat = new THREE.Group();
      const col = hullCols[i % hullCols.length];
      const len = rng.float(6, 11), wid = len * 0.32;
      const hullMat = new THREE.MeshLambertMaterial({ map: boatHullTexture(col) });
      const hull = new THREE.Mesh(new THREE.BoxGeometry(wid, 1.4, len), hullMat);
      hull.position.y = 0.4; hull.castShadow = true;
      boat.add(hull);
      const bow = new THREE.Mesh(new THREE.CylinderGeometry(0.01, wid * 0.5, 1.4, 4, 1), hullMat);
      bow.rotation.y = Math.PI / 4;
      bow.scale.set(1, 1, 1.6);
      bow.position.set(0, 0.4, -len / 2 - wid * 0.4);
      boat.add(bow);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.62, 1.1, len * 0.34),
        new THREE.MeshLambertMaterial({ color: 0xf5efe0 }));
      cabin.position.set(0, 1.5, len * 0.08);
      boat.add(cabin);
      if (rng.chance(0.55)) { // sailboat rig
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 7.5, 5),
          new THREE.MeshLambertMaterial({ color: 0xcac2b2 }));
        mast.position.set(0, 4.6, -len * 0.1);
        boat.add(mast);
        const sailGeo = new THREE.BufferGeometry();
        sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([
          0, 1.2, -len * 0.1, 0, 8.1, -len * 0.1, 0, 1.2, len * 0.32,
        ], 3));
        sailGeo.setIndex([0, 1, 2]);
        sailGeo.computeVertexNormals();
        const sail = new THREE.Mesh(sailGeo, new THREE.MeshLambertMaterial({ color: 0xf8f2e2, side: THREE.DoubleSide }));
        boat.add(sail);
      }
      const pierX = [-160, -40, 120][i % 3];
      boat.position.set(pierX + rng.float(-16, 16), WORLD.seaLevel + 0.55, 492 + rng.float(0, 52));
      boat.rotation.y = rng.float(-0.4, 0.4) + (i % 2 ? 0 : Math.PI);
      this.scene.add(boat);
      this.boats.push({ g: boat, baseY: boat.position.y, phase: rng.float(6.28), amp: rng.float(0.08, 0.2) });
    }

    // Buoys marking the channel.
    const buoyBatch = new Batch(true);
    for (let i = 0; i < 8; i++) {
      const bx = -260 + i * 74, bz = 560 + (i % 2) * 26;
      buoyBatch.add(new THREE.CylinderGeometry(0.7, 0.9, 1.6, 7), M4(bx, WORLD.seaLevel + 0.6, bz), i % 2 ? 0xd8452e : 0xf5efe0);
    }
    this.scene.add(buoyBatch.build(solidMat));

    // Faro Azahar: the lighthouse on its breakwater, west of the marina.
    const lh = new THREE.Group();
    const rock = new THREE.Mesh(new THREE.CylinderGeometry(16, 20, 3, 9), new THREE.MeshLambertMaterial({ color: 0x7a7268 }));
    rock.position.y = -0.6; lh.add(rock);
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(3.4 - i * 0.28, 3.7 - i * 0.28, 4.4, 10),
        new THREE.MeshLambertMaterial({ color: i % 2 ? 0xd8452e : 0xf5efe0 }));
      seg.position.y = 3.4 + i * 4.4;
      seg.castShadow = true;
      lh.add(seg);
    }
    const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 2.6, 8),
      new THREE.MeshLambertMaterial({ color: 0x22242a }));
    lampRoom.position.y = 26.6; lh.add(lampRoom);
    this.lighthouseLamp = new THREE.Mesh(new THREE.SphereGeometry(1.3, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    this.lighthouseLamp.position.y = 26.6;
    lh.add(this.lighthouseLamp);
    this.lighthouseBeam = new THREE.Mesh(
      new THREE.ConeGeometry(9, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.lighthouseBeam.rotation.z = Math.PI / 2;
    this.lighthouseBeam.position.y = 26.6;
    lh.add(this.lighthouseBeam);
    lh.position.set(LOCATIONS.lighthouse.x, 0, LOCATIONS.lighthouse.z);
    this.scene.add(lh);
    this.lighthouse = lh;
    this.addCollider(LOCATIONS.lighthouse.x - 4, LOCATIONS.lighthouse.x + 4, LOCATIONS.lighthouse.z - 4, LOCATIONS.lighthouse.z + 4, 0, 26);
  }

  // ---- the port: cranes and container yards -----------------------------------
  buildPortProps() {
    const rng = new Rng(555);
    const solid = new Batch(true);
    const solidMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    // Container yards on three reserved aprons.
    const yards = [[566, -560], [566, -350], [392, -566], [566, -140]];
    const contMats = new Map();
    const contBatches = new Map();
    const contCols = [0xc24a32, 0x2e6ad8, 0x3fae6a, 0xd88f2e, 0x707a8c];
    for (const col of contCols) {
      const mat = new THREE.MeshLambertMaterial({ map: containerTexture(col, new Rng(col)) });
      contMats.set(col, mat); contBatches.set(col, new Batch(false));
    }
    for (const [yx, yz] of yards) {
      const stacks = rng.int(6, 10);
      for (let i = 0; i < stacks; i++) {
        const px = yx + rng.float(-52, 52), pz = yz + rng.float(-30, 30);
        const ry = rng.pick([0, Math.PI / 2]);
        const levels = rng.int(1, 3);
        const col = rng.pick(contCols);
        for (let l = 0; l < levels; l++) {
          const m = M4(px, 1.3 + l * 2.6, pz, ry);
          contBatches.get(col).add(new THREE.BoxGeometry(12, 2.6, 5), m);
        }
        this.addCollider(px - 6, px + 6, pz - 6, pz + 6, 0, levels * 2.6);
      }
    }
    for (const col of contCols) this.scene.add(contBatches.get(col).build(contMats.get(col)));
    // Gantry cranes over the yards.
    for (const [cx, cz] of [[566, -470], [480, -566], [566, -250]]) {
      solid.box(2.4, 26, 2.4, cx - 14, 13, cz, 0xd88f2e);
      solid.box(2.4, 26, 2.4, cx + 14, 13, cz, 0xd88f2e);
      solid.box(36, 2.4, 3, cx, 26.5, cz, 0xd88f2e);
      solid.box(0.3, 12, 0.3, cx + rng.float(-8, 8), 19, cz, 0x333333);
      solid.box(3, 2.4, 3, cx, 12.4, cz, 0x707a8c);
      this.addCollider(cx - 15, cx - 12.5, cz - 1.5, cz + 1.5, 0, 26);
      this.addCollider(cx + 12.5, cx + 15, cz - 1.5, cz + 1.5, 0, 26);
    }
    this.scene.add(solid.build(solidMat));
  }

  // ---- palms, trees, lamps, clutter --------------------------------------------
  buildVegetation() {
    const rng = new Rng(808);
    const batch = new Batch(true);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 5.4, 5);
    trunkGeo.translate(0, 2.7, 0);
    const frondGeo = new THREE.PlaneGeometry(3.4, 0.7);
    frondGeo.translate(1.5, 0, 0);
    const blobGeo = new THREE.IcosahedronGeometry(2.1, 1);

    const palm = (x, z) => {
      const y = groundHeight(x, z);
      const lean = rng.float(0.06, 0.2), la = rng.float(Math.PI * 2);
      const topX = x + Math.cos(la) * lean * 5, topZ = z + Math.sin(la) * lean * 5;
      batch.add(trunkGeo, M4(x, y, z, 0, Math.sin(la) * lean, Math.cos(la) * lean), 0x8a6a42);
      const fronds = rng.int(5, 7);
      for (let i = 0; i < fronds; i++) {
        const a = (i / fronds) * Math.PI * 2 + rng.float(0.4);
        batch.add(frondGeo, M4(topX, y + 5.3, topZ, -a, 0, -0.5 - rng.float(0.3)), 0x3f8f4f);
      }
    };
    const tree = (x, z) => {
      const y = groundHeight(x, z);
      batch.add(trunkGeo, M4(x, y, z), 0x6a5136);
      batch.add(blobGeo, M4(x, y + 6.4, z), 0x4d9448);
      batch.add(blobGeo, M4(x + 1.2, y + 5.4, z + 0.6), 0x439040);
    };
    // Shore palms along the boardwalk.
    for (let x = -620; x <= 620; x += 26) { if (rng.chance(0.8)) palm(x + rng.float(-4, 4), 446 + rng.float(-3, 3)); }
    // District scatter on block corners.
    for (let i = 0; i < 260; i++) {
      const x = rng.float(-640, 640), z = rng.float(-640, 440);
      if (this.onRoad(x, z, 4)) continue;
      const d = districtAt(x, z);
      if (rng.chance(d.palms)) palm(x, z); else if (rng.chance(0.4)) tree(x, z);
    }
    const mesh = batch.build(mat);
    this.scene.add(mesh);
  }

  onRoad(x, z, pad = 0) {
    for (const l of GRID.lines) {
      if (Math.abs(x - l) < GRID.roadHalf + pad && z < GRID.southLimit + 10) return true;
      if (Math.abs(z - l) < GRID.roadHalf + pad && z < GRID.southLimit + 10) return true;
    }
    return Math.abs(z - 458) < 9;
  }

  buildStreetFurniture() {
    const rng = new Rng(909);
    const batch = new Batch(true);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.6, 5);
    poleGeo.translate(0, 2.8, 0);

    // Lamp posts down both sides of the lattice, staggered.
    this.lampHeadMat = new THREE.MeshBasicMaterial({ color: 0x554e33 });
    const headBatch = new Batch(false);
    const poolBatch = new Batch(false);
    const poolGeo = new THREE.PlaneGeometry(21, 21);
    poolGeo.rotateX(-Math.PI / 2);
    const glowTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
      grad.addColorStop(0, 'rgba(255,214,140,0.9)');
      grad.addColorStop(1, 'rgba(255,214,140,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    const placeLamp = (x, z) => {
      const y = groundHeight(x, z);
      batch.add(poleGeo, M4(x, y, z), 0x3a3f46);
      headBatch.box(0.9, 0.22, 0.5, x, y + 5.6, z, 0xffffff);
      // A pool of lamplight on the street below: one merged additive disc
      // per lamp, all sharing a material whose opacity the night drives.
      // It floats a hand's breadth over the ground so the sidewalk slabs
      // (whose tops sit proud of the road) never swallow it.
      poolBatch.add(poolGeo, M4(x, y + 0.22, z), 0xffffff);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      spr.scale.set(7, 7, 1);
      spr.position.set(x, y + 5.6, z);
      this.scene.add(spr);
      this.lampGlows.push(spr);
    };
    for (const l of GRID.lines) {
      for (let s = -620; s <= 620; s += 62) {
        if (s + 30 < GRID.southLimit) placeLamp(l + GRID.roadHalf + 1.6, s + 30);
        if (l + 30 <= 640) placeLamp(s, l + GRID.roadHalf + 1.6);
      }
    }
    const headMesh = headBatch.build(this.lampHeadMat, false);
    this.scene.add(headMesh);
    this.lampPoolMat = new THREE.MeshBasicMaterial({
      map: glowTex, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, vertexColors: true,
    });
    const poolMesh = poolBatch.build(this.lampPoolMat, false);
    poolMesh.renderOrder = 2;
    this.scene.add(poolMesh);

    // Clutter: dumpsters, crates, barrels, benches, hydrants.
    for (let i = 0; i < 190; i++) {
      const x = rng.float(-640, 640), z = rng.float(-640, 450);
      if (this.onRoad(x, z, 2)) continue;
      const y = groundHeight(x, z);
      const kind = rng.int(0, 4);
      if (kind === 0) { batch.box(2.2, 1.3, 1.2, x, y + 0.65, z, 0x3f6a4f, rng.float(3)); this.addCollider(x - 1.1, x + 1.1, z - 0.6, z + 0.6, y, y + 1.3); }
      else if (kind === 1) batch.box(0.9, 0.9, 0.9, x, y + 0.45, z, 0x9a744c, rng.float(3));
      else if (kind === 2) batch.add(new THREE.CylinderGeometry(0.36, 0.36, 0.95, 8), M4(x, y + 0.48, z), rng.pick([0xc24a32, 0x2e6ad8, 0x707a8c]));
      else if (kind === 3) batch.box(1.9, 0.5, 0.55, x, y + 0.5, z, 0x7a5c38, rng.float(3));
      else batch.add(new THREE.CylinderGeometry(0.16, 0.2, 0.7, 6), M4(x, y + 0.35, z), 0xd8452e);
    }
    // Poster boards in the old town and market.
    for (let i = 0; i < 26; i++) {
      const x = rng.float(-620, 620), z = rng.float(-620, 440);
      if (this.onRoad(x, z, 3)) continue;
      const y = groundHeight(x, z);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.1),
        new THREE.MeshLambertMaterial({ map: posterTexture(rng) }));
      p.position.set(x, y + 1.5, z);
      p.rotation.y = rng.float(Math.PI * 2);
      this.scene.add(p);
      batch.box(0.16, 3, 0.16, x, y + 1.5, z, 0x4a4038);
    }
    this.scene.add(batch.build(mat));
  }

  // ---- per-frame life ---------------------------------------------------------
  update(dt, sky, elapsed) {
    const darkness = 1 - sky.daylight;
    for (const m of this.facadeMaterials) m.emissiveIntensity = darkness * 0.85;
    const pulse = 0.82 + 0.18 * Math.sin(elapsed * 2.4);
    for (const m of this.neonMaterials) m.color.setScalar(0.35 + darkness * 0.65 * pulse + 0.3);
    if (this.lampHeadMat) this.lampHeadMat.color.setHex(darkness > 0.35 ? 0xffd98a : 0x554e33);
    for (const s of this.lampGlows) s.material.opacity = darkness * 0.5;
    if (this.lampPoolMat) this.lampPoolMat.opacity = darkness * 0.45;
    for (const b of this.boats) {
      b.g.position.y = b.baseY + Math.sin(elapsed * 0.9 + b.phase) * b.amp;
      b.g.rotation.z = Math.sin(elapsed * 0.7 + b.phase) * 0.03;
      b.g.rotation.x = Math.cos(elapsed * 0.55 + b.phase) * 0.02;
    }
    if (this.lighthouseBeam) {
      this.lighthouseBeam.material.opacity = darkness * 0.16;
      this.lighthouse.rotation.y = elapsed * 0.4;
      this.lighthouseLamp.material.color.setHex(darkness > 0.3 ? 0xffe9a8 : 0x9a9478);
    }
    if (this.sea) {
      this.sea.material.color.setHex(sky.daylight > 0.4 ? 0x1d6f8e : 0x0e2c44);
    }
  }
}
