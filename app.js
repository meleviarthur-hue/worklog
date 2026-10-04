/* ===== 工时 · 日历版 ===== */
'use strict';

const LS_KEY = 'worklog.v2';
const $ = id => document.getElementById(id);

const DEFAULTS = {
  settings: {
    dayStart: '08:00', dayEnd: '20:00', dayBreak: 0,
    nightStart: '20:00', nightEnd: '08:00', nightBreak: 0,
    dayRate: 20, nightRate: 25,
    payType: 'formal',                        // formal 正式工 / hourly 小时工
    otAfter: 8,
    otWorkday: 1.5,                           // 工作日加班倍率
    otWeekend: 2,                             // 周末加班倍率
    overrides: {}                             // { '2026-10-01': 3 } 手动覆盖倍率
  },
  adjustments: [
    { id: 'd_si',   name: '社保', mode: 'fixed',   value: 300, sign: '-', enabled: true },
    { id: 'd_tax',  name: '个税', mode: 'percent', value: 3,   sign: '-', enabled: true }
  ],
  shifts: []
};

let state = load();
let viewMonth = ym(new Date());     // '2026-10'
let selDate = todayStr();           // 选中日期 / 某日视图
let editingId = null;
let formType = 'day';

/* ---------- 存储 ---------- */
function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return clone(DEFAULTS);
    const s = JSON.parse(raw);
    const st = Object.assign({}, DEFAULTS.settings, s.settings || {});
    // 老数据迁移：旧的单一 otRate → 新的三档倍率
    if (s.settings && s.settings.otRate != null && s.settings.otWorkday == null) {
      st.otWorkday = s.settings.otRate;
      st.otWeekend = 2;
    }
    delete st.otRate;
    if (!st.overrides || typeof st.overrides !== 'object') st.overrides = {};
    // 老数据迁移：deductions -> adjustments（都带上负号）
    let adj = s.adjustments;
    if (!Array.isArray(adj)) {
      adj = (Array.isArray(s.deductions) ? s.deductions : clone(DEFAULTS.adjustments))
        .map(d => Object.assign({}, d, { sign: d.sign || '-' }));
    }
    return {
      settings: st,
      adjustments: adj,
      shifts: Array.isArray(s.shifts) ? s.shifts : []
    };
  } catch (e) { return clone(DEFAULTS); }
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function save() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }

