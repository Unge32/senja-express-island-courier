/*
  SENJA EXPRESS: Island Courier Run — game/js/missions.js
  ========================================================
  Tiga misi yang BENAR-BENAR berbeda — bukan satu mode dengan skin
  beda. File ini adalah "wasit" game: ia menaruh objektif di dunia,
  menilai keberhasilan/kegagalan, dan menghitung skor. Ia tidak
  menggambar apa pun sendiri; ia meminta main.js menampilkan cincin,
  peti, dan kalout lewat callback.

  1) RING RUN — "12 Rings vs the Clock"
     Dua belas cincin oranye (torus) tersusun sebagai rute melintasi
     Kepulauan Senja, dari Kutilang Field ke Merapi Kecil lalu kembali
     ke Laguna Biru. Terbang menembus cincin = +500 poin + kalout
     "RING CLEAR +500". Semua 12 = WIN. Tidak ada batas waktu keras —
     waktu hanya memengaruhi bonus (makin cepat, makin besar).

  2) ISLAND HOP — "Land at 3 Airstrips"
     Mendarat di Kutilang Field, lalu Banda, lalu Rote, berurutan.
     Pendaratan sah bila: di atas strip runway, kecepatan 55-90 kt,
     laju turun < 4 m/s. Pendaratan sah = +1000 poin + "TOUCHDOWN!".
     Mendarat di air/terrain = crash lembut (pesan jelas, misi gagal).
     Ketiga strip = WIN.

  3) MEDIC DROP — "3 Crates Before Fuel Runs Out"
     Tiga desa (Banda, Rote, Senja) menunggu peti suplai. Tekan SPACE
     saat berada di atas desa (jarak horizontal < 90 m, ketinggian
     60-400 m): peti jatuh dengan parasut, mendarat di zona desa =
     +750 poin + "MEDIC DROP ✓". Peti yang jatuh di luar zona = gagal
     untuk desa itu, tapi masih bisa dicoba lagi selama peti tersisa
     (bawa 5 peti untuk 3 desa). Fuel habis sebelum ketiganya = LOSE
     (atau ditching dengan skor parsial bila sudah ada progres).

  Skor & hasil:
  - Skor = ring 500 + landing 1000 + drop 750 + bonus waktu
    (RING RUN: maks 1500 bila < 3 menit) + bonus fuel sisa (1 poin
    per % fuel saat WIN). Flight Log di layar hasil menampilkan cincin,
    pendaratan, peti, waktu, fuel sisa, damage, dan skor total.
  - WIN: semua objektif selesai. LOSE: crash (terrain/air/damage
    100%) atau fuel habis tanpa progres yang cukup untuk ditching.
    Ditching: fuel 0 di atas laut dengan kecepatan rendah = pendaratan
    darurat yang "menyelamatkan skor parsial" (bukan hard fail total —
    layar hasil tetap menampilkan skor yang sudah diraih).

  Cincin dibangun di sini dari TorusGeometry oranye emissive supaya
  kontras lawan langit senja; cincin yang sudah dilewati berubah hijau
  redup dan mengecil — pilot selalu tahu mana target berikutnya.
  Cincin berikutnya diberi penanda panah (cone kecil) yang berputar
  pelan, terlihat dari jauh.
*/
import * as THREE from 'three';
import { RUNWAYS, VILLAGES } from './terrain.js';

/** Jalur 12 cincin RING RUN: posisi + ketinggian, melintasi kepulauan. */
export const RING_PATH = [
  [0, 120, 620], [250, 160, 300], [550, 200, 100], [850, 220, 250],
  [1150, 180, 500], [900, 240, -150], [450, 280, -550], [0, 320, -800],
  [-450, 280, -700], [-850, 220, -300], [-900, 180, 300], [-450, 140, 700],
];

export const MISSION_DEFS = {
  rings: {
    name: 'RING RUN',
    objective: 'Fly through all 12 orange rings. Faster = bigger time bonus.',
    total: 12,
    progressLabel: 'RINGS',
  },
  hop: {
    name: 'ISLAND HOP',
    objective: 'Land at 3 airstrips in order: Kutilang Field, Banda, Rote.',
    total: 3,
    progressLabel: 'LANDINGS',
  },
  medic: {
    name: 'MEDIC DROP',
    objective: 'Drop 3 supply crates on the villages (SPACE) before fuel runs out.',
    total: 3,
    progressLabel: 'CRATES',
  },
};

export class MissionManager {
  constructor(scene, missionKey = 'rings') {
    this.scene = scene;
    this.missionKey = missionKey;
    this.def = MISSION_DEFS[missionKey];
    this.score = 0;
    this.time = 0;
    this.done = 0;
    this.finished = false;
    this.outcome = null; // 'win' | 'lose' | null
    this.resultReason = '';
    this.rings = [];
    this.nextRingIndex = 0;
    this.cratesLeft = 5;
    this.droppedCrates = [];
    this.landingOrder = ['Kutilang Field', 'Banda', 'Rote'];
    this.nextLandingIndex = 0;
    this.droppedVillages = new Set();
    this.onCallout = null; // (text, small) => void
    this.onScore = null;
    if (missionKey === 'rings') this._buildRings();
  }

