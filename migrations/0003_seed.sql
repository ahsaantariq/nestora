-- Default platform settings and cancellation policies.
-- No listings and no password are seeded. The first signed-in account becomes
-- the operator unless NESTORA_ADMIN_EMAILS is set on the server.
-- scripts/seed.mjs can also create an operator when NESTORA_ADMIN_EMAIL and
-- NESTORA_ADMIN_PASSWORD are present and DATABASE_URL points at Postgres.

insert into platform_lock (id, founder_user_id)
values (1, null)
on conflict (id) do nothing;

insert into platform_settings (
  id,
  subscription_enabled,
  subscription_amount_cents,
  commission_enabled,
  commission_type,
  commission_fixed_cents,
  commission_bps,
  managed_cleaning_fee_cents,
  managed_management_bps,
  managed_linen_fee_cents,
  managed_maintenance_cents,
  managed_custom_fees,
  tax_bps,
  service_fee_bps,
  currency
) values (
  1,
  false,
  0,
  true,
  'PERCENT',
  0,
  1000,
  0,
  1500,
  0,
  0,
  '[]'::jsonb,
  0,
  0,
  'usd'
)
on conflict (id) do nothing;

insert into cancellation_policies (code, name, summary, rules) values
  (
    'FLEXIBLE',
    'Flexible',
    'Full refund when you cancel at least 24 hours before check-in. After that, the stay is non-refundable.',
    '[{"minHoursBeforeCheckIn":24,"refundBps":10000},{"minHoursBeforeCheckIn":0,"refundBps":0}]'::jsonb
  ),
  (
    'MODERATE',
    'Moderate',
    'Full refund when you cancel at least 5 days before check-in. Inside that window, half is refunded.',
    '[{"minHoursBeforeCheckIn":120,"refundBps":10000},{"minHoursBeforeCheckIn":0,"refundBps":5000}]'::jsonb
  ),
  (
    'STRICT',
    'Strict',
    'Half is refunded when you cancel at least 7 days before check-in. After that, the stay is non-refundable.',
    '[{"minHoursBeforeCheckIn":168,"refundBps":5000},{"minHoursBeforeCheckIn":0,"refundBps":0}]'::jsonb
  )
on conflict (code) do nothing;
