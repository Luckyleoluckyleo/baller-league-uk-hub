import gcData from '../data/gamechangers.json';

export type ReportMatch = {
  season: number;
  gameweek: number;
  gameId: number;
  homeTeam: string;
  homeSlug: string;
  awayTeam: string;
  awaySlug: string;
  homeScore: number;
  awayScore: number;
  matchDate?: string | null;
  matchTime?: string | null;
  gamechanger1?: { type: string; goalsScored: number };
  gamechanger2?: { type: string; goalsScored: number };
  goalscorers?: { minute: number; player: string }[];
};

const seasons = (gcData as any).seasons as Record<string, { matches: any[] }>;

/** Every season that has match data, newest first. */
export function seasonNumbers(): number[] {
  return Object.keys(seasons)
    .map(Number)
    .sort((a, b) => b - a);
}

/** Seasons with at least one played match, newest first. */
export function playedSeasonNumbers(): number[] {
  return seasonNumbers().filter((s) =>
    (seasons[String(s)]?.matches || []).some((m) => m.homeScore > 0 || m.awayScore > 0)
  );
}

export function seasonMatches(season: number): ReportMatch[] {
  return (seasons[String(season)]?.matches || []).map((m) => ({ ...m, season }));
}

export function playedSeasonMatches(season: number): ReportMatch[] {
  return seasonMatches(season).filter((m) => m.homeScore > 0 || m.awayScore > 0);
}

export function gameweeksFor(season: number): number[] {
  return [...new Set(playedSeasonMatches(season).map((m) => m.gameweek))].sort((a, b) => a - b);
}

export function gameweekMatches(season: number, gw: number): ReportMatch[] {
  return playedSeasonMatches(season)
    .filter((m) => m.gameweek === gw)
    .sort((a, b) => (a.gameId || 0) - (b.gameId || 0));
}

export function teamMatches(slug: string, season: number): ReportMatch[] {
  return playedSeasonMatches(season)
    .filter((m) => m.homeSlug === slug || m.awaySlug === slug)
    .sort((a, b) => b.gameweek - a.gameweek || (a.gameId || 0) - (b.gameId || 0));
}

export function reportSlug(m: ReportMatch): string {
  return `${m.homeSlug}-vs-${m.awaySlug}-gw${m.gameweek}`;
}

export function reportUrl(m: ReportMatch): string {
  return `/news/${reportSlug(m)}`;
}

export function matchUrl(m: ReportMatch): string {
  return `/match/s${m.season}-${reportSlug(m)}`;
}

export function gwHubUrl(season: number, gw: number): string {
  return `/reports/season-${season}/gw${gw}`;
}

export function teamHubUrl(slug: string): string {
  return `/reports/teams/${slug}`;
}

export function seasonHubUrl(season: number): string {
  return `/season/${season}`;
}
