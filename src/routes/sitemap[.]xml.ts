import { createFileRoute } from "@tanstack/react-router";
import { liveSitemapSlugs } from "@/lib/nestora/commerce.server";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const rows = await liveSitemapSlugs();
        const urls = [
          `<url><loc>${origin}/</loc></url>`,
          `<url><loc>${origin}/search</loc></url>`,
          `<url><loc>${origin}/list</loc></url>`,
          ...rows.map((row) => `<url><loc>${origin}/stay/${encodeURIComponent(row.slug)}</loc></url>`),
        ];
        const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`;
        return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } });
      },
    },
  },
});
