(function () {
  const { DISTRIBUTIONS, validateParams, quantile } = Stats;
  const $ = (id) => document.getElementById(id);

  const PROB_OPTS = [
    { v: 'le', label: 'X <= q', n: 1 },
    { v: 'gt', label: 'X > q', n: 1 },
    { v: 'between', label: 'q1 < X <= q2', n: 2 },
    { v: 'outside', label: 'X <= q1  OR  X > q2', n: 2 },
  ];
  // In "value" mode, the probability is entered and quantile(s) are returned.
  const VALUE_OPTS = [
    { v: 'le', label: 'P(X <= q) = p' },
    { v: 'gt', label: 'P(X > q) = p' },
    { v: 'between', label: 'P(q1 < X <= q2) = p (centered)' },
    { v: 'outside', label: 'P(X <= q1 or X > q2) = p (split equally)' },
  ];

  const state = { dist: 'normal', mode: 'prob', opt: 'le', values: { q: '1', q1: '-1', q2: '1', p: '0.95' } };
  let prm = null;      // parsed params (null if invalid)
  let shade = null;    // {intervals: [[a,b],...]} for plotting

  const distEl = $('dist');
  for (const k in DISTRIBUTIONS) distEl.add(new Option(DISTRIBUTIONS[k].name, k));

  function renderParams() {
    const d = DISTRIBUTIONS[state.dist];
    $('params').innerHTML = d.params.map((p) =>
      `<label class="field">${p.label}<input type="number" inputmode="decimal" step="any" data-param="${p.key}" value="${p.def}"></label>`).join('');
    $('params').querySelectorAll('input').forEach((i) => i.addEventListener('input', update));
  }

  function renderOptions() {
    const list = state.mode === 'prob' ? PROB_OPTS : VALUE_OPTS;
    $('optLegend').textContent = state.mode === 'prob' ? 'Probability Options' : 'Value Options';
    $('options').innerHTML = list.map((o) =>
      `<label class="radio"><input type="radio" name="opt" value="${o.v}" ${o.v === state.opt ? 'checked' : ''}> ${o.label}</label>`).join('');
    $('options').querySelectorAll('input').forEach((i) => i.addEventListener('change', () => { state.opt = i.value; renderInputs(); update(); }));
    renderInputs();
  }

  function renderInputs() {
    const two = state.opt === 'between' || state.opt === 'outside';
    const f = (key, label) =>
      `<label class="field">${label}<input type="text" inputmode="decimal" data-in="${key}" value="${state.values[key]}"></label>`;
    let html;
    if (state.mode === 'prob') html = two ? f('q1', 'q1') + f('q2', 'q2') : f('q', 'Value');
    else html = f('p', 'Probability');
    $('inputs').innerHTML = html;
    $('inputs').querySelectorAll('input').forEach((i) => i.addEventListener('input', () => { state.values[i.dataset.in] = i.value; update(); }));
  }

  const fmt = (x) => Number.isFinite(x) ? String(+x.toPrecision(6)) : (x > 0 ? '∞' : '-∞');
  const fmtP = (x) => (+x.toFixed(4)).toString().replace(/^(\d)$/, '$1');
  const num = (s) => (s.trim() === '' ? NaN : Number(s));

  function readParams() {
    const d = DISTRIBUTIONS[state.dist];
    const p = {};
    $('params').querySelectorAll('input').forEach((i) => { p[i.dataset.param] = num(i.value); });
    const err = validateParams(d, p);
    return err ? { err } : { p };
  }

  function update() {
    const d = DISTRIBUTIONS[state.dist];
    $('plotTitle').textContent = d.name + ' Distribution';
    const r = readParams();
    let err = r.err || '';
    let result = '';
    shade = null;
    prm = r.p || null;
    if (prm) {
      const out = compute(d, prm);
      err = out.err || '';
      result = out.text || '';
      shade = out.shade || null;
    }
    $('error').textContent = err;
    $('result').textContent = err ? '' : result;
    draw();
  }

  // Probability of each region using P(X<=x) = cdf(x); works for discrete (cdf floors) and continuous.
  function compute(d, p) {
    const cdf = (x) => d.cdf(x, p);
    const v = state.values;
    if (state.mode === 'prob') {
      const two = state.opt === 'between' || state.opt === 'outside';
      const q = num(v.q), q1 = num(v.q1), q2 = num(v.q2);
      if (two ? !(Number.isFinite(q1) && Number.isFinite(q2)) : !Number.isFinite(q)) return { err: 'Enter a numeric value.' };
      if (two && q1 > q2) return { err: 'q1 must not exceed q2.' };
      let prob, iv;
      if (state.opt === 'le') { prob = cdf(q); iv = [[-Infinity, q]]; }
      else if (state.opt === 'gt') { prob = 1 - cdf(q); iv = [[q, Infinity]]; }
      else if (state.opt === 'between') { prob = cdf(q2) - cdf(q1); iv = [[q1, q2]]; }
      else { prob = cdf(q1) + 1 - cdf(q2); iv = [[-Infinity, q1], [q2, Infinity]]; }
      prob = Math.min(1, Math.max(0, prob));
      return { text: `Probability = ${fmtP(prob)}`, shade: iv };
    }
    const pr = num(v.p);
    if (!(pr >= 0 && pr <= 1)) return { err: 'Probability must be between 0 and 1.' };
    const Q = (x) => quantile(d, x, p);
    let text, iv;
    if (state.opt === 'le') { const q = Q(pr); text = `q = ${fmt(q)}`; iv = [[-Infinity, q]]; }
    else if (state.opt === 'gt') { const q = Q(1 - pr); text = `q = ${fmt(q)}`; iv = [[q, Infinity]]; }
    else if (state.opt === 'between') {
      const q1 = Q((1 - pr) / 2), q2 = Q((1 + pr) / 2);
      text = `q1 = ${fmt(q1)},  q2 = ${fmt(q2)}`; iv = [[q1, q2]];
    } else {
      const q1 = Q(pr / 2), q2 = Q(1 - pr / 2);
      text = `q1 = ${fmt(q1)},  q2 = ${fmt(q2)}`; iv = [[-Infinity, q1], [q2, Infinity]];
    }
    return { text, shade: iv };
  }

  // ---------- Plot ----------
  const canvas = $('chart');
  const ctx = canvas.getContext('2d');

  function niceTicks(lo, hi, n) {
    const raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
    const out = [];
    for (let t = Math.ceil(lo / step) * step; t <= hi + step * 1e-9; t += step) out.push(+t.toPrecision(12));
    return out;
  }

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!prm) return;

    const d = DISTRIBUTIONS[state.dist];
    const text = css('--text'), muted = css('--muted'), shadeC = css('--shade');
    const [slo, shi] = d.support(prm);
    let xlo = quantile(d, 0.0005, prm), xhi = quantile(d, 0.9995, prm);
    if (isFinite(slo) && !d.discrete) xlo = Math.max(slo, xlo);
    if (isFinite(shi) && !d.discrete) xhi = Math.min(shi, xhi);
    // include shaded boundaries so the region is visible
    if (shade) for (const [a, b] of shade) for (const x of [a, b]) if (isFinite(x)) {
      xlo = Math.min(xlo, x - (xhi - xlo) * 0.03); xhi = Math.max(xhi, x + (xhi - xlo) * 0.03);
    }
    if (d.discrete) { xlo = Math.max(isFinite(slo) ? slo : xlo, Math.floor(xlo)); xhi = Math.ceil(xhi); if (xhi === xlo) xhi++; }
    if (!(xhi > xlo)) { xlo -= 1; xhi += 1; }

    const m = { l: 52, r: 14, t: 12, b: 36 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const N = d.discrete ? 0 : Math.max(200, Math.round(pw));
    const step = (xhi - xlo) / N;
    const xs = [], ys = [];
    if (d.discrete) {
      for (let k = xlo; k <= xhi; k++) { xs.push(k); ys.push(d.pdf(k, prm)); }
    } else {
      for (let i = 0; i <= N; i++) { const x = xlo + i * step; xs.push(x); ys.push(d.pdf(x, prm)); }
    }
    const finite = ys.filter(Number.isFinite).sort((a, b) => a - b);
    let ymax = finite[finite.length - 1] || 1;
    if (!d.discrete) ymax = Math.min(ymax, 4 * (finite[Math.floor(finite.length * 0.9)] || ymax)); // tame singularities at 0
    ymax *= 1.08;

    const X = (x) => m.l + (x - xlo) / (xhi - xlo) * pw;
    const Y = (y) => m.t + ph - Math.min(y, ymax) / ymax * ph;

    // axes + ticks
    ctx.strokeStyle = muted; ctx.fillStyle = muted; ctx.lineWidth = 1; ctx.font = '12px system-ui, sans-serif';
    ctx.beginPath(); ctx.moveTo(m.l, m.t); ctx.lineTo(m.l, m.t + ph); ctx.lineTo(m.l + pw, m.t + ph); ctx.stroke();
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const t of niceTicks(0, ymax, 5)) {
      ctx.fillText(+t.toPrecision(3), m.l - 6, Y(t));
      ctx.beginPath(); ctx.moveTo(m.l - 3, Y(t)); ctx.lineTo(m.l, Y(t)); ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const xt = d.discrete ? niceTicks(xlo, xhi, Math.max(2, Math.floor(pw / 50))).filter(Number.isInteger) : niceTicks(xlo, xhi, Math.max(2, Math.floor(pw / 70)));
    for (const t of xt) {
      ctx.fillText(+t.toPrecision(6), X(t), m.t + ph + 6);
      ctx.beginPath(); ctx.moveTo(X(t), m.t + ph); ctx.lineTo(X(t), m.t + ph + 3); ctx.stroke();
    }
    ctx.fillStyle = text; ctx.fillText('X', m.l + pw / 2, m.t + ph + 20);
    ctx.save(); ctx.translate(12, m.t + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = 'middle'; ctx.fillText(d.discrete ? 'Probability' : 'Density', 0, 0); ctx.restore();

    const inShade = (x) => shade && shade.some(([a, b]) => x > a && x <= b);
    ctx.save();
    ctx.beginPath(); ctx.rect(m.l, m.t, pw, ph + 1); ctx.clip();

    if (d.discrete) {
      const bw = Math.max(1, Math.min(pw / (xs.length) * 0.8, 40));
      xs.forEach((x, i) => {
        ctx.fillStyle = inShade(x) ? shadeC : 'transparent';
        ctx.strokeStyle = text; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.rect(X(x) - bw / 2, Y(ys[i]), bw, m.t + ph - Y(ys[i]));
        ctx.fill(); ctx.stroke();
      });
    } else {
      // shaded regions
      ctx.fillStyle = shadeC;
      for (const [a, b] of shade || []) {
        const lo = Math.max(a, xlo), hi = Math.min(b, xhi);
        if (!(hi > lo)) continue;
        ctx.beginPath(); ctx.moveTo(X(lo), Y(0));
        const n = Math.max(2, Math.ceil((hi - lo) / step));
        for (let i = 0; i <= n; i++) { const x = lo + (hi - lo) * i / n; ctx.lineTo(X(x), Y(d.pdf(x, prm))); }
        ctx.lineTo(X(hi), Y(0)); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = text; ctx.lineWidth = 1.5; ctx.beginPath();
      let started = false;
      xs.forEach((x, i) => {
        if (!Number.isFinite(ys[i])) return;
        if (!started) { ctx.moveTo(X(x), Y(ys[i])); started = true; } else ctx.lineTo(X(x), Y(ys[i]));
      });
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- Wiring ----------
  distEl.addEventListener('change', () => { state.dist = distEl.value; renderParams(); update(); });
  $('reset').addEventListener('click', () => { renderParams(); update(); });
  document.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', () => {
    state.mode = r.value; renderOptions(); update();
  }));
  new ResizeObserver(draw).observe(canvas);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);

  renderParams(); renderOptions(); update();
})();
