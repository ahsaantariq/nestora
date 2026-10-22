import { getSql } from "@/lib/db";

const DEMO_ID = "demo-cove-house";
const HOST_ID = "demo-host";

let pending: Promise<void> | null = null;

/** One public listing so the marketplace isn't empty on a fresh database. */
export function ensureDemoCatalog() {
  pending ??= seed().catch((error) => {
    pending = null;
    console.error("[demo] listing was not seeded:", error instanceof Error ? error.message : error);
  });
  return pending;
}

async function seed() {
  const sql = await getSql();
  const existing = await sql<{ id: string }>`select id from properties where id = ${DEMO_ID}`;
  if (existing[0]) return;
  const now = new Date().toISOString();
  await sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values (${HOST_ID}, 'Cedar Cove', 'demo-host@nestora.invalid', true, ${now}, ${now})
    on conflict (id) do nothing
  `;
  await sql`
    insert into profiles (user_id, display_name, role, owner_status, account_status, business_name, city, country)
    values (${HOST_ID}, 'Cedar Cove', 'OWNER', 'APPROVED', 'ACTIVE', 'Cedar Cove', 'Carmel-by-the-Sea', 'United States')
    on conflict (user_id) do nothing
  `;
  await sql`
    insert into properties (
      id, owner_user_id, property_type, title, slug, summary, description, status,
      address_line, city, region, postal_code, country, lat, lng,
      max_guests, bedrooms, beds, bathrooms, pets_allowed, max_pets, pet_fee_cents,
      instant_book, nightly_cents, cleaning_fee_cents, included_guests,
      check_in_time, check_out_time, cancellation_policy, house_rules, amenities, min_nights
    ) values (
      ${DEMO_ID}, ${HOST_ID}, 'HOUSE', 'Cedar Cove House', 'cedar-cove-house',
      'A pale house above the water, with three bedrooms and a path down to the sand.',
      'Cedar Cove is a whole house in Carmel-by-the-Sea: a quiet living room, a kitchen for long breakfasts, and bedrooms dressed in linen. The garden faces the Pacific. Check-in is in the afternoon, and the house rules ask for quiet after 10.',
      'LIVE',
      'Scenic Road', 'Carmel-by-the-Sea', 'California', '93921', 'United States', 36.544, -121.933,
      6, 3, 3, 2, true, 1, 2500,
      true, 28500, 7500, 4,
      '15:00', '11:00', 'MODERATE',
      'No parties. Quiet hours after 10 pm. Shoes off in the bedrooms.',
      ${["Wifi", "Kitchen", "Washer", "Free parking", "Heating", "Self check-in"]},
      2
    )
    on conflict (id) do nothing
  `;
  const photos = [
    ["/stays/cove-exterior.jpg", true],
    ["/stays/cove-living.jpg", false],
    ["/stays/cove-bedroom.jpg", false],
  ] as const;
  for (let index = 0; index < photos.length; index += 1) {
    const [url, cover] = photos[index]!;
    await sql`
      insert into property_media (id, property_id, kind, url, sort_order, is_cover)
      values (${`demo-cove-media-${index}`}, ${DEMO_ID}, 'IMAGE', ${url}, ${index}, ${cover})
      on conflict (id) do nothing
    `;
  }
}
