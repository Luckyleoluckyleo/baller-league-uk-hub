import type { APIRoute } from 'astro';
import playerData from '../../data/players.json';

export const prerender = true;

// Machine-readable Baller League UK player-stats dataset (all seasons).
export const GET: APIRoute = () =>
  new Response(JSON.stringify(playerData, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  });
