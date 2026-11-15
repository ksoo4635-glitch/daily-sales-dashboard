import { api, lockScreen, won, int, md, stamp, esc } from './common.js';

const $ = (id) => document.getElementById(id);

lockScreen({
  form: $('lock-form'), input: $('pw'), error: $('lock-error'), lock: $('lock'), app: $('app'),
  check: () => api('/api/admin'),
  onOpen: (data) => { showMeta(data); if (location.hash === '#target') $('target').scrollIntoView(); },
});

/* ───────── 올린 기록 · 목표 ───────── */
function showMeta(data) {
  $('channel-list').innerHTML = data.channels.map((c) => `<option value="${esc(c)}">`).join('');
  $('log').innerHTML = data.uploads.length
    ? data.uploads.map((u) => `<li><b>${esc(u.channel)} · ${int(u.row_count)}줄</b>
        <span class="muted">${stamp(u.created_at)}에 올림${u.date_from ? `, 주문 날짜 ${md(u.date_from)}~${md(u.date_to)}` : ''}${u.cancelled_count ? `, 취소·반품 ${int(u.cancelled_count)}줄 뺌` : ''}</span></li>`).join('')
    : '<li class="muted">아직 올린 파일이 없어요.</li>';
  $('t-list').textContent = data.targets.length
    ? '저장된 목표: ' + data.targets.slice(0, 4).map((t) => `${Number(t.month.slice(5))}월 ${won(t.amount)}`).join(', ')
    : '';
  if (!$('t-month').value) $('t-month').value = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
}
async function refreshMeta() { try { showMeta(await api('/api/admin')); } catch {} }

$('t-amount').addEventListener('input', (e) => {
  const v = e.target.value.replace(/[^\d]/g, '');
  e.target.value = v ? int(v) : '';
});
$('t-save').addEventListener('click', async () => {
  $('t-error').textContent = '';
  const amount = Number($('t-amount').value.replace(/[^\d]/g, ''));
  try {
    await api('/api/admin', { method: 'PUT', body: JSON.stringify({ month: $('t-month').value, amount }) });
    $('t-amount').value = '';
    await refreshMeta();
    $('t-error').textContent = '';
    $('t-list').textContent = `목표를 저장했어요. ` + $('t-list').textContent;
  } catch (e) { $('t-error').textContent = e.message; }
});

/* ───────── CSV 읽기 ───────── */
// 한국 쇼핑몰 CSV는 UTF-8 또는 EUC-KR(CP949)이다. UTF-8로 읽어 깨지면 EUC-KR로 다시 읽는다.
function decode(buf) {
  const utf = new TextDecoder('utf-8').decode(buf);
  if (!utf.includes('�')) return utf.replace(/^﻿/, '');
  try { return new TextDecoder('euc-kr').decode(buf); } catch { return utf; }
}

