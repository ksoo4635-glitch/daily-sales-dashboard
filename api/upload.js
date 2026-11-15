// CSV에서 고른 칸만 받아 저장한다. 구매자 이름·연락처·주소는 브라우저에서 이미 빠진 채로 온다.
// 같은 쇼핑몰 + 상품별 주문번호(없으면 주문번호 + 상품)는 한 줄로 본다 → 같은 파일을 또 올려도 두 번 세지 않는다.
const { guard, sb, body, isDate } = require('./_lib');

const clip = (v, n) => String(v ?? '').trim().slice(0, n);

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능해요' });
  const b = body(req);
  const channel = clip(b.channel, 40);
  if (!channel) return res.status(400).json({ error: '쇼핑몰 이름을 적어 주세요.' });

  try {
    // 마지막 요청: 올린 기록 남기기
    if (b.action === 'finish') {
      const rec = {
        channel,
        file_name: clip(b.file_name, 120),
        row_count: Math.max(0, Math.min(1e7, Number(b.row_count) | 0)),
        cancelled_count: Math.max(0, Math.min(1e7, Number(b.cancelled_count) | 0)),
        date_from: isDate(b.date_from) ? b.date_from : null,
        date_to: isDate(b.date_to) ? b.date_to : null,
      };
      await sb('uploads', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(rec) });
      return res.status(200).json({ ok: true });
    }

    const rows = Array.isArray(b.rows) ? b.rows : [];
    if (!rows.length || rows.length > 1000) return res.status(400).json({ error: '한 번에 1~1000줄씩 보내 주세요.' });
    const out = [];
    for (const r of rows) {
      const order_no = clip(r.o, 80);
      const product = clip(r.p, 200) || '(상품명 없음)';
      const line = clip(r.l, 80);
      const qty = Math.round(Number(r.q));
      const amount = Math.round(Number(r.a));
      if (!isDate(r.d) || !order_no || !Number.isFinite(qty) || !Number.isFinite(amount)) {
        return res.status(400).json({ error: '날짜·주문번호·수량·금액이 비어 있거나 잘못된 줄이 있어요.' });
      }
      if (Math.abs(amount) > 1e10 || Math.abs(qty) > 1e6) return res.status(400).json({ error: '금액이나 수량이 너무 큰 줄이 있어요.' });
      out.push({
        line_key: line ? `${channel}\u0001L\u0001${line}` : `${channel}\u0001P\u0001${order_no}\u0001${product}`,
        order_date: r.d, channel, order_no, product, qty, amount,
        cancelled: r.c === true,
        updated_at: new Date().toISOString(),
      });
    }
    await sb('sales_items?on_conflict=line_key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(out),
    });
    return res.status(200).json({ ok: true, saved: out.length });
  } catch (e) {
    return res.status(500).json({ error: '저장하지 못했어요. 잠시 뒤 다시 올려 주세요.', detail: e.detail });
  }
};