/* ---------- 日期工具 ---------- */
function p2(n) { return String(n).padStart(2, '0'); }
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; }
function ym(d) { return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`; }
function parseD(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function fmtD(d) { return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; }
function dateAdd(s, n) { const d = parseD(s); d.setDate(d.getDate() + n); return fmtD(d); }
const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function weekday(s) { return WD[parseD(s).getDay()]; }
function weekStart(s) { const d = parseD(s); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); return fmtD(d); }
function monthStart(s) { return s.slice(0, 7) + '-01'; }
function monthEnd(s) { const [y, m] = s.split('-').map(Number); return `${y}-${p2(m)}-${p2(new Date(y, m, 0).getDate())}`; }
function toMin(t) { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); }
function money(n) { return (n < 0 ? '-¥' : '¥') + Math.abs(n).toFixed(2); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function r2(n) { return Math.round(n * 100) / 100; }
function uid() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/* ---------- 计算 ---------- */
/**
 * 判断某天的加班倍率
 * 小时工 → 恒为 1（不算加班费）
 * 正式工 → 该日手动覆盖 > 周末(2×) > 工作日(1.5×)
 * 返回 { mult, kind }  kind: 'work' | 'weekend' | 'manual' | 'hourly'
 */
function dayMult(dateStr) {
  const st = state.settings;
  if (st.payType === 'hourly') return { mult: 1, kind: 'hourly' };
  const ov = st.overrides && st.overrides[dateStr];
  if (ov != null && ov !== '') return { mult: Number(ov), kind: 'manual' };
  const dow = parseD(dateStr).getDay();          // 0=日 6=六
  if (dow === 0 || dow === 6) return { mult: Number(st.otWeekend) || 2, kind: 'weekend' };
  return { mult: Number(st.otWorkday) || 1.5, kind: 'work' };
}

function calcShift(sh) {
  const st = state.settings;
  let mins = toMin(sh.end) - toMin(sh.start);
  let cross = false;
  if (mins <= 0) { mins += 1440; cross = true; }
  mins -= Number(sh.brk || 0);
  if (mins < 0) mins = 0;
  const hours = mins / 60;
  const rate = (sh.rate !== '' && sh.rate != null && !isNaN(Number(sh.rate)))
    ? Number(sh.rate) : (sh.type === 'night' ? Number(st.nightRate) : Number(st.dayRate));

  const otAfter = Number(st.otAfter) || 0;
  const dm = dayMult(sh.date);
  const otRate = dm.mult;                        // 加班倍率随日期变化
  let baseH = hours, otH = 0;
  if (otAfter > 0 && hours > otAfter) { baseH = otAfter; otH = hours - otAfter; }
  const base = baseH * rate, ot = otH * rate * otRate;
  return {
    hours: r2(hours), base: r2(base), ot: r2(ot), otHours: r2(otH),
    total: r2(base + ot), rate, cross,
    otRate: otRate, otKind: dm.kind
  };
}

function rangeOf(kind) {
  if (kind === 'week') { const a = weekStart(selDate); return [a, dateAdd(a, 6)]; }
  if (kind === 'month') return [monthStart(selDate), monthEnd(selDate)];
  return ['0000-01-01', '9999-12-31'];
}
function rangeLabel(kind) { return { week: '本周', month: '本月', all: '全部' }[kind] || ''; }

function summarize(shifts) {
  const a = {
    hours: 0, dayHours: 0, nightHours: 0, dayPay: 0, nightPay: 0,
    ot: 0, otWork: 0, otWeekend: 0, otHoliday: 0, base: 0,
    count: shifts.length, days: 0
  };
  const daySet = new Set(), dd = {};
  shifts.forEach(s => {
    const c = calcShift(s);
    a.hours += c.hours; a.base += c.base; a.ot += c.ot;
    if (c.otKind === 'weekend') a.otWeekend += c.ot;
    else if (c.otKind === 'manual') a.otHoliday += c.ot;
    else a.otWork += c.ot;
    if (s.type === 'night') { a.nightHours += c.hours; a.nightPay += c.base; }
    else { a.dayHours += c.hours; a.dayPay += c.base; }
    daySet.add(s.date);
    (dd[s.date] = dd[s.date] || { h: 0, p: 0, day: 0, night: 0 });
    dd[s.date].h += c.hours; dd[s.date].p += c.total;
    dd[s.date][s.type === 'night' ? 'night' : 'day'] += c.hours;
  });
  a.days = daySet.size;
  a.hours = r2(a.hours); a.dayHours = r2(a.dayHours); a.nightHours = r2(a.nightHours);
  a.dayPay = r2(a.dayPay); a.nightPay = r2(a.nightPay); a.ot = r2(a.ot); a.base = r2(a.base);
  a.otWork = r2(a.otWork); a.otWeekend = r2(a.otWeekend); a.otHoliday = r2(a.otHoliday);
  a.gross = r2(a.base + a.ot);

  const detail = []; let plus = 0, minus = 0;
  (state.adjustments || []).forEach(d => {
    if (!d.enabled) return;
    const val = Number(d.value) || 0; let amt = 0;
    if (d.mode === 'perDay') amt = val * a.days;
    else if (d.mode === 'perHour') amt = val * a.hours;
    else if (d.mode === 'percent') amt = a.gross * val / 100;
    else amt = val;
    amt = r2(amt);
    if (amt === 0) return;
    // 加项用绝对值（用户填正数即可），减项固定为负
    const signed = (d.sign === '-' ? -1 : 1) * Math.abs(amt);
    detail.push({
      name: d.name || '未命名', mode: d.mode, value: val,
      sign: d.sign === '-' ? '-' : '+', amount: signed
    });
    if (signed >= 0) plus += signed; else minus += -signed;
  });
  a.adjustDetail = detail;
  a.grossBase = a.gross;              // 基础+加班
  a.grossTotal = r2(a.gross + plus);  // 含加项的应发总额
  a.otSplit = () => {
    const out = [];
    if (a.otWork > 0)    out.push({ name: '工作日加班', value: a.otWork,    color: '#d29922' });
    if (a.otWeekend > 0) out.push({ name: '周末加班',   value: a.otWeekend, color: '#db6d28' });
    if (a.otHoliday > 0) out.push({ name: '节假日加班', value: a.otHoliday, color: '#cf222e' });
    return out;
  };
  a.plus = r2(plus);        // 加项合计（绩效、全勤等）
  a.deduct = r2(minus);     // 扣款合计
  a.net = r2(a.gross + a.plus - a.deduct);   // 实发
  a.avgRate = a.hours > 0 ? r2(a.gross / a.hours) : 0;
  a.byDay = dd;
  return a;
}

/* ---------- 环形图 ---------- */
/**
 * 生成环形图 SVG。
 * segments: [{ value, color, name }]
 * 从 -90° 起顺时针排列，段间留 2° 空隙。
 */
function ringSVG(segments, size) {
  const S = size || 200, cx = S / 2, cy = S / 2;
  const r = S / 2 - 10, sw = 22;
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const CIRC = 2 * Math.PI * r;

  if (total <= 0) {
    return `<svg viewBox="0 0 ${S} ${S}" width="100%" height="100%">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
        stroke="var(--line-soft)" stroke-width="${sw}" />
    </svg>`;
  }

  const GAP = 2.5;                       // 段间空隙（度）
  const vis = segments.filter(x => x.value > 0);
  let cursor = 0, out = '';
  vis.forEach((seg, i) => {
    const frac = seg.value / total;
    let deg = frac * 360;
    // 只有一段时不留空隙，画整圈
    const gap = vis.length > 1 ? GAP : 0;
    const d = Math.max(deg - gap, 0.8);
    const dash = (d / 360) * CIRC;
    out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
      stroke="${seg.color}" stroke-width="${sw}"
      stroke-dasharray="${dash.toFixed(2)} ${(CIRC - dash).toFixed(2)}"
      stroke-dashoffset="${(-(cursor + gap / 2) / 360 * CIRC).toFixed(2)}"
      transform="rotate(-90 ${cx} ${cy})" />`;
    cursor += deg;
  });
  return `<svg viewBox="0 0 ${S} ${S}" width="100%" height="100%">${out}</svg>`;
}

