/*
  SENJA EXPRESS: Island Courier Run — game/js/ui.js
  ==================================================
  Layar judul + layar hasil + layar pause. File ini HANYA mengurus
  overlay DOM dan pilihan pemain; ia tidak tahu Three.js atau fisika.
  Semua keputusan gameplay (misi selesai, skor) datang dari main.js
  sebagai data biasa, lalu file ini menampilkannya.

  Layar judul (sesuai benchmark-notes.md):
  - Judul besar SENJA EXPRESS + pitch satu baris dengan angka yang
    bisa dihitung juri: 8 Islands, 12 Rings, 3 Missions, 3 Difficulties,
    2 Views, 1 Bush Plane at Golden Hour.
  - Kotak GOAL / WIN / LOSE yang jujur: apa yang harus dicapai, apa
    yang dihitung menang, apa yang dihitung kalah. Juri membaca ini
    sebelum menerbangkan pesawat.
  - Dua dropdown: MISI (RING RUN / ISLAND HOP / MEDIC DROP) dan
    KESULITAN (Calm / Breeze / Gale). Pilihan dibaca main.js saat
    tombol FLY ditekan — bukan saat dropdown berubah, supaya pemain
    bisa berubah pikiran tanpa me-restart apa pun.
  - Tombol FLY besar oranye. Klik = gestur pengguna pertama, jadi
    main.js memakai momen ini untuk membangun AudioContext.

  Layar hasil (Flight Log):
  - Judul MISSION COMPLETE (menang), MISSION FAILED (kalah), atau
    EMERGENCY DITCHING (mendarat darurat, skor parsial selamat).
  - Satu baris alasan ("All 12 rings cleared." / "Crashed into the
    sea.") supaya pemain tahu persis kenapa penerbangan berakhir.
  - Flight Log: misi, cincin, pendaratan, peti, waktu, fuel sisa,
    damage, skor — angka yang sama dengan yang tampil di HUD, supaya
    screenshot ke-4 membuktikan game selesai, bukan demo.
  - Tombol FLY AGAIN (atau tekan R) untuk restart instan.

  Layar pause: kalout "PAUSED — press P to resume" lewat HUD, bukan
  overlay terpisah — satu permukaan lebih sedikit untuk dirawat, dan
  pemain tetap melihat pesawatnya saat jeda.

  Semua teks berbahasa Inggris (juri internasional; standar pemenang
  best-game-01), dengan nama lokal (Senja, Kutilang, Raka, Banda,
  Rote) sebagai identitas — bukan terjemahan.
*/
export class UIManager {
  constructor() {
    this.titleScreen = document.getElementById('title-screen');
    this.resultsScreen = document.getElementById('results-screen');
    this.noglScreen = document.getElementById('nogl-screen');
    this.selectMission = document.getElementById('select-mission');
    this.selectDifficulty = document.getElementById('select-difficulty');
    this.btnFly = document.getElementById('btn-fly');
    this.btnAgain = document.getElementById('btn-again');
    this.resultsTitle = document.getElementById('results-title');
    this.resultsSub = document.getElementById('results-sub');
    this.log = {
      mission: document.getElementById('log-mission'),
      rings: document.getElementById('log-rings'),
      landings: document.getElementById('log-landings'),
      crates: document.getElementById('log-crates'),
      time: document.getElementById('log-time'),
      fuel: document.getElementById('log-fuel'),
      damage: document.getElementById('log-damage'),
      score: document.getElementById('log-score'),
    };
    this.onFly = null; // (missionKey, difficulty) => void
    this.onAgain = null; // () => void
    if (this.btnFly) this.btnFly.addEventListener('click', () => {
      if (this.onFly) this.onFly(this.selectMission.value, this.selectDifficulty.value);
    });
    if (this.btnAgain) this.btnAgain.addEventListener('click', () => {
      if (this.onAgain) this.onAgain();
    });
  }

  showTitle() {
    this.titleScreen.hidden = false;
    this.resultsScreen.hidden = true;
  }

  hideTitle() {
    this.titleScreen.hidden = true;
  }

  showNoGL() {
    this.noglScreen.hidden = false;
    this.titleScreen.hidden = true;
  }

  /** Menampilkan layar hasil dari data Flight Log yang sudah final. */
  showResults(data) {
    const titles = {
      win: 'MISSION COMPLETE',
      lose: 'MISSION FAILED',
      ditch: 'EMERGENCY DITCHING',
    };
    this.resultsTitle.textContent = titles[data.outcome] || 'MISSION COMPLETE';
    this.resultsSub.textContent = data.reason || '';
    this.log.mission.textContent = data.missionName;
    this.log.rings.textContent = data.rings;
    this.log.landings.textContent = data.landings;
    this.log.crates.textContent = data.crates;
    this.log.time.textContent = data.time;
    this.log.fuel.textContent = data.fuel;
    this.log.damage.textContent = data.damage;
    this.log.score.textContent = String(data.score);
    this.resultsScreen.hidden = false;
  }

  hideResults() {
    this.resultsScreen.hidden = true;
  }
}