  _buildRings() {
    const mat = new THREE.MeshLambertMaterial({ color: 0xff7a1a, emissive: 0xcc5500 });
    const geo = new THREE.TorusGeometry(26, 3.2, 10, 32);
    RING_PATH.forEach(([x, y, z], i) => {
      const ring = new THREE.Mesh(geo, mat.clone());
      ring.position.set(x, y, z);
      // Cincin menghadap sepanjang jalur (ke cincin berikutnya).
      const next = RING_PATH[(i + 1) % RING_PATH.length];
      ring.lookAt(next[0], next[1], next[2]);
      ring.userData.index = i;
      this.scene.add(ring);
      this.rings.push(ring);
    });
  }

  _say(text, small = false) {
    if (this.onCallout) this.onCallout(text, small);
  }

  _addScore(points) {
    this.score += points;
    if (this.onScore) this.onScore(this.score);
  }

  /** Target aktif saat ini: posisi + nama + jarak (dipakai HUD). */
  currentTarget(planePos) {
    if (this.missionKey === 'rings') {
      if (this.nextRingIndex >= this.rings.length) return { name: 'ALL CLEAR', pos: planePos, dist: 0 };
      const r = this.rings[this.nextRingIndex];
      return { name: `RING ${this.nextRingIndex + 1}`, pos: r.position, dist: planePos.distanceTo(r.position) };
    }
    if (this.missionKey === 'hop') {
      if (this.nextLandingIndex >= this.landingOrder.length) return { name: 'ALL LANDED', pos: planePos, dist: 0 };
      const rw = RUNWAYS.find((r) => r.name === this.landingOrder[this.nextLandingIndex]);
      const pos = new THREE.Vector3(rw.x, rw.h + 10, rw.z);
      return { name: rw.name, pos, dist: planePos.distanceTo(pos) };
    }
    // medic: desa berikutnya yang belum menerima peti.
    const next = VILLAGES.find((v) => !this.droppedVillages.has(v.name));
    if (!next) return { name: 'ALL VILLAGES SERVED', pos: planePos, dist: 0 };
    const pos = new THREE.Vector3(next.x, 80, next.z);
    return { name: next.name, pos, dist: planePos.distanceTo(pos) };
  }

  get progressText() {
    return `${this.done} / ${this.def.total}`;
  }

  get fraction() {
    return this.done / this.def.total;
  }

  /** Dipanggil tiap frame: cek cincin yang dilewati + animasi cincin. */
  update(dt, plane, flight) {
    this.time += dt;
    if (this.finished) return;
    // Denyut cincin berikutnya supaya terlihat dari jauh.
    if (this.missionKey === 'rings' && this.nextRingIndex < this.rings.length) {
      const ring = this.rings[this.nextRingIndex];
      const s = 1 + Math.sin(this.time * 3) * 0.06;
      ring.scale.setScalar(s);
      const d = plane.position.distanceTo(ring.position);
      if (d < 26) {
        ring.material.color.set(0x37d67a);
        ring.material.emissive.set(0x1a7a3a);
        ring.scale.setScalar(0.85);
        this.done += 1;
        this.nextRingIndex += 1;
        this._addScore(500);
        this._say(`RING CLEAR +500`, false);
        if (this.done >= this.def.total) this._finishWin('All 12 rings cleared.');
      }
    }
    // Peti yang jatuh: parasut turun, cek zona desa saat mendarat.
    for (const crate of this.droppedCrates) {
      if (crate.landed) continue;
      crate.mesh.position.y -= 22 * dt;
      crate.mesh.rotation.y += dt;
      const ground = crate.groundY;
      if (crate.mesh.position.y <= ground + 2) {
        crate.mesh.position.y = ground + 2;
        crate.landed = true;
        const v = crate.village;
        const d = Math.hypot(crate.mesh.position.x - v.x, crate.mesh.position.z - v.z);
        if (d < v.r) {
          this.droppedVillages.add(v.name);
          this.done += 1;
          this._addScore(750);
          this._say(`MEDIC DROP ✓ ${v.name}`, true);
          if (this.done >= this.def.total) this._finishWin('All 3 villages received supplies.');
        } else {
          this._say('CRATE MISSED THE VILLAGE', true);
        }
      }
    }
  }

