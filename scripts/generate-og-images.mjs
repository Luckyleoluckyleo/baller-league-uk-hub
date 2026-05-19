import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const newsDir = path.join(rootDir, 'src/content/news');
const ogDir = path.join(rootDir, 'public/og');

if (!fs.existsSync(ogDir)) fs.mkdirSync(ogDir, { recursive: true });

function parseFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = {};
  m[1].split('\n').forEach(line => {
    const kv = line.match(/^(\w+):\s*(.+)/);
    if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  });
  return fm;
}

function slugToTeamName(slug) {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function parseMatchSlug(slug) {
  const gwMatch = slug.match(/^(.+?)-vs-(.+?)-gw(\d+)/i);
  if (gwMatch) {
    return { homeSlug: gwMatch[1], awaySlug: gwMatch[2], gw: parseInt(gwMatch[3]), isPreview: slug.includes('-preview') };
  }
  const ffMatch = slug.match(/^(.+?)-vs-(.+?)-final-four/i);
  if (ffMatch) {
    return { homeSlug: ffMatch[1], awaySlug: ffMatch[2], gw: 0, isPreview: true, isFinalFour: true };
  }
  return null;
}

const files = fs.readdirSync(newsDir).filter(f => f.endsWith('.md'));
let generated = 0;

for (const file of files) {
  const content = fs.readFileSync(path.join(newsDir, file), 'utf-8');
  const fm = parseFrontmatter(content);
  if (!fm || !fm.title) continue;

  const slug = file.replace('.md', '');
  const match = parseMatchSlug(slug);
  if (!match) continue;

  const homeName = slugToTeamName(match.homeSlug);
  const awayName = slugToTeamName(match.awaySlug);
  const scoreText = match.isPreview ? 'VS' : '';
  const catLabel = match.isFinalFour ? 'FINAL FOUR' : (match.isPreview ? 'PREVIEW' : 'MATCH REPORT');
  const gwLabel = match.isFinalFour ? 'THE O2 · 25 MAY 2026' : `GAMEWEEK ${match.gw}`;

  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0f1625"/>
      <stop offset="100%" style="stop-color:#1b2840"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#00e676"/>
      <stop offset="100%" style="stop-color:#00c853"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Brand bar -->
  <rect x="0" y="0" width="1200" height="4" fill="url(#accent)"/>

  <!-- Top label -->
  <text x="600" y="60" text-anchor="middle" font-family="Inter, sans-serif" font-size="22" font-weight="700" fill="#64748b" letter-spacing="6">BALLER LEAGUE UK HUB</text>

  <!-- Category badge -->
  <rect x="440" y="210" width="320" height="40" rx="20" fill="rgba(0,230,118,0.12)" stroke="rgba(0,230,118,0.3)" stroke-width="1"/>
  <text x="600" y="237" text-anchor="middle" font-family="Inter, sans-serif" font-size="16" font-weight="700" fill="#00e676" letter-spacing="4">${catLabel}</text>

  <!-- Home team -->
  <text x="300" y="340" text-anchor="middle" font-family="Bebas Neue, Impact, sans-serif" font-size="64" font-weight="700" fill="#edf0ff">${homeName}</text>

  <!-- VS / Score -->
  <text x="600" y="350" text-anchor="middle" font-family="Bebas Neue, Impact, sans-serif" font-size="48" font-weight="400" fill="#94a3b8">${scoreText}</text>

  <!-- Away team -->
  <text x="900" y="340" text-anchor="middle" font-family="Bebas Neue, Impact, sans-serif" font-size="64" font-weight="700" fill="#edf0ff">${awayName}</text>

  <!-- Divider -->
  <line x1="200" y1="390" x2="1000" y2="390" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>

  <!-- Gameweek -->
  <rect x="510" y="430" width="180" height="44" rx="8" fill="rgba(0,230,118,0.15)" stroke="rgba(0,230,118,0.3)" stroke-width="1"/>
  <text x="600" y="460" text-anchor="middle" font-family="Bebas Neue, Impact, sans-serif" font-size="28" font-weight="700" fill="#00e676">${gwLabel}</text>

  <!-- Footer -->
  <text x="600" y="570" text-anchor="middle" font-family="Inter, sans-serif" font-size="18" font-weight="500" fill="#475569">ballerleagueukhub.com</text>
</svg>`;

  const outFile = path.join(ogDir, `${slug}.png`);
  try {
    await sharp(Buffer.from(svg)).png().toFile(outFile);
    generated++;
    console.log(`OG: ${slug}.png`);
  } catch (e) {
    console.error(`Failed: ${slug} — ${e.message}`);
  }
}

console.log(`\nGenerated ${generated} OG images`);
