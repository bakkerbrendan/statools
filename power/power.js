// Statistical power calculations (depends on assets/stats.js).
(function (root) {
  const { DISTRIBUTIONS, quantile, betaI, lgamma, normCdf } = root.Stats;
  const normQ = (p) => quantile(DISTRIBUTIONS.normal, p, { mu: 0, sigma: 1 });
  const tQ = (p, df) => quantile(DISTRIBUTIONS.t, p, { df });
  const chiPdf = (v, df) => DISTRIBUTIONS.chisq.pdf(v, { df });

  // Noncentral t CDF: P(T <= t) = ∫ Φ(t·√(v/df) − δ) f_chi2(v) dv, integrated in x = √v
  // with Simpson's rule (the substitution keeps the integrand smooth even for df = 1).
  function ntCdf(t, df, delta) {
    const chi = { df };
    const xlo = Math.sqrt(quantile(DISTRIBUTIONS.chisq, 1e-12, chi));
    const xhi = Math.sqrt(quantile(DISTRIBUTIONS.chisq, 1 - 1e-12, chi));
    const N = 600, h = (xhi - xlo) / N, s = t / Math.sqrt(df);
    const g = (x) => normCdf(s * x - delta) * chiPdf(x * x, df) * 2 * x;
    let sum = g(xlo) + g(xhi);
    for (let i = 1; i < N; i++) sum += g(xlo + i * h) * (i % 2 ? 4 : 2);
    return Math.min(1, Math.max(0, sum * h / 3));
  }

  function tPower(df, delta, alpha, two) {
    if (two) {
      const c = tQ(1 - alpha / 2, df);
      return Math.min(1, Math.max(0, 1 - ntCdf(c, df, delta) + ntCdf(-c, df, delta)));
    }
    return Math.max(0, 1 - ntCdf(tQ(1 - alpha, df), df, delta));
  }

  // Power of a z-type test whose standardized shift is `shift` (in SE units).
  function zPower(shift, zc, two) {
    return two ? normCdf(shift - zc) + normCdf(-shift - zc) : normCdf(shift - zc);
  }

  // Noncentral F power via the Poisson mixture of incomplete betas.
  function fPower(d1, d2, lambda, alpha) {
    const Fc = quantile(DISTRIBUTIONS.f, 1 - alpha, { d1, d2 });
    const x = d1 * Fc / (d1 * Fc + d2), half = lambda / 2;
    const j0 = Math.floor(half), spread = 12 * Math.sqrt(half + 1) + 30;
    let cdf = 0;
    for (let j = Math.max(0, Math.floor(j0 - spread)); j <= j0 + spread; j++) {
      const w = half === 0 ? (j === 0 ? 1 : 0) : Math.exp(j * Math.log(half) - half - lgamma(j + 1));
      cdf += w * betaI(d1 / 2 + j, d2 / 2, x);
    }
    return Math.min(1, Math.max(0, 1 - cdf));
  }

  const clampP = (x) => Math.min(1, Math.max(0, x));

  // ---- Curves for the null/alternative picture ----
  // Each returns { xlab, nullPdf, altPdf, region: [[a,b],...] (rejection region), crit: [..], xlo, xhi }.
  const normPdf = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));

  // Noncentral t pdf: f(t) = ∫ φ(t·x/√df − δ)(x/√df)·2x·f_chi2(x²) dx, weights precomputed once.
  function ntPdfFn(df, delta) {
    const chi = { df };
    const xlo = Math.sqrt(quantile(DISTRIBUTIONS.chisq, 1e-12, chi));
    const xhi = Math.sqrt(quantile(DISTRIBUTIONS.chisq, 1 - 1e-12, chi));
    const N = 300, h = (xhi - xlo) / N, xs = [], ws = [];
    for (let i = 0; i <= N; i++) {
      const x = xlo + i * h, c = i === 0 || i === N ? 1 : i % 2 ? 4 : 2;
      xs.push(x); ws.push(c * h / 3 * chiPdf(x * x, df) * 2 * x);
    }
    const sd = Math.sqrt(df);
    return (t) => {
      let s = 0;
      for (let i = 0; i <= N; i++) s += ws[i] * Math.exp(-0.5 * (t * xs[i] / sd - delta) ** 2) * xs[i] / sd;
      return s / Math.sqrt(2 * Math.PI);
    };
  }

  function tCurves(df, delta, alpha, two) {
    const c = tQ(two ? 1 - alpha / 2 : 1 - alpha, df);
    const lim = Math.max(c, 3) + 1;
    return {
      xlab: 't statistic',
      nullPdf: (x) => DISTRIBUTIONS.t.pdf(x, { df }), altPdf: ntPdfFn(df, delta),
      region: two ? [[-Infinity, -c], [c, Infinity]] : [[c, Infinity]], crit: two ? [-c, c] : [c],
      xlo: Math.min(-lim, delta - 5), xhi: Math.max(lim, delta + 5),
    };
  }

  function zCurves(mean, sd, alpha, two) {
    const c = normQ(two ? 1 - alpha / 2 : 1 - alpha);
    return {
      xlab: 'z statistic',
      nullPdf: (x) => normPdf(x, 0, 1), altPdf: (x) => normPdf(x, mean, sd),
      region: two ? [[-Infinity, -c], [c, Infinity]] : [[c, Infinity]], crit: two ? [-c, c] : [c],
      xlo: Math.min(-4, -c - 1, mean - 4 * sd), xhi: Math.max(4, c + 1, mean + 4 * sd),
    };
  }

  function fCurves(d1, d2, lambda, alpha) {
    const c = quantile(DISTRIBUTIONS.f, 1 - alpha, { d1, d2 }), half = lambda / 2;
    const J = Math.ceil(half + 12 * Math.sqrt(half + 1) + 30);
    const ws = [];
    for (let j = 0; j <= J; j++) ws.push(half === 0 ? (j === 0 ? 1 : 0) : Math.exp(j * Math.log(half) - half - lgamma(j + 1)));
    const altPdf = (x) => {
      let s = 0;
      for (let j = 0; j <= J; j++) {
        if (ws[j] < 1e-14) continue;
        const a = d1 + 2 * j;
        s += ws[j] * (d1 / a) * DISTRIBUTIONS.f.pdf(d1 * x / a, { d1: a, d2 });
      }
      return s;
    };
    const mean = (d2 > 2 ? d2 / (d2 - 2) : 1) * (1 + lambda / d1);
    return {
      xlab: 'F statistic',
      nullPdf: (x) => DISTRIBUTIONS.f.pdf(x, { d1, d2 }), altPdf,
      region: [[c, Infinity]], crit: [c],
      xlo: 0, xhi: Math.max(quantile(DISTRIBUTIONS.f, 0.999, { d1, d2 }), c * 1.3, mean * 3.5),
    };
  }

  // Each test: inputs, minimum n, and power(n, params, alpha, two) with n = per-group size.
  const TESTS = {
    t1: {
      name: 'One-sample or paired t-test',
      nLabel: 'Sample size (n)',
      inputs: [{ key: 'd', label: "Effect size (Cohen's d)", def: 0.5 }],
      minN: 2, oneSided: true,
      validate: (p) => (p.d === 0 ? 'Effect size must not be zero.' : null),
      power: (n, p, a, two) => tPower(n - 1, p.d * Math.sqrt(n), a, two),
      curves: (n, p, a, two) => tCurves(n - 1, p.d * Math.sqrt(n), a, two),
    },
    t2: {
      name: 'Two-sample t-test (equal variances)',
      nLabel: 'Sample size per group',
      inputs: [{ key: 'd', label: "Effect size (Cohen's d)", def: 0.5 }],
      minN: 2, oneSided: true, groups: 2,
      validate: (p) => (p.d === 0 ? 'Effect size must not be zero.' : null),
      power: (n, p, a, two) => tPower(2 * n - 2, p.d * Math.sqrt(n / 2), a, two),
      curves: (n, p, a, two) => tCurves(2 * n - 2, p.d * Math.sqrt(n / 2), a, two),
    },
    prop2: {
      name: 'Two proportions (z-test)',
      nLabel: 'Sample size per group',
      inputs: [{ key: 'p1', label: 'Proportion, group 1', def: 0.5, min: 0, max: 1 },
        { key: 'p2', label: 'Proportion, group 2', def: 0.65, min: 0, max: 1 }],
      minN: 2, oneSided: true, groups: 2,
      validate: (p) => (p.p1 === p.p2 ? 'The two proportions must differ.'
        : (p.p1 + p.p2 === 1 && Math.abs(p.p1 - p.p2) === 1 ? 'Proportions of exactly 0 and 1 are perfectly separable; choose values strictly between.' : null)),
      // Test statistic is standardized by the null SE; under H1 it is Normal(mean, sd).
      shift: (n, p) => {
        const pb = (p.p1 + p.p2) / 2, se0 = Math.sqrt(2 * pb * (1 - pb));
        const se1 = Math.sqrt(p.p1 * (1 - p.p1) + p.p2 * (1 - p.p2));
        return { mean: (p.p2 - p.p1) * Math.sqrt(n) / se0, sd: se1 / se0 };
      },
      power: (n, p, a, two) => {
        const { mean, sd } = TESTS.prop2.shift(n, p), zc = normQ(two ? 1 - a / 2 : 1 - a);
        if (!(sd > 0)) return 1;
        return clampP(two ? normCdf((mean - zc) / sd) + normCdf((-mean - zc) / sd) : normCdf((mean - zc) / sd));
      },
      curves: (n, p, a, two) => { const { mean, sd } = TESTS.prop2.shift(n, p); return zCurves(mean, sd, a, two); },
    },
    corr: {
      name: 'Correlation (Fisher z)',
      nLabel: 'Sample size',
      inputs: [{ key: 'r', label: 'Correlation (r)', def: 0.3, min: -1, max: 1, open: true }],
      minN: 4, oneSided: true,
      validate: (p) => (p.r === 0 ? 'Correlation must not be zero.' : null),
      power: (n, p, a, two) => zPower(Math.atanh(p.r) * Math.sqrt(n - 3), normQ(two ? 1 - a / 2 : 1 - a), two),
      curves: (n, p, a, two) => zCurves(Math.atanh(p.r) * Math.sqrt(n - 3), 1, a, two),
    },
    anova: {
      name: 'One-way ANOVA (fixed effects)',
      nLabel: 'Sample size per group',
      inputs: [{ key: 'f', label: "Effect size (Cohen's f)", def: 0.25, min: 0 },
        { key: 'k', label: 'Number of groups', def: 4, int: true, min: 2 }],
      minN: 2, oneSided: false, groups: 'k',
      validate: (p) => (p.f === 0 ? 'Effect size must be greater than zero.' : null),
      power: (n, p, a) => fPower(p.k - 1, p.k * n - p.k, p.f * p.f * p.k * n, a),
      curves: (n, p, a) => fCurves(p.k - 1, p.k * n - p.k, p.f * p.f * p.k * n, a),
    },
  };

  function validateInputs(test, p, alpha) {
    for (const d of test.inputs) {
      const v = p[d.key];
      if (!Number.isFinite(v)) return `${d.label} must be a number.`;
      if (d.int && !Number.isInteger(v)) return `${d.label} must be a whole number.`;
      if (d.open) {
        if (d.min !== undefined && d.max !== undefined && (v <= d.min || v >= d.max)) return `${d.label} must be strictly between ${d.min} and ${d.max}.`;
      } else {
        if (d.min !== undefined && v < d.min) return `${d.label} must be at least ${d.min}.`;
        if (d.max !== undefined && v > d.max) return `${d.label} must be at most ${d.max}.`;
      }
    }
    if (!(alpha > 0 && alpha < 1)) return 'Significance level must be between 0 and 1.';
    return test.validate ? test.validate(p) : null;
  }

  // Smallest per-group n reaching the target power, or null if none up to a cap.
  function solveN(test, p, alpha, two, target) {
    const pw = (n) => test.power(n, p, alpha, two);
    let lo = test.minN;
    if (pw(lo) >= target) return lo;
    let hi = lo * 2;
    while (pw(hi) < target) { lo = hi; hi *= 2; if (hi > 1e7) return null; }
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (pw(mid) >= target) hi = mid; else lo = mid;
    }
    return hi;
  }

  root.Power = { TESTS, validateInputs, solveN, tPower, fPower, ntCdf };
})(typeof window !== 'undefined' ? window : globalThis);
