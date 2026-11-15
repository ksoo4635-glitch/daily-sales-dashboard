// 한 번만 쓰는 표 만들기 통로 — 표가 생기면 이 파일은 지운다. 데이터는 읽지도 보내지도 않는다.
const { Client } = require('pg');
const SQL = `
create table if not exists public.sales_items (
  line_key text primary key,
  order_date date not null,
  channel text not null,
  order_no text not null,
  product text not null,
  qty integer not null default 0,
  amount bigint not null default 0,
  cancelled boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists sales_items_order_date on public.sales_items (order_date);

create table if not exists public.uploads (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  channel text not null,
  file_name text,
  row_count integer not null default 0,
  cancelled_count integer not null default 0,
  date_from date,
  date_to date
);

create table if not exists public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.sales_items enable row level security;
alter table public.uploads enable row level security;
alter table public.settings enable row level security;
revoke all on public.sales_items, public.uploads, public.settings from anon, authenticated;

create or replace view public.daily_totals with (security_invoker = true) as
  select order_date, sum(amount)::bigint as amount,
         count(distinct channel || '|' || order_no)::int as orders, sum(qty)::int as qty
  from public.sales_items where not cancelled group by order_date;

create or replace view public.daily_channel with (security_invoker = true) as
  select order_date, channel, sum(amount)::bigint as amount, count(distinct order_no)::int as orders
  from public.sales_items where not cancelled group by order_date, channel;

create or replace view public.daily_products with (security_invoker = true) as
  select order_date, product, sum(amount)::bigint as amount, sum(qty)::int as qty
  from public.sales_items where not cancelled group by order_date, product;

revoke all on public.daily_totals, public.daily_channel, public.daily_products from anon, authenticated;
notify pgrst, 'reload schema';
`;
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능해요' });
  const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
  if (!url) return res.status(500).json({ error: '데이터베이스 연결 정보가 없어요. Vercel Storage에서 Supabase를 연결해 주세요.' });
  const client = new Client({ connectionString: url.replace(/[?&]sslmode=[^&]*/, ''), ssl: { rejectUnauthorized: false } });
  try { await client.connect(); await client.query(SQL); return res.status(200).json({ ok: true }); }
  catch (e) { return res.status(500).json({ error: '표를 만들지 못했어요', detail: String(e.message).slice(0, 200) }); }
  finally { await client.end().catch(() => {}); }
};
