// 대시보드 숫자: 고른 날짜(없으면 마지막 데이터 날짜)의 매출과 비교, 최근 60일, 이달 누적, 잘 팔린 상품, 쇼핑몰별.
const { guard, sb, isDate } = require('./_lib');

const addDays = (d, n) => {
  const t = new Date(d + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const minDate = (...ds) => ds.sort()[0];

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: '지원하지 않는 요청이에요.' });

  try {
    const lastRow = await sb('daily_totals?select=order_date&order=order_date.desc&limit=1');
    const lastUpload = await sb('uploads?select=created_at,channel,file_name,date_from,date_to,row_count&order=created_at.desc&limit=1');
    if (!lastRow || !lastRow.length) {
      return res.status(200).json({ empty: true, lastUpload: lastUpload?.[0] || null });
    }
    const latest = lastRow[0].order_date;
    const q = String(req.query?.date || '');
    const sel = isDate(q) && q <= latest ? q : latest;
    const monthStart = sel.slice(0, 8) + '01';
    const from = minDate(addDays(latest, -59), addDays(sel, -7), monthStart);

    const [days, channels, products, target] = await Promise.all([
      sb(`daily_totals?select=order_date,amount,orders,qty&order_date=gte.${from}&order_date=lte.${latest}&order=order_date.asc`),
      sb(`daily_channel?select=channel,amount,orders&order_date=eq.${sel}&order=amount.desc`),
      sb(`daily_products?select=product,amount,qty&order_date=eq.${sel}&order=amount.desc&limit=5`),
      sb(`settings?select=value&key=eq.target:${sel.slice(0, 7)}`),
    ]);

    const byDate = Object.fromEntries(days.map((d) => [d.order_date, d]));
    const pick = (d) => byDate[d] || null;
    const month = days.filter((d) => d.order_date >= monthStart && d.order_date <= sel);
    const monthAmount = month.reduce((s, d) => s + Number(d.amount), 0);

    return res.status(200).json({
      latest,
      date: sel,
      day: pick(sel) || { order_date: sel, amount: 0, orders: 0, qty: 0, none: true },
      prev: pick(addDays(sel, -1)),
      lastWeek: pick(addDays(sel, -7)),
      strip: days.filter((d) => d.order_date >= addDays(latest, -59)),
      stripFrom: addDays(latest, -59),
      month: { from: monthStart, to: sel, amount: monthAmount, days: month.length },
      target: target?.[0]?.value?.amount ?? null,
      channels,
      products,
      lastUpload: lastUpload?.[0] || null,
    });
  } catch (e) {
    return res.status(500).json({ error: '숫자를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.', detail: e.detail });
  }
};
