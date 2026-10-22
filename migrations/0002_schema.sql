-- Nestora marketplace schema. Applied automatically on preview startup and on deploy.
-- Money is integer cents. Card numbers are never stored — only Stripe ids, brand, and last4.

create table if not exists profiles (
  user_id text primary key references "user" ("id") on delete cascade,
  display_name text not null,
  phone text,
  role text not null default 'CUSTOMER' check (role in ('CUSTOMER', 'OWNER', 'ADMIN')),
  account_status text not null default 'ACTIVE' check (account_status in ('ACTIVE', 'SUSPENDED')),
  owner_status text not null default 'NONE' check (owner_status in ('NONE', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED')),
  owner_note text,
  owner_reviewed_at timestamptz,
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists platform_lock (
  id integer primary key check (id = 1),
  founder_user_id text
);

create table if not exists platform_settings (
  id integer primary key check (id = 1),
  subscription_enabled boolean not null default false,
  subscription_amount_cents integer not null default 0 check (subscription_amount_cents >= 0),
  commission_enabled boolean not null default true,
  commission_type text not null default 'PERCENT' check (commission_type in ('FIXED', 'PERCENT')),
  commission_fixed_cents integer not null default 0 check (commission_fixed_cents >= 0),
  commission_bps integer not null default 1000 check (commission_bps >= 0 and commission_bps <= 10000),
  managed_cleaning_fee_cents integer not null default 0 check (managed_cleaning_fee_cents >= 0),
  managed_management_bps integer not null default 0 check (managed_management_bps >= 0 and managed_management_bps <= 10000),
  managed_linen_fee_cents integer not null default 0 check (managed_linen_fee_cents >= 0),
  managed_maintenance_cents integer not null default 0 check (managed_maintenance_cents >= 0),
  managed_custom_fees jsonb not null default '[]'::jsonb,
  tax_bps integer not null default 0 check (tax_bps >= 0 and tax_bps <= 10000),
  service_fee_bps integer not null default 0 check (service_fee_bps >= 0 and service_fee_bps <= 10000),
  currency text not null default 'usd',
  updated_at timestamptz not null default now()
);

create table if not exists owner_fee_overrides (
  user_id text primary key references "user" ("id") on delete cascade,
  subscription_enabled boolean,
  subscription_amount_cents integer,
  commission_enabled boolean,
  commission_type text check (commission_type in ('FIXED', 'PERCENT')),
  commission_fixed_cents integer,
  commission_bps integer,
  updated_at timestamptz not null default now()
);

create table if not exists cancellation_policies (
  code text primary key check (code in ('FLEXIBLE', 'MODERATE', 'STRICT')),
  name text not null,
  summary text not null,
  rules jsonb not null
);

create table if not exists properties (
  id text primary key,
  owner_user_id text not null references "user" ("id") on delete cascade,
  property_type text not null check (property_type in ('HOTEL', 'HOUSE', 'APARTMENT', 'WAREHOUSE')),
  title text not null,
  slug text not null unique,
  summary text not null default '',
  description text not null default '',
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PENDING_REVIEW', 'LIVE', 'REJECTED', 'PAUSED')),
  rejection_reason text,
  management_mode text not null default 'OWNER' check (management_mode in ('OWNER', 'NESTORA')),
  address_line text not null default '',
  city text not null default '',
  region text not null default '',
  postal_code text not null default '',
  country text not null default '',
  lat double precision,
  lng double precision,
  max_guests integer not null default 1 check (max_guests >= 1),
  bedrooms integer not null default 0 check (bedrooms >= 0),
  beds integer not null default 1 check (beds >= 0),
  bathrooms double precision not null default 1 check (bathrooms >= 0),
  pets_allowed boolean not null default false,
  max_pets integer not null default 0 check (max_pets >= 0),
  pet_fee_cents integer not null default 0 check (pet_fee_cents >= 0),
  instant_book boolean not null default false,
  nightly_cents integer not null default 0 check (nightly_cents >= 0),
  weekend_cents integer check (weekend_cents is null or weekend_cents >= 0),
  weekly_discount_bps integer not null default 0 check (weekly_discount_bps between 0 and 10000),
  monthly_discount_bps integer not null default 0 check (monthly_discount_bps between 0 and 10000),
  security_deposit_cents integer not null default 0 check (security_deposit_cents >= 0),
  extra_guest_fee_cents integer not null default 0 check (extra_guest_fee_cents >= 0),
  included_guests integer not null default 1 check (included_guests >= 1),
  cleaning_fee_cents integer not null default 0 check (cleaning_fee_cents >= 0),
  check_in_time text not null default '15:00',
  check_out_time text not null default '11:00',
  cancellation_policy text not null default 'MODERATE' references cancellation_policies (code),
  smoking_allowed boolean not null default false,
  parties_allowed boolean not null default false,
  children_allowed boolean not null default true,
  quiet_hours text not null default '',
  house_rules text not null default '',
  check_in_instructions text not null default '',
  video_url text,
  tour_url text,
  amenities text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists properties_status_idx on properties (status);
create index if not exists properties_owner_idx on properties (owner_user_id);
create index if not exists properties_city_idx on properties (city);

create table if not exists property_media (
  id text primary key,
  property_id text not null references properties (id) on delete cascade,
  kind text not null check (kind in ('IMAGE', 'VIDEO')),
  url text not null,
  public_id text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists property_media_property_idx on property_media (property_id, sort_order);

create table if not exists rooms (
  id text primary key,
  property_id text not null references properties (id) on delete cascade,
  name text not null,
  quantity integer not null default 1 check (quantity >= 1),
  nightly_cents integer not null default 0 check (nightly_cents >= 0),
  max_guests integer not null default 1 check (max_guests >= 1),
  beds integer not null default 1 check (beds >= 0),
  description text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists rooms_property_idx on rooms (property_id);

create table if not exists calendar_days (
  property_id text not null references properties (id) on delete cascade,
  room_id text not null default '',
  day date not null,
  price_cents integer check (price_cents is null or price_cents >= 0),
  blocked boolean not null default false,
  primary key (property_id, room_id, day)
);

create table if not exists bookings (
  id text primary key,
  property_id text not null references properties (id),
  room_id text not null default '',
  customer_user_id text not null references "user" ("id"),
  status text not null check (status in ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'REFUNDED')),
  check_in date not null,
  check_out date not null,
  adults integer not null check (adults >= 1),
  children integer not null default 0 check (children >= 0),
  infants integer not null default 0 check (infants >= 0),
  pets boolean not null default false,
  pet_count integer not null default 0 check (pet_count >= 0),
  special_requests text not null default '',
  currency text not null default 'usd',
  nightly_subtotal_cents integer not null default 0,
  discount_cents integer not null default 0,
  extra_guest_cents integer not null default 0,
  pet_fee_cents integer not null default 0,
  cleaning_fee_cents integer not null default 0,
  tax_cents integer not null default 0,
  service_fee_cents integer not null default 0,
  total_cents integer not null default 0,
  security_deposit_cents integer not null default 0,
  fee_snapshot jsonb not null default '{}'::jsonb,
  instant_book boolean not null default false,
  hold_expires_at timestamptz,
  stripe_payment_intent_id text,
  cancellation_policy text not null default 'MODERATE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out > check_in)
);

create index if not exists bookings_customer_idx on bookings (customer_user_id, check_in);
create index if not exists bookings_property_idx on bookings (property_id, check_in);
create index if not exists bookings_status_idx on bookings (status);

-- One row per occupied night. The primary key is what stops a double book.
create table if not exists booking_nights (
  property_id text not null,
  room_id text not null default '',
  night date not null,
  booking_id text not null references bookings (id) on delete cascade,
  primary key (property_id, room_id, night)
);

create table if not exists reviews (
  id text primary key,
  property_id text not null references properties (id) on delete cascade,
  booking_id text not null unique references bookings (id) on delete cascade,
  author_user_id text not null references "user" ("id"),
  rating smallint not null check (rating between 1 and 5),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists reviews_property_idx on reviews (property_id);

create table if not exists payments (
  id text primary key,
  booking_id text not null references bookings (id),
  user_id text not null references "user" ("id"),
  stripe_payment_intent_id text unique,
  idempotency_key text not null unique,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'usd',
  status text not null,
  created_at timestamptz not null default now()
);

create index if not exists payments_booking_idx on payments (booking_id);

create table if not exists refunds (
  id text primary key,
  payment_id text not null references payments (id),
  booking_id text not null references bookings (id),
  stripe_refund_id text unique,
  idempotency_key text not null unique,
  amount_cents integer not null check (amount_cents >= 0),
  status text not null,
  reason text,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payment_methods (
  id text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  stripe_payment_method_id text not null unique,
  brand text not null,
  last4 text not null check (length(last4) = 4),
  exp_month smallint not null check (exp_month between 1 and 12),
  exp_year smallint not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists payment_methods_user_idx on payment_methods (user_id);

create table if not exists saved_properties (
  user_id text not null references "user" ("id") on delete cascade,
  property_id text not null references properties (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, property_id)
);

create table if not exists payout_accounts (
  user_id text primary key references "user" ("id") on delete cascade,
  account_name text not null,
  bank_name text not null,
  account_number text not null,
  routing_code text not null,
  updated_at timestamptz not null default now()
);

create table if not exists payouts (
  id text primary key,
  user_id text not null references "user" ("id"),
  amount_cents integer not null check (amount_cents >= 0),
  status text not null check (status in ('PENDING', 'PAID', 'FAILED')),
  bank_reference text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists payouts_user_idx on payouts (user_id, created_at desc);

create table if not exists owner_subscriptions (
  id text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  stripe_subscription_id text unique,
  status text not null,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists property_views (
  property_id text not null references properties (id) on delete cascade,
  viewed_on date not null,
  view_count integer not null default 0 check (view_count >= 0),
  primary key (property_id, viewed_on)
);

create table if not exists stripe_events (
  id text primary key,
  type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

create table if not exists email_log (
  id text primary key,
  to_address text not null,
  template text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null,
  error text,
  created_at timestamptz not null default now()
);
