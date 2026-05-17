-- schema v3
create table if not exists settings (
  key text primary key,
  value text not null
);

create table if not exists savings (
  id text primary key,
  bank text default '',
  name text default '',
  principal double precision default 0,
  balance double precision default 0,
  monthly_payment double precision default 0,
  payment_day integer default 1,
  last_paid_month text default '',
  rate double precision default 0,
  start_date text default '',
  maturity_date text default '',
  status text default 'active',
  note text default ''
);

create table if not exists overseas_holdings (
  id text primary key,
  owner text default 'me',
  ticker text not null,
  name text default '',
  shares double precision default 0,
  price double precision default 0,
  target double precision default 0,
  note text default ''
);

create table if not exists rebal_history (
  id text primary key,
  date text not null,
  note text default ''
);

create table if not exists isa_history (
  id text primary key,
  date text not null,
  value double precision default 0,
  note text default ''
);

create table if not exists isa_holdings (
  id text primary key,
  ticker text not null,
  name text default '',
  shares double precision default 0,
  price double precision default 0,
  note text default ''
);

create table if not exists shinhan_isa_history (
  id text primary key,
  date text not null,
  value double precision default 0,
  note text default ''
);

create table if not exists shinhan_isa_holdings (
  id text primary key,
  ticker text not null,
  name text default '',
  shares double precision default 0,
  price double precision default 0,
  note text default ''
);

create table if not exists crypto_holdings (
  id text primary key,
  market text not null,
  currency text default '',
  balance double precision default 0,
  locked double precision default 0,
  avg_buy_price double precision default 0,
  price double precision default 0,
  value double precision default 0,
  profit double precision default 0,
  note text default ''
);

create table if not exists crypto_history (
  id text primary key,
  date text not null,
  value double precision default 0,
  krw_cash double precision default 0,
  note text default ''
);

create table if not exists real_estate (
  id text primary key,
  name text not null,
  type text default '매매',
  deposit double precision default 0,
  monthly_rent double precision default 0,
  purchase_price double precision default 0,
  current_value double precision default 0,
  debt double precision default 0,
  start_date text default '',
  end_date text default '',
  status text default 'active',
  note text default ''
);

create table if not exists yearly_records (
  id text primary key,
  year integer not null unique,
  savings double precision default 0,
  overseas double precision default 0,
  isa double precision default 0,
  crypto double precision default 0,
  real_estate double precision default 0,
  other double precision default 0,
  total double precision default 0,
  inv_savings double precision default 0,
  inv_overseas double precision default 0,
  inv_isa double precision default 0,
  inv_crypto double precision default 0,
  inv_real_estate double precision default 0,
  note text default ''
);

create table if not exists monthly_records (
  id text primary key,
  year_month text not null unique,
  savings double precision default 0,
  overseas double precision default 0,
  isa double precision default 0,
  crypto double precision default 0,
  real_estate double precision default 0,
  other double precision default 0,
  total double precision default 0,
  inv_savings double precision default 0,
  inv_overseas double precision default 0,
  inv_isa double precision default 0,
  inv_crypto double precision default 0,
  inv_real_estate double precision default 0,
  note text default ''
);

alter table yearly_records add column if not exists inv_savings double precision default 0;
alter table yearly_records add column if not exists inv_overseas double precision default 0;
alter table yearly_records add column if not exists inv_isa double precision default 0;
alter table yearly_records add column if not exists inv_crypto double precision default 0;
alter table yearly_records add column if not exists inv_real_estate double precision default 0;

create table if not exists dain_isa_history (
  id text primary key,
  date text not null,
  value double precision default 0,
  note text default ''
);

create table if not exists dain_isa_holdings (
  id text primary key,
  ticker text not null,
  name text default '',
  shares double precision default 0,
  price double precision default 0,
  note text default ''
);

create table if not exists fixed_costs (
  id text primary key,
  name text not null,
  category text default '기타',
  amount double precision default 0,
  billing_day integer default 1,
  payment_method text default '자동이체',
  status text default 'active',
  note text default ''
);

create table if not exists fixed_savings (
  id text primary key,
  name text not null,
  category text default '적금',
  amount double precision default 0,
  payment_day integer default 1,
  status text default 'active',
  note text default ''
);

create table if not exists portfolio_templates (
  id text primary key,
  name text not null,
  note text default '',
  rebal_interval_months integer default 6,
  deviation_threshold double precision default 5.0,
  last_rebal_date text default ''
);

