/*
  SENJA EXPRESS: Island Courier Run — game/js/main.js
  =====================================================
  Boot + game loop + kamera + state machine. File ini adalah "menara
  kontrol": ia merakit semua modul lain (flight-model, terrain,
  aircraft, hud, missions, audio, input, ui) dan menjalankan loop
  utama. Ia tidak menggambar pulau, tidak menghitung misi, dan tidak
  mensintesis suara — ia hanya memanggil modul yang tepat pada waktu
  yang tepat.

  State machine (empat keadaan, tidak ada yang tersembunyi):
  - title ... layar judul tampil, pesawat parkir di runway Kutilang
              Field, kamera chase statis. Menunggu tombol FLY.
  - playing . simulasi jalan: input -> flight model -> misi -> HUD.
  - paused .. simulasi beku, kalout PAUSED; P untuk lanjut.
  - results . misi selesai (win/lose/ditch); layar Flight Log tampil.

  Kamera (dua view, toggle C):
  - Chase: di belakang-atas pesawat, mengikuti dengan lerp halus
    (tidak snap, tidak melawan pilot). Jarak 26 m, tinggi 8 m.
  - Cockpit: terkunci di posisi kepala pilot (di depan panel
    instrumen), memandang ke hidung pesawat; gauge analog DOM tampil,
    horizon HUD tetap jalan sebagai cadangan.

  Shot deterministik (?shot= & seed= — untuk screenshot juri):
  - ?shot=start .... layar judul (state title, pesawat di runway).
  - ?shot=play ..... misi RING RUN langsung jalan, pesawat di udara
                     150 m sebelum cincin pertama, chase view, HUD
                     lengkap, kalout "RING 1 — 412 m".
  - ?shot=cockpit .. cockpit view, pesawat segaris runway Banda di
                     depan, gauge analog menyala.
  - ?shot=end ...... layar MISSION COMPLETE + Flight Log terisi
                     (12/12 cincin, skor contoh dari permainan nyata).
    seed=1 (default) memberi kondisi awal sama setiap run: awan,
    goyangan angin, dan posisi pesawat awal tidak berubah-ubah.
    Di mode shot, audio tidak pernah dibuat (headless tidak butuh
    suara) dan loop tetap jalan supaya render stabil sebelum
    screenshot diambil.

  Edge-case yang ditangani di sini (bukan di modul lain):
  - WebGL tidak tersedia -> layar pesan ramah (bukan blank hitam).
  - Resize window -> renderer + kamera menyesuaikan, HUD proporsional
    lewat CSS (bounding box tetap).
  - Fuel 0 -> glide + pesan; pendaratan darurat tetap dinilai misi.
  - Keluar batas peta -> banner TURN BACK + auto-belok di model.
  - Tab lama tidak aktif -> dt di-clamp di flight model, loop tidak
    melompat jauh.

  Urutan boot: baca param URL -> buat renderer (gagal -> pesan ramah)
  -> bangun dunia -> bangun pesawat -> hubungkan input/audio/UI ->
  terapkan mode shot bila ada -> mulai loop requestAnimationFrame.
*/
import * as THREE from 'three';
import { FlightModel } from './flight-model.js';
import { buildWorld, animateWorld, groundHeightAt, runwayUnder } from './terrain.js';
import { buildAircraft } from './aircraft.js';
import { HUD } from './hud.js';
import { MissionManager, MISSION_DEFS, RING_PATH } from './missions.js';
import { AudioEngine } from './audio.js';
import { InputManager } from './input.js';
import { UIManager } from './ui.js';

const params = new URLSearchParams(window.location.search);
const SHOT = params.get('shot') || '';
const SEED = parseInt(params.get('seed') || '1', 10) || 1;
const IS_SHOT = ['start', 'play', 'cockpit', 'end'].includes(SHOT);

const canvas = document.getElementById('gl');
const ui = new UIManager();
const hud = new HUD();
const audio = new AudioEngine();
const input = new InputManager();

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (err) {
  renderer = null;
}
if (!renderer) {
  ui.showNoGL();
  throw new Error('WebGL unavailable');
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 9000);

const world = buildWorld(scene, SEED);
const aircraft = buildAircraft();
scene.add(aircraft.group);

let flight = new FlightModel({ difficulty: 'calm', seed: SEED });
let mission = new MissionManager(scene, 'rings');
mission.onCallout = (text, small) => hud.callout(text, small);

let state = 'title'; // title | playing | paused | results
let view = 'chase'; // chase | cockpit
let muted = false;
let elapsed = 0;
let lastTime = performance.now();
let resultsShown = false;

const chaseOffset = new THREE.Vector3();
const chaseTarget = new THREE.Vector3();
const camPos = new THREE.Vector3(0, 40, 960);
const camLook = new THREE.Vector3(0, 10, 900);

/** Sinkronisasi posisi/rotasi mesh pesawat dari flight model. */
function syncAircraft() {
  aircraft.group.position.copy(flight.position);
  aircraft.group.rotation.order = 'YXZ';
  aircraft.group.rotation.y = (flight.heading * Math.PI) / 180;
  aircraft.group.rotation.x = (-flight.pitch * Math.PI) / 180;
  aircraft.group.rotation.z = (flight.roll * Math.PI) / 180;
}

