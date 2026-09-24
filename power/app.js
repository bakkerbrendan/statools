(function () {
  const { TESTS, validateInputs, solveN } = Power;
  const $ = (id) => document.getElementById(id);
  const num = (s) => (s.trim() === '' ? NaN : Number(s));

  const state = { test: 't2', solve: 'power', n: '64', target: '0.8', emode: 'd', vals: {} };

  // Effect-size formulas (LaTeX). Tests with `diff` can also take a raw difference and SD.
  const EFFECT = {
    t1: { tex: String.raw`d = \dfrac{\mu_{\text{diff}}}{\sigma}`, plain: 'd = mean difference / σ', diffLabel: 'Mean difference',
      note: 'For a paired test, the mean difference and SD of the paired differences. For a one-sample test, the sample mean minus the null value (μ − μ₀) and the SD of the values.', diff: true },
    t2: { tex: String.raw`d = \dfrac{\mu_1 - \mu_2}{\sigma}`, plain: 'd = (μ₁ − μ₂) / σ', diffLabel: 'Difference in means (μ₁ − μ₂)',
      note: 'σ is the common (pooled) standard deviation of the two groups.', diff: true },
    anova: { tex: String.raw`f = \dfrac{\sigma_m}{\sigma}`, plain: 'f = σ_m / σ',
      note: 'σ_m is the standard deviation of the group means; σ is the common within-group SD.' },
  };
  let model = null; // { test, p, alpha, two, n } once inputs are valid

  const testEl = $('test');
  for (const k in TESTS) testEl.add(new Option(TESTS[k].name, k));

  function renderInputs() {
    const t = TESTS[state.test], eff = EFFECT[state.test];
    const val = (k, def) => (state.vals[k] !== undefined ? state.vals[k] : def);
    const field = (label, attrs) =>
      `<label class="field">${label}<input type="number" inputmode="decimal" step="any" ${attrs}></label>`;
    const dField = (d) => field(d.label, `data-param="${d.key}" value="${val(d.key, d.def)}"`);
    let html = '';
    if (eff && eff.diff) {
      const r = (v, label) => `<label class="radio"><input type="radio" name="emode" value="${v}" ${state.emode === v ? 'checked' : ''}> ${label}</label>`;
      html += `<div class="modes" role="radiogroup" aria-label="Effect size input">${r('d', "Enter Cohen's d")}${r('diff', 'Enter difference and SD')}</div>`;
      html += state.emode === 'd'
        ? t.inputs.map(dField).join('')
        : field(eff.diffLabel, `data-param="diff" value="${val('diff', 5)}"`) +
          field('Standard deviation (σ)', `data-param="sd" value="${val('sd', 10)}"`);
    } else html += t.inputs.map(dField).join('');
    html += state.solve === 'power'
      ? field(t.nLabel, `data-n value="${state.n}"`)
      : field('Target power', `data-target value="${state.target}"`);
    $('inputs').innerHTML = html;
    $('inputs').querySelectorAll('input[type=number]').forEach((i) => i.addEventListener('input', () => {
      if (i.hasAttribute('data-n')) state.n = i.value;
      else if (i.hasAttribute('data-target')) state.target = i.value;
      else state.vals[i.dataset.param] = i.value;
      update();
    }));
    $('inputs').querySelectorAll('input[name=emode]').forEach((i) => i.addEventListener('change', () => {
      state.emode = i.value; renderInputs(); update();
    }));
    $('tailsRow').hidden = !t.oneSided;
    $('effectBox').hidden = !eff;
    $('formulaNote').textContent = eff ? eff.note : '';
  }

  // Draw the effect size formula, with the entered numbers substituted in difference mode.
  function renderFormula(sub) {
    const eff = EFFECT[state.test];
    if (!eff) return;
    let tex = eff.tex, plain = eff.plain;
    if (sub) {
      tex += String.raw` = \dfrac{${sub.diff}}{${sub.sd}}` + ` = ${sub.d}`;
      plain += ` = ${sub.diff} / ${sub.sd} = ${sub.d}`;
    }
    const el = $('formula');
    if (window.katex) window.katex.render(tex, el, { displayMode: true, throwOnError: false });
    else el.textContent = plain;
  }

  const pct = (x) => (100 * x).toFixed(1) + '%';
  const pctA = (x) => +(100 * x).toPrecision(3) + '%'; // keeps tiny α values readable
  const total = (t, p, n) => (t.groups === 2 ? 2 * n : t.groups === 'k' ? p.k * n : n);

  function update() {
    const t = TESTS[state.test];
    const p = {};
    $('inputs').querySelectorAll('[data-param]').forEach((i) => { p[i.dataset.param] = num(i.value); });
    let sub = null, effErr = null;
    if (EFFECT[state.test] && EFFECT[state.test].diff &&state.emode === 'diff') {
      if (!Number.isFinite(p.diff) || !Number.isFinite(p.sd)) effErr = 'Difference and standard deviation must be numbers.';
      else if (!(p.sd > 0)) effErr = 'Standard deviation must be greater than zero.';
      else {
        p.d = p.diff / p.sd;
        sub = { diff: +p.diff.toPrecision(6), sd: +p.sd.toPrecision(6), d: +p.d.toPrecision(4) };
      }
    }
    renderFormula(sub);
    const alpha = num($('alpha').value);
    const two = !t.oneSided || $('tails').value === 'two';
    model = null;
    let err = effErr || validateInputs(t, p, alpha), result = '', detail = '';

    if (!err && state.solve === 'power') {
      const n = num(state.n);
      if (!Number.isInteger(n) || n < t.minN) err = `${t.nLabel} must be a whole number of at least ${t.minN}.`;
      else {
        const pw = t.power(n, p, alpha, two);
        model = { t, p, alpha, two, n };
        result = `Power = ${pct(pw)}`;
        detail = `Probability of detecting this effect at α = ${alpha}. Total N = ${total(t, p, n)}.`;
      }
    } else if (!err) {
      const target = num(state.target);
      if (!(target > 0 && target < 1)) err = 'Target power must be between 0 and 1.';
      else {
        const n = solveN(t, p, alpha, two, target);
        if (n === null) err = two
          ? 'This effect is too small to reach the target power at any practical sample size.'
          : 'Target power is unreachable. The effect may be too small, or it points the opposite way from the one-sided alternative.';
        else {
          model = { t, p, alpha, two, n, target };
          result = `${t.nLabel} = ${n}`;
          detail = `Achieved power = ${pct(t.power(n, p, alpha, two))}. Total N = ${total(t, p, n)}.`;
        }
      }
    }
    $('error').textContent = err || '';
    $('result').textContent = err ? '' : result;
    $('detail').textContent = err ? '' : detail;
    $('legend').hidden = !model;
    if (model) {
      const pw = model.t.power(model.n, model.p, model.alpha, model.two);
      $('lgA').textContent = `Type I error (α) = ${pctA(model.alpha)}: rejecting H0 when it is true`;
      $('lgB').textContent = `Type II error (β) = ${pct(1 - pw)}: missing a real effect`;
      $('lgP').textContent = `Power (1 − β) = ${pct(pw)}`;
    }
    draw();
  }

  // ---------- Plot: power vs. sample size ----------
  const canvas = $('chart');
  const ctx = canvas.getContext('2d');
  const dCanvas = $('distChart');
  const dctx = dCanvas.getContext('2d');
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function niceStep(range, n) {
    const raw = range / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    return ([1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)) || raw;
  }

  function draw() { drawCurve(); drawDist(); }

  // ---------- Plot: null vs. alternative distribution ----------
  function drawDist() {
    const dpr = window.devicePixelRatio || 1;
    const W = dCanvas.clientWidth, H = dCanvas.clientHeight;
    if (!W || !H) return;
    dCanvas.width = Math.round(W * dpr); dCanvas.height = Math.round(H * dpr);
    const c = dctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    if (!model) return;

    const { t, p, alpha, two, n } = model;
    const cv = t.curves(n, p, alpha, two);
    const text = css('--text'), muted = css('--muted');
    const cA = css('--c-alpha'), cB = css('--c-beta'), cP = css('--c-power');
    const m = { l: 14, r: 14, t: 24, b: 40 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const N = Math.max(200, Math.round(pw));
    const xs = [], y0 = [], y1 = [];
    for (let i = 0; i <= N; i++) {
      const x = cv.xlo + (cv.xhi - cv.xlo) * i / N;
      xs.push(x); y0.push(cv.nullPdf(x)); y1.push(cv.altPdf(x));
    }
    const all = y0.concat(y1).filter(Number.isFinite).sort((a, b) => a - b);
    const ymax = Math.min(all[all.length - 1], 4 * all[Math.floor(all.length * 0.9)]) * 1.1 || 1;
    const X = (x) => m.l + (x - cv.xlo) / (cv.xhi - cv.xlo) * pw;
    const Y = (y) => m.t + ph - Math.min(y, ymax) / ymax * ph;
    const inRegion = (x) => cv.region.some(([a, b]) => x >= a && x <= b);

    // fill under a curve wherever pick(x) is true
    const fill = (ys, pick, color, alphaV) => {
      c.fillStyle = color; c.globalAlpha = alphaV;
      let i = 0;
      while (i <= N) {
        if (!pick(xs[i])) { i++; continue; }
        let j = i; while (j + 1 <= N && pick(xs[j + 1])) j++;
        c.beginPath(); c.moveTo(X(xs[i]), Y(0));
        for (let k = i; k <= j; k++) c.lineTo(X(xs[k]), Y(ys[k]));
        c.lineTo(X(xs[j]), Y(0)); c.closePath(); c.fill();
        i = j + 1;
      }
      c.globalAlpha = 1;
    };
    c.save(); c.beginPath(); c.rect(m.l, m.t - 4, pw, ph + 5); c.clip();
    fill(y1, inRegion, cP, 0.30);                      // power
    fill(y1, (x) => !inRegion(x), cB, 0.60);           // beta
    fill(y0, inRegion, cA, 0.75);                      // alpha
    for (const [ys, col, dash] of [[y0, muted, [5, 4]], [y1, text, []]]) {
      c.strokeStyle = col; c.lineWidth = 1.75; c.setLineDash(dash); c.beginPath();
      xs.forEach((x, i) => { if (i === 0) c.moveTo(X(x), Y(ys[i])); else c.lineTo(X(x), Y(ys[i])); });
      c.stroke();
    }
    c.setLineDash([]);
    c.restore();

    // axis, critical value(s), labels
    c.strokeStyle = muted; c.fillStyle = muted; c.lineWidth = 1; c.font = '12px system-ui, sans-serif';
    c.beginPath(); c.moveTo(m.l, m.t + ph); c.lineTo(m.l + pw, m.t + ph); c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'top';
    const step = niceStep(cv.xhi - cv.xlo, Math.max(2, Math.floor(pw / 70)));
    for (let v = Math.ceil(cv.xlo / step) * step; v <= cv.xhi; v += step) {
      c.fillText(+v.toPrecision(6), X(v), m.t + ph + 6);
      c.beginPath(); c.moveTo(X(v), m.t + ph); c.lineTo(X(v), m.t + ph + 3); c.stroke();
    }
    c.fillStyle = text; c.fillText(cv.xlab, m.l + pw / 2, m.t + ph + 22);
    c.strokeStyle = text; c.setLineDash([3, 3]); c.textBaseline = 'bottom';
    for (const x of cv.crit) {
      c.beginPath(); c.moveTo(X(x), m.t); c.lineTo(X(x), m.t + ph); c.stroke();
      c.fillText('critical ' + (+x.toPrecision(4)), X(x), m.t - 4);
    }
    c.setLineDash([]);
    c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillStyle = muted; c.fillText('- - - if H0 is true', m.l + 4, m.t + 16);
    c.fillStyle = text; c.fillText('—— if H1 is true', m.l + 4, m.t + 32);
  }

  function drawCurve() {
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!model) return;

    const { t, p, alpha, two, n } = model;
    const text = css('--text'), muted = css('--muted'), accent = css('--accent');
    // x-range: enough to show the curve reaching high power, and the chosen n
    const reach = solveN(t, p, alpha, two, 0.99);
    const nmax = Math.max(Math.ceil(Math.max(n * 1.5, (reach || n) * 1.1)), t.minN + 4);
    const nmin = t.minN;
    const m = { l: 48, r: 14, t: 12, b: 40 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const X = (v) => m.l + (v - nmin) / (nmax - nmin) * pw;
    const Y = (v) => m.t + ph - v * ph;

    ctx.strokeStyle = muted; ctx.fillStyle = muted; ctx.lineWidth = 1; ctx.font = '12px system-ui, sans-serif';
    ctx.beginPath(); ctx.moveTo(m.l, m.t); ctx.lineTo(m.l, m.t + ph); ctx.lineTo(m.l + pw, m.t + ph); ctx.stroke();
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let v = 0; v <= 1.0001; v += 0.2) {
      ctx.fillText(v.toFixed(1), m.l - 6, Y(v));
      ctx.save(); ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(m.l, Y(v)); ctx.lineTo(m.l + pw, Y(v)); ctx.stroke(); ctx.restore();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const step = niceStep(nmax - nmin, Math.max(2, Math.floor(pw / 70)));
    for (let v = Math.ceil(nmin / step) * step; v <= nmax; v += step) {
      ctx.fillText(v, X(v), m.t + ph + 6);
      ctx.beginPath(); ctx.moveTo(X(v), m.t + ph); ctx.lineTo(X(v), m.t + ph + 3); ctx.stroke();
    }
    ctx.fillStyle = text; ctx.fillText(t.nLabel, m.l + pw / 2, m.t + ph + 22);
    ctx.save(); ctx.translate(12, m.t + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = 'middle'; ctx.fillText('Power', 0, 0); ctx.restore();

    // curve, sampled at integer n
    const pts = Math.min(nmax - nmin, 60);
    ctx.save(); ctx.beginPath(); ctx.rect(m.l, m.t, pw, ph + 1); ctx.clip();
    ctx.strokeStyle = text; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i <= pts; i++) {
      const v = Math.round(nmin + (nmax - nmin) * i / pts);
      const x = X(v), y = Y(t.power(v, p, alpha, two));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // marker for the current / solved n, with a guide to its power
    const py = Y(t.power(n, p, alpha, two));
    ctx.strokeStyle = accent; ctx.fillStyle = accent; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(X(n), m.t + ph); ctx.lineTo(X(n), py); ctx.lineTo(m.l, py); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(X(n), py, 4, 0, 2 * Math.PI); ctx.fill();
    ctx.restore();
  }

  // ---------- Wiring ----------
  testEl.addEventListener('change', () => { state.test = testEl.value; renderInputs(); update(); });
  $('solve').addEventListener('change', () => { state.solve = $('solve').value; renderInputs(); update(); });
  $('alpha').addEventListener('input', update);
  $('tails').addEventListener('change', update);
  new ResizeObserver(draw).observe(canvas);
  new ResizeObserver(draw).observe(dCanvas);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);

  renderInputs(); update();
  // KaTeX loads deferred and may arrive after the first render; redraw the formula once ready.
  window.addEventListener('load', () => update());
})();
