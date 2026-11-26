/*
  SENJA EXPRESS: Island Courier Run — game/js/terrain.js
  =======================================================
  Dunia Kepulauan Senja: 8 pulau low-poly prosedural di golden hour.
  File ini membangun SEMUA yang terlihat dari jendela pesawat kecuali
  pesawatnya sendiri: laut, langit senja, matahari, awan, kabut, dan
  kedelapan pulau beserta isinya.

  Kedelapan pulau (masing-masing berkarakter, bukan ladang generik):
  1. Kutilang Field (pusat-selatan) — pulau induk: kota kecil + runway
     utama tempat Raka lepas landas. 2. Banda (timur) — airstrip kedua
     di tepi laguna biru. 3. Rote (barat) — airstrip ketiga di dataran
     rumput. 4. Merapi Kecil (utara) — pulau vulkano dengan kerucut dan
     asap tipis. 5. Laguna Biru (tenggara) — cincin karang + air dangkal
     kehijauan. 6. Sawah Terasering (barat daya) — undakan hijau
     bertingkat. 7. Pulau Batu (timur laut) — tebing batu abu-abu.
     8. Pulau Senja (selatan) — bukit landai tempat matahari terbenam.

  Keputusan teknis:
  - Semua geometri dari primitif Three.js (cone, cylinder, box, sphere,
    torus, plane) dengan material MeshLambertMaterial flat — murah di
    GPU, gaya low-poly hangat, dan nol tekstur eksternal. Tekstur laut
    dibuat prosedural lewat canvas di kode (noise halus), bukan file.
  - groundHeight(x, z) adalah "kebenaran" fisika: model terbang dan misi
    bertanya ke fungsi ini, bukan ke mesh. Pulau dimodelkan sebagai
    cakram bertingkat: di dalam radius inti = tanah tinggi, di cincin
    pantai = rendah, di luar = laut (0). Runway adalah persegi yang
    terdaftar eksplisit dengan ketinggian dan arahnya.
  - Golden hour: matahari bola oranye besar rendah di barat, cahaya
    directional hangat (oranye keemasan), ambient ungu-biru, fog
    ungu-jingga supaya pulau jauh memudar seperti senja sungguhan.
  - Langit adalah bola besar bermaterial gradient prosedural (canvas
    vertikal: jingga di horizon -> ungu -> biru gelap di atas), dibalik
    (BackSide) supaya kamera selalu di dalamnya.
  - Awan: gumpalan sphere putih-merah muda yang melayang pelan; posisi
    awal dari PRNG seed agar deterministik (seed=1 sama setiap run).
  - Runway: strip abu-abu gelap + garis tengah putih + lampu oranye
    kecil di tepi, supaya terlihat dari udara sebagai target pendaratan.
*/
import * as THREE from 'three';
import { mulberry32 } from './flight-model.js';

export const SEA_LEVEL = 0;

/** Nama + posisi + karakter tiap pulau. Koordinat meter, pusat peta (0,0). */
export const ISLANDS = [
  { name: 'Kutilang Field', x: 0, z: 900, r: 420, h: 8, kind: 'home' },
  { name: 'Banda', x: 1150, z: 350, r: 380, h: 10, kind: 'lagoon' },
  { name: 'Rote', x: -1150, z: 250, r: 360, h: 9, kind: 'grass' },
  { name: 'Merapi Kecil', x: -250, z: -1050, r: 400, h: 120, kind: 'volcano' },
  { name: 'Laguna Biru', x: 1250, z: -750, r: 330, h: 6, kind: 'lagoon' },
  { name: 'Sawah Terasering', x: -1250, z: -750, r: 340, h: 26, kind: 'terraces' },
  { name: 'Pulau Batu', x: 650, z: -1250, r: 300, h: 55, kind: 'rock' },
  { name: 'Pulau Senja', x: -450, z: 1350, r: 320, h: 30, kind: 'hill' },
];

/** Tiga airstrip misi ISLAND HOP: nama, posisi, arah runway, panjang. */
export const RUNWAYS = [
  { name: 'Kutilang Field', x: 0, z: 900, heading: 0, length: 420, width: 26, h: 8 },
  { name: 'Banda', x: 1150, z: 350, heading: 90, length: 360, width: 24, h: 10 },
  { name: 'Rote', x: -1150, z: 250, heading: 45, length: 360, width: 24, h: 9 },
];

