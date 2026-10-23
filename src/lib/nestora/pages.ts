export const PAGE_PATHS: Record<string, string> = {
  about: "/about",
  "how-it-works": "/how-it-works",
  faqs: "/faqs",
  contact: "/contact",
  cancellation: "/cancellation",
  privacy: "/privacy",
  terms: "/terms",
  cookies: "/cookies",
  "guest-policy": "/guest-policy",
  "host-policy": "/host-policy",
  safety: "/safety",
  help: "/help",
  careers: "/careers",
};

export const BUILTIN_SLUGS = new Set(Object.keys(PAGE_PATHS));

export function pagePath(slug: string): string {
  return PAGE_PATHS[slug] ?? `/p/${slug}`;
}
