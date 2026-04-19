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
  note text default ''
);

alter table settings enable row level security;
alter table savings enable row level security;
alter table overseas_holdings enable row level security;
alter table rebal_history enable row level security;
alter table isa_history enable row level security;
alter table isa_holdings enable row level security;
alter table crypto_holdings enable row level security;
alter table crypto_history enable row level security;
alter table real_estate enable row level security;
alter table yearly_records enable row level security;

drop policy if exists "read settings" on settings;
drop policy if exists "read savings" on savings;
drop policy if exists "read overseas_holdings" on overseas_holdings;
drop policy if exists "read rebal_history" on rebal_history;
drop policy if exists "read isa_history" on isa_history;
drop policy if exists "read isa_holdings" on isa_holdings;
drop policy if exists "read crypto_holdings" on crypto_holdings;
drop policy if exists "read crypto_history" on crypto_history;
drop policy if exists "read real_estate" on real_estate;
drop policy if exists "read yearly_records" on yearly_records;

create policy "read settings" on settings for select using (auth.role() = 'authenticated');
create policy "read savings" on savings for select using (auth.role() = 'authenticated');
create policy "read overseas_holdings" on overseas_holdings for select using (auth.role() = 'authenticated');
create policy "read rebal_history" on rebal_history for select using (auth.role() = 'authenticated');
create policy "read isa_history" on isa_history for select using (auth.role() = 'authenticated');
create policy "read isa_holdings" on isa_holdings for select using (auth.role() = 'authenticated');
create policy "read crypto_holdings" on crypto_holdings for select using (auth.role() = 'authenticated');
create policy "read crypto_history" on crypto_history for select using (auth.role() = 'authenticated');
create policy "read real_estate" on real_estate for select using (auth.role() = 'authenticated');
create policy "read yearly_records" on yearly_records for select using (auth.role() = 'authenticated');