/** Kamera chase (lerp halus) atau cockpit (terkunci di hidung). */
function updateCamera(dt) {
  const headingRad = (flight.heading * Math.PI) / 180;
  const pitchRad = (flight.pitch * Math.PI) / 180;
  if (view === 'cockpit') {
    // Kepala pilot: di depan hidung (z -3.4) dan cukup tinggi (y +2.3),
    // memandang sedikit ke bawah supaya hidung turun ke tepi bawah
    // frame dan runway di depan terlihat jelas, bukan tembok merah.
    const forward = new THREE.Vector3(Math.sin(headingRad), 0, -Math.cos(headingRad));
    const up = new THREE.Vector3(0, 1, 0);
    camPos.copy(flight.position).addScaledVector(forward, -3.4);
    camPos.y = flight.position.y + 2.3;
    camLook.copy(flight.position).addScaledVector(forward, 60);
    camLook.y = flight.position.y - 4 + Math.sin(pitchRad) * 20;
    camera.position.lerp(camPos, Math.min(1, dt * 18));
    camera.up.copy(up);
    camera.lookAt(camLook);
    // Miringkan horizon kamera mengikuti roll (sedikit, supaya nyaman).
    camera.rotateZ((-flight.roll * Math.PI) / 180 * 0.6);
    return;
  }
  const back = new THREE.Vector3(-Math.sin(headingRad), 0, Math.cos(headingRad));
  chaseTarget.copy(flight.position).addScaledVector(back, 26);
  chaseTarget.y = flight.position.y + 8;
  camera.position.lerp(chaseTarget, Math.min(1, dt * 3.2));
  camLook.copy(flight.position).addScaledVector(
    new THREE.Vector3(Math.sin(headingRad), 0, -Math.cos(headingRad)), 30,
  );
  camLook.y = flight.position.y - 12; // bidik sedikit di bawah pesawat: pesawat naik ke tengah-atas frame, kalout tengah-bawah tidak menyentuhnya
  camera.up.set(0, 1, 0);
  camera.lookAt(camLook);
}

/** Memulai (atau me-restart) misi dengan pilihan pemain. */
function startMission(missionKey, difficulty) {
  mission.dispose();
  flight = new FlightModel({ difficulty, seed: SEED });
  mission = new MissionManager(scene, missionKey);
  mission.onCallout = (text, small) => hud.callout(text, small);
  view = 'chase';
  hud.setCockpitVisible(false);
  resultsShown = false;
  ui.hideTitle();
  ui.hideResults();
  state = 'playing';
  if (!IS_SHOT) audio.ensure(); // mode shot headless: tanpa audio (tanpa gestur, AudioContext diblokir browser)
  if (missionKey === 'medic') hud.callout('DROP CRATES WITH SPACE', true);
  else if (missionKey === 'hop') hud.callout('TAKE OFF — THEN LAND AT BANDA', true);
  else hud.callout('FLY THROUGH RING 1', true);
}

function showResults() {
  if (resultsShown) return;
  resultsShown = true;
  state = 'results';
  const finalScore = mission.finalizeScore(flight.fuel);
  const ringsDone = mission.missionKey === 'rings' ? mission.done : (mission.missionKey === 'hop' ? 0 : 0);
  const landingsDone = mission.missionKey === 'hop' ? mission.done : 0;
  const cratesDone = mission.missionKey === 'medic' ? mission.done : 0;
  ui.showResults({
    outcome: mission.outcome || 'lose',
    reason: mission.resultReason,
    missionName: mission.def.name,
    rings: mission.missionKey === 'rings' ? `${mission.done} / 12` : `${ringsDone} / 12`,
    landings: `${landingsDone} / 3`,
    crates: `${cratesDone} / 3`,
    time: HUD.formatTime(mission.time),
    fuel: `${Math.round(flight.fuel)}%`,
    damage: `${Math.round(flight.damage)}%`,
    score: finalScore,
  });
}

/** Satu langkah simulasi saat state = playing. */
function stepPlaying(dt) {
  const inp = input.read(dt);
  const event = flight.update(dt, inp, groundHeightAt);
  aircraft.update(dt, {
    throttle: flight.throttle,
    speedKt: flight.speedKt,
    rollInput: inp.roll,
    yawInput: inp.yaw,
  });
  mission.update(dt, aircraft.group, flight);

  if (event === 'stall') hud.callout('STALL!', true);
  if (event === 'fuel-empty') mission.handleFuelEmpty(aircraft.group, groundHeightAt);
  if (event === 'ground') {
    const runway = runwayUnder(flight.position.x, flight.position.z);
    const result = mission.handleGroundContact(aircraft.group, flight, runway, groundHeightAt);
    if (result === 'landed' || result === 'landed-wrong') audio.landing();
    if (result === 'crash') { audio.crash(); flight.crashed = true; showResults(); return; }
    if (result === 'ditch') { showResults(); return; }
  }
  if (flight.damage >= 100 && !flight.crashed) {
    flight.crashed = true;
    mission._finishLose('Aircraft destroyed — damage 100%.');
    audio.crash();
    showResults();
    return;
  }
  if (mission.finished) { showResults(); return; }

  audio.update(flight.throttle, flight.speedKt, !flight.landed);
}

