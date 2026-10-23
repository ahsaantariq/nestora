import { randomUUID } from "node:crypto";
import sanitizeHtml from "sanitize-html";
import { getSql } from "@/lib/db";
import { requireActive } from "./data.server.ts";
import { sendMail } from "./mail.server.ts";
import { writeAudit } from "./audit.server.ts";
import { BUILTIN_SLUGS } from "./pages.ts";

const buckets = new Map<string, number[]>();

function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  buckets.set(key, recent);
  return true;
}

export function cleanHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "h1", "h2", "h3", "p", "br", "strong", "em", "u", "s", "span", "a", "ul", "ol", "li",
      "blockquote", "hr", "table", "thead", "tbody", "tr", "th", "td", "img", "div", "mark",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt"],
      span: ["style"],
      p: ["style"],
      div: ["style"],
      h1: ["style"],
      h2: ["style"],
      h3: ["style"],
      li: ["style"],
      mark: ["style", "data-color"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedStyles: {
      "*": {
        color: [/^#[0-9a-f]{3,8}$/i, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i],
        "background-color": [/^#[0-9a-f]{3,8}$/i, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i],
        "font-size": [/^\d+(px|rem|em)$/],
        "text-align": [/^(left|right|center|justify)$/],
      },
    },
    allowedSchemes: ["http", "https", "mailto"],
  });
}