/** 取应发构成的所有色块（基础 / 加班 / 各加项） */
function grossSegments(agg) {
  const segs = [];
  const P = ['#2ea44f', '#d29922', '#0075ca', '#8250df', '#1a7f37'];
  if (agg.base > 0) segs.push({ name: '基础工资', value: agg.base, color: P[0] });
  agg.otSplit().forEach(x => { if (x.value > 0) segs.push(x); });
  (agg.adjustDetail || []).filter(d => d.sign === '+').forEach((d, i) => {
    segs.push({ name: d.name, value: d.amount, color: P[(i + 2) % P.length] });
  });
  return segs;
}
function go(v) {
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === 'view-' + v));
  if (v === 'calendar') renderCalendar();
  else if (v === 'day') renderDay();
  else if (v === 'stats') renderStats();
  else if (v === 'settings') renderSettings();
  window.scrollTo(0, 0);
}

/* ---------- 日历 ---------- */
function renderCalendar() {
  const [y, m] = viewMonth.split('-').map(Number);
  $('calTitle').textContent = `${y}年${m}月`;

  // 该月每天的班次
  const byDate = {};
  state.shifts.forEach(s => {
    if (s.date.slice(0, 7) !== viewMonth) return;
    (byDate[s.date] = byDate[s.date] || { day: false, night: false, h: 0, p: 0 });
    const c = calcShift(s);
    byDate[s.date][s.type === 'night' ? 'night' : 'day'] = true;
    byDate[s.date].h += c.hours;
    byDate[s.date].p += c.total;
  });

  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7;          // 周一为第一列
  const daysInMonth = new Date(y, m, 0).getDate();
  const today = todayStr();

  let html = '';
  for (let i = 0; i < lead; i++) html += '<div class="cell pad"><span class="d"></span></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${y}-${p2(m)}-${p2(d)}`;
    const info = byDate[ds];
    let marks = '';
    if (info) {
      marks = '<span class="marks">';
      if (info.day) marks += '<i class="day"></i>';
      if (info.night) marks += '<i class="night"></i>';
      marks += '</span>';
    } else {
      marks = '<span class="marks"></span>';
    }
    const sub = info ? `<span class="sub">${info.h.toFixed(1)}h</span>` : '';
    const cls = ['cell'];
    if (ds === today) cls.push('today');
    if (ds === selDate) cls.push('sel');
    if (info) cls.push('has');
    html += `<div class="${cls.join(' ')}" data-date="${ds}"><span class="d">${d}</span>${marks}${sub}</div>`;
  }
  $('calGrid').innerHTML = html;

  const monthShifts = state.shifts.filter(s => s.date.slice(0, 7) === viewMonth);
  const agg = summarize(monthShifts);
  $('mHours').textContent = agg.hours.toFixed(2) + ' h';
  $('mGross').textContent = money(agg.grossTotal);
  $('mNet').textContent = money(agg.net);
  $('monthTotal').textContent = agg.count ? `${agg.days} 天有记录` : '本月无记录';
}

