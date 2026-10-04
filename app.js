/* ===== 工时 · 日历版 ===== */
'use strict';

const LS_KEY = 'worklog.v2';
const $ = id => document.getElementById(id);

const DEFAULTS = {
  settings: {
    dayStart: '08:00', dayEnd: '20:00',
    nightStart: '20:00', nightEnd: '08:00',
    dayRate: 20, nightRate: 25,
    otAfter: 8, otRate: 1.5
  },
  deductions: [
    { id: 'd_si',   name: '社保', mode: 'fixed',   value: 300, enabled: true },
    { id: 'd_tax',  name: '个税', mode: 'percent', value: 3,   enabled: true }
  ],
  shifts: []
};

let state = load();
let viewMonth = ym(new Date());     // '2026-10'
let selDate = todayStr();           // 选中日期 / 某日视图
let editingId = null;
let formType = 'day';
let statRange = 'month';

/* ---------- 存储 ---------- */
function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return clone(DEFAULTS);
    const s = JSON.parse(raw);
    return {
      settings: Object.assign({}, DEFAULTS.settings, s.settings || {}),
      deductions: Array.isArray(s.deductions) ? s.deductions : clone(DEFAULTS.deductions),
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
  const otRate = Number(st.otRate) || 1;
  let baseH = hours, otH = 0;
  if (otAfter > 0 && hours > otAfter) { baseH = otAfter; otH = hours - otAfter; }
  const base = baseH * rate, ot = otH * rate * otRate;
  return { hours: r2(hours), base: r2(base), ot: r2(ot), otHours: r2(otH), total: r2(base + ot), rate, cross };
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
    ot: 0, base: 0, count: shifts.length, days: 0
  };
  const daySet = new Set(), dd = {};
  shifts.forEach(s => {
    const c = calcShift(s);
    a.hours += c.hours; a.base += c.base; a.ot += c.ot;
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
  a.gross = r2(a.base + a.ot);

  const detail = []; let deduct = 0;
  (state.deductions || []).forEach(d => {
    if (!d.enabled) return;
    const val = Number(d.value) || 0; let amt = 0;
    if (d.mode === 'perDay') amt = val * a.days;
    else if (d.mode === 'perHour') amt = val * a.hours;
    else if (d.mode === 'percent') amt = a.gross * val / 100;
    else amt = val;
    amt = r2(amt);
    if (amt !== 0) { detail.push({ name: d.name || '未命名', mode: d.mode, value: val, amount: amt }); deduct += amt; }
  });
  a.deductDetail = detail;
  a.deduct = r2(deduct);
  a.net = r2(a.gross - a.deduct);
  a.avgRate = a.hours > 0 ? r2(a.gross / a.hours) : 0;
  a.byDay = dd;
  return a;
}

/* ---------- 视图切换 ---------- */
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
  $('mGross').textContent = money(agg.gross);
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
}

/* ---------- 统计 ---------- */
function renderStats() {
  const [a, b] = rangeOf(statRange);
  const shifts = state.shifts.filter(s => s.date >= a && s.date <= b);
  const agg = summarize(shifts);
  $('stNet').textContent = money(agg.net);
  $('stHours').textContent = agg.hours.toFixed(2) + ' h';
  $('stDayHours').textContent = agg.dayHours.toFixed(2) + ' h';
  $('stNightHours').textContent = agg.nightHours.toFixed(2) + ' h';
  $('stDays').textContent = agg.days + ' 天';
  $('stCount').textContent = agg.count;
  $('stAvg').textContent = money(agg.avgRate);
  $('stDayPay').textContent = money(agg.dayPay);
  $('stNightPay').textContent = money(agg.nightPay);
  $('stOT').textContent = money(agg.ot);
  $('stGross').textContent = money(agg.gross);

  const MODE = { fixed: '固定', perDay: '/天', perHour: '/时', percent: '%' };
  const dr = $('deductRows');
  let html = (agg.deductDetail.length
    ? agg.deductDetail.map(d => `<div class="row"><span>${esc(d.name)} <span style="color:#8c959f;font-size:11px">${d.mode === 'percent' ? d.value + '%' : money(d.value) + MODE[d.mode]}</span></span><b class="neg">${money(d.amount)}</b></div>`).join('')
    : '');
  html += `<div class="row strong"><span>扣款合计</span><b class="neg">-${money(agg.deduct).replace('-', '')}</b></div>`;
  dr.innerHTML = html;
}