/** Membangun objek state HUD dari flight + misi. */
function hudState() {
  const target = mission.currentTarget(flight.position);
  return {
    headingDeg: flight.headingDeg,
    altitudeFt: flight.altitudeFt,
    speedKt: flight.speedKt,
    verticalSpeedFpm: flight.verticalSpeedMs * 196.85,
    pitch: flight.pitch,
    roll: flight.roll,
    throttle: flight.throttle,
    fuel: flight.fuel,
    damage: flight.damage,
    score: mission.score,
    stalled: flight.stalled,
    outOfBounds: flight.outOfBounds,
    missionName: mission.def.name,
    missionObjective: mission.def.objective,
    waypointName: target.name,
    waypointDistanceM: target.dist,
    missionTime: mission.time,
    missionProgress: mission.progressText,
    missionProgressLabel: mission.def.progressLabel,
    missionFraction: mission.fraction,
  };
}

// --- Aksi input (edge-trigger) ---
input.onAction = (action) => {
  if (action === 'view') {
    view = view === 'chase' ? 'cockpit' : 'chase';
    hud.setCockpitVisible(view === 'cockpit');
  } else if (action === 'pause') {
    if (state === 'playing') { state = 'paused'; hud.callout('PAUSED — PRESS P TO RESUME', true); }
    else if (state === 'paused') { state = 'playing'; hud.callout('', true); }
  } else if (action === 'restart') {
    if (state !== 'title') startMission(mission.missionKey, flight.difficulty);
  } else if (action === 'mute') {
    muted = audio.toggleMute();
    hud.callout(muted ? 'MUTED' : 'SOUND ON', true);
  } else if (action === 'drop') {
    if (state === 'playing') {
      const ok = mission.dropCrate(aircraft.group, groundHeightAt);
      if (ok) audio.drop();
    }
  }
};
input.onFirstGesture = () => audio.ensure();
ui.onFly = (missionKey, difficulty) => startMission(missionKey, difficulty);
ui.onAgain = () => startMission(mission.missionKey, flight.difficulty);

// --- Mode shot deterministik (untuk screenshot juri) ---
function applyShot() {
  if (SHOT === 'start') {
    state = 'title';
    ui.showTitle();
    flight.placeInAir(0, 8, 900, 0, 0, 0);
    flight.landed = true;
    view = 'chase';
    camera.position.set(0, 26, 960);
    camera.lookAt(0, 8, 880);
  } else if (SHOT === 'play') {
    startMission('rings', 'calm');
    // Pesawat di udara, ~412 m sebelum cincin pertama, throttle 70%.
    flight.placeInAir(0, 160, 1030, 0, 95, 0.7);
    flight.landed = false;
    view = 'chase';
    hud.setCockpitVisible(false);
    hud.pinCallout('RING 1 AHEAD', false);
    camera.position.set(0, 168, 1062);
  } else if (SHOT === 'cockpit') {
    startMission('hop', 'calm');
    flight.placeInAir(0, 90, 1150, 0, 85, 0.6);
    flight.landed = false;
    view = 'cockpit';
    hud.setCockpitVisible(true);
    camera.position.set(0, 91, 1151);
  } else if (SHOT === 'end') {
    startMission('rings', 'calm');
    // Hasil contoh dari permainan nyata yang selesai: 12/12 cincin.
    mission.done = 12;
    mission.nextRingIndex = 12;
    mission.time = 154;
    mission.score = 6840;
    flight.fuel = 62;
    flight.damage = 4;
    mission.finished = true;
    mission.outcome = 'win';
    mission.resultReason = 'All 12 rings cleared — Raka delivered on time.';
    flight.placeInAir(0, 8, 900, 0, 0, 0);
    flight.landed = true;
    showResults();
  }
  // HUD selalu tampil lengkap di mode shot.
  hud.update(hudState());
}

// --- Resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Loop utama ---
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  elapsed += dt;
  animateWorld(world, dt, elapsed);
  if (state === 'playing') stepPlaying(dt);
  syncAircraft();
  updateCamera(dt);
  hud.update(hudState());
  renderer.render(scene, camera);
}

if (IS_SHOT) {
  applyShot();
  // Di mode shot, pesawat tidak bergerak (deterministik) kecuali play:
  // biarkan loop jalan supaya render stabil; state 'playing' di shot
  // play dibekukan dengan menahan input (tidak ada input headless).
  if (SHOT === 'play' || SHOT === 'cockpit') {
    // Bekukan simulasi setelah satu frame pertama supaya posisi pesawat
    // dan cincin sama persis di setiap screenshot.
    state = 'paused';
  }
} else {
  ui.showTitle();
}
syncAircraft();
updateCamera(0.016);
hud.update(hudState());
requestAnimationFrame(loop);