function parseCSV(text) {
  const first = text.slice(0, 2000);
  const delim = (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? '\t' : ',';
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

// 칸 이름 찾기 — 쇼핑몰마다 이름이 달라서 자주 쓰는 이름을 순서대로 본다.
const FIELDS = [
  { key: 'd', label: '주문 날짜', need: true, names: ['주문일시', '주문일자', '주문일', '결제일시', '결제일', '결제완료일', '주문 일시', '주문날짜', '발주확인일', 'order date', 'date'] },
  { key: 'o', label: '주문번호', need: true, names: ['주문번호', '주문 번호', 'order id', 'order no', 'order number'] },
  { key: 'li', label: '상품별 주문번호 (있으면)', need: false, names: ['상품주문번호', '품목별 주문번호', '주문상품번호', '품주번호', 'line id', 'line item id'] },
  { key: 'p', label: '상품명', need: true, names: ['상품명', '주문상품명', '상품명(한국어 쇼핑몰)', '품목명', '상품', 'product', 'item'] },
  { key: 'op', label: '옵션 (있으면)', need: false, names: ['옵션정보', '상품옵션', '옵션명', '옵션', 'option'] },
  { key: 'q', label: '수량 (없으면 1개로)', need: false, names: ['수량', '주문수량', '구매수량', '상품수량', 'qty', 'quantity'] },
  { key: 'a', label: '금액', need: true, names: ['최종 상품별 총 주문금액', '상품별 총 주문금액', '총 결제금액', '결제금액', '실결제금액', '주문금액', '상품구매금액', '판매금액', '판매가', '금액', 'amount', 'total', 'price'] },
  { key: 's', label: '주문 상태 (있으면, 취소·반품을 빼요)', need: false, names: ['주문상태', '클레임상태', '처리상태', '주문 상태', '상태', 'status'] },
];
const norm = (s) => String(s).replace(/\s+/g, ' ').trim().toLowerCase();

function findHeaderRow(rows) {
  let best = 0, bestScore = -1;
  for (let i = 0; i < Math.min(6, rows.length); i++) {
    const cells = rows[i].map(norm);
    const score = FIELDS.filter((f) => f.names.some((n) => cells.includes(norm(n)))).length;
    if (score > bestScore) { best = i; bestScore = score; }
  }
  return best;
}
function guess(headers, field) {
  const h = headers.map(norm);
  for (const n of field.names) { const i = h.indexOf(norm(n)); if (i >= 0) return i; }
  for (const n of field.names) { const i = h.findIndex((x) => x.includes(norm(n))); if (i >= 0) return i; }
  return -1;
}

function toDate(v) {
  const s = String(v).trim();
  let m = s.match(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (!m) { const k = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (k) m = [0, k[3], k[1], k[2]]; }
  if (!m) { const c = s.match(/^(\d{4})(\d{2})(\d{2})/); if (c) m = c; }
  if (!m) return null;
  const d = `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  return Number.isNaN(Date.parse(d + 'T00:00:00Z')) ? null : d;
}
const toNum = (v) => {
  const s = String(v ?? '').replace(/[,\s원₩]/g, '').replace(/^\((.*)\)$/, '-$1');
  return s === '' ? NaN : Number(s);
};
const CANCEL = /취소|반품|환불|cancel|return|refund/i;

let file = null, headers = [], body = [], built = null;

function readFile(f) {
  $('file-error').textContent = ''; $('done').hidden = true;
  if (!f) return;
  if (/\.xlsx?$/i.test(f.name)) { $('file-error').textContent = '엑셀 파일은 바로 읽지 못해요. 엑셀에서 "다른 이름으로 저장 → CSV UTF-8"로 저장한 뒤 올려 주세요.'; return; }
  if (f.size > 30 * 1024 * 1024) { $('file-error').textContent = '파일이 30MB보다 커요. 기간을 나눠서 내려받아 주세요.'; return; }
  const r = new FileReader();
  r.onload = () => {
    const rows = parseCSV(decode(new Uint8Array(r.result)));
    if (rows.length < 2) { $('file-error').textContent = '파일에서 표를 찾지 못했어요. 쇼핑몰에서 내려받은 CSV인지 확인해 주세요.'; return; }
    const h = findHeaderRow(rows);
    file = f; headers = rows[h].map((c) => c.trim()); body = rows.slice(h + 1);
    buildMapping();
  };
  r.readAsArrayBuffer(f);
}

const mapKey = () => 'sales-map:' + $('channel').value.trim();
function savedMap() { try { return JSON.parse(localStorage.getItem(mapKey()) || 'null'); } catch { return null; } }

function buildMapping() {
  const saved = savedMap();
  $('map-fields').innerHTML = FIELDS.map((f) => {
    let sel = guess(headers, f);
    if (saved && saved[f.key] && headers.includes(saved[f.key])) sel = headers.indexOf(saved[f.key]);
    const opts = [`<option value="-1">${f.need ? '골라 주세요' : '없음'}</option>`]
      .concat(headers.map((h, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(h || `(${i + 1}번째 칸)`)}</option>`));
    return `<div class="field"><label for="m-${f.key}">${f.label}</label><select class="input" id="m-${f.key}" data-key="${f.key}">${opts.join('')}</select></div>`;
  }).join('');
  $('mapping').hidden = false;
  $('map-fields').onchange = updatePreview;
  updatePreview();
}

function currentMap() {
  return Object.fromEntries(FIELDS.map((f) => [f.key, Number($('m-' + f.key).value)]));
}