/** Tiga desa misi MEDIC DROP: posisi + radius zona jatuh yang sah. */
export const VILLAGES = [
  { name: 'Desa Banda', x: 1000, z: 520, r: 60 },
  { name: 'Desa Rote', x: -1000, z: 420, r: 60 },
  { name: 'Desa Senja', x: -450, z: 1250, r: 60 },
];

/**
 * Ketinggian tanah di (x, z). Laut = 0. Di dalam pulau naik mengikuti
 * profil: datar di inti, menurun ke pantai. Vulkano menjulang kerucut.
 */
export function groundHeightAt(x, z) {
  let h = SEA_LEVEL;
  for (const isl of ISLANDS) {
    const d = Math.hypot(x - isl.x, z - isl.z);
    if (d >= isl.r) continue;
    const t = 1 - d / isl.r; // 0 di pantai, 1 di pusat
    let local;
    if (isl.kind === 'volcano') local = isl.h * Math.pow(t, 1.6);
    else if (isl.kind === 'rock') local = isl.h * Math.pow(t, 1.2);
    else local = isl.h * (0.35 + 0.65 * t * t);
    h = Math.max(h, local);
  }
  return h;
}

/** Apakah (x, z) berada di atas strip runway bernama `name`? */
export function onRunway(x, z, name) {
  const rw = RUNWAYS.find((r) => r.name === name);
  if (!rw) return false;
  const rad = (rw.heading * Math.PI) / 180;
  const dx = x - rw.x, dz = z - rw.z;
  const along = dx * Math.sin(rad) + dz * -Math.cos(rad);
  const across = dx * Math.cos(rad) + dz * Math.sin(rad);
  return Math.abs(along) <= rw.length / 2 && Math.abs(across) <= rw.width / 2;
}

/** Runway mana pun yang sedang di bawah pesawat (atau null). */
export function runwayUnder(x, z) {
  for (const rw of RUNWAYS) if (onRunway(x, z, rw.name)) return rw;
  return null;
}

function makeSeaTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, '#1d6f8e');
  grad.addColorStop(0.5, '#1a5f83');
  grad.addColorStop(1, '#2a7f9e');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 256);
  const rng = mulberry32(7);
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  for (let i = 0; i < 60; i++) {
    ctx.beginPath();
    const x = rng() * 256, y = rng() * 256;
    ctx.moveTo(x, y); ctx.lineTo(x + 20 + rng() * 40, y + (rng() - 0.5) * 8);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  return tex;
}

function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 512;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#1b1440'); // zenith: biru gelap
  grad.addColorStop(0.45, '#5b2a6e'); // ungu
  grad.addColorStop(0.72, '#c65a3c'); // jingga senja
  grad.addColorStop(0.88, '#ff9a3c'); // emas horizon
  grad.addColorStop(1.0, '#ffb347');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 4, 512);
  return new THREE.CanvasTexture(c);
}

function lambert(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });
}

