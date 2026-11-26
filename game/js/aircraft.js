/*
  SENJA EXPRESS: Island Courier Run — game/js/aircraft.js
  ========================================================
  Pesawat bush "Kutilang": satu-satunya pesawat di game, dibangun
  seluruhnya dari primitif Three.js — tanpa model eksternal, tanpa
  tekstur file. File ini hanya tahu cara MEMBANGUN dan MENGANIMASI
  pesawat; ia tidak tahu fisika (itu flight-model.js) atau misi.

  Anatomi Kutilang (dirakit dari 20+ bagian, semua bernama jelas):
  - Badan (fuselage): silinder putih yang meruncing ke ekor + hidung
    kerucut oranye; garis livery oranye di sepanjang badan.
  - Sayap utama: kotak pipih oranye-putih di atas badan (high-wing,
    khas pesawat bush), lengkap dengan strut penyangga ke badan.
  - Ekor: stabilizer horizontal + fin vertikal oranye dengan ujung
    putih; rudder dan elevator sebagai panel terpisah.
  - Propeller: hub + 2 bilah abu-abu gelap yang BERPUTAR; kecepatan
    putar sebanding throttle — dari luar terlihat mesin hidup atau mati.
  - Roda: 3 roda bush (2 utama besar + 1 ekor kecil) dengan penyangga,
    supaya pesawat terlihat "dibangun" saat parkir di runway.
  - Kokpit: kaca depan + jendela samping biru transparan; kursi dan
    panel instrumen gelap di dalam, terlihat dari cockpit view.
  - Lampu: lampu navigasi merah (kiri) dan hijau (kanan) di ujung
    sayap — detail kecil yang membuat pesawat terbaca di senja.

  Skala: 1 unit = 1 meter. Panjang badan ~9 m, bentang sayap ~11 m —
  proporsi pesawat bush ringan seperti Cessna 185. Sumbu lokal:
  hidung menghadap -Z (konvensi Three.js), sayap sepanjang X, atas +Y.
  main.js memutar grup sesuai heading/pitch/roll dari flight model.

  Animasi per frame (update(dt, state)):
  - Propeller berputar (cepat saat throttle tinggi, melambat saat glide).
  - Aileron miring mengikuti input roll; elevator mengikuti pitch.
  - Roda sedikit bergetar saat lepas landas (takeoff roll) — detail
    kecil yang menjual "pesawat bush", bukan pesawat mainan.
*/
import * as THREE from 'three';

function lambert(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });
}

