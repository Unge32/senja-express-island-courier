/*
  SENJA EXPRESS: Island Courier Run — game/js/hud.js
  ===================================================
  HUD tiga kolom + kompas + artificial horizon + kalout + gauge kokpit.
  File ini HANYA menggambar dan memperbarui DOM/kanvas HUD; ia tidak
  memutuskan apa-apa tentang misi atau fisika — semua angka datang dari
  main.js sebagai satu objek state per frame.

  Layout (bounding box tetap, lihat style.css — tidak ada yang bergeser):
  - Atas tengah: kompas strip (N/NE/E/SE/S/SW/W/NW + derajat heading).
  - Kiri: panel MISI — nama misi, objektif, waypoint, jarak, timer,
    progres (mis. 4/12), bar progres oranye.
  - Kanan: panel INSTRUMEN — ALT (ft), SPD (kt), HDG, VSI, SCORE besar,
    bar THROTTLE / FUEL / DAMAGE dengan angka persen.
  - Tengah bawah: artificial horizon (kanvas 220x220: langit biru vs
    tanah cokelat, garis horizon miring mengikuti roll, bergeser
    mengikuti pitch) + kalout besar di atasnya.
  - Banner peringatan di tengah atas: STALL (merah), LOW FUEL (kuning),
    TURN BACK (kuning) — hanya satu yang tampil dalam satu waktu,
    prioritas: STALL > LOW FUEL > TURN BACK.
  - Kokpit view: tiga gauge analog (airspeed, altimeter, VSI) digambar
    sebagai jam berjarum di kanvas + tuas throttle yang naik-turun.

  Keputusan keterbacaan:
  - Angka instrumen >=28px (style.css), kalout >=44px, label 13-15px.
  - Kalout muncul maksimal 2,2 detik lalu memudar, supaya tidak
    menutupi horizon terus-menerus; kalout baru menggantikan yang lama.
  - Semua nilai dibulatkan ke bilangan bulat sebelum ditulis ke DOM —
    angka yang berkedip desimalnya melelahkan mata dan juri.
  - Update DOM hanya saat nilai berubah (cache string terakhir), supaya
    frame rate tidak tergerus penulisan DOM tiap frame.
*/
export class HUD {
  constructor() {
    this.el = {
      compassStrip: document.getElementById('compass-strip'),
      compassHdg: document.getElementById('compass-hdg'),
      missionName: document.getElementById('mission-name'),
      missionObjective: document.getElementById('mission-objective'),
      missionWaypoint: document.getElementById('mission-waypoint'),
      missionDistance: document.getElementById('mission-distance'),
      missionTimer: document.getElementById('mission-timer'),
      missionProgress: document.getElementById('mission-progress'),
      missionProgressLabel: document.getElementById('mission-progress-label'),
      missionBar: document.getElementById('mission-bar'),
      instAlt: document.getElementById('inst-alt'),
      instSpd: document.getElementById('inst-spd'),
      instHdg: document.getElementById('inst-hdg'),
      instVsi: document.getElementById('inst-vsi'),
      instScore: document.getElementById('inst-score'),
      gaugeThrottle: document.getElementById('gauge-throttle'),
      gaugeFuel: document.getElementById('gauge-fuel'),
      gaugeDamage: document.getElementById('gauge-damage'),
      fuelPct: document.getElementById('fuel-pct'),
      damagePct: document.getElementById('damage-pct'),
      callout: document.getElementById('callout'),
      horizon: document.getElementById('horizon'),
      warning: document.getElementById('warning-banner'),
      cockpit: document.getElementById('cockpit'),
      gaugeAirspeed: document.getElementById('gauge-airspeed'),
      gaugeAltimeter: document.getElementById('gauge-altimeter'),
      gaugeVsi: document.getElementById('gauge-vsi'),
      throttleLever: document.getElementById('cockpit-throttle-lever'),
      controlsHint: document.getElementById('controls-hint'),
    };
    this.horizonCtx = this.el.horizon.getContext('2d');
    this._cache = {};
    this._calloutUntil = 0;
    this._calloutTimer = null;
  }

  _set(key, element, value) {
    if (!element) return;
    if (this._cache[key] !== value) {
      this._cache[key] = value;
      element.textContent = value;
    }
  }