function buildIsland(isl, scene) {
  const g = new THREE.Group();
  g.position.set(isl.x, 0, isl.z);
  const sand = lambert(0xe8d29a);
  const grass = lambert(0x5da24a);
  const rock = lambert(0x8a7f78);

  // Pantai: cakram pasir rendah; daratan: kerucut terpancung hijau.
  const beach = new THREE.Mesh(new THREE.CylinderGeometry(isl.r, isl.r * 1.08, 3, 24), sand);
  beach.position.y = 1;
  g.add(beach);
  const land = new THREE.Mesh(new THREE.CylinderGeometry(isl.r * 0.72, isl.r * 0.98, isl.h, 24), grass);
  land.position.y = isl.h / 2 + 1;
  g.add(land);

  if (isl.kind === 'volcano') {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(isl.r * 0.45, isl.h * 1.5, 20), lambert(0x6e4a3a));
    cone.position.y = isl.h * 0.9;
    g.add(cone);
    const crater = new THREE.Mesh(new THREE.CylinderGeometry(isl.r * 0.12, isl.r * 0.16, 10, 12), lambert(0x2a1a12));
    crater.position.y = isl.h * 1.62;
    g.add(crater);
    // Asap tipis: tiga bola abu-abu transparan.
    for (let i = 0; i < 3; i++) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(16 + i * 6, 8, 8),
        new THREE.MeshLambertMaterial({ color: 0xd8cfc8, transparent: true, opacity: 0.55 }),
      );
      puff.position.set(i * 8 - 8, isl.h * 1.75 + i * 14, 0);
      g.add(puff);
    }
  }
  if (isl.kind === 'lagoon') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(isl.r * 0.62, 14, 8, 28), sand);
    ring.rotation.x = Math.PI / 2; ring.position.y = 2;
    g.add(ring);
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(isl.r * 0.55, 24),
      lambert(0x3fd2c0, { transparent: true, opacity: 0.9 }),
    );
    pool.rotation.x = -Math.PI / 2; pool.position.y = 2.4;
    g.add(pool);
  }
  if (isl.kind === 'terraces') {
    for (let i = 0; i < 4; i++) {
      const step = new THREE.Mesh(
        new THREE.CylinderGeometry(isl.r * (0.62 - i * 0.12), isl.r * (0.68 - i * 0.12), 5, 20),
        lambert(i % 2 ? 0x6fbf4a : 0x4f9e3e),
      );
      step.position.y = 5 + i * 5;
      g.add(step);
    }
  }
  if (isl.kind === 'rock') {
    for (let i = 0; i < 5; i++) {
      const crag = new THREE.Mesh(new THREE.ConeGeometry(28 + i * 6, 50 + i * 12, 6), rock);
      crag.position.set((i - 2) * 55, 40 + i * 4, (i % 2 ? 40 : -40));
      g.add(crag);
    }
  }
  if (isl.kind === 'home') {
    // Kota kecil: deretan kotak atap oranye di sekitar runway.
    const rng = mulberry32(11);
    for (let i = 0; i < 22; i++) {
      const w = 14 + rng() * 14, hgt = 10 + rng() * 16, d = 14 + rng() * 14;
      const house = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), lambert(0xf2e6c8));
      const a = rng() * Math.PI * 2, rr = 150 + rng() * 180;
      house.position.set(Math.cos(a) * rr, isl.h + hgt / 2, Math.sin(a) * rr - 60);
      g.add(house);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.75, 8, 4), lambert(0xd96a2a));
      roof.position.set(house.position.x, isl.h + hgt + 4, house.position.z);
      roof.rotation.y = Math.PI / 4;
      g.add(roof);
    }
  }
  if (isl.kind === 'hill') {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(isl.r * 0.55, 16, 12), lambert(0x7fae56));
    hill.scale.y = 0.35; hill.position.y = isl.h;
    g.add(hill);
  }
  // Pepohonan: kerucut hijau + batang, tersebar di inti pulau.
  const treeRng = mulberry32(isl.x + isl.z + 31);
  const treeCount = isl.kind === 'home' ? 14 : 22;
  for (let i = 0; i < treeCount; i++) {
    const a = treeRng() * Math.PI * 2, rr = treeRng() * isl.r * 0.55;
    const tx = Math.cos(a) * rr, tz = Math.sin(a) * rr;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2, 8, 6), lambert(0x6b4a2a));
    trunk.position.set(tx, isl.h * 0.6 + 4, tz);
    const top = new THREE.Mesh(new THREE.ConeGeometry(8, 18, 7), lambert(0x2f7a33));
    top.position.set(tx, isl.h * 0.6 + 16, tz);
    g.add(trunk, top);
  }
  scene.add(g);
}

function buildRunway(rw, scene) {
  const g = new THREE.Group();
  const strip = new THREE.Mesh(new THREE.BoxGeometry(rw.width, 1.2, rw.length), lambert(0x3a3a44));
  strip.position.set(rw.x, rw.h + 0.4, rw.z);
  strip.rotation.y = (rw.heading * Math.PI) / 180;
  g.add(strip);
  // Garis tengah putih putus-putus.
  for (let i = -4; i <= 4; i++) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(2, 0.4, 14), lambert(0xffffff));
    const rad = (rw.heading * Math.PI) / 180;
    dash.position.set(
      rw.x + Math.sin(rad) * i * 40,
      rw.h + 1.2,
      rw.z - Math.cos(rad) * i * 40,
    );
    dash.rotation.y = rad;
    g.add(dash);
  }
  // Lampu tepi oranye.
  for (let i = -5; i <= 5; i++) {
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(1.6, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xffa726 }),
      );
      const rad = (rw.heading * Math.PI) / 180;
      lamp.position.set(
        rw.x + Math.cos(rad) * side * (rw.width / 2 + 2) + Math.sin(rad) * i * 36,
        rw.h + 1.6,
        rw.z + Math.sin(rad) * side * (rw.width / 2 + 2) - Math.cos(rad) * i * 36,
      );
      g.add(lamp);
    }
  }
  scene.add(g);
}