// 고른 칸만 꺼내 한 줄씩 만든다. 같은 주문번호+상품이 파일 안에 여러 줄이면 합친다.
function build() {
  const m = currentMap();
  const missing = FIELDS.filter((f) => f.need && m[f.key] < 0).map((f) => f.label);
  if (missing.length) return { error: `${missing.join(', ')} 칸을 골라 주세요.` };
  const lines = new Map(); let bad = 0, cancelled = 0;
  for (const r of body) {
    const d = toDate(r[m.d]); const o = String(r[m.o] ?? '').trim();
    const a = toNum(r[m.a]); const qv = m.q >= 0 ? toNum(r[m.q]) : 1;
    if (!d || !o || !Number.isFinite(a)) { bad++; continue; }
    const name = String(r[m.p] ?? '').trim();
    const opt = m.op >= 0 ? String(r[m.op] ?? '').trim() : '';
    const p = opt ? `${name} (${opt})` : name;
    const c = m.s >= 0 && CANCEL.test(String(r[m.s] ?? ''));
    if (c) cancelled++;
    const li = m.li >= 0 ? String(r[m.li] ?? '').trim() : '';
    const k = li ? 'L' + li : 'P' + o + '\u0001' + p;
    const prev = lines.get(k);
    if (prev) { prev.a += a; prev.q += Number.isFinite(qv) ? qv : 1; prev.c = prev.c && c; }
    else lines.set(k, { d, o, l: li, p, q: Number.isFinite(qv) ? qv : 1, a, c });
  }
  const rows = [...lines.values()];
  const live = rows.filter((x) => !x.c);
  const dates = rows.map((x) => x.d).sort();
  return {
    rows, bad, cancelled,
    from: dates[0], to: dates[dates.length - 1],
    total: live.reduce((s, x) => s + x.a, 0),
    orders: new Set(live.map((x) => x.o)).size,
  };
}

function updatePreview() {
  built = build();
  const p = $('preview');
  if (built.error) { p.innerHTML = `<p class="error" style="margin:0">${esc(built.error)}</p>`; $('save').disabled = true; return; }
  if (!built.rows.length) { p.innerHTML = '<p class="error" style="margin:0">읽을 수 있는 줄이 없어요. 날짜·주문번호·금액 칸이 맞는지 확인해 주세요.</p>'; $('save').disabled = true; return; }
  p.innerHTML = `<p><b>${esc(file.name)}</b></p>
    <p>주문 날짜 ${md(built.from)} ~ ${md(built.to)}, 주문 ${int(built.orders)}건, 매출 합계 <b class="num">${won(built.total)}</b></p>
    <p class="muted">${int(built.rows.length)}줄 저장${built.cancelled ? `, 취소·반품 ${int(built.cancelled)}줄은 매출에서 빼요` : ''}${built.bad ? `, 날짜나 금액을 못 읽은 ${int(built.bad)}줄은 건너뛰어요` : ''}</p>`;
  $('save').disabled = false;
}

$('file').addEventListener('change', (e) => readFile(e.target.files[0]));
const drop = $('drop');
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => readFile(e.dataTransfer.files[0]));
$('channel').addEventListener('change', () => { if (headers.length) buildMapping(); });

$('save').addEventListener('click', async () => {
  const channel = $('channel').value.trim();
  $('file-error').textContent = '';
  if (!channel) { $('file-error').textContent = '어느 쇼핑몰 파일인지 먼저 적어 주세요.'; $('channel').focus(); return; }
  if (!built || built.error || !built.rows.length) return;
  const btn = $('save'); const bar = $('progress');
  btn.disabled = true; bar.hidden = false;
  try {
    const rows = built.rows; const size = 500;
    for (let i = 0; i < rows.length; i += size) {
      await api('/api/upload', { method: 'POST', body: JSON.stringify({ channel, rows: rows.slice(i, i + size) }) });
      bar.firstElementChild.style.width = `${Math.round(((i + size) / rows.length) * 100)}%`;
    }
    await api('/api/upload', { method: 'POST', body: JSON.stringify({
      action: 'finish', channel, file_name: file.name, row_count: rows.length, cancelled_count: built.cancelled,
      date_from: built.from, date_to: built.to,
    }) });
    try {
      const m = currentMap();
      localStorage.setItem('sales-map:' + channel, JSON.stringify(Object.fromEntries(Object.entries(m).map(([k, i]) => [k, i >= 0 ? headers[i] : null]))));
    } catch {}
    $('mapping').hidden = true;
    $('done').hidden = false;
    $('done').innerHTML = `저장했어요: ${esc(channel)}, ${int(rows.length)}줄 (${md(built.from)} ~ ${md(built.to)}). <a href="/?date=${built.to}">대시보드에서 보기</a>`;
    $('file').value = '';
    refreshMeta();
  } catch (e) {
    $('file-error').textContent = e.message + ' 이미 보낸 줄은 저장됐어요. 같은 파일을 다시 올리면 이어서 맞춰져요.';
  } finally { btn.disabled = false; bar.hidden = true; bar.firstElementChild.style.width = '0'; }
});
