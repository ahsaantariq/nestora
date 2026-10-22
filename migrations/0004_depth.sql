-- Listing depth, commerce, and operator audit. Idempotent. Does not drop data.

alter table properties add column if not exists min_nights integer not null default 1;
alter table properties add column if not exists max_nights integer;
alter table properties add column if not exists star_rating smallint;
alter table properties add column if not exists floor_sqm numeric;
alter table properties add column if not exists ceiling_m numeric;
alter table properties add column if not exists loading_docks integer not null default 0;
alter table properties add column if not exists truck_parking integer not null default 0;

alter table property_media add column if not exists is_cover boolean not null default false;

alter table reviews add column if not exists owner_reply text;
alter table reviews add column if not exists hidden boolean not null default false;

alter table profiles add column if not exists verified boolean not null default false;
alter table profiles add column if not exists email_bookings boolean not null default true;

alter table bookings add column if not exists promo_code text;
alter table bookings add column if not exists promo_cents integer not null default 0;

alter table platform_settings add column if not exists stripe_subscription_price_id text;

create table if not exists seasonal_rates (
  id text primary key,
  property_id text not null references properties (id) on delete cascade,
  label text not null,
  starts_on date not null,
  ends_on date not null,
  nightly_cents integer not null check (nightly_cents >= 0)
);

create index if not exists seasonal_rates_property_idx on seasonal_rates (property_id, starts_on);

create table if not exists promo_codes (
  code text primary key,
  percent_bps integer,
  amount_cents integer,
  active boolean not null default true,
  max_uses integer,
  used_count integer not null default 0,
  expires_on date
);

create table if not exists saved_searches (
  id text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  label text not null,
  query jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists saved_searches_user_idx on saved_searches (user_id, created_at desc);

create table if not exists notifications (
  id text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  title text not null,
  body text not null,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on notifications (user_id, created_at desc);

create table if not exists audit_log (
  id text primary key,
  actor_user_id text not null,
  action text not null,
  target text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_idx on audit_log (created_at desc);