function buildVillage(v, scene) {
  const g = new THREE.Group();
  g.position.set(v.x, groundHeightAt(v.x, v.z), v.z);
  // Tanda desa: lingkaran target putih + beberapa rumah + tiang bendera.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(v.r, 2.5, 8, 32), lambert(0xffffff));
  ring.rotation.x = Math.PI / 2; ring.position.y = 1;
  g.add(ring);
  for (let i = 0; i < 6; i++) {
    const house = new THREE.Mesh(new THREE.BoxGeometry(12, 9, 12), lambert(0xf2e6c8));
    const a = (i / 6) * Math.PI * 2;
    house.position.set(Math.cos(a) * (v.r + 22), 5, Math.sin(a) * (v.r + 22));
    g.add(house);
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 26, 6), lambert(0xdddddd));
  pole.position.y = 13;
  g.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(12, 7), new THREE.MeshBasicMaterial({ color: 0xff4040, side: THREE.DoubleSide }));
  flag.position.set(6, 22, 0);
  g.add(flag);
  scene.add(g);
}

/** Membangun seluruh dunia; mengembalikan referensi untuk animasi. */
export function buildWorld(scene, seed = 1) {
  // Langit gradient (bola terbalik).
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(5200, 24, 16),
    new THREE.MeshBasicMaterial({ map: makeSkyTexture(), side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  // Laut: bidang besar dengan tekstur prosedural.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(11000, 11000),
    new THREE.MeshLambertMaterial({ map: makeSeaTexture() }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = SEA_LEVEL;
  scene.add(sea);

  // Matahari terbenam: bola oranye besar rendah di barat + halo.
  const sun = new THREE.Mesh(new THREE.SphereGeometry(150, 24, 24), new THREE.MeshBasicMaterial({ color: 0xffb347, fog: false }));
  sun.position.set(-3400, 260, -900);
  scene.add(sun);
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(230, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.28, fog: false }),
  );
  halo.position.copy(sun.position);
  scene.add(halo);

  // Cahaya: directional hangat dari arah matahari + ambient ungu.
  const sunLight = new THREE.DirectionalLight(0xffb36b, 1.6);
  sunLight.position.set(-3000, 900, -800);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x8a6bbf, 0.85));
  const hemi = new THREE.HemisphereLight(0x7a5aa8, 0x2a4a3a, 0.5);
  scene.add(hemi);

  // Kabut senja ungu-jingga.
  scene.fog = new THREE.Fog(0xc98a6e, 900, 5200);

  for (const isl of ISLANDS) buildIsland(isl, scene);
  for (const rw of RUNWAYS) buildRunway(rw, scene);
  for (const v of VILLAGES) buildVillage(v, scene);

  // Awan: gumpalan sphere, posisi dari PRNG seed (deterministik).
  const clouds = [];
  const rng = mulberry32(seed * 101 + 5);
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffd9c2, emissive: 0xcc99aa, emissiveIntensity: 0.55, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 26; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 3);
    for (let j = 0; j < puffs; j++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(18 + rng() * 22, 8, 8), cloudMat);
      s.position.set(j * 26 - puffs * 12, (rng() - 0.5) * 8, (rng() - 0.5) * 18);
      s.scale.y = 0.55;
      cloud.add(s);
    }
    cloud.position.set((rng() - 0.5) * 4800, 260 + rng() * 220, (rng() - 0.5) * 4800);
    scene.add(cloud);
    clouds.push(cloud);
  }

  return { clouds, sun };
}

/** Awan melayang pelan ke timur; dipanggil tiap frame. */
export function animateWorld(world, dt, time) {
  for (const cloud of world.clouds) {
    cloud.position.x += dt * 2.2;
    if (cloud.position.x > 2600) cloud.position.x = -2600;
    cloud.position.y += Math.sin(time * 0.2 + cloud.position.z) * dt * 0.4;
  }
}
