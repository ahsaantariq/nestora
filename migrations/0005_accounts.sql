-- Accounts, secrets, mail queue, and optional per-owner property caps.

alter table profiles add column if not exists max_properties integer;
alter table profiles add column if not exists business_name text;
alter table profiles add column if not exists country text;
alter table profiles add column if not exists city text;
alter table profiles add column if not exists signup_property_type text;
alter table profiles add column if not exists signup_property_count integer;
alter table profiles add column if not exists deactivated_at timestamptz;

alter table platform_settings add column if not exists require_owner_2fa boolean not null default false;

do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'profiles'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%account_status%'
  loop
    execute format('alter table profiles drop constraint %I', r.conname);
  end loop;
end $$;

alter table profiles drop constraint if exists profiles_account_status_check;
alter table profiles
  add constraint profiles_account_status_check
  check (account_status in ('ACTIVE', 'SUSPENDED', 'DEACTIVATED'));

create table if not exists user_security (
  user_id text primary key references "user" ("id") on delete cascade,
  totp_secret_enc text,
  totp_enabled boolean not null default false,
  backup_hashes_enc text,
  failed_attempts integer not null default 0,
  locked_until timestamptz
);

create table if not exists session_assurance (
  session_id text primary key,
  user_id text not null,
  verified_at timestamptz not null default now()
);

create table if not exists signup_intents (
  email text primary key,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  nonce text not null,
  created_at timestamptz not null default now()
);

create table if not exists integration_settings (
  id integer primary key check (id = 1),
  stripe_publishable_key text,
  stripe_secret_enc text,
  stripe_webhook_enc text,
  stripe_live boolean not null default false,
  smtp_host text,
  smtp_port integer,
  smtp_security text,
  smtp_username text,
  smtp_password_enc text,
  smtp_from_name text,
  smtp_from_email text,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into integration_settings (id) values (1) on conflict (id) do nothing;

alter table email_log add column if not exists subject text not null default '';
alter table email_log add column if not exists body text not null default '';
alter table email_log add column if not exists attempts integer not null default 0;
alter table email_log add column if not exists next_attempt_at timestamptz;
alter table email_log add column if not exists sent_at timestamptz;