create table if not exists portfolio_categories (
  id text primary key,
  template_id text not null,
  name text not null,
  color text default '#2563eb',
  order_idx integer default 0,
  target double precision default 0
);

create table if not exists portfolio_allocations (
  id text primary key,
  template_id text not null,
  category_id text not null,
  source_type text not null,
  source_id text not null
);

alter table portfolio_templates add column if not exists rebal_interval_months integer default 6;
alter table portfolio_templates add column if not exists deviation_threshold double precision default 5.0;
alter table portfolio_templates add column if not exists last_rebal_date text default '';
alter table portfolio_categories add column if not exists target double precision default 0;

alter table settings enable row level security;
alter table savings enable row level security;
alter table overseas_holdings enable row level security;
alter table rebal_history enable row level security;
alter table isa_history enable row level security;
alter table isa_holdings enable row level security;
alter table shinhan_isa_history enable row level security;
alter table shinhan_isa_holdings enable row level security;
alter table crypto_holdings enable row level security;
alter table crypto_history enable row level security;
alter table real_estate enable row level security;
alter table yearly_records enable row level security;
alter table monthly_records enable row level security;
alter table dain_isa_history enable row level security;
alter table dain_isa_holdings enable row level security;
alter table fixed_costs enable row level security;
alter table fixed_savings enable row level security;
alter table portfolio_templates enable row level security;
alter table portfolio_categories enable row level security;
alter table portfolio_allocations enable row level security;

drop policy if exists "read settings" on settings;
drop policy if exists "read savings" on savings;
drop policy if exists "read overseas_holdings" on overseas_holdings;
drop policy if exists "read rebal_history" on rebal_history;
drop policy if exists "read isa_history" on isa_history;
drop policy if exists "read isa_holdings" on isa_holdings;
drop policy if exists "read shinhan_isa_history" on shinhan_isa_history;
drop policy if exists "read shinhan_isa_holdings" on shinhan_isa_holdings;
drop policy if exists "read crypto_holdings" on crypto_holdings;
drop policy if exists "read crypto_history" on crypto_history;
drop policy if exists "read real_estate" on real_estate;
drop policy if exists "read yearly_records" on yearly_records;
drop policy if exists "read monthly_records" on monthly_records;

create policy "read settings" on settings for select using (auth.role() = 'authenticated');
create policy "read savings" on savings for select using (auth.role() = 'authenticated');
create policy "read overseas_holdings" on overseas_holdings for select using (auth.role() = 'authenticated');
create policy "read rebal_history" on rebal_history for select using (auth.role() = 'authenticated');
create policy "read isa_history" on isa_history for select using (auth.role() = 'authenticated');
create policy "read isa_holdings" on isa_holdings for select using (auth.role() = 'authenticated');
create policy "read shinhan_isa_history" on shinhan_isa_history for select using (auth.role() = 'authenticated');
create policy "read shinhan_isa_holdings" on shinhan_isa_holdings for select using (auth.role() = 'authenticated');
create policy "read crypto_holdings" on crypto_holdings for select using (auth.role() = 'authenticated');
create policy "read crypto_history" on crypto_history for select using (auth.role() = 'authenticated');
create policy "read real_estate" on real_estate for select using (auth.role() = 'authenticated');
create policy "read yearly_records" on yearly_records for select using (auth.role() = 'authenticated');
create policy "read monthly_records" on monthly_records for select using (auth.role() = 'authenticated');

drop policy if exists "read dain_isa_history" on dain_isa_history;
drop policy if exists "read dain_isa_holdings" on dain_isa_holdings;
drop policy if exists "read fixed_costs" on fixed_costs;
drop policy if exists "read fixed_savings" on fixed_savings;
drop policy if exists "read portfolio_templates" on portfolio_templates;
drop policy if exists "read portfolio_categories" on portfolio_categories;
drop policy if exists "read portfolio_allocations" on portfolio_allocations;

create policy "read dain_isa_history" on dain_isa_history for select using (auth.role() = 'authenticated');
create policy "read dain_isa_holdings" on dain_isa_holdings for select using (auth.role() = 'authenticated');
create policy "read fixed_costs" on fixed_costs for select using (auth.role() = 'authenticated');
create policy "read fixed_savings" on fixed_savings for select using (auth.role() = 'authenticated');
create policy "read portfolio_templates" on portfolio_templates for select using (auth.role() = 'authenticated');
create policy "read portfolio_categories" on portfolio_categories for select using (auth.role() = 'authenticated');
create policy "read portfolio_allocations" on portfolio_allocations for select using (auth.role() = 'authenticated');