/* ---------- 某日 ---------- */
function renderDay() {
  $('dayTitle').textContent = `${selDate} ${weekday(selDate)}`;
  const list = state.shifts.filter(s => s.date === selDate)
    .sort((a, b) => toMin(a.start) - toMin(b.start));
  const box = $('dayShifts');
  if (!list.length) {
    box.innerHTML = '<div class="empty">这一天没有记录</div>';
  } else {
    box.innerHTML = list.map(s => {
      const c = calcShift(s);
      const night = s.type === 'night';
      return `<div class="shift ${night ? 'night' : ''}" data-id="${s.id}">
        <span class="tag">${night ? '夜' : '白'}</span>
        <span class="info">
          <span class="t1">${esc(s.start)}–${esc(s.end)}${c.cross ? '<span style="color:#8c959f;font-size:11px"> +1</span>' : ''}</span>
          <span class="t2">${c.hours.toFixed(2)}h · ${money(c.rate)}/h${s.brk ? ' · 休' + s.brk + "'" : ''}${s.note ? ' · ' + esc(s.note) : ''}</span>
        </span>
        <span class="amt">${money(c.total)}${c.otHours > 0 ? `<small>加班 ${c.otHours.toFixed(1)}h</small>` : ''}</span>
      </div>`;
    }).join('');
  }
  const agg = summarize(list);
  $('dHours').textContent = agg.hours.toFixed(2) + ' h';
  $('dPay').textContent = money(agg.gross);

  // 倍率按钮
  const dm = dayMult(selDate);
  const LABEL = { work: '工作日', weekend: '周末', manual: '手动设置', hourly: '小时工' };
  $('btnMult').style.display = (state.settings.payType === 'hourly') ? 'none' : '';
  $('multLabel').textContent = `${LABEL[dm.kind]} ${dm.mult}×`;
  document.querySelectorAll('#multGrid .mult-opt').forEach(b => {
    b.classList.toggle('on', Math.abs(Number(b.dataset.val) - dm.mult) < 0.001 && dm.kind !== 'hourly');
  });
}