export function buildAircraft() {
  const plane = new THREE.Group();
  plane.name = 'Kutilang';

  const white = lambert(0xf5f2ea);
  const orange = lambert(0xe86a1a);
  const dark = lambert(0x2b2b33);
  const glass = new THREE.MeshLambertMaterial({
    color: 0x9fd8ef, transparent: true, opacity: 0.75, flatShading: true,
  });

  // --- Badan: silinder meruncing + hidung kerucut oranye ---
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.55, 7.2, 12), white);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.set(0, 0, 0.4);
  plane.add(fuselage);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.6, 12), orange);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0, -3.8);
  plane.add(nose);
  // Garis livery oranye di sepanjang badan.
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 6.4), orange);
  stripe.position.set(0.86, -0.1, 0.4);
  plane.add(stripe);
  const stripeL = stripe.clone();
  stripeL.position.x = -0.86;
  plane.add(stripeL);

  // --- Kokpit: kaca depan + jendela samping ---
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 0.9), glass);
  windshield.position.set(0, 0.62, -1.7);
  windshield.rotation.x = -0.35;
  plane.add(windshield);
  for (const side of [-1, 1]) {
    const window = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 1.1), glass);
    window.position.set(side * 0.82, 0.55, -0.9);
    plane.add(window);
  }
  // Panel instrumen gelap (terlihat dari cockpit view).
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.25), dark);
  panel.position.set(0, 0.35, -2.15);
  plane.add(panel);

  // --- Sayap utama (high-wing) + strut ---
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.22, 1.9), orange);
  wing.position.set(0, 0.95, -0.6);
  plane.add(wing);
  const wingTipL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 1.9), white);
  wingTipL.position.set(-5.4, 0.95, -0.6);
  const wingTipR = wingTipL.clone();
  wingTipR.position.x = 5.4;
  plane.add(wingTipL, wingTipR);
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 6), dark);
    strut.position.set(side * 1.6, 0.15, -0.6);
    strut.rotation.z = side * 0.5;
    plane.add(strut);
  }

  // --- Aileron (panel sayap yang bergerak mengikuti roll) ---
  const aileronL = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.6), white);
  aileronL.position.set(-4.2, 0.95, 0.45);
  const aileronR = aileronL.clone();
  aileronR.position.x = 4.2;
  plane.add(aileronL, aileronR);

  // --- Ekor: stabilizer + fin + rudder ---
  const stabilizer = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.16, 1.2), orange);
  stabilizer.position.set(0, 0.25, 3.9);
  plane.add(stabilizer);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.7, 1.5), orange);
  fin.position.set(0, 1.0, 3.9);
  plane.add(fin);
  const finTip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.35, 1.5), white);
  finTip.position.set(0, 1.85, 3.9);
  plane.add(finTip);
  const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.7), white);
  rudder.position.set(0, 0.85, 4.65);
  plane.add(rudder);

  // --- Propeller: hub + 2 bilah (grup sendiri agar bisa berputar) ---
  const prop = new THREE.Group();
  prop.position.set(0, 0, -4.7);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.35, 10), dark);
  hub.rotation.x = Math.PI / 2;
  prop.add(hub);
  const blades = [];
  for (let i = 0; i < 2; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.6, 0.08), lambert(0x3a3a42));
    blade.rotation.z = (i * Math.PI) / 2;
    prop.add(blade);
    blades.push(blade);
  }
  // Cakram blur tipis: memberi kesan putaran cepat saat throttle tinggi.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.35, 24),
    new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.0, side: THREE.DoubleSide }),
  );
  prop.add(disc);
  plane.add(prop);

  // --- Roda bush: 2 utama + 1 ekor ---
  const wheels = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6), dark);
    leg.position.set(side * 1.0, -0.95, -0.8);
    plane.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 12), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.0, -1.5, -0.8);
    plane.add(wheel);
    wheels.push(wheel);
  }
  const tailLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.8, 6), dark);
  tailLeg.position.set(0, -0.7, 3.9);
  plane.add(tailLeg);
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.2, 10), dark);
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -1.1, 3.9);
  plane.add(tailWheel);
  wheels.push(tailWheel);

  // --- Lampu navigasi: merah kiri, hijau kanan ---
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  navL.position.set(-5.6, 0.95, -0.6);
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0x22ff66 }));
  navR.position.set(5.6, 0.95, -0.6);
  plane.add(navL, navR);

  // Nomor registrasi di badan (teks prosedural via canvas, nol aset).
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 256; labelCanvas.height = 64;
  const lctx = labelCanvas.getContext('2d');
  lctx.fillStyle = '#e86a1a'; lctx.fillRect(0, 0, 256, 64);
  lctx.fillStyle = '#ffffff'; lctx.font = 'bold 40px Arial';
  lctx.textAlign = 'center'; lctx.textBaseline = 'middle';
  lctx.fillText('KUTILANG', 128, 34);
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.65),
    new THREE.MeshBasicMaterial({ map: labelTex }),
  );
  label.position.set(0.88, 0.35, 1.6);
  label.rotation.y = Math.PI / 2;
  plane.add(label);

  return {
    group: plane,
    prop,
    propDisc: disc,
    aileronL,
    aileronR,
    rudder,
    wheels,
    _propAngle: 0,
    /** Animasi per frame: putar propeller, gerakkan permukaan kendali. */
    update(dt, state) {
      const throttle = state.throttle ?? 0;
      const speedKt = state.speedKt ?? 0;
      // Propeller: putaran sebanding throttle + angin saat glide.
      const spinRate = 4 + throttle * 55 + speedKt * 0.12;
      this._propAngle += spinRate * dt;
      this.prop.rotation.z = this._propAngle;
      this.propDisc.material.opacity = Math.min(0.22, throttle * 0.22);
      // Aileron berlawanan arah kiri/kanan mengikuti input roll.
      const rollInput = state.rollInput ?? 0;
      this.aileronL.rotation.x = rollInput * 0.45;
      this.aileronR.rotation.x = -rollInput * 0.45;
      // Rudder mengikuti yaw.
      this.rudder.rotation.y = (state.yawInput ?? 0) * 0.4;
    },
  };
}