  static formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  /** Kalout besar di tengah (mis. "RING CLEAR +500"). */
  callout(text, small = false) {
    const el = this.el.callout;
    el.textContent = text;
    el.classList.toggle('small', small);
    this._calloutUntil = performance.now() + 2200;
    if (this._calloutTimer) clearTimeout(this._calloutTimer);
    this._calloutTimer = setTimeout(() => { el.textContent = ''; }, 2200);
  }

  /** Kalout yang tidak memudar — untuk screenshot deterministik. */
  pinCallout(text, small = false) {
    if (this._calloutTimer) clearTimeout(this._calloutTimer);
    const el = this.el.callout;
    el.textContent = text;
    el.classList.toggle('small', small);
  }

  showWarning(text, amber = false) {
    const el = this.el.warning;
    if (!text) { el.classList.remove('show'); return; }
    if (this._cache.warning !== text) {
      this._cache.warning = text;
      el.textContent = text;
    }
    el.classList.toggle('warn-amber', amber);
    el.classList.add('show');
  }

  setCockpitVisible(visible) {
    this.el.cockpit.hidden = !visible;
    // Di kokpit, hint kontrol bawah disembunyikan supaya tidak menutupi
    // label gauge analog; kontrol sudah tercantum di layar judul.
    if (this.el.controlsHint) this.el.controlsHint.style.display = visible ? 'none' : '';
  }

  /** Update seluruh HUD dari satu objek state. Dipanggil tiap frame. */
  update(state) {
    const hdg = Math.round(state.headingDeg);
    // Kompas strip: 8 arah mata angin, heading di tengah.
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const idx = Math.round(hdg / 45) % 8;
    const prev = dirs[(idx + 7) % 8], next = dirs[(idx + 1) % 8];
    this._set('compass', this.el.compassStrip, `${prev}  ·  ${dirs[idx]}  ·  ${next}`);
    this._set('compassHdg', this.el.compassHdg, `HDG ${String(hdg).padStart(3, '0')}°`);

    this._set('missionName', this.el.missionName, state.missionName);
    this._set('missionObjective', this.el.missionObjective, state.missionObjective);
    this._set('missionWaypoint', this.el.missionWaypoint, state.waypointName);
    this._set('missionDistance', this.el.missionDistance, `${Math.round(state.waypointDistanceM)} m`);
    this._set('missionTimer', this.el.missionTimer, HUD.formatTime(state.missionTime));
    this._set('missionProgressLabel', this.el.missionProgressLabel, state.missionProgressLabel);
    this._set('missionProgress', this.el.missionProgress, state.missionProgress);
    if (this.el.missionBar) {
      const pct = Math.round(state.missionFraction * 100);
      if (this._cache.bar !== pct) {
        this._cache.bar = pct;
        this.el.missionBar.style.width = `${pct}%`;
      }
    }

    this._set('alt', this.el.instAlt, String(Math.round(state.altitudeFt)));
    this._set('spd', this.el.instSpd, String(Math.round(state.speedKt)));
    // HDG: angka + derajat ditulis ke SATU span nowrap (#inst-hdg),
    // supaya "000°" tidak pernah terpisah baris di panel instrumen.
    this._set('hdg', this.el.instHdg, `${String(hdg).padStart(3, '0')}°`);
    this._set('vsi', this.el.instVsi, String(Math.round(state.verticalSpeedFpm)));
    this._set('score', this.el.instScore, String(state.score));
    this._set('fuelPct', this.el.fuelPct, `${Math.round(state.fuel)}%`);
    this._set('damagePct', this.el.damagePct, `${Math.round(state.damage)}%`);
    if (this.el.gaugeThrottle) this.el.gaugeThrottle.style.width = `${Math.round(state.throttle * 100)}%`;
    if (this.el.gaugeFuel) {
      this.el.gaugeFuel.style.width = `${Math.round(state.fuel)}%`;
      this.el.gaugeFuel.classList.toggle('low', state.fuel < 25);
    }
    if (this.el.gaugeDamage) this.el.gaugeDamage.style.width = `${Math.round(state.damage)}%`;

    // Banner peringatan: satu prioritas tertinggi saja.
    if (state.stalled) this.showWarning('STALL — NOSE DOWN, ADD POWER');
    else if (state.fuel < 15 && state.fuel > 0) this.showWarning('LOW FUEL', true);
    else if (state.fuel <= 0) this.showWarning('FUEL EMPTY — GLIDE TO LAND', true);
    else if (state.outOfBounds) this.showWarning('TURN BACK — LEAVING THE ISLANDS', true);
    else this.showWarning(null);

    this._drawHorizon(state.pitch, state.roll);
    if (!this.el.cockpit.hidden) this._drawCockpitGauges(state);
  }