/* ---------- 统计 ---------- */
function renderStats() {
  // 只看本月
  const [a, b] = [monthStart(selDate), monthEnd(selDate)];
  const shifts = state.shifts.filter(s => s.date >= a && s.date <= b);
  const agg = summarize(shifts);
  // 本月没有任何班次时，不做计算（固定加项/扣款也不算），全部归零
  if (!shifts.length) {
    agg.plus = 0; agg.deduct = 0; agg.grossTotal = 0; agg.net = 0;
    agg.adjustDetail = [];
  }

  // 环内：净收入
  $('stNet').textContent = money(agg.net);
  $('stMonthLabel').textContent = selDate.slice(0, 7).replace('-', ' 年 ') + ' 月';

  // 环形图 + 图例（没有任何工时记录时显示灰色空环）
  const segs = (agg.base > 0 || agg.ot > 0) ? grossSegments(agg) : [];
  $('ringBox').innerHTML = ringSVG(segs, 200);

  const MODE = { fixed: '固定', perDay: '/天', perHour: '/时', percent: '%' };
  const legend = [];
  segs.forEach(x => legend.push({ name: x.name, color: x.color, value: x.value }));
  (agg.adjustDetail || []).filter(d => d.sign === '-').forEach(d =>
    legend.push({ name: d.name, color: 'var(--neg)', value: d.amount }));

  $('ringLegend').innerHTML = legend.length
    ? legend.map(x => `<div class="lg-row">
        <span class="lg-sq" style="background:${x.color}"></span>
        <span class="lg-name">${esc(x.name)}</span>
        <span class="lg-val ${x.value < 0 ? 'neg' : ''}">${money(x.value)}</span>
      </div>`).join('')
    : '<div class="lg-empty">本月还没有记录，去日历记一笔吧</div>';

  // 应发 / 扣款 / 实发 三行小结
  $('stGross').textContent = money(agg.grossTotal);
  $('stPlus').textContent = money(agg.plus);
  $('stDeduct').textContent = '-' + money(agg.deduct).replace('-', '');
  $('stNet2').textContent = money(agg.net);
  document.querySelector('.row.plus-row').style.display = agg.plus > 0 ? '' : 'none';
}

/* ---------- 设置 ---------- */
function renderSettings() {
  const s = state.settings;
  $('setDayStart').value = s.dayStart; $('setDayEnd').value = s.dayEnd;
  $('setNightStart').value = s.nightStart; $('setNightEnd').value = s.nightEnd;
  $('setDayBreak').value = s.dayBreak || 0;
  $('setNightBreak').value = s.nightBreak || 0;
  $('setDayRate').value = s.dayRate; $('setNightRate').value = s.nightRate;
  $('setOTAfter').value = s.otAfter;
  $('setOTWorkday').value = s.otWorkday;
  $('setOTWeekend').value = s.otWeekend;
  setPayType(s.payType || 'formal', false);
  renderDeductions();
}

