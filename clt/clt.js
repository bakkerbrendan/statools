(function () {
  const $ = (id) => document.getElementById(id);
  const radio = (name) => document.querySelector(`input[name=${name}]:checked`).value;

  // ---------- Population shapes, defined standardized (mean 0, sd 1) ----------
  const SQ2PI = Math.sqrt(2 * Math.PI);
  const phi = (z) => Math.exp(-0.5 * z * z) / SQ2PI;
  const randn = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
  const rande = () => -Math.log(1 - Math.random());
  const LN_S = 0.5, LN_M = Math.exp(LN_S ** 2 / 2), LN_SD = Math.sqrt((Math.exp(LN_S ** 2) - 1) * Math.exp(LN_S ** 2));
  const BI_SD = Math.sqrt(1.25);
  const R3 = Math.sqrt(3), R2 = Math.SQRT2;

  const SHAPES = {
    normal: { name: 'Normal', rnd: randn, pdf: phi },
    right: { name: 'Skewed Right', rnd: () => rande() - 1, pdf: (z) => z < -1 ? 0 : Math.exp(-(z + 1)) },
    left: { name: 'Skewed Left', rnd: () => 1 - rande(), pdf: (z) => z > 1 ? 0 : Math.exp(z - 1) },
    uniform: { name: 'Uniform', rnd: () => (Math.random() * 2 - 1) * R3, pdf: (z) => Math.abs(z) <= R3 ? 1 / (2 * R3) : 0 },
    gamma: { name: 'Gamma (shape 2)', rnd: () => (rande() + rande() - 2) / R2,
      pdf: (z) => { const g = z * R2 + 2; return g <= 0 ? 0 : g * Math.exp(-g) * R2; } },
    lognormal: { name: 'Lognormal', rnd: () => (Math.exp(LN_S * randn()) - LN_M) / LN_SD,
      pdf: (z) => { const x = z * LN_SD + LN_M; return x <= 0 ? 0 : LN_SD * Math.exp(-0.5 * (Math.log(x) / LN_S) ** 2) / (x * LN_S * SQ2PI); } },
    bimodal: { name: 'Bimodal', rnd: () => ((Math.random() < 0.5 ? -1 : 1) + 0.5 * randn()) / BI_SD,
      pdf: (z) => { const y = z * BI_SD; return BI_SD * 0.5 * (phi((y + 1) / 0.5) + phi((y - 1) / 0.5)) / 0.5; } },
  };
  for (const k in SHAPES) $('shape').add(new Option(SHAPES[k].name, k));

  // ---------- State ----------
  const S = { means: [], count: 0, sample: null, popZ: null, popZShape: null, timer: null };

  function params() {
    const mean = Number($('mean').value), sd = Number($('sd').value);
    if (!Number.isFinite(mean)) return { err: 'Population mean must be a number.' };
    if (!(sd > 0)) return { err: 'Population std dev must be greater than 0.' };
    return { mean, sd, shape: SHAPES[$('shape').value], xlo: mean - 4 * sd, xhi: mean + 4 * sd, name: $('varname').value.trim() || 'X' };
  }

  // ---------- Stats helpers ----------
  const meanOf = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / a.length; };
  const sdOf = (a) => {
    if (a.length < 2) return NaN;
    const m = meanOf(a); let s = 0;
    for (let i = 0; i < a.length; i++) s += (a[i] - m) ** 2;
    return Math.sqrt(s / (a.length - 1));
  };
  const f4 = (x) => Number.isFinite(x) ? String(+x.toPrecision(6)) : '.';

  function histogram(values, xlo, xhi, bw) {
    const nb = Math.max(1, Math.ceil((xhi - xlo) / bw - 1e-9));
    const c = new Array(nb).fill(0);
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v < xlo || v > xhi) continue;
      c[Math.min(nb - 1, Math.floor((v - xlo) / bw))]++;
    }
    return c;
  }

  // ---------- Charting ----------
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  function niceTicks(lo, hi, n) {
    const raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
    const out = [];
    for (let t = Math.ceil(lo / step) * step; t <= hi + step * 1e-9; t += step) out.push(+t.toPrecision(12));
    return out;
  }

  function frame(canvas, o) {
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const m = { l: o.yLabels ? 44 : 10, r: 10, t: 8, b: 40 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const X = (x) => m.l + (x - o.xlo) / (o.xhi - o.xlo) * pw;
    const Y = (y) => m.t + ph - Math.min(y, o.ymax) / o.ymax * ph;
    const text = css('--text'), muted = css('--muted');
    ctx.strokeStyle = muted; ctx.fillStyle = muted; ctx.lineWidth = 1; ctx.font = '12px system-ui, sans-serif';
    ctx.beginPath(); ctx.moveTo(m.l, m.t); ctx.lineTo(m.l, m.t + ph); ctx.lineTo(m.l + pw, m.t + ph); ctx.stroke();
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const t of niceTicks(0, o.ymax, 4)) {
      if (o.yLabels) ctx.fillText(+t.toPrecision(3), m.l - 6, Y(t));
      ctx.beginPath(); ctx.moveTo(m.l - 3, Y(t)); ctx.lineTo(m.l, Y(t)); ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const t of niceTicks(o.xlo, o.xhi, Math.max(3, Math.floor(pw / 70)))) {
      ctx.fillText(+t.toPrecision(6), X(t), m.t + ph + 6);
      ctx.beginPath(); ctx.moveTo(X(t), m.t + ph); ctx.lineTo(X(t), m.t + ph + 3); ctx.stroke();
    }
    ctx.fillStyle = text; ctx.fillText(o.xlabel, m.l + pw / 2, m.t + ph + 22);
    ctx.save(); ctx.beginPath(); ctx.rect(m.l, m.t, pw + 1, ph + 1); ctx.clip();
    return { ctx, X, Y, base: m.t + ph, text };
  }

  function bars(f, counts, xlo, bw) {
    const { ctx, X, Y, base } = f;
    ctx.fillStyle = css('--bar'); ctx.strokeStyle = f.text; ctx.lineWidth = 1;
    counts.forEach((c, i) => {
      if (!c) return;
      const x0 = X(xlo + i * bw), x1 = X(xlo + (i + 1) * bw);
      ctx.beginPath(); ctx.rect(x0, Y(c), x1 - x0, base - Y(c)); ctx.fill(); ctx.stroke();
    });
  }

  function curve(f, fn, xlo, xhi, color, width) {
    const { ctx, X, Y } = f;
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
    const N = 300;
    for (let i = 0; i <= N; i++) {
      const x = xlo + (xhi - xlo) * i / N, y = fn(x);
      i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y));
    }
    ctx.stroke();
  }

  const niceMax = (v) => { const t = niceTicks(0, v * 1.05 || 1, 4); return Math.max(t[t.length - 1], v) * 1.0 || 1; };

  // ---------- Drawing ----------
  function ensurePopZ(shapeKey) {
    if (S.popZShape === shapeKey) return;
    const z = new Float32Array(100000), r = SHAPES[shapeKey].rnd;
    for (let i = 0; i < z.length; i++) z[i] = r();
    S.popZ = z; S.popZShape = shapeKey;
  }

  function drawAll() {
    const P = params();
    if (P.err) return;
    const { mean, sd, shape, xlo, xhi, name } = P;
    const dens = (x) => shape.pdf((x - mean) / sd) / sd;

    // Population
    const mode = radio('display');
    let f;
    let popMax = 0, hc = null;
    const pbw = (xhi - xlo) / 60;
    if (mode !== 'curve') {
      ensurePopZ($('shape').value);
      const vals = new Float32Array(S.popZ.length);
      for (let i = 0; i < vals.length; i++) vals[i] = mean + sd * S.popZ[i];
      hc = histogram(vals, xlo, xhi, pbw).map((c) => c / (vals.length * pbw));
      popMax = Math.max(popMax, ...hc);
    }
    if (mode !== 'hist') for (let i = 0; i <= 300; i++) { const y = dens(xlo + (xhi - xlo) * i / 300); if (isFinite(y)) popMax = Math.max(popMax, y); }
    f = frame($('cPop'), { xlo, xhi, ymax: popMax * 1.08, yLabels: false, xlabel: name });
    if (hc) bars(f, hc, xlo, pbw);
    if (mode !== 'hist') curve(f, dens, xlo, xhi, f.text, 1.5);
    f.ctx.restore();
    $('popMean').textContent = mean; $('popSd').textContent = sd;

    // Current sample
    const sbw = Number($('bwSample').value) > 0 ? Number($('bwSample').value) : (xhi - xlo) / 24;
    const sc = S.sample ? histogram(S.sample, xlo, xhi, sbw) : [];
    f = frame($('cSample'), { xlo, xhi, ymax: S.sample ? niceMax(Math.max(...sc, 1)) : 100, yLabels: true, xlabel: name });
    if (S.sample) bars(f, sc, xlo, sbw);
    f.ctx.restore();

    // Sample means
    const n = Number($('n').value) || 1, se = sd / Math.sqrt(n);
    const mbw = Number($('bwMeans').value) > 0 ? Number($('bwMeans').value) : Math.max(se / 4, (xhi - xlo) / 400);
    const mc = histogram(S.means, xlo, xhi, mbw);
    const showNormal = radio('normal') === 'yes' && S.means.length > 0;
    const normPdf = (x) => S.means.length * mbw * phi((x - mean) / se) / se;
    let mmax = Math.max(...mc, 1);
    if (showNormal) mmax = Math.max(mmax, normPdf(mean));
    f = frame($('cMeans'), { xlo, xhi, ymax: S.means.length ? niceMax(mmax) : 100, yLabels: true, xlabel: 'Mean ' + name });
    bars(f, mc, xlo, mbw);
    if (showNormal) curve(f, normPdf, xlo, xhi, css('--accent'), 2);
    f.ctx.restore();
  }

  function updateSummaries() {
    if (S.sample) {
      $('sMean').textContent = f4(meanOf(S.sample)); $('sSd').textContent = f4(sdOf(S.sample)); $('sIdx').textContent = S.count;
    } else { $('sMean').textContent = $('sSd').textContent = $('sIdx').textContent = '.'; }
    const nm = S.means.length;
    $('mMean').textContent = nm ? f4(meanOf(S.means)) : '.';
    $('mSd').textContent = nm > 1 ? f4(sdOf(S.means)) : '.';
    $('mCount').textContent = nm || '.';
  }

  // ---------- Simulation ----------
  function drawSample(P, n) {
    const a = new Float64Array(n), r = P.shape.rnd;
    for (let i = 0; i < n; i++) a[i] = P.mean + P.sd * r();
    S.sample = a; S.count++; S.means.push(meanOf(a));
  }

  function stopTimer() { if (S.timer) { cancelAnimationFrame(S.timer); S.timer = null; } }

  function run() {
    stopTimer();
    const P = params();
    const n = Number($('n').value), k = Number($('k').value);
    let err = P.err || '';
    if (!err && !(Number.isInteger(n) && n >= 1 && n <= 10000)) err = 'Sample size must be a whole number from 1 to 10,000.';
    if (!err && !(Number.isInteger(k) && k >= 1 && k <= 100000)) err = 'Number of samples must be a whole number from 1 to 100,000.';
    if (!err && n * k > 5e6) err = 'Sample size × number of samples must be at most 5,000,000 per draw.';
    $('error').textContent = err;
    if (err) return;

    if (radio('animate') === 'no') {
      for (let i = 0; i < k; i++) drawSample(P, n);
      updateSummaries(); drawAll();
      return;
    }
    let done = 0;
    const per = Math.max(1, Math.ceil(k / 120));
    const step = () => {
      const stop = Math.min(k, done + per);
      for (; done < stop; done++) drawSample(P, n);
      updateSummaries(); drawAll();
      S.timer = done < k ? requestAnimationFrame(step) : null;
    };
    step();
  }

  function reset() {
    stopTimer();
    S.means = []; S.count = 0; S.sample = null;
    updateSummaries(); drawAll();
  }

  // ---------- Wiring ----------
  $('draw').addEventListener('click', run);
  $('resetSamples').addEventListener('click', reset);
  // Changing the population or sample size invalidates accumulated samples; display/sizing options only redraw.
  ['shape', 'mean', 'sd', 'n'].forEach((id) => $(id).addEventListener('input', () => { validateLive(); reset(); }));
  ['varname', 'bwSample', 'bwMeans'].forEach((id) => $(id).addEventListener('input', drawAll));
  document.querySelectorAll('input[name=display], input[name=normal]').forEach((r) => r.addEventListener('change', drawAll));

  function validateLive() { const P = params(); $('error').textContent = P.err || ''; }

  const ro = new ResizeObserver(drawAll);
  ['cPop', 'cSample', 'cMeans'].forEach((id) => ro.observe($(id)));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawAll);

  updateSummaries(); drawAll();
})();