function slugOk(slug: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

async function admin(userId: string) {
  return requireActive(userId, ["ADMIN"]);
}

export type PublicPage = {
  slug: string;
  title: string;
  seoTitle: string;
  seoDescription: string;
  bodyHtml: string;
};

export async function loadPublicPage(slug: string): Promise<PublicPage | null> {
  const sql = await getSql();
  const rows = await sql<{ slug: string; title: string; seo_title: string; seo_description: string; body_html: string }>`
    select slug, title, seo_title, seo_description, body_html
    from cms_pages
    where slug = ${slug} and status = 'PUBLISHED'
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    slug: row.slug,
    title: row.title,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    bodyHtml: cleanHtml(row.body_html),
  };
}

export async function listPages(userId: string) {
  await admin(userId);
  const sql = await getSql();
  return sql<{ id: string; slug: string; title: string; status: string; updated_at: string }>`
    select id, slug, title, status, updated_at::text as updated_at
    from cms_pages
    order by title asc
  `;
}

export async function loadPageAdmin(userId: string, id: string) {
  await admin(userId);
  const sql = await getSql();
  const rows = await sql<{
    id: string; slug: string; title: string; seo_title: string; seo_description: string; body_html: string; status: string; updated_at: string;
  }>`
    select id, slug, title, seo_title, seo_description, body_html, status, updated_at::text as updated_at
    from cms_pages where id = ${id}
  `;
  const page = rows[0];
  if (!page) throw new Error("That page was not found.");
  const versions = await sql<{ id: string; title: string; created_at: string }>`
    select id, title, created_at::text as created_at
    from cms_page_versions
    where page_id = ${id}
    order by created_at desc
    limit 10
  `;
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    seoTitle: page.seo_title,
    seoDescription: page.seo_description,
    bodyHtml: page.body_html,
    status: page.status,
    updatedAt: page.updated_at,
    builtin: BUILTIN_SLUGS.has(page.slug),
    versions,
  };
}

async function keepVersions(pageId: string) {
  const sql = await getSql();
  await sql`
    delete from cms_page_versions
    where page_id = ${pageId}
      and id not in (
        select id from cms_page_versions where page_id = ${pageId} order by created_at desc limit 10
      )
  `;
}

export async function savePage(
  userId: string,
  input: { id: string; title: string; seoTitle: string; seoDescription: string; bodyHtml: string; status: "DRAFT" | "PUBLISHED" },
) {
  const profile = await admin(userId);
  const title = input.title.trim();
  if (!title) throw new Error("Add a title.");
  const sql = await getSql();
  const body = cleanHtml(input.bodyHtml).slice(0, 200_000);
  const rows = await sql<{ id: string }>`
    update cms_pages set
      title = ${title.slice(0, 140)},
      seo_title = ${input.seoTitle.trim().slice(0, 140)},
      seo_description = ${input.seoDescription.trim().slice(0, 300)},
      body_html = ${body},
      status = ${input.status},
      updated_at = now(),
      updated_by = ${profile.userId}
    where id = ${input.id}
    returning id
  `;
  if (!rows[0]) throw new Error("That page was not found.");
  await sql`
    insert into cms_page_versions (id, page_id, title, seo_title, seo_description, body_html, actor_user_id)
    values (${randomUUID()}, ${input.id}, ${title.slice(0, 140)}, ${input.seoTitle.trim().slice(0, 140)}, ${input.seoDescription.trim().slice(0, 300)}, ${body}, ${profile.userId})
  `;
  await keepVersions(input.id);
  await writeAudit(profile.userId, "page.save", input.id, { title, status: input.status });
  return loadPageAdmin(userId, input.id);
}

export async function createPage(userId: string, input: { title: string; slug: string }) {
  const profile = await admin(userId);
  const slug = input.slug.trim().toLowerCase();
  if (!slugOk(slug)) throw new Error("Use a short URL made of lowercase letters, numbers, and dashes.");
  if (BUILTIN_SLUGS.has(slug)) throw new Error("That address is already used.");
  const title = input.title.trim();
  if (!title) throw new Error("Add a title.");
  const sql = await getSql();
  const id = randomUUID();
  try {
    await sql`
      insert into cms_pages (id, slug, title, body_html, status, updated_by)
      values (${id}, ${slug}, ${title.slice(0, 140)}, ${"<p></p>"}, 'DRAFT', ${profile.userId})
    `;
  } catch {
    throw new Error("That address is already used.");
  }
  await writeAudit(profile.userId, "page.create", id, { slug });
  return { id };
}

export async function deletePage(userId: string, id: string) {
  const profile = await admin(userId);
  const sql = await getSql();
  const rows = await sql<{ slug: string }>`select slug from cms_pages where id = ${id}`;
  const slug = rows[0]?.slug;
  if (!slug) throw new Error("That page was not found.");
  if (BUILTIN_SLUGS.has(slug)) throw new Error("Built-in pages stay in the list. Unpublish them instead of deleting.");
  await sql`delete from cms_pages where id = ${id}`;
  await writeAudit(profile.userId, "page.delete", id, { slug });
  return { ok: true as const };
}

export async function restorePageVersion(userId: string, versionId: string) {
  const profile = await admin(userId);
  const sql = await getSql();
  const rows = await sql<{ page_id: string; title: string; seo_title: string; seo_description: string; body_html: string }>`
    select page_id, title, seo_title, seo_description, body_html
    from cms_page_versions where id = ${versionId}
  `;
  const version = rows[0];
  if (!version) throw new Error("That version is gone.");
  await sql`
    update cms_pages set
      title = ${version.title},
      seo_title = ${version.seo_title},
      seo_description = ${version.seo_description},
      body_html = ${cleanHtml(version.body_html)},
      updated_at = now(),
      updated_by = ${profile.userId}
    where id = ${version.page_id}
  `;
  await writeAudit(profile.userId, "page.restore", version.page_id, { versionId });
  return loadPageAdmin(userId, version.page_id);
}

export async function listPublicFaqs() {
  const sql = await getSql();
  return sql<{ id: string; category: string; question: string; answer: string; sort_order: number }>`
    select id, category, question, answer, sort_order
    from faqs
    where published = true
    order by sort_order asc, question asc
  `;
}

export async function listFaqsAdmin(userId: string) {
  await admin(userId);
  const sql = await getSql();
  return sql<{ id: string; category: string; question: string; answer: string; sort_order: number; published: boolean }>`
    select id, category, question, answer, sort_order, published
    from faqs
    order by category asc, sort_order asc, question asc
  `;
}

export async function saveFaq(
  userId: string,
  input: { id?: string; category: "GUESTS" | "OWNERS" | "PAYMENTS"; question: string; answer: string; published: boolean },
) {
  const profile = await admin(userId);
  const question = input.question.trim();
  const answer = input.answer.trim();
  if (!question || !answer) throw new Error("Add a question and an answer.");
  const sql = await getSql();
  const id = input.id || randomUUID();
  await sql`
    insert into faqs (id, category, question, answer, published, sort_order)
    values (${id}, ${input.category}, ${question.slice(0, 200)}, ${answer.slice(0, 4000)}, ${input.published}, 0)
    on conflict (id) do update set
      category = excluded.category,
      question = excluded.question,
      answer = excluded.answer,
      published = excluded.published
  `;
  await writeAudit(profile.userId, "faq.save", id, { question });
  return { id };
}

export async function deleteFaq(userId: string, id: string) {
  const profile = await admin(userId);
  const sql = await getSql();
  await sql`delete from faqs where id = ${id}`;
  await writeAudit(profile.userId, "faq.delete", id, {});
  return { ok: true as const };
}

export async function reorderFaqs(userId: string, ids: string[]) {
  const profile = await admin(userId);
  const sql = await getSql();
  for (let index = 0; index < ids.length; index += 1) {
    await sql`update faqs set sort_order = ${index} where id = ${ids[index]}`;
  }
  await writeAudit(profile.userId, "faq.reorder", "faqs", { count: ids.length });
  return listFaqsAdmin(userId);
}

const SUBJECTS = ["Booking", "Listing", "Payments", "Account", "Something else"] as const;

export async function submitContact(input: {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  companyWebsite: string;
}) {
  if (input.companyWebsite.trim()) return { ok: true as const };
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const message = input.message.trim();
  if (!name || !email || !message) throw new Error("Add your name, email, and message.");
  if (!SUBJECTS.includes(input.subject as (typeof SUBJECTS)[number])) throw new Error("Choose a subject.");
  if (!rateLimit(`contact:${email}`, 5, 60 * 60 * 1000)) {
    throw new Error("Too many messages from this email. Try again in an hour.");
  }
  const sql = await getSql();
  const recent = await sql<{ n: number }>`
    select count(*)::int as n from contact_messages
    where lower(email) = ${email} and created_at > now() - interval '1 hour'
  `;
  if ((recent[0]?.n ?? 0) >= 5) throw new Error("Too many messages from this email. Try again in an hour.");
  const id = randomUUID();
  await sql`
    insert into contact_messages (id, name, email, phone, subject, body)
    values (${id}, ${name.slice(0, 80)}, ${email.slice(0, 160)}, ${input.phone.trim().slice(0, 40)}, ${input.subject}, ${message.slice(0, 4000)})
  `;
  const admins = await sql<{ email: string }>`
    select u.email from profiles p join "user" u on u.id = p.user_id
    where p.role = 'ADMIN' and p.account_status = 'ACTIVE'
  `;
  for (const admin of admins) {
    await sendMail({
      to: admin.email,
      template: "contact-new",
      subject: `New message: ${input.subject}`,
      text: `${name} <${email}>\n${input.phone}\n\n${message}`,
    });
  }
  return { ok: true as const };
}

export async function listMessages(userId: string, input: { q: string; status: string }) {
  await admin(userId);
  const sql = await getSql();
  const where = ["true"];
  const params: unknown[] = [];
  const add = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (["UNREAD", "READ", "ARCHIVED"].includes(input.status)) where.push(`status = ${add(input.status)}`);
  if (input.q.trim()) {
    const token = add(`%${input.q.trim()}%`);
    where.push(`(name ilike ${token} or email ilike ${token} or subject ilike ${token} or body ilike ${token})`);
  }
  return sql.query<{
    id: string; name: string; email: string; phone: string; subject: string; body: string; status: string; reply_text: string | null; created_at: string;
  }>(
    `select id, name, email, phone, subject, body, status, reply_text, created_at::text as created_at
     from contact_messages
     where ${where.join(" and ")}
     order by created_at desc
     limit 200`,
    params,
  );
}

export async function setMessageStatus(userId: string, id: string, status: "UNREAD" | "READ" | "ARCHIVED") {
  await admin(userId);
  const sql = await getSql();
  await sql`update contact_messages set status = ${status} where id = ${id}`;
  return { ok: true as const };
}

export async function replyToMessage(userId: string, id: string, reply: string) {
  const profile = await admin(userId);
  const text = reply.trim();
  if (!text) throw new Error("Write a reply.");
  const sql = await getSql();
  const rows = await sql<{ email: string; subject: string; name: string }>`
    select email, subject, name from contact_messages where id = ${id}
  `;
  const message = rows[0];
  if (!message) throw new Error("That message was not found.");
  await sendMail({
    to: message.email,
    template: "contact-reply",
    subject: `Re: ${message.subject}`,
    text: text.slice(0, 4000),
  });
  await sql`
    update contact_messages
    set reply_text = ${text.slice(0, 4000)}, replied_at = now(), status = 'READ'
    where id = ${id}
  `;
  await writeAudit(profile.userId, "message.reply", id, { to: message.email });
  return { ok: true as const };
}

export async function deleteMessage(userId: string, id: string) {
  const profile = await admin(userId);
  const sql = await getSql();
  await sql`delete from contact_messages where id = ${id}`;
  await writeAudit(profile.userId, "message.delete", id, {});
  return { ok: true as const };
}

export async function subscribeNewsletter(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("Enter a valid email.");
  const sql = await getSql();
  await sql`
    insert into newsletter_subscribers (email) values (${normalized.slice(0, 160)})
    on conflict (email) do nothing
  `;
  return { ok: true as const };
}

export async function listSubscribers(userId: string) {
  await admin(userId);
  const sql = await getSql();
  return sql<{ email: string; created_at: string }>`
    select email, created_at::text as created_at from newsletter_subscribers order by created_at desc limit 200
  `;
}

export async function loadPublicChrome() {
  const sql = await getSql();
  const links = await sql<{ id: string; placement: string; column_name: string; label: string; href: string; sort_order: number }>`
    select id, placement, column_name, label, href, sort_order
    from site_nav
    where visible = true
    order by sort_order asc, label asc
  `;
  const contactRows = await sql<{ email: string; phone: string; address: string; hours: string }>`
    select email, phone, address, hours from site_contact where id = 1
  `;
  return {
    links,
    contact: contactRows[0] ?? { email: "", phone: "", address: "", hours: "" },
  };
}

export async function loadNavAdmin(userId: string) {
  await admin(userId);
  const sql = await getSql();
  const links = await sql<{ id: string; placement: string; column_name: string; label: string; href: string; sort_order: number; visible: boolean }>`
    select id, placement, column_name, label, href, sort_order, visible
    from site_nav
    order by placement asc, column_name asc, sort_order asc
  `;
  const contactRows = await sql<{ email: string; phone: string; address: string; hours: string }>`
    select email, phone, address, hours from site_contact where id = 1
  `;
  return { links, contact: contactRows[0] ?? { email: "", phone: "", address: "", hours: "" } };
}

export async function saveNavigation(
  userId: string,
  links: { id: string; placement: "HEADER" | "FOOTER"; columnName: string; label: string; href: string; sortOrder: number; visible: boolean }[],
) {
  const profile = await admin(userId);
  if (links.length > 60) throw new Error("Keep the menu under 60 links.");
  const sql = await getSql();
  await sql`delete from site_nav`;
  for (const link of links) {
    const label = link.label.trim().slice(0, 80);
    const href = link.href.trim().slice(0, 200);
    if (!label || !href) continue;
    if (!href.startsWith("/") && !href.startsWith("https://") && !href.startsWith("mailto:")) {
      throw new Error(`“${label}” needs a path starting with / or an https link.`);
    }
    await sql`
      insert into site_nav (id, placement, column_name, label, href, sort_order, visible)
      values (${link.id || randomUUID()}, ${link.placement}, ${link.columnName.trim().slice(0, 40)}, ${label}, ${href}, ${link.sortOrder}, ${link.visible})
    `;
  }
  await writeAudit(profile.userId, "nav.save", "site", { count: links.length });
  return loadNavAdmin(userId);
}

export async function saveContactDetails(userId: string, input: { email: string; phone: string; address: string; hours: string }) {
  const profile = await admin(userId);
  const sql = await getSql();
  await sql`
    insert into site_contact (id, email, phone, address, hours)
    values (1, ${input.email.trim().slice(0, 160)}, ${input.phone.trim().slice(0, 40)}, ${input.address.trim().slice(0, 240)}, ${input.hours.trim().slice(0, 120)})
    on conflict (id) do update set
      email = excluded.email,
      phone = excluded.phone,
      address = excluded.address,
      hours = excluded.hours
  `;
  await writeAudit(profile.userId, "contact.save", "site", {});
  return loadNavAdmin(userId);
}

export async function loadMarketplace() {
  const { searchStays } = await import("./data.server.ts");
  const { listDestinations } = await import("./listings.server.ts");
  const stays = (await searchStays({
    location: "",
    type: "",
    minCents: null,
    maxCents: null,
    guests: 0,
    bedrooms: 0,
    pets: false,
    instant: false,
    minRating: 0,
    amenities: [],
    sort: "newest",
  })).slice(0, 6);
  const destinations = await listDestinations();
  const sql = await getSql();
  const counts = await sql<{ property_type: string; n: number }>`
    select property_type, count(*)::int as n from properties where status = 'LIVE' group by property_type
  `;
  const statsRows = await sql<{ stays: number; cities: number; bookings: number }>`
    select
      (select count(*)::int from properties where status = 'LIVE') as stays,
      (select count(distinct city)::int from properties where status = 'LIVE' and city <> '') as cities,
      (select count(*)::int from bookings where status in ('CONFIRMED', 'CHECKED_IN', 'COMPLETED')) as bookings
  `;
  const reviews = await sql<{ id: string; rating: number; body: string; title: string; slug: string; author: string }>`
    select r.id, r.rating, r.body, p.title, p.slug, pr.display_name as author
    from reviews r
    join properties p on p.id = r.property_id
    join profiles pr on pr.user_id = r.author_user_id
    where r.hidden = false and p.status = 'LIVE'
    order by r.created_at desc
    limit 6
  `;
  const faqs = await sql<{ id: string; question: string; answer: string }>`
    select id, question, answer from faqs where published = true order by sort_order asc, question asc limit 5
  `;
  return {
    stays,
    destinations,
    counts,
    stats: statsRows[0] ?? { stays: 0, cities: 0, bookings: 0 },
    reviews,
    faqs,
  };
}