/** 计薪方式切换：小时工隐藏加班规则 */
function setPayType(t, persist) {
  state.settings.payType = t;
  document.querySelectorAll('#segPayType .seg-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.val === t));
  $('otBox').style.display = (t === 'hourly') ? 'none' : '';
  $('payTypeHint').textContent = (t === 'hourly')
    ? '小时工：按实际工时 × 时薪计算，不计加班费。'
    : '正式工：工作日 1.5× · 周末 2× · 节假日可在日历里单独标记。';
  if (persist) save();
}

const MODE_OPTIONS = [
  ['fixed', '固定 (一次)'],
  ['perDay', '按天 (¥/天)'],
  ['perHour', '按工时 (¥/时)'],
  ['percent', '按应发 (%)']
];
function renderDeductions() {
  const box = $('deductItems');
  if (!state.adjustments.length) {
    box.innerHTML = '<div class="hint" style="padding:12px 0">还没有调整项</div>';
    return;
  }
  box.innerHTML = state.adjustments.map(d => `
    <div class="ded" data-id="${d.id}">
      <div class="ded-top">
        <div class="seg tiny" data-sign="${d.id}">
          <button class="seg-btn ${d.sign !== '-' ? 'active' : ''}" data-val="+">加项</button>
          <button class="seg-btn ${d.sign === '-' ? 'active' : ''}" data-val="-">减项</button>
        </div>
        <input type="text" class="d-name" value="${esc(d.name)}" placeholder="名称">
        <button class="ded-x" data-del="${d.id}">×</button>
      </div>
      <div class="ded-mid">
        <select class="d-mode">
          ${MODE_OPTIONS.map(o => `<option value="${o[0]}"${d.mode === o[0] ? ' selected' : ''}>${o[1]}</option>`).join('')}
        </select>
        <input type="number" class="d-val" step="0.01" inputmode="decimal" value="${d.value}">
      </div>
      <label class="ded-bot">
        <input type="checkbox" class="d-on"${d.enabled ? ' checked' : ''}><span class="box"></span>
        <span>启用</span>
      </label>
    </div>`).join('');
}

/* ---------- 弹窗 ---------- */
function openSheet(id) {
  editingId = id || null;
  if (id) {
    const sh = state.shifts.find(x => x.id === id);
    $('sheetTitle').textContent = '编辑班次';
    $('fDate').value = sh.date;
    setType(sh.type);
    $('fStart').value = sh.start; $('fEnd').value = sh.end;
    $('fBreak').value = sh.brk || 0;
    $('fRate').value = (sh.rate === '' || sh.rate == null) ? '' : sh.rate;
    $('fNote').value = sh.note || '';
    $('btnDeleteShift').hidden = false;
  } else {
    $('sheetTitle').textContent = '记录班次';
    $('fDate').value = selDate;
    // 当天已有白班 → 默认新建夜班；否则白班
    const has = state.shifts.filter(s => s.date === selDate).map(s => s.type);
    const t = (has.includes('day') && !has.includes('night')) ? 'night' : 'day';
    setType(t);
    fillPreset(t);
    $('fRate').value = ''; $('fNote').value = '';
    $('btnDeleteShift').hidden = true;
  }
  updateCalc();
  $('sheet').classList.add('show');
}
function closeSheet() { $('sheet').classList.remove('show'); }

function setType(t) {
  formType = t;
  document.querySelectorAll('#fType .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.val === t));
}
/** 关键：按类型自动填入自定义默认时段 */
function fillPreset(t) {
  const s = state.settings;
  if (t === 'night') {
    $('fStart').value = s.nightStart; $('fEnd').value = s.nightEnd;
    $('fBreak').value = s.nightBreak || 0;
  } else {
    $('fStart').value = s.dayStart; $('fEnd').value = s.dayEnd;
    $('fBreak').value = s.dayBreak || 0;
  }
}
function readForm() {
  return {
    id: editingId || uid(),
    date: $('fDate').value || selDate,
    type: formType,
    start: $('fStart').value || '08:00',
    end: $('fEnd').value || '20:00',
    brk: Number($('fBreak').value) || 0,
    rate: $('fRate').value === '' ? '' : Number($('fRate').value),
    note: $('fNote').value.trim()
  };
}
function updateCalc() {
  const f = readForm(), c = calcShift(f);
  $('cHours').textContent = c.hours.toFixed(2) + ' h';
  $('cBase').textContent = money(c.base);
  $('cOT').textContent = money(c.ot);
  $('cTotal').textContent = money(c.total);
  $('hourHint').textContent = c.cross
    ? '跨零点班次，结束时间按次日计算。'
    : (formType === 'night' ? '默认夜班时段：' : '默认白班时段：') +
      (formType === 'night' ? state.settings.nightStart + ' – ' + state.settings.nightEnd
                            : state.settings.dayStart + ' – ' + state.settings.dayEnd);
}

/* ---------- 事件 ---------- */
document.addEventListener('DOMContentLoaded', () => {
  $('prevMonth').onclick = () => { const [y, m] = viewMonth.split('-').map(Number); const d = new Date(y, m - 2, 1); viewMonth = ym(d); renderCalendar(); };
  $('nextMonth').onclick = () => { const [y, m] = viewMonth.split('-').map(Number); const d = new Date(y, m, 1); viewMonth = ym(d); renderCalendar(); };
  $('btnToday').onclick = () => { viewMonth = todayStr().slice(0, 7); selDate = todayStr(); renderCalendar(); };

  $('calGrid').addEventListener('click', e => {
    const cell = e.target.closest('.cell');
    if (!cell || !cell.dataset.date) return;
    selDate = cell.dataset.date;
    go('day');
  });

  $('dayBack').onclick = () => { selDate = selDate; viewMonth = selDate.slice(0, 7); go('calendar'); };
  $('btnStats').onclick = () => go('stats');
  $('btnSettings').onclick = () => go('settings');
  $('statsBack').onclick = () => go('calendar');
  $('setBack').onclick = () => go('calendar');

  $('btnAddShift').onclick = () => openSheet(null);

  // 赞赏码
  $('btnReward').onclick = () => $('rewardPop').classList.add('show');
  $('rewardClose').onclick = () => $('rewardPop').classList.remove('show');
  document.querySelector('#rewardPop .pop-scrim').onclick = () => $('rewardPop').classList.remove('show');
  $('dayShifts').addEventListener('click', e => {
    const el = e.target.closest('.shift'); if (el) openSheet(el.dataset.id);
  });

  $('sheetCancel').onclick = closeSheet;
  document.querySelector('#sheet .sheet-scrim').onclick = closeSheet;
  document.querySelectorAll('#fType .seg-btn').forEach(b => {
    b.onclick = () => { setType(b.dataset.val); fillPreset(b.dataset.val); updateCalc(); };
  });
  ['fDate', 'fStart', 'fEnd', 'fBreak', 'fRate'].forEach(id => {
    $(id).addEventListener('input', updateCalc);
    $(id).addEventListener('change', updateCalc);
  });
  $('sheetSave').onclick = () => {
    const f = readForm();
    if (editingId) {
      const i = state.shifts.findIndex(x => x.id === editingId);
      if (i >= 0) state.shifts[i] = f;
    } else state.shifts.push(f);
    save(); closeSheet();
    selDate = f.date; viewMonth = f.date.slice(0, 7);
    go('day');
  };
  $('btnDeleteShift').onclick = () => {
    if (!editingId) return;
    state.shifts = state.shifts.filter(x => x.id !== editingId);
    save(); closeSheet(); go('day');
  };

  // 设置自动保存
  const autoSave = () => {
    const s = state.settings;
    s.dayStart = $('setDayStart').value; s.dayEnd = $('setDayEnd').value;
    s.nightStart = $('setNightStart').value; s.nightEnd = $('setNightEnd').value;
    s.dayBreak = Number($('setDayBreak').value) || 0;
    s.nightBreak = Number($('setNightBreak').value) || 0;
    s.dayRate = Number($('setDayRate').value) || 0;
    s.nightRate = Number($('setNightRate').value) || 0;
    s.otAfter = Number($('setOTAfter').value) || 0;
    s.otWorkday = Number($('setOTWorkday').value) || 1.5;
    s.otWeekend = Number($('setOTWeekend').value) || 2;
    save();
    const t = $('saveTip'); t.textContent = '已保存'; setTimeout(() => t.textContent = '', 1200);
  };
  ['setDayStart', 'setDayEnd', 'setNightStart', 'setNightEnd', 'setDayBreak', 'setNightBreak', 'setDayRate', 'setNightRate', 'setOTAfter', 'setOTWorkday', 'setOTWeekend']
    .forEach(id => { $(id).addEventListener('change', autoSave); });

  // 计薪方式
  document.querySelectorAll('#segPayType .seg-btn').forEach(b => {
    b.onclick = () => setPayType(b.dataset.val, true);
  });

  // 倍率选择
  $('btnMult').onclick = () => {
    $('multCustom').value = '';
    $('multPop').classList.add('show');
  };
  $('multClose').onclick = () => $('multPop').classList.remove('show');
  document.querySelector('#multPop .pop-scrim').onclick = () => $('multPop').classList.remove('show');
  document.querySelectorAll('#multGrid .mult-opt').forEach(b => {
    b.onclick = () => {
      state.settings.overrides[selDate] = Number(b.dataset.val);
      save(); $('multPop').classList.remove('show'); renderDay();
    };
  });
  $('multCustom').addEventListener('change', () => {
    const v = Number($('multCustom').value);
    if (v > 0) {
      state.settings.overrides[selDate] = v;
      save(); $('multPop').classList.remove('show'); renderDay();
    }
  });
  $('multReset').onclick = () => {
    delete state.settings.overrides[selDate];
    save(); $('multPop').classList.remove('show'); renderDay();
  };

  // 调整项
  $('btnAddDeduct').onclick = () => {
    state.adjustments.push({ id: 'd' + Date.now().toString(36), name: '', mode: 'fixed', value: 0, sign: '-', enabled: true });
    save(); renderDeductions();
  };
  // 加项 / 减项 切换
  $('deductItems').addEventListener('click', e => {
    const btn = e.target.closest('[data-sign] .seg-btn');
    if (btn) {
      const id = btn.parentElement.dataset.sign;
      const d = state.adjustments.find(x => x.id === id);
      if (d) { d.sign = btn.dataset.val; save(); renderDeductions(); }
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      state.adjustments = state.adjustments.filter(x => x.id !== del.dataset.del);
      save(); renderDeductions();
    }
  });
  $('deductItems').addEventListener('input', e => {
    const it = e.target.closest('.ded'); if (!it) return;
    const d = state.adjustments.find(x => x.id === it.dataset.id); if (!d) return;
    if (e.target.classList.contains('d-name')) d.name = e.target.value;
    if (e.target.classList.contains('d-val')) d.value = Number(e.target.value) || 0;
    if (e.target.classList.contains('d-on')) d.enabled = e.target.checked;
    save();
  });
  $('deductItems').addEventListener('change', e => {
    const it = e.target.closest('.ded'); if (!it) return;
    const d = state.adjustments.find(x => x.id === it.dataset.id); if (!d) return;
    if (e.target.classList.contains('d-mode')) { d.mode = e.target.value; save(); }
  });

  // 导出
  $('btnExport').onclick = () => {
    const rows = [['日期', '星期', '班次', '开始', '结束', '休息(分)', '工时', '时薪', '基础薪资', '加班薪资', '合计', '备注']];
    state.shifts.slice().sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).forEach(s => {
      const c = calcShift(s);
      rows.push([s.date, weekday(s.date), s.type === 'night' ? '夜班' : '白班', s.start, s.end,
        s.brk || 0, c.hours.toFixed(2), c.rate.toFixed(2), c.base.toFixed(2), c.ot.toFixed(2), c.total.toFixed(2), s.note || '']);
    });
    const csv = '\uFEFF' + rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    dl('工时记录_' + todayStr() + '.csv', csv, 'text/csv');
  };
  $('btnBackup').onclick = () => dl('工时备份_' + todayStr() + '.json', JSON.stringify(state, null, 2), 'application/json');
  $('btnImport').onclick = () => $('fileInput').click();
  $('fileInput').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        if (!d.shifts) return alert('文件格式不正确');
        state = {
          settings: Object.assign({}, DEFAULTS.settings, d.settings || {}),
          adjustments: Array.isArray(d.adjustments)
            ? d.adjustments
            : (Array.isArray(d.deductions) ? d.deductions.map(x => Object.assign({}, x, { sign: x.sign || '-' })) : clone(DEFAULTS.adjustments)),
          shifts: d.shifts
        };
        save(); go('calendar'); alert('导入成功，共 ' + state.shifts.length + ' 条');
      } catch (err) { alert('解析失败：' + err.message); }
      e.target.value = '';
    };
    rd.readAsText(f);
  };

  go('calendar');
});

function dl(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 300);
}
