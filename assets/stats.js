// Special functions and probability distributions (no dependencies).
(function (root) {
  const EPS = 1e-14;

  function lgamma(x) {
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1;
    const g = 7;
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
      1.5056327351493116e-7];
    let a = c[0];
    const t = x + g + 0.5;
    for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }

  // Regularized lower incomplete gamma P(a, x)
  function gammaP(a, x) {
    if (x <= 0) return 0;
    if (!isFinite(x)) return 1;
    const gln = lgamma(a);
    if (x < a + 1) {
      let ap = a, sum = 1 / a, del = sum;
      for (let n = 0; n < 1000; n++) {
        ap++; del *= x / ap; sum += del;
        if (Math.abs(del) < Math.abs(sum) * EPS) break;
      }
      return sum * Math.exp(-x + a * Math.log(x) - gln);
    }
    let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
    for (let i = 1; i < 1000; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d;
      const del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - gln) * h;
  }

  function betacf(a, b, x) {
    const tiny = 1e-300;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < tiny) d = tiny;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 1000; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
      c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
      c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d;
      const del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }

  // Regularized incomplete beta I_x(a, b)
  function betaI(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2)
      ? bt * betacf(a, b, x) / a
      : 1 - bt * betacf(b, a, 1 - x) / b;
  }

  const normCdf = (z) => 0.5 * (1 + (z >= 0 ? 1 : -1) * gammaP(0.5, z * z / 2));
  const lchoose = (n, k) => lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);

  // Each distribution: params, pdf (or pmf), cdf, support [lo, hi].
  const DISTRIBUTIONS = {
    normal: {
      name: 'Normal',
      params: [{ key: 'mu', label: 'Mean', def: 0 }, { key: 'sigma', label: 'Std. Dev.', def: 1, min: 0 }],
      support: () => [-Infinity, Infinity],
      pdf: (x, p) => Math.exp(-0.5 * ((x - p.mu) / p.sigma) ** 2) / (p.sigma * Math.sqrt(2 * Math.PI)),
      cdf: (x, p) => normCdf((x - p.mu) / p.sigma),
    },
    t: {
      name: "Student's t",
      params: [{ key: 'df', label: 'DF', def: 10, min: 0 }],
      support: () => [-Infinity, Infinity],
      pdf: (x, p) => Math.exp(lgamma((p.df + 1) / 2) - lgamma(p.df / 2) - 0.5 * Math.log(p.df * Math.PI)
        - (p.df + 1) / 2 * Math.log(1 + x * x / p.df)),
      cdf: (x, p) => {
        const tail = 0.5 * betaI(p.df / 2, 0.5, p.df / (p.df + x * x));
        return x > 0 ? 1 - tail : tail;
      },
    },
    chisq: {
      name: 'Chi-Square',
      params: [{ key: 'df', label: 'DF', def: 5, min: 0 }],
      support: () => [0, Infinity],
      pdf: (x, p) => x < 0 ? 0 : Math.exp((p.df / 2 - 1) * Math.log(x) - x / 2 - (p.df / 2) * Math.LN2 - lgamma(p.df / 2)),
      cdf: (x, p) => gammaP(p.df / 2, x / 2),
    },
    f: {
      name: 'F',
      params: [{ key: 'd1', label: 'Numerator DF', def: 5, min: 0 }, { key: 'd2', label: 'Denominator DF', def: 10, min: 0 }],
      support: () => [0, Infinity],
      pdf: (x, p) => {
        if (x < 0) return 0;
        const { d1, d2 } = p;
        return Math.exp(0.5 * (d1 * Math.log(d1 * x) + d2 * Math.log(d2) - (d1 + d2) * Math.log(d1 * x + d2))
          - Math.log(x) - (lgamma(d1 / 2) + lgamma(d2 / 2) - lgamma((d1 + d2) / 2)));
      },
      cdf: (x, p) => x <= 0 ? 0 : betaI(p.d1 / 2, p.d2 / 2, p.d1 * x / (p.d1 * x + p.d2)),
    },
    exponential: {
      name: 'Exponential',
      params: [{ key: 'theta', label: 'Scale (mean)', def: 1, min: 0 }],
      support: () => [0, Infinity],
      pdf: (x, p) => x < 0 ? 0 : Math.exp(-x / p.theta) / p.theta,
      cdf: (x, p) => x <= 0 ? 0 : 1 - Math.exp(-x / p.theta),
    },
    gamma: {
      name: 'Gamma',
      params: [{ key: 'alpha', label: 'Shape (α)', def: 2, min: 0 }, { key: 'theta', label: 'Scale (θ)', def: 1, min: 0 }],
      support: () => [0, Infinity],
      pdf: (x, p) => x < 0 ? 0 : Math.exp((p.alpha - 1) * Math.log(x / p.theta) - x / p.theta - lgamma(p.alpha)) / p.theta,
      cdf: (x, p) => gammaP(p.alpha, x / p.theta),
    },
    beta: {
      name: 'Beta',
      params: [{ key: 'a', label: 'Alpha', def: 2, min: 0 }, { key: 'b', label: 'Beta', def: 5, min: 0 }],
      support: () => [0, 1],
      pdf: (x, p) => (x < 0 || x > 1) ? 0
        : Math.exp((p.a - 1) * Math.log(x) + (p.b - 1) * Math.log(1 - x) + lgamma(p.a + p.b) - lgamma(p.a) - lgamma(p.b)),
      cdf: (x, p) => betaI(p.a, p.b, x),
    },
    lognormal: {
      name: 'Lognormal',
      params: [{ key: 'mu', label: 'Log-mean (μ)', def: 0 }, { key: 'sigma', label: 'Log-SD (σ)', def: 1, min: 0 }],
      support: () => [0, Infinity],
      pdf: (x, p) => x <= 0 ? 0 : Math.exp(-0.5 * ((Math.log(x) - p.mu) / p.sigma) ** 2) / (x * p.sigma * Math.sqrt(2 * Math.PI)),
      cdf: (x, p) => x <= 0 ? 0 : normCdf((Math.log(x) - p.mu) / p.sigma),
    },
    weibull: {
      name: 'Weibull',
      params: [{ key: 'k', label: 'Shape (β)', def: 2, min: 0 }, { key: 'lambda', label: 'Scale (α)', def: 1, min: 0 }],
      support: () => [0, Infinity],
      pdf: (x, p) => x < 0 ? 0 : (p.k / p.lambda) * (x / p.lambda) ** (p.k - 1) * Math.exp(-((x / p.lambda) ** p.k)),
      cdf: (x, p) => x <= 0 ? 0 : 1 - Math.exp(-((x / p.lambda) ** p.k)),
    },
    uniform: {
      name: 'Uniform',
      params: [{ key: 'a', label: 'Minimum', def: 0 }, { key: 'b', label: 'Maximum', def: 1 }],
      validate: (p) => p.b > p.a ? null : 'Maximum must be greater than minimum.',
      support: (p) => [p.a, p.b],
      pdf: (x, p) => (x < p.a || x > p.b) ? 0 : 1 / (p.b - p.a),
      cdf: (x, p) => x <= p.a ? 0 : x >= p.b ? 1 : (x - p.a) / (p.b - p.a),
    },
    binomial: {
      name: 'Binomial',
      discrete: true,
      params: [{ key: 'n', label: 'N (trials)', def: 10, min: 1, int: true }, { key: 'p', label: 'p (success prob.)', def: 0.5, min: 0, max: 1, allowZero: true }],
      support: (p) => [0, p.n],
      pdf: (k, p) => {
        if (k < 0 || k > p.n) return 0;
        if (p.p === 0) return k === 0 ? 1 : 0;
        if (p.p === 1) return k === p.n ? 1 : 0;
        return Math.exp(lchoose(p.n, k) + k * Math.log(p.p) + (p.n - k) * Math.log(1 - p.p));
      },
      cdf: (k, p) => {
        k = Math.floor(k);
        if (k < 0) return 0;
        if (k >= p.n) return 1;
        return betaI(p.n - k, k + 1, 1 - p.p);
      },
    },
    poisson: {
      name: 'Poisson',
      discrete: true,
      params: [{ key: 'lambda', label: 'Lambda (mean)', def: 4, min: 0 }],
      support: () => [0, Infinity],
      pdf: (k, p) => k < 0 ? 0 : Math.exp(k * Math.log(p.lambda) - p.lambda - lgamma(k + 1)),
      cdf: (k, p) => { k = Math.floor(k); return k < 0 ? 0 : 1 - gammaP(k + 1, p.lambda); },
    },
    geometric: {
      name: 'Geometric',
      discrete: true,
      params: [{ key: 'p', label: 'p (success prob.)', def: 0.3, min: 0, max: 1 }],
      support: () => [1, Infinity],
      pdf: (k, p) => k < 1 ? 0 : p.p * Math.pow(1 - p.p, k - 1),
      cdf: (k, p) => { k = Math.floor(k); return k < 1 ? 0 : 1 - Math.pow(1 - p.p, k); },
    },
  };

  // Validate raw parameter values; returns an error string or null.
  function validateParams(dist, p) {
    for (const d of dist.params) {
      const v = p[d.key];
      if (!Number.isFinite(v)) return `${d.label} must be a number.`;
      if (d.int && !Number.isInteger(v)) return `${d.label} must be a whole number.`;
      if (d.min !== undefined && (d.allowZero ? v < d.min : v <= d.min) && !(d.min === 0 && d.allowZero && v === 0))
        return `${d.label} must be greater than ${d.min}.`;
      if (d.max !== undefined && v > d.max) return `${d.label} must be at most ${d.max}.`;
    }
    return dist.validate ? dist.validate(p) : null;
  }

  // Quantile: continuous by bisection, discrete by smallest k with cdf(k) >= p.
  function quantile(dist, p, prm) {
    const [slo, shi] = dist.support(prm);
    if (dist.discrete) {
      if (p >= 1) return isFinite(shi) ? shi : Infinity;
      let lo = slo, hi = isFinite(shi) ? shi : Math.max(slo + 1, 1);
      while (dist.cdf(hi, prm) < p && hi < 1e9) hi = hi * 2 + 1;
      if (dist.cdf(lo, prm) >= p) return lo;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (dist.cdf(mid, prm) >= p) hi = mid; else lo = mid;
      }
      return hi;
    }
    if (p <= 0) return slo;
    if (p >= 1) return shi;
    let lo = isFinite(slo) ? slo : -1, hi = isFinite(shi) ? shi : 1;
    if (!isFinite(slo)) while (dist.cdf(lo, prm) > p && lo > -1e12) lo *= 2;
    if (!isFinite(shi)) while (dist.cdf(hi, prm) < p && hi < 1e12) hi *= 2;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (dist.cdf(mid, prm) < p) lo = mid; else hi = mid;
      if (hi - lo <= 1e-13 * Math.max(1, Math.abs(mid))) break;
    }
    return (lo + hi) / 2;
  }

  root.Stats = { DISTRIBUTIONS, validateParams, quantile, lgamma, gammaP, betaI, normCdf };
})(typeof window !== 'undefined' ? window : globalThis);
