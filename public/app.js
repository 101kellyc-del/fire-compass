(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const KEY = 'fire-compass-v1';

  const DEFAULTS = {
    age: 30, life: 90, assets: 200, save: 25000, expense: 40000, other: 0,
    ret: 6, inf: 2, wr: 4,
    retireAge: null, vol: 15, flex: 0, seed: 1,
    latte: [
      { name: '手搖飲', amt: 60, freq: 30 },
      { name: '影音串流訂閱', amt: 390, freq: 1 },
    ],
    tab: null,
  };

  const store = {
    load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
    save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 私密模式等情況忽略 */ } },
  };
  const state = Object.assign({}, DEFAULTS, store.load() || {});

  // ---------- 格式化 ----------
  const fmtMoney = (v) => {
    if (!isFinite(v)) return '–';
    const neg = v < 0 ? '-' : '';
    v = Math.abs(v);
    if (v >= 1e8) return neg + (v / 1e8).toFixed(2) + ' 億';
    if (v >= 1e4) return neg + Math.round(v / 1e4).toLocaleString() + ' 萬';
    return neg + Math.round(v).toLocaleString() + ' 元';
  };
  const fmtNT = (v) => 'NT$ ' + Math.round(v).toLocaleString();

  // ---------- 核心計算（皆為今日幣值，使用實質報酬） ----------
  const realAnnual = (s) => (1 + s.ret / 100) / (1 + s.inf / 100) - 1;
  const realMonthly = (s) => Math.pow(1 + realAnnual(s), 1 / 12) - 1;
  const netMonthlyNeed = (s) => Math.max(0, s.expense - s.other);
  const fireNumber = (s) => (netMonthlyNeed(s) * 12) / (s.wr / 100);

  // 回傳達到自由數字所需月數；60 年內達不到回傳 null
  function monthsToFI(s) {
    const target = fireNumber(s);
    const m = realMonthly(s);
    let a = s.assets * 1e4;
    for (let k = 0; k <= 720; k++) {
      if (a >= target) return k;
      a = a * (1 + m) + s.save;
    }
    return null;
  }

  // 一生資產軌跡：退休前每月存入，退休後每月提領淨支出
  function lifePath(s, retireAge) {
    const m = realMonthly(s);
    const need = netMonthlyNeed(s);
    let a = s.assets * 1e4;
    const pts = [{ age: s.age, v: a }];
    for (let age = s.age; age < s.life; age++) {
      for (let k = 0; k < 12; k++) {
        a = a * (1 + m) + (age < retireAge ? s.save : -need);
      }
      pts.push({ age: age + 1, v: Math.max(a, 0) });
    }
    return pts;
  }

  // 可重現的亂數
  function rng(seed) {
    let t = seed >>> 0;
    return () => {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normal(rand) {
    const u = 1 - rand(), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function monteCarlo(s, retireAge, runs = 1000) {
    const rand = rng(s.seed * 9973 + 17);
    const years = s.life - s.age;
    const need = netMonthlyNeed(s) * 12;
    const paths = Array.from({ length: years + 1 }, () => new Float64Array(runs));
    let ok = 0;
    const failAges = [];
    for (let r = 0; r < runs; r++) {
      let a = s.assets * 1e4;
      let failed = false;
      paths[0][r] = a;
      for (let y = 0; y < years; y++) {
        const nominal = s.ret / 100 + (s.vol / 100) * normal(rand);
        const real = (1 + nominal) / (1 + s.inf / 100) - 1;
        if (s.age + y < retireAge) {
          a = a * (1 + real) + s.save * 12 * (1 + real / 2);
        } else {
          const spend = need * (nominal < 0 ? 1 - s.flex / 100 : 1);
          a = (a - spend) * (1 + real);
        }
        if (a <= 0 && !failed) { failed = true; failAges.push(s.age + y + 1); }
        if (a < 0) a = 0;
        paths[y + 1][r] = a;
      }
      if (!failed) ok++;
    }
    const pct = (arr, p) => {
      const sorted = Array.from(arr).sort((x, y) => x - y);
      return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    };
    const bands = paths.map((col, i) => ({
      age: s.age + i,
      p5: pct(col, 0.05), p25: pct(col, 0.25), p50: pct(col, 0.5), p75: pct(col, 0.75), p95: pct(col, 0.95),
    }));
    failAges.sort((x, y) => x - y);
    return {
      rate: ok / runs,
      bands,
      endMedian: bands[bands.length - 1].p50,
      endP10: pct(paths[years], 0.1),
      earlyFail: failAges.length ? failAges[Math.floor(failAges.length * 0.1)] : null,
    };
  }

  // ---------- SVG 折線圖 ----------
  const NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }

  // opts: { xs, lines:[{values,color,dash}], bands:[{lo,hi,fill}], hlines:[{y,color,dash}], vline:{x,label}, tip(i) }
  function drawChart(host, opts) {
    host.innerHTML = '';
    const W = host.clientWidth || 600, H = host.clientHeight || 300;
    const pad = { l: 56, r: 12, t: 12, b: 28 };
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' }, host);
    const xs = opts.xs;
    let ymax = 0;
    opts.lines.forEach((l) => l.values.forEach((v) => { ymax = Math.max(ymax, v); }));
    (opts.bands || []).forEach((b) => b.hi.forEach((v) => { ymax = Math.max(ymax, v); }));
    (opts.hlines || []).forEach((h) => { ymax = Math.max(ymax, h.y); });
    ymax = niceMax(Math.min(ymax, opts.ymax || Infinity) * 1.05);
    const X = (i) => pad.l + (i / (xs.length - 1)) * (W - pad.l - pad.r);
    const Y = (v) => H - pad.b - (Math.min(v, ymax * 1.02) / ymax) * (H - pad.t - pad.b);

    for (let g = 0; g <= 4; g++) {
      const v = (ymax / 4) * g;
      el('line', { x1: pad.l, x2: W - pad.r, y1: Y(v), y2: Y(v), class: 'grid' }, svg);
      el('text', { x: pad.l - 6, y: Y(v) + 4, 'text-anchor': 'end' }, svg).textContent = fmtMoney(v).replace(' 元', '');
    }
    const step = Math.max(1, Math.ceil(xs.length / (W < 500 ? 5 : 10)));
    xs.forEach((x, i) => {
      if (i % step === 0 || i === xs.length - 1) {
        el('text', { x: X(i), y: H - 8, 'text-anchor': 'middle' }, svg).textContent = x + '歲';
      }
    });

    (opts.bands || []).forEach((b) => {
      let d = b.hi.map((v, i) => `${i ? 'L' : 'M'}${X(i)},${Y(v)}`).join('');
      for (let i = b.lo.length - 1; i >= 0; i--) d += `L${X(i)},${Y(b.lo[i])}`;
      el('path', { d: d + 'Z', fill: b.fill, stroke: 'none' }, svg);
    });
    (opts.hlines || []).forEach((h) => {
      el('line', { x1: pad.l, x2: W - pad.r, y1: Y(h.y), y2: Y(h.y), stroke: h.color, 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }, svg);
    });
    if (opts.vline) {
      const i = xs.indexOf(opts.vline.x);
      if (i >= 0) {
        el('line', { x1: X(i), x2: X(i), y1: pad.t, y2: H - pad.b, class: 'grid', 'stroke-dasharray': '3 3' }, svg);
        el('text', { x: X(i) + 4, y: pad.t + 10 }, svg).textContent = opts.vline.label;
      }
    }
    opts.lines.forEach((l) => {
      const d = l.values.map((v, i) => `${i ? 'L' : 'M'}${X(i)},${Y(v)}`).join('');
      el('path', { d, fill: 'none', stroke: l.color, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-dasharray': l.dash || '' }, svg);
    });

    const cursor = el('line', { y1: pad.t, y2: H - pad.b, stroke: 'currentColor', opacity: 0, 'stroke-width': 1 }, svg);
    const dot = el('circle', { r: 4, fill: opts.lines[0].color, opacity: 0 }, svg);
    const tip = $('#tip');
    const move = (ev) => {
      const rect = svg.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width) * W;
      const i = Math.max(0, Math.min(xs.length - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (xs.length - 1))));
      cursor.setAttribute('x1', X(i)); cursor.setAttribute('x2', X(i)); cursor.setAttribute('opacity', 0.3);
      dot.setAttribute('cx', X(i)); dot.setAttribute('cy', Y(opts.lines[0].values[i])); dot.setAttribute('opacity', 1);
      tip.innerHTML = opts.tip(i);
      tip.hidden = false;
      const tx = Math.min(ev.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
      tip.style.left = tx + 'px';
      tip.style.top = ev.clientY - tip.offsetHeight - 12 + 'px';
    };
    const leave = () => { tip.hidden = true; cursor.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerdown', move);
    svg.addEventListener('pointerleave', leave);
  }

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // ---------- 自由試算 ----------
  function plannedRetireAge() {
    const m = monthsToFI(state);
    const fiAge = m == null ? null : Math.ceil(state.age + m / 12);
    return { fiAge, retireAge: state.retireAge || fiAge || Math.max(65, state.age + 1) };
  }

  function renderFire() {
    const s = state;
    const target = fireNumber(s);
    const now = s.assets * 1e4;
    const m = monthsToFI(s);
    const { fiAge } = plannedRetireAge();

    $('#kFire').textContent = fmtMoney(target);
    $('#kFireSub').textContent = `每年提領 ${fmtMoney(netMonthlyNeed(s) * 12)}`;
    if (m === 0) {
      $('#kAge').textContent = '已達成 🎉';
      $('#kAgeSub').textContent = '你已經財務自由了';
    } else if (m == null) {
      $('#kAge').textContent = '60 年內未達';
      $('#kAgeSub').textContent = '試著提高存款或降低支出';
    } else {
      $('#kAge').textContent = `${(s.age + m / 12).toFixed(1)} 歲`;
      $('#kAgeSub').textContent = `還要 ${Math.floor(m / 12)} 年 ${m % 12} 個月`;
    }
    const prog = target > 0 ? Math.min(1, now / target) : 1;
    $('#kProg').textContent = Math.round(prog * 100) + '%';
    $('#kBar').style.width = prog * 100 + '%';

    // 里程碑
    const r = realAnnual(s);
    const coastYears = Math.max(0, 65 - s.age);
    const coast = target / Math.pow(1 + r, coastYears);
    const miles = [
      { name: '緊急預備金', desc: '6 個月生活費', v: s.expense * 6 },
      { name: '基本自由 Lean FI', desc: '生活費打 7 折也能退休', v: target * 0.7 },
      { name: 'Coast FI', desc: '從此不存錢，65 歲也會達標', v: coast },
      { name: '半自由 Barista FI', desc: '投資收入負擔一半生活費', v: target * 0.5 },
      { name: '財務自由 FI', desc: '投資收入完全負擔生活', v: target },
      { name: '寬裕自由 Fat FI', desc: '生活費多 5 成的餘裕', v: target * 1.5 },
    ].sort((a, b) => a.v - b.v);
    $('#miles').innerHTML = miles.map((x) => `
      <li class="${now >= x.v ? 'done' : ''}">
        <span class="dot"></span>
        <span>${x.name}<small>${x.desc}</small></span>
        <span class="amt">${fmtMoney(x.v)}</span>
      </li>`).join('');

    // 圖表：以預估自由年齡退休
    const retire = fiAge || s.life;
    const path = lifePath(s, retire);
    const xs = path.map((p) => p.age);
    drawChart($('#fireChart'), {
      xs,
      lines: [{ values: path.map((p) => p.v), color: css('--s1') }],
      hlines: [{ y: target, color: css('--s2') }],
      vline: fiAge && fiAge < s.life ? { x: fiAge, label: `${fiAge} 歲自由` } : null,
      tip: (i) => `<b>${xs[i]} 歲</b><br>資產 ${fmtMoney(path[i].v)}`,
    });
    const depleted = path.find((p) => p.age > retire && p.v <= 0);
    $('#fireNote').innerHTML = !fiAge
      ? '照目前設定，在預期壽命前無法達到自由數字。到「拿鐵因子」看看能從哪裡擠出空間。'
      : depleted
        ? `<span class="warn">注意：用固定報酬試算，資產會在 ${depleted.age} 歲左右用完。</span>可降低提領率或增加其他收入。`
        : `在 ${fiAge} 歲停止工作，並每月提領 ${fmtNT(netMonthlyNeed(s))}，資產可支撐到 ${s.life} 歲。到「壓力模擬」看看遇到市場起伏時的成功率。`;
  }

  // ---------- 壓力模擬 ----------
  function renderMC() {
    const s = state;
    const { fiAge, retireAge } = plannedRetireAge();
    const inp = $('input[data-k="retireAge"]');
    if (document.activeElement !== inp) inp.value = retireAge;
    $('#retireHint').textContent = fiAge ? `試算建議：${fiAge} 歲` : '試算在 60 年內未達自由數字';

    const res = monteCarlo(s, retireAge);
    const rate = Math.round(res.rate * 100);
    const cls = rate >= 85 ? 'good' : rate >= 70 ? 'warn' : 'bad';
    $('#mRate').innerHTML = `<span class="${cls}">${rate}%</span>`;
    $('#mVerdict').textContent = rate >= 85 ? '穩健' : rate >= 70 ? '需要保留彈性' : '風險偏高';
    $('#mMed').textContent = fmtMoney(res.endMedian);
    $('#mWorst').textContent = res.earlyFail ? `${res.earlyFail} 歲歸零` : fmtMoney(res.endP10);
    $('#mWorstSub').textContent = res.earlyFail ? '最早一成失敗情境' : '壽終時仍有資產';

    let advice;
    if (rate >= 85) {
      advice = `在 ${retireAge} 歲退休，1,000 次模擬中有 ${rate * 10} 次資產撐到 ${s.life} 歲。你甚至可以試試提早一兩年，看成功率掉多少。`;
    } else if (rate >= 70) {
      advice = `成功率 ${rate}%：多數情況沒問題，但退休初期若遇到空頭會很吃力。試試把「壞年少花」設成 10–20%，通常能明顯拉高成功率。`;
    } else {
      advice = `成功率只有 ${rate}%。可以：① 退休年齡往後延 2–3 年；② 把提領率降到 3.5%（回「自由試算」調整）；③ 增加退休後其他收入，例如兼職。`;
    }
    $('#mAdvice').textContent = advice;

    const b = res.bands;
    drawChart($('#mcChart'), {
      xs: b.map((x) => x.age),
      bands: [
        { lo: b.map((x) => x.p5), hi: b.map((x) => x.p95), fill: css('--band') },
        { lo: b.map((x) => x.p25), hi: b.map((x) => x.p75), fill: css('--band2') },
      ],
      lines: [{ values: b.map((x) => x.p50), color: css('--s1') }],
      // 樂觀情境會無限放大，縱軸以 75 百分位為準，避免中位數被壓扁
      ymax: Math.max(...b.map((x) => x.p75)) * 1.4,
      vline: retireAge < s.life ? { x: retireAge, label: '退休' } : null,
      tip: (i) => `<b>${b[i].age} 歲</b><br>樂觀 95%：${fmtMoney(b[i].p95)}<br>中位數：${fmtMoney(b[i].p50)}<br>悲觀 5%：${fmtMoney(b[i].p5)}`,
    });
  }

  // ---------- 拿鐵因子 ----------
  function renderLatte() {
    const s = state;
    const base = monthsToFI(s);
    const m = realMonthly(s);
    const fv30 = (pmt) => (m === 0 ? pmt * 360 : pmt * (Math.pow(1 + m, 360) - 1) / m);
    const delayOf = (monthly) => {
      const cut = monthsToFI({ ...s, save: s.save + monthly, expense: Math.max(0, s.expense - monthly) });
      if (base == null || cut == null) return null;
      return base - cut;
    };
    const fmtDelay = (d) => d == null ? '–' : d <= 0 ? '幾乎無影響' : d >= 12 ? `${Math.floor(d / 12)} 年 ${d % 12} 個月` : `${d} 個月`;

    const rows = s.latte.map((it, idx) => {
      const monthly = it.amt * it.freq;
      return `<tr>
        <td>${escapeHTML(it.name)}</td>
        <td>${fmtNT(monthly)}</td>
        <td>${fmtMoney(fv30(monthly))}</td>
        <td>${fmtMoney((monthly * 12) / (s.wr / 100))}</td>
        <td class="delay">${fmtDelay(delayOf(monthly))}</td>
        <td><button class="del" data-del="${idx}" aria-label="刪除">×</button></td>
      </tr>`;
    });
    $('#latteBody').innerHTML = rows.join('') ||
      '<tr><td colspan="6" style="text-align:center;color:var(--muted)">還沒有項目，從上面加入第一筆</td></tr>';

    const total = s.latte.reduce((t, it) => t + it.amt * it.freq, 0);
    const d = delayOf(total);
    $('#latteSum').innerHTML = !s.latte.length
      ? '<p class="muted" style="margin:0">加入幾個固定花費，看看它們加起來讓你晚多久自由。</p>'
      : `<h3>合計每月 ${fmtNT(total)}</h3>
         <p style="margin:0">這些花費 30 年的機會成本約 <b>${fmtMoney(fv30(total))}</b>。
         ${d && d > 0 ? `若全部省下，自由年齡可提早 <b>${fmtDelay(d)}</b>。` : base == null ? '目前設定下尚未能達到自由數字，先回「自由試算」調整。' : ''}
         問問自己：哪一項值得，哪一項只是習慣？</p>`;
  }

  function escapeHTML(t) {
    return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- 介面 ----------
  function renderActive() {
    store.save(state);
    if (state.tab === 'fire') renderFire();
    if (state.tab === 'mc') renderMC();
    if (state.tab === 'latte') renderLatte();
  }

  function showTab(name) {
    state.tab = name;
    $$('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    $$('.panel').forEach((p) => { p.hidden = p.id !== 'tab-' + name; });
    renderActive();
    window.scrollTo({ top: 0 });
  }

  function bindInputs() {
    $$('input[data-k]').forEach((inp) => {
      const k = inp.dataset.k;
      if (k !== 'retireAge') inp.value = state[k];
      inp.addEventListener('input', () => {
        const v = parseFloat(inp.value);
        if (k === 'retireAge') {
          state.retireAge = isFinite(v) && v > state.age && v <= state.life ? v : null;
        } else if (isFinite(v)) {
          state[k] = v;
          if (k === 'age' || k === 'life') state.retireAge = null;
        } else return;
        renderActive();
      });
    });
  }

  $$('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $$('[data-goto]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.goto)));

  $('#resetBtn').addEventListener('click', () => {
    const { latte, tab } = state;
    Object.assign(state, DEFAULTS, { latte, tab });
    bindInputs();
    renderActive();
  });
  $('#rerunBtn').addEventListener('click', () => { state.seed++; renderActive(); });

  $('#latteForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const amt = parseFloat(f.amt.value);
    if (!f.name.value.trim() || !(amt > 0)) return;
    state.latte.push({ name: f.name.value.trim(), amt, freq: parseFloat(f.freq.value) });
    f.reset();
    renderActive();
  });
  $('#latteBody').addEventListener('click', (e) => {
    const i = e.target.dataset.del;
    if (i != null) { state.latte.splice(+i, 1); renderActive(); }
  });

  // 深淺色切換
  const root = document.documentElement;
  try { const t = localStorage.getItem(KEY + '-theme'); if (t) root.dataset.theme = t; } catch { /* 忽略 */ }
  $('#themeBtn').addEventListener('click', () => {
    const dark = root.dataset.theme
      ? root.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem(KEY + '-theme', root.dataset.theme); } catch { /* 忽略 */ }
    renderActive();
  });

  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderActive, 150); });

  bindInputs();
  showTab(state.tab || 'guide');
})();
