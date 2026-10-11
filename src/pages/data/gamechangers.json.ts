import type { APIRoute } from 'astro';
import gcData from '../../data/gamechangers.json';

export const prerender = true;

// Machine-readable Baller League UK match dataset (all seasons), served for
// journalists, developers and researchers who want to cite or analyse the data.
export const GET: APIRoute = () =>
  new Response(JSON.stringify(gcData, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  });
