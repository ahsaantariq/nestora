-- AI assistant, omnichannel inbox, and the job queue.

alter table integration_settings add column if not exists anthropic_key_enc text;
alter table integration_settings add column if not exists anthropic_model text not null default 'claude-sonnet-4-5';
alter table integration_settings add column if not exists twilio_account_sid text;
alter table integration_settings add column if not exists twilio_auth_token_enc text;
alter table integration_settings add column if not exists twilio_phone text;
alter table integration_settings add column if not exists twilio_whatsapp text;
alter table integration_settings add column if not exists twilio_api_key_enc text;
alter table integration_settings add column if not exists twilio_api_secret_enc text;
alter table integration_settings add column if not exists twilio_twiml_app_sid text;
alter table integration_settings add column if not exists zernio_api_key_enc text;
alter table integration_settings add column if not exists zernio_webhook_secret_enc text;
alter table integration_settings add column if not exists zernio_facebook_account_id text;
alter table integration_settings add column if not exists zernio_instagram_account_id text;
alter table integration_settings add column if not exists imap_host text;
alter table integration_settings add column if not exists imap_port integer;
alter table integration_settings add column if not exists imap_secure boolean not null default true;
alter table integration_settings add column if not exists imap_username text;
alter table integration_settings add column if not exists imap_password_enc text;
alter table integration_settings add column if not exists voice_public_url text;
alter table integration_settings add column if not exists voice_bridge_secret_enc text;
alter table integration_settings add column if not exists public_base_url text;
alter table integration_settings add column if not exists channel_status jsonb not null default '{}'::jsonb;

create table if not exists assistant_settings (
  id integer primary key check (id = 1),
  enabled boolean not null default false,
  assistant_name text not null default 'Nia',
  greeting text not null default 'Hi, I''m Nia, Nestora''s virtual assistant. Where are you hoping to stay, and when?',
  tone_notes text not null default 'Warm, brief, and calm. Like a person at a front desk.',
  business_hours text not null default 'Every day, 8:00 to 20:00 local time',
  languages text not null default 'Reply in the customer''s language.',
  escalation_rules text not null default 'Hand off when someone asks for a person, a cancellation, a refund, or when you are not sure.',
  never_do text not null default 'Never invent a stay, a price, a policy, or a distance. Never cancel, refund, or change a price. Never offer a discount unless discounts are enabled.',
  discount_enabled boolean not null default false,
  max_discount_bps integer not null default 0 check (max_discount_bps >= 0 and max_discount_bps <= 10000),
  monthly_cap_cents integer not null default 5000 check (monthly_cap_cents >= 0),
  alerted_month text,
  recording_enabled boolean not null default true,
  recording_notice text not null default 'This call may be recorded for quality and booking purposes.',
  human_phone text not null default '',
  retention_days integer not null default 90 check (retention_days >= 1 and retention_days <= 3650),
  sms_on boolean not null default false,
  whatsapp_on boolean not null default false,
  voice_on boolean not null default false,
  messenger_on boolean not null default false,
  instagram_on boolean not null default false,
  email_on boolean not null default false,
  web_on boolean not null default true,
  comments_on boolean not null default false,
  input_usd_per_mtok numeric not null default 3,
  output_usd_per_mtok numeric not null default 15
);

insert into assistant_settings (id) values (1) on conflict (id) do nothing;

create table if not exists contacts (
  id text primary key,
  name text not null default '',
  phone text,
  email text,
  user_id text,
  notes text not null default '',
  tags text not null default '',
  consent_sms boolean not null default false,
  consent_whatsapp boolean not null default false,
  opted_out boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists contact_identities (
  id text primary key,
  contact_id text not null references contacts (id) on delete cascade,
  channel text not null,
  external_id text not null,
  unique (channel, external_id)
);

create index if not exists contact_identities_contact_idx on contact_identities (contact_id);

create table if not exists conversations (
  id text primary key,
  contact_id text not null references contacts (id) on delete cascade,
  status text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED')),
  mode text not null default 'AI' check (mode in ('AI', 'HUMAN')),
  assigned_user_id text,
  needs_attention boolean not null default false,
  attention_reason text,
  sentiment text,
  unread boolean not null default false,
  booked boolean not null default false,
  last_message_at timestamptz not null default now(),
  last_preview text not null default '',
  last_channel text not null default 'web',
  last_customer_at timestamptz
);

create index if not exists conversations_last_idx on conversations (last_message_at desc);

create table if not exists conversation_messages (
  id text primary key,
  conversation_id text not null references conversations (id) on delete cascade,
  channel text not null,
  sender text not null check (sender in ('CUSTOMER', 'AI', 'ADMIN', 'SYSTEM')),
  body text not null default '',
  status text not null default 'SENT',
  external_id text,
  kind text not null default 'MESSAGE',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists conversation_messages_external_idx
  on conversation_messages (channel, external_id) where external_id is not null;
create index if not exists conversation_messages_thread_idx on conversation_messages (conversation_id, created_at);

create table if not exists assistant_calls (
  id text primary key,
  conversation_id text,
  contact_id text,
  direction text not null,
  from_number text,
  to_number text,
  call_sid text unique,
  recording_url text,
  transcript text not null default '',
  summary text not null default '',
  duration_seconds integer not null default 0,
  outcome text not null default 'open',
  cost_cents integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists assistant_jobs (
  id text primary key,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  run_at timestamptz not null default now(),
  attempts integer not null default 0,
  status text not null default 'QUEUED',
  last_error text,
  unique_key text unique
);

create index if not exists assistant_jobs_due_idx on assistant_jobs (status, run_at);

create table if not exists webhook_receipts (
  id text primary key,
  source text not null,
  received_at timestamptz not null default now()
);

create table if not exists ai_usage (
  id text primary key,
  conversation_id text,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_cents integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists message_templates (
  id text primary key,
  channel text not null,
  name text not null,
  language text not null default 'en',
  body text not null default '',
  approved boolean not null default false,
  unique (channel, name, language)
);

create table if not exists welcome_tokens (
  token text primary key,
  user_id text not null,
  booking_id text,
  email text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

alter table bookings add column if not exists conversation_id text;
alter table bookings add column if not exists payment_url text;
alter table bookings add column if not exists checkout_session_id text;
alter table bookings add column if not exists guest_name text;
alter table bookings add column if not exists guest_phone text;
alter table bookings add column if not exists payment_channel text;
alter table bookings add column if not exists assistant_notified boolean not null default false;
alter table bookings add column if not exists reminder_sent boolean not null default false;

update cms_pages
set body_html = body_html || $html$<h2>AI assistant, messages, and call recording</h2><p>Nestora's virtual assistant can reply on the website, by email, text message, WhatsApp, Facebook, Instagram, and phone. Those messages, and the booking details in them, are stored so the team can help you. Phone calls may be recorded after a short notice. Recordings and transcripts are kept for the period set by Nestora, then deleted. You can ask Nestora to delete your conversation data. Card numbers are never typed into a chat. Payment happens only on a Stripe page.</p>$html$,
    updated_at = now()
where slug in ('privacy', 'terms')
  and body_html not like '%AI assistant, messages, and call recording%';
