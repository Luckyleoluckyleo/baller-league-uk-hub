import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import gcData from '../data/gamechangers.json';

export const prerender = true;

const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

// Parse the site's match-date format ("12 Oct 2026") into an ISO timestamp.
function iso(dateStr?: string | null): string | null {
  const m = (dateStr || '').match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!m) return null;
  const mm = MONTHS[m[2]];
  if (!mm) return null;
  return `${m[3]}-${mm}-${String(m[1]).padStart(2, '0')}T00:00:00.000Z`;
}

// Emits a URL -> ISO-date map used by generate-sitemap.mjs so <lastmod> reflects the
// real content date instead of the build time (which trains crawlers to ignore it).
export const GET: APIRoute = async () => {
  const map: Record<string, string> = {};

  const news = await getCollection('news');
  for (const a of news) map[`/news/${a.slug}/`] = a.data.date.toISOString();

  const gc = gcData as any;
  for (const [season, s] of Object.entries(gc.seasons)) {
    for (const m of (s as any).matches as any[]) {
      if (m.homeScore === 0 && m.awayScore === 0 && m.gamechanger1?.type === 'unknown') continue;
      const d = iso(m.matchDate);
      if (!d) continue;
      map[`/match/s${season}-${m.homeSlug}-vs-${m.awaySlug}-gw${m.gameweek}/`] = d;
    }
  }

  return new Response(JSON.stringify(map), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