/* ---------- 设置 ---------- */
function renderSettings() {
  const s = state.settings;
  $('setDayStart').value = s.dayStart; $('setDayEnd').value = s.dayEnd;
  $('setNightStart').value = s.nightStart; $('setNightEnd').value = s.nightEnd;
  $('setDayRate').value = s.dayRate; $('setNightRate').value = s.nightRate;
  $('setOTAfter').value = s.otAfter; $('setOTRate').value = s.otRate;
  renderDeductions();
}

const MODE_OPTIONS = [
  ['fixed', '固定 (一次)'],
  ['perDay', '按天 (¥/天)'],
  ['perHour', '按工时 (¥/时)'],
  ['percent', '按应发 (%)']
];
function renderDeductions() {
  const box = $('deductItems');
  if (!state.deductions.length) {
    box.innerHTML = '<div class="hint" style="padding:12px 0">还没有扣款项</div>';
    return;
  }
  box.innerHTML = state.deductions.map(d => `
    <div class="ded" data-id="${d.id}">
      <div class="ded-top">
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
    $('fBreak').value = 0; $('fRate').value = ''; $('fNote').value = '';
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
  if (t === 'night') { $('fStart').value = s.nightStart; $('fEnd').value = s.nightEnd; }
  else { $('fStart').value = s.dayStart; $('fEnd').value = s.dayEnd; }
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

  document.querySelectorAll('#rangeSeg .seg-btn').forEach(b => {
    b.onclick = () => {
      statRange = b.dataset.range;
      document.querySelectorAll('#rangeSeg .seg-btn').forEach(x => x.classList.toggle('active', x === b));
      renderStats();
    };
  });

  // 设置自动保存
  const autoSave = () => {
    const s = state.settings;
    s.dayStart = $('setDayStart').value; s.dayEnd = $('setDayEnd').value;
    s.nightStart = $('setNightStart').value; s.nightEnd = $('setNightEnd').value;
    s.dayRate = Number($('setDayRate').value) || 0;
    s.nightRate = Number($('setNightRate').value) || 0;
    s.otAfter = Number($('setOTAfter').value) || 0;
    s.otRate = Number($('setOTRate').value) || 1;
    save();
    const t = $('saveTip'); t.textContent = '已保存'; setTimeout(() => t.textContent = '', 1200);
  };
  ['setDayStart', 'setDayEnd', 'setNightStart', 'setNightEnd', 'setDayRate', 'setNightRate', 'setOTAfter', 'setOTRate']
    .forEach(id => { $(id).addEventListener('change', autoSave); });

  // 扣款项
  $('btnAddDeduct').onclick = () => {
    state.deductions.push({ id: 'd' + Date.now().toString(36), name: '', mode: 'fixed', value: 0, enabled: true });
    save(); renderDeductions();
  };
  $('deductItems').addEventListener('input', e => {
    const it = e.target.closest('.ded'); if (!it) return;
    const d = state.deductions.find(x => x.id === it.dataset.id); if (!d) return;
    if (e.target.classList.contains('d-name')) d.name = e.target.value;
    if (e.target.classList.contains('d-val')) d.value = Number(e.target.value) || 0;
    if (e.target.classList.contains('d-on')) d.enabled = e.target.checked;
    save();
  });
  $('deductItems').addEventListener('change', e => {
    const it = e.target.closest('.ded'); if (!it) return;
    const d = state.deductions.find(x => x.id === it.dataset.id); if (!d) return;
    if (e.target.classList.contains('d-mode')) { d.mode = e.target.value; save(); }
  });
  $('deductItems').addEventListener('click', e => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    state.deductions = state.deductions.filter(x => x.id !== b.dataset.del);
    save(); renderDeductions();
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
          deductions: Array.isArray(d.deductions) ? d.deductions : clone(DEFAULTS.deductions),
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