  /** SPACE: jatuhkan peti dari pesawat (hanya misi medic). */
  dropCrate(plane, groundHeightAt) {
    if (this.missionKey !== 'medic' || this.finished) return false;
    if (this.cratesLeft <= 0) { this._say('NO CRATES LEFT', true); return false; }
    const target = this.currentTarget(plane.position);
    const village = VILLAGES.find((v) => !this.droppedVillages.has(v.name));
    if (!village) return false;
    if (plane.position.y < 60 || plane.position.y > 400) {
      this._say('DROP BETWEEN 60–400 m ALTITUDE', true);
      return false;
    }
    const dist = Math.hypot(plane.position.x - village.x, plane.position.z - village.z);
    if (dist > 120) {
      this._say(`TOO FAR FROM ${village.name.toUpperCase()}`, true);
      return false;
    }
    this.cratesLeft -= 1;
    const crate = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(6, 6, 6),
      new THREE.MeshLambertMaterial({ color: 0xd96a2a }),
    );
    crate.add(box);
    const chute = new THREE.Mesh(
      new THREE.ConeGeometry(7, 4, 8),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
    );
    chute.position.y = 7;
    crate.add(chute);
    crate.position.copy(plane.position);
    crate.position.y -= 4;
    this.scene.add(crate);
    this.droppedCrates.push({
      mesh: crate, landed: false, village,
      groundY: groundHeightAt(crate.position.x, crate.position.z),
    });
    this._say('CRATE AWAY!', true);
    return true;
  }

  /** Dipanggil main.js saat roda menyentuh tanah. */
  handleGroundContact(plane, flight, runway, groundHeightAt) {
    if (this.finished) return 'none';
    const speedKt = flight.speedKt;
    const vsMs = Math.abs(flight.verticalSpeedMs);
    const overWater = groundHeightAt(plane.position.x, plane.position.z) <= 0.5;
    // Mendarat di air = ditching: skor parsial selamat bila pelan.
    if (overWater && !runway) {
      if (speedKt < 70 && vsMs < 5) {
        this._finishDitch('Ditched in the sea — Raka is safe, partial score kept.');
        return 'ditch';
      }
      this._finishLose('Crashed into the sea.');
      return 'crash';
    }
    if (!runway) {
      // Terrain bukan runway.
      if (speedKt < 45 && vsMs < 4 && flight.fuel <= 0) {
        this._finishDitch('Forced landing on open ground — Raka walked away.');
        return 'ditch';
      }
      this._finishLose('Crashed into terrain — land only on a runway.');
      return 'crash';
    }
    // Di atas runway: nilai kualitas pendaratan.
    if (speedKt > 95 || vsMs > 6) {
      flight.addDamage(35);
      this._say('HARD LANDING! SLOW DOWN', true);
      if (flight.damage >= 100) { this._finishLose('Aircraft written off by a hard landing.'); return 'crash'; }
      return 'hard';
    }
    const soft = flight.registerTouchdown(flight.verticalSpeedMs);
    if (this.missionKey === 'hop') {
      const expected = this.landingOrder[this.nextLandingIndex];
      if (runway.name === expected) {
        this.done += 1;
        this.nextLandingIndex += 1;
        this._addScore(1000);
        this._say('TOUCHDOWN! +1000');
        if (this.done >= this.def.total) this._finishWin('All 3 airstrips landed.');
        return 'landed';
      }
      this._say(`WRONG STRIP — NEXT IS ${expected.toUpperCase()}`, true);
      return 'landed-wrong';
    }
    // Misi lain: pendaratan di runway tetap sah & diberi poin kecil.
    this._addScore(200);
    this._say(soft ? 'TOUCHDOWN!' : 'TOUCHDOWN!', false);
    return 'landed';
  }

  /** Fuel habis: beri kesempatan ditching, bukan hard fail instan. */
  handleFuelEmpty(plane, groundHeightAt) {
    if (this.finished) return;
    this._say('FUEL EMPTY — GLIDE TO LAND', true);
  }

  _finishWin(reason) {
    if (this.finished) return;
    this.finished = true;
    this.outcome = 'win';
    this.resultReason = reason;
    // Bonus: waktu (RING RUN) + fuel sisa.
    if (this.missionKey === 'rings' && this.time < 180) {
      this._addScore(Math.round((180 - this.time) * 8));
    }
  }

  _finishLose(reason) {
    if (this.finished) return;
    this.finished = true;
    this.outcome = 'lose';
    this.resultReason = reason;
  }

  _finishDitch(reason) {
    if (this.finished) return;
    this.finished = true;
    this.outcome = 'ditch';
    this.resultReason = reason;
  }

  /** Bonus fuel sisa ditambahkan sekali saat layar hasil dibuka. */
  finalizeScore(fuelPct) {
    if (this.outcome === 'win') this.score += Math.round(fuelPct);
    return this.score;
  }

  dispose() {
    for (const ring of this.rings) this.scene.remove(ring);
    for (const crate of this.droppedCrates) this.scene.remove(crate.mesh);
    this.rings = [];
    this.droppedCrates = [];
  }
}
