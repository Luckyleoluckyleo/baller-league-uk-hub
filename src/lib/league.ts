import gcData from '../data/gamechangers.json';
import tableData from '../data/table.json';
import standingsData from '../data/standings.json';
import fixturesData from '../data/fixtures.json';

export type Match = {
  gameweek: number;
  homeTeam: string; homeSlug: string; homeEmoji: string;
  awayTeam: string; awaySlug: string; awayEmoji: string;
  homeScore: number; awayScore: number;
  gamechanger1?: { type: string; goalsScored: number };
  gamechanger2?: { type: string; goalsScored: number };
  goalscorers?: { minute: number; player: string }[];
  playerStats?: any[];
  matchDate?: string | null;
  matchTime?: string | null;
};

export type StandingRow = {
  slug: string;
  team: string;
  emoji?: string;
  pos: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  ep: number;
  pts: number;
};

const seasons = (gcData as any).seasons as Record<string, { matches: Match[] }>;
const table = tableData as any[];
const fixtures = fixturesData as any;
const officialBySeason = standingsData as Record<string, any[]>;

// The season the site currently presents: the season the upcoming fixtures belong
// to, otherwise the newest season with match data.
export const CURRENT_SEASON: number =
  fixtures.upcoming?.[0]?.season ?? Math.max(...Object.keys(seasons).map(Number));

export function seasonMatches(season: number | string): Match[] {
  return seasons[String(season)]?.matches ?? [];
}

export function isPlayed(m: Match): boolean {
  return (m.homeScore ?? 0) > 0 || (m.awayScore ?? 0) > 0;
}

export function playedMatches(season: number | string): Match[] {
  return seasonMatches(season).filter(isPlayed);
}

export function teamMeta(slug: string): any | undefined {
  return table.find((t) => t.slug === slug);
}

export function matchSlug(m: Match): string {
  return `${m.homeSlug}-vs-${m.awaySlug}-gw${m.gameweek}`;
}

function computeStandings(matches: Match[], epBySlug: Record<string, number>): StandingRow[] {
  const rec: Record<string, any> = {};
  for (const m of matches) {
    for (const [slug, gf, ga] of [
      [m.homeSlug, m.homeScore, m.awayScore],
      [m.awaySlug, m.awayScore, m.homeScore],
    ] as [string, number, number][]) {
      if (!rec[slug]) rec[slug] = { slug, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 };
      const r = rec[slug];
      r.played++;
      r.gf += gf;
      r.ga += ga;
      if (gf > ga) r.won++;
      else if (gf < ga) r.lost++;
      else r.drawn++;
    }
  }
  const rows = Object.values(rec).map((r: any) => {
    const ep = epBySlug[r.slug] || 0;
    const meta = teamMeta(r.slug);
    return {
      ...r,
      team: meta?.team ?? r.slug,
      emoji: meta?.emoji,
      gd: r.gf - r.ga,
      ep,
      pts: r.won * 3 + r.drawn + ep,
    };
  });
  rows.sort((a: any, b: any) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  rows.forEach((r: any, i: number) => (r.pos = i + 1));
  return rows as StandingRow[];
}

// League table for a season: computed from match results once games are played,
// otherwise the official (possibly all-zero pre-season) table.
export function standingsFor(season: number | string): StandingRow[] {
  const official = officialBySeason[String(season)] ?? [];
  const epBySlug = Object.fromEntries(official.map((r) => [r.slug, r.ep || 0]));
  const league = playedMatches(season).filter((m) => m.gameweek <= 11);
  if (league.length) return computeStandings(league, epBySlug);

  return official
    .slice()
    .sort((a, b) => a.pos - b.pos)
    .map((r) => ({
      ...r,
      emoji: teamMeta(r.slug)?.emoji,
      gf: r.gf ?? 0,
      ga: r.ga ?? 0,
      gd: r.gd ?? 0,
      ep: r.ep ?? 0,
      pts: r.pts ?? 0,
    }));
}

export type FormResult = { label: 'W' | 'D' | 'L'; cls: string; gameweek: number; match: Match };

export function formFor(slug: string, season: number | string): FormResult[] {
  return playedMatches(season)
    .filter((m) => m.homeSlug === slug || m.awaySlug === slug)
    .sort((a, b) => b.gameweek - a.gameweek)
    .slice(0, 5)
    .map((m) => {
      const isHome = m.homeSlug === slug;
      const gd = isHome ? m.homeScore - m.awayScore : m.awayScore - m.homeScore;
      if (gd > 0) return { label: 'W' as const, cls: 'form-win', gameweek: m.gameweek, match: m };
      if (gd < 0) return { label: 'L' as const, cls: 'form-loss', gameweek: m.gameweek, match: m };
      return { label: 'D' as const, cls: 'form-draw', gameweek: m.gameweek, match: m };
    });
}

// Club accent colours used to theme profile pages.
export const TEAM_COLORS: Record<string, string> = {
  "clutch-fc": "#e11d48",
  "deportrio": "#e5153c",
  "gold-devils-fc": "#f5a623",
  "n5-fc": "#3b82f6",
  "ndl-fc": "#f59e0b",
  "rukkas-fc": "#8b5cf6",
  "prime-fc": "#22c55e",
  "yanited": "#ef4444",
  "sds-fc": "#10b981",
  "toma": "#a855f7",
  "vzn-fc": "#38bdf8",
  "wembley-rangers-afc": "#fb7185",
  "m7-fc": "#94a3b8",
  "community-fc": "#14b8a6",
};

export function teamColor(slug?: string | null): string {
  return (slug && TEAM_COLORS[slug]) || "#00e676";
}

// Hex + alpha -> rgba() for glows/borders.
export function teamColorSoft(slug?: string | null, alpha = 0.15): string {
  const hex = teamColor(slug).replace("#", "");
  const n = parseInt(hex, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
