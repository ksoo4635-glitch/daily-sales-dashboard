import { api, pass, lockScreen, won, int, shortWon, md, mdw, weekday, addDays, todayKST, stamp, esc } from './common.js';

const $ = (id) => document.getElementById(id);
const view = $('view');
let firstPaint = true;

const load = (date) => api('/api/summary' + (date ? `?date=${encodeURIComponent(date)}` : ''));

lockScreen({
  form: $('lock-form'), input: $('pw'), error: $('lock-error'), lock: $('lock'), app: $('app'),
  check: () => load(new URLSearchParams(location.search).get('date')),
  onOpen: render,
});

$('lock-btn').addEventListener('click', () => { pass.clear(); location.href = '/'; });

async function pickDate(date) {
  try {
    const data = await load(date);
    history.replaceState(null, '', date === data.latest ? '/' : `/?date=${date}`);
    render(data);
  } catch (e) {
    if (e.status === 401) { pass.clear(); location.reload(); return; }
    alert(e.message);
  }
}

function change(now, before, label) {
  if (!before) return `<li>${esc(label)} 데이터 없음</li>`;
  const diff = Number(now) - Number(before.amount);
  if (!Number(before.amount)) return `<li>${esc(label)} 매출 0원</li>`;
  const pct = Math.round((diff / Number(before.amount)) * 100);
  if (diff === 0) return `<li>${esc(label)}와 같아요</li>`;
  const up = diff > 0;
  return `<li>${esc(label)}보다 <b>${up ? '▲' : '▼'} ${shortWon(diff)} (${Math.abs(pct)}%)</b> ${up ? '많아요' : '적어요'}</li>`;
}

function stripHTML(data) {
  const byDate = Object.fromEntries(data.strip.map((d) => [d.order_date, Number(d.amount)]));
  const max = Math.max(1, ...Object.values(byDate));
  let html = '';
  for (let i = 0; i < 60; i++) {
    const d = addDays(data.stripFrom, i);
    const has = d in byDate;
    const h = has ? Math.max(3, Math.round((byDate[d] / max) * 112)) : 3;
    const day = Number(d.slice(8));
    const isMon = weekday(d) === '월';
    const label = day === 1 ? `${Number(d.slice(5, 7))}월` : (isMon || d === data.date ? String(day) : '');
    html += `<button class="bar${has ? '' : ' none'}" type="button" data-date="${d}" aria-pressed="${d === data.date}"
      aria-label="${mdw(d)} ${has ? won(byDate[d]) : '데이터 없음'}" ${has ? '' : 'disabled'}>
      <i style="height:${h}px;animation-delay:${firstPaint ? i * 8 : 0}ms"></i><small class="${day === 1 ? 'mon' : ''}">${label}</small></button>`;
  }
  return html;
}

function render(data) {
  const lu = data.lastUpload;
  $('last-upload').textContent = lu ? `마지막으로 올린 파일: ${lu.channel}, ${stamp(lu.created_at)}` : '아직 올린 파일이 없어요';

  if (data.empty) {
    view.innerHTML = `<section class="empty">
      <h1>아직 매출 데이터가 없어요</h1>
      <p>쇼핑몰 관리자 화면에서 주문 CSV를 내려받아 올려 주세요. 올리면 하루 매출, 주문 수, 잘 팔린 상품이 여기에 정리돼요.</p>
      <a class="btn btn-act" href="/admin">CSV 올리기</a></section>`;
    return;
  }

  const day = data.day;
  const amount = Number(day.amount);
  const orders = Number(day.orders);
  const yesterday = addDays(todayKST(), -1);
  const stale = data.latest < yesterday;
  const lastWeekLabel = `지난주 ${weekday(data.date)}요일`;

  const month = data.month;
  const target = data.target ? Number(data.target) : null;
  const pct = target ? Math.min(100, Math.round((month.amount / target) * 100)) : 0;

  const products = data.products || [];
  const pMax = Math.max(1, ...products.map((p) => Number(p.amount)));
  const channels = data.channels || [];
  const cSum = channels.reduce((s, c) => s + Number(c.amount), 0) || 1;

  view.innerHTML = `
    ${stale ? `<div class="alert" role="status"><span>어제(${md(yesterday)}) 매출이 아직 안 올라왔어요. 마지막 데이터는 ${md(data.latest)}이에요.</span>
      <a class="btn btn-act" href="/admin">CSV 올리기</a></div>` : ''}

    <section class="day-card" aria-labelledby="day-title">
      <p class="day-sentence" id="day-title">${mdw(data.date)} 매출은</p>
      <strong class="day-amount num">${int(amount)}<span class="won">원</span></strong>
      <ul class="compare">
        ${change(amount, data.prev, '전날')}
        ${change(amount, data.lastWeek, lastWeekLabel)}
      </ul>
      <dl class="facts">
        <div class="fact"><dt>주문 수</dt><dd class="num">${int(orders)}건</dd></div>
        <div class="fact"><dt>객단가</dt><dd class="num">${orders ? won(amount / orders) : '-'}</dd></div>
      </dl>
      <div class="strip-head"><h2>최근 60일</h2><span>막대를 누르면 그날로 바뀌어요</span></div>
      <div class="strip${firstPaint ? ' grow' : ''}" id="strip">${stripHTML(data)}</div>
    </section>

    <div class="grid two">
      <section class="panel">
        <h2>${Number(month.from.slice(5, 7))}월 누적</h2>
        <p class="sub">${md(month.from)}부터 ${md(month.to)}까지</p>
        <p class="big num">${won(month.amount)}</p>
        ${target ? `<div class="track" role="img" aria-label="목표의 ${pct}%"><span style="width:${pct}%"></span></div>
          <p class="muted">목표 ${won(target)} 중 <b>${Math.round((month.amount / target) * 100)}%</b> · 남은 금액 ${won(Math.max(0, target - month.amount))}</p>`
        : `<p class="muted">이달 목표를 넣으면 몇 %까지 왔는지 보여 드려요. <a href="/admin#target"><b>목표 넣기</b></a></p>`}
      </section>

      <section class="panel">
        <h2>쇼핑몰별</h2>
        <p class="sub">${md(data.date)} 매출</p>
        ${channels.length ? `<ul class="rank">${channels.map((c) => `
          <li><span class="name">${esc(c.channel)}</span><span class="val num">${won(c.amount)}</span>
          <span class="meter"><span style="width:${Math.round((Number(c.amount) / cSum) * 100)}%"></span></span></li>`).join('')}</ul>`
        : '<p class="muted">이날은 쇼핑몰별 데이터가 없어요.</p>'}
      </section>
    </div>

    <div class="grid">
      <section class="panel">
        <h2>잘 팔린 상품</h2>
        <p class="sub">${md(data.date)} 매출이 많은 순서 (최대 5개)</p>
        ${products.length ? `<ol class="rank">${products.map((p) => `
          <li><span class="name">${esc(p.product)}</span><span class="val num">${won(p.amount)} · ${int(p.qty)}개</span>
          <span class="meter"><span style="width:${Math.round((Number(p.amount) / pMax) * 100)}%"></span></span></li>`).join('')}</ol>`
        : '<p class="muted">이날 팔린 상품이 없어요.</p>'}
      </section>
    </div>`;

  const strip = $('strip');
  strip.scrollLeft = strip.scrollWidth;
  const sel = strip.querySelector('[aria-pressed="true"]');
  if (sel) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  strip.addEventListener('click', (ev) => {
    const b = ev.target.closest('.bar');
    if (b && !b.disabled && b.dataset.date !== data.date) pickDate(b.dataset.date);
  });
  firstPaint = false;
}
