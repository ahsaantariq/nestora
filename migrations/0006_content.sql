-- Listing history, public pages, FAQs, contact, and navigation.

create table if not exists listing_events (
  id text primary key,
  property_id text not null references properties (id) on delete cascade,
  actor_user_id text,
  action text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists listing_events_property_idx on listing_events (property_id, created_at desc);

create table if not exists cms_pages (
  id text primary key,
  slug text not null unique,
  title text not null,
  seo_title text not null default '',
  seo_description text not null default '',
  body_html text not null default '',
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED')),
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists cms_page_versions (
  id text primary key,
  page_id text not null references cms_pages (id) on delete cascade,
  title text not null,
  seo_title text not null default '',
  seo_description text not null default '',
  body_html text not null default '',
  created_at timestamptz not null default now(),
  actor_user_id text
);

create index if not exists cms_page_versions_page_idx on cms_page_versions (page_id, created_at desc);

create table if not exists faqs (
  id text primary key,
  category text not null check (category in ('GUESTS', 'OWNERS', 'PAYMENTS')),
  question text not null,
  answer text not null,
  sort_order integer not null default 0,
  published boolean not null default true
);

create table if not exists contact_messages (
  id text primary key,
  name text not null,
  email text not null,
  phone text not null default '',
  subject text not null,
  body text not null,
  status text not null default 'UNREAD' check (status in ('UNREAD', 'READ', 'ARCHIVED')),
  reply_text text,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists contact_messages_status_idx on contact_messages (status, created_at desc);

create table if not exists newsletter_subscribers (
  email text primary key,
  created_at timestamptz not null default now()
);

create table if not exists site_nav (
  id text primary key,
  placement text not null check (placement in ('HEADER', 'FOOTER')),
  column_name text not null default '',
  label text not null,
  href text not null,
  sort_order integer not null default 0,
  visible boolean not null default true
);

create table if not exists site_contact (
  id integer primary key check (id = 1),
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  hours text not null default ''
);

insert into site_contact (id, email, phone, address, hours)
values (1, 'hello@nestora.com', '', '', 'Monday to Friday, 9:00–17:00')
on conflict (id) do nothing;

insert into cms_pages (id, slug, title, seo_title, seo_description, body_html, status) values
('about', 'about', 'About us', 'About Nestora', 'Nestora is a marketplace for hotels, houses, apartments, and warehouses.',
$html$<h2>A marketplace for real rooms</h2><p>Nestora connects people who have a space with people who need one. Hotels, houses, apartments, and warehouses are listed by their owners. A stay appears in search only after Nestora reviews it.</p><p>The price you see before you pay is the nightly rate, fees, and tax. Hosts keep their own calendar and house rules. Guests read those rules before they book.</p><p>Nestora does not invent stays or reviews. If a city or a rating is on the site, it comes from a live listing or a completed trip.</p>$html$,
'PUBLISHED'),
('how-it-works', 'how-it-works', 'How it works', 'How Nestora works', 'Search a stay, read the price, and book. Hosts list a space and Nestora reviews it.',
$html$<h2>For guests</h2><p><strong>Search.</strong> Choose a city, dates, and who is coming. Filter by hotels, houses, apartments, or warehouses.</p><p><strong>Book.</strong> The stay page shows photos, house rules, cancellation, and a total before you pay.</p><p><strong>Stay.</strong> Your trip, receipt, and cancellation live in your account.</p><h2>For hosts</h2><p>Create a host account, draft the listing, and send it for review. It goes live after it is approved. You can pause a live stay without deleting existing bookings.</p>$html$,
'PUBLISHED'),
('cancellation', 'cancellation', 'Cancellation and refunds', 'Cancellation policy', 'How Nestora refunds a cancelled stay.',
$html$<h2>The stay sets the policy</h2><p>Every listing uses Flexible, Moderate, or Strict. The policy is shown on the stay page and again before you pay. The refund is a percentage of the amount paid, based on how many hours remain before check-in.</p><p>Cancelling from your trip page starts the refund to the original card. If a refund fails, Nestora can retry it. A security deposit shown on a listing is not charged with the stay.</p>$html$,
'PUBLISHED'),
('privacy', 'privacy', 'Privacy policy', 'Privacy policy', 'What Nestora stores about guests and hosts.',
$html$<h2>What we store</h2><p>We store the account you create: name, email, phone if you add one, and the role on the account. Bookings store dates, guest counts, and the amount paid. We do not store full card numbers. Card payments are handled by the card network.</p><p>Listing photos and messages you send through the contact form are stored so we can run the marketplace and reply to you.</p><h2>How long</h2><p>Account and booking records stay while the account is open and as needed for payments, refunds, and disputes. You can ask us to close an account from your security settings.</p>$html$,
'PUBLISHED'),
('terms', 'terms', 'Terms of service', 'Terms of service', 'The rules for using Nestora.',
$html$<h2>Using Nestora</h2><p>Guests agree to provide accurate trip details and to follow the house rules of a stay they book. Hosts agree that a listing is a real space they can offer, with a price, photos, and rules that match the place.</p><p>Nestora may refuse, pause, or remove a listing or an account that is misleading, unsafe, or unused for abuse. Fees shown in the host dashboard and on the stay page are the fees that apply at the time you book or list.</p>$html$,
'PUBLISHED'),
('cookies', 'cookies', 'Cookie policy', 'Cookie policy', 'How Nestora uses cookies.',
$html$<h2>Cookies we use</h2><p>Nestora uses a sign-in cookie so you stay logged in, and a short-lived cookie to finish checkout. We do not use advertising cookies.</p><p>You can clear cookies in your browser. If you do, you will need to sign in again.</p>$html$,
'PUBLISHED'),
('guest-policy', 'guest-policy', 'Guest policy', 'Guest policy', 'What guests can expect on Nestora.',
$html$<h2>Before you book</h2><p>Read the description, amenities, house rules, and cancellation policy. The guest count includes adults and children. Infants and pets are asked for separately when the stay allows them.</p><p>A pending booking holds the dates for 15 minutes while you pay. A confirmed booking stays on the calendar until you cancel under the stay's policy.</p>$html$,
'PUBLISHED'),
('host-policy', 'host-policy', 'Host policy', 'Host policy', 'What hosts agree to when they list on Nestora.',
$html$<h2>Your listing</h2><p>You can keep as many drafts as you need unless Nestora has set a limit on the account. A listing is not public until it is approved. While it is in review, wait for a decision before editing.</p><p>Keep the calendar accurate. If you cannot host dates that are already booked, cancel with the guest rather than blocking those nights after the fact. Payout details are the ones you enter in the host dashboard.</p>$html$,
'PUBLISHED'),
('safety', 'safety', 'Safety and trust', 'Safety and trust', 'How Nestora reviews listings and handles problems.',
$html$<h2>Reviewed before it is public</h2><p>New listings are read by Nestora before guests can book them. We can ask for changes, reject a listing, or pause one that is already live.</p><p>Reviews can be written after a completed stay. Nestora can hide a review that is not about the stay. If something on a trip is wrong, use the contact form and include the booking dates and the property name.</p>$html$,
'PUBLISHED'),
('help', 'help', 'Help center', 'Help center', 'Where to get help on Nestora.',
$html$<h2>Start here</h2><p>Guests can look up a booking under Trips. Hosts manage drafts, calendars, and payouts in the host dashboard.</p><p>Common questions are on the FAQ page, grouped for guests, hosts, and payments. If you still need a person, use the contact form. Include the property name and the dates if the note is about a booking.</p>$html$,
'PUBLISHED'),
('contact', 'contact', 'Contact', 'Contact Nestora', 'Send Nestora a message.',
$html$<p>Send a note about a booking, a listing, or your account. We reply by email to the address you enter.</p>$html$,
'PUBLISHED'),
('careers', 'careers', 'Careers', 'Careers at Nestora', 'Nestora is not listing open roles yet.',
$html$<p>We are not hiring through this page yet. When roles open, they will be published here.</p>$html$,
'DRAFT')
on conflict (id) do nothing;

insert into faqs (id, category, question, answer, sort_order, published) values
('faq-guest-live', 'GUESTS', 'When does a stay appear in search?', 'After the host submits it and Nestora approves it. Drafts are private.', 0, true),
('faq-guest-price', 'GUESTS', 'Is the price on the stay the price I pay?', 'The quote adds the nightly rate, fees, and tax before you pay. A security deposit, if the host lists one, is shown and is not charged with the stay.', 1, true),
('faq-guest-cancel', 'GUESTS', 'How do cancellations work?', 'Each stay uses Flexible, Moderate, or Strict. The policy is on the stay page. Cancel from your trip and the refund follows that policy.', 2, true),
('faq-owner-review', 'OWNERS', 'When does my listing go live?', 'You can draft it immediately. It appears in search only after Nestora approves it.', 0, true),
('faq-owner-edit', 'OWNERS', 'Can I edit a listing that is in review?', 'Not until there is a decision. If we ask for changes, it returns to a draft and the note explains what to update.', 1, true),
('faq-owner-pause', 'OWNERS', 'Can I pause a live stay?', 'Yes. Pausing hides it from search. Existing bookings stay on the calendar.', 2, true),
('faq-pay-card', 'PAYMENTS', 'Where is my card stored?', 'Nestora does not store the full card number. Payments go through the card network.', 0, true),
('faq-pay-refund', 'PAYMENTS', 'When does a refund arrive?', 'A successful refund is sent back to the original card. Banks can take several days to show it. If a refund fails, Nestora can retry it.', 1, true)
on conflict (id) do nothing;

insert into site_nav (id, placement, column_name, label, href, sort_order, visible) values
('nav-h-stays', 'HEADER', '', 'Stays', '/search', 0, true),
('nav-h-how', 'HEADER', '', 'How it works', '/how-it-works', 1, true),
('nav-h-host', 'HEADER', '', 'List your property', '/host', 2, true),
('nav-f-about', 'FOOTER', 'Company', 'About', '/about', 0, true),
('nav-f-careers', 'FOOTER', 'Company', 'Careers', '/careers', 1, false),
('nav-f-contact', 'FOOTER', 'Company', 'Contact', '/contact', 2, true),
('nav-f-stays', 'FOOTER', 'Guests', 'Find a stay', '/search', 0, true),
('nav-f-faq', 'FOOTER', 'Guests', 'FAQs', '/faqs', 1, true),
('nav-f-help', 'FOOTER', 'Guests', 'Help center', '/help', 2, true),
('nav-f-guest', 'FOOTER', 'Guests', 'Guest policy', '/guest-policy', 3, true),
('nav-f-list', 'FOOTER', 'Hosts', 'List your property', '/host', 0, true),
('nav-f-how', 'FOOTER', 'Hosts', 'How it works', '/how-it-works', 1, true),
('nav-f-hostpol', 'FOOTER', 'Hosts', 'Host policy', '/host-policy', 2, true),
('nav-f-privacy', 'FOOTER', 'Legal', 'Privacy', '/privacy', 0, true),
('nav-f-terms', 'FOOTER', 'Legal', 'Terms', '/terms', 1, true),
('nav-f-cookies', 'FOOTER', 'Legal', 'Cookies', '/cookies', 2, true),
('nav-f-cancel', 'FOOTER', 'Legal', 'Cancellation', '/cancellation', 3, true),
('nav-f-safety', 'FOOTER', 'Legal', 'Safety', '/safety', 4, true)
on conflict (id) do nothing;