  _drawHorizon(pitchDeg, rollDeg) {
    const ctx = this.horizonCtx;
    const W = 220, H = 220, cx = W / 2, cy = H / 2, R = 104;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    // Langit biru senja di atas, tanah cokelat di bawah; geser pitch.
    const pitchPx = (pitchDeg / 35) * 70;
    ctx.translate(cx, cy);
    ctx.rotate((-rollDeg * Math.PI) / 180);
    ctx.translate(0, pitchPx);
    ctx.fillStyle = '#5a7fd6'; ctx.fillRect(-R - 10, -R - 90, (R + 10) * 2, R + 90);
    ctx.fillStyle = '#8a5a32'; ctx.fillRect(-R - 10, 0, (R + 10) * 2, R + 90);
    ctx.fillStyle = '#ffb347'; ctx.fillRect(-R - 10, -4, (R + 10) * 2, 8);
    ctx.restore();
    // Garis sayap tetap (simbol pesawat) + garis tengah.
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - 55, cy); ctx.lineTo(cx - 14, cy);
    ctx.moveTo(cx + 14, cy); ctx.lineTo(cx + 55, cy);
    ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
    // Tanda pitch tiap 10 derajat.
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
    ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center';
    for (const deg of [-20, -10, 10, 20]) {
      const y = cy - (deg / 35) * 70;
      ctx.beginPath(); ctx.moveTo(cx - 22, y); ctx.lineTo(cx + 22, y); ctx.stroke();
      ctx.fillText(String(Math.abs(deg)), cx + 38, y + 4);
    }
  }

  _drawGauge(canvas, value, max, label, ticks) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = 150, H = 150, cx = W / 2, cy = H / 2, R = 68;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#14141f';
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center';
    for (let i = 0; i <= ticks; i++) {
      const frac = i / ticks;
      const angle = Math.PI * 0.75 + frac * Math.PI * 1.5;
      const x1 = cx + Math.cos(angle) * (R - 8), y1 = cy + Math.sin(angle) * (R - 8);
      const x2 = cx + Math.cos(angle) * (R - 18), y2 = cy + Math.sin(angle) * (R - 18);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const val = Math.round((frac * max) / (max >= 1000 ? 1000 : 10)) * (max >= 1000 ? 1000 : 10);
      ctx.fillText(String(val), cx + Math.cos(angle) * (R - 32), cy + Math.sin(angle) * (R - 32) + 4);
    }
    // Jarum.
    const frac = Math.max(0, Math.min(1, value / max));
    const angle = Math.PI * 0.75 + frac * Math.PI * 1.5;
    ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * (R - 22), cy + Math.sin(angle) * (R - 22));
    ctx.stroke();
    ctx.fillStyle = '#ffb347';
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px Arial';
    ctx.fillText(label, cx, cy + R - 12);
  }

  _drawCockpitGauges(state) {
    this._drawGauge(this.el.gaugeAirspeed, state.speedKt, 160, `${Math.round(state.speedKt)} kt`, 8);
    this._drawGauge(this.el.gaugeAltimeter, state.altitudeFt, 5000, `${Math.round(state.altitudeFt)} ft`, 5);
    const vsi = state.verticalSpeedFpm;
    const vsiMax = 2000;
    const frac = Math.max(-1, Math.min(1, vsi / vsiMax));
    const canvas = this.el.gaugeVsi;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      const W = 150, H = 150, cx = W / 2, cy = H / 2, R = 68;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#14141f';
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#eee'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      const angle = -Math.PI / 2 + frac * Math.PI * 0.75;
      ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * (R - 22), cy + Math.sin(angle) * (R - 22));
      ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center';
      ctx.fillText(`${vsi >= 0 ? '+' : ''}${Math.round(vsi)}`, cx, cy + R - 12);
    }
    if (this.el.throttleLever) {
      this.el.throttleLever.style.bottom = `${8 + state.throttle * 72}%`;
    }
  }
}
