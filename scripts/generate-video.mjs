import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import sharp from "sharp";

// Short-form (vertical 1080x1920) Baller League UK data videos, generated from our
// own data — no third-party footage, so they're clean to post on YouTube/Shorts,
// TikTok, Reels and X. Manual/offline tool (not part of `npm run update`).
//
// Usage:
//   node scripts/generate-video.mjs
//   node scripts/generate-video.mjs --season=3 --gw=11
//   node scripts/generate-video.mjs --type=scorers   # results | scorers | table
//
// Requires ffmpeg: `npm i ffmpeg-static --no-save` (or a system install).

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "output");
const TMP_DIR = resolve(OUT_DIR, ".frames");
const LOGO_DIR = resolve(ROOT, "public", "logos");

const W = 1080, H = 1920, FPS = 25;

const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));
const gcData = read("src/data/gamechangers.json");
const playerData = read("src/data/players.json");
const tableData = read("src/data/table.json");
const standingsData = read("src/data/standings.json");

const nameBySlug = Object.fromEntries(tableData.map((t) => [t.slug, t.team]));

const TEAM_COLORS = {
  "clutch-fc": "#e11d48", deportrio: "#e5153c", "gold-devils-fc": "#f5a623", "n5-fc": "#3b82f6",
  "ndl-fc": "#f59e0b", "rukkas-fc": "#8b5cf6", "prime-fc": "#22c55e", yanited: "#ef4444",
  "sds-fc": "#10b981", toma: "#a855f7", "vzn-fc": "#38bdf8", "wembley-rangers-afc": "#fb7185",
  "m7-fc": "#94a3b8", "community-fc": "#14b8a6",
};
const color = (slug) => TEAM_COLORS[slug] || "#00e676";

const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : def;
};

const seasons = gcData.seasons;
const seasonKeys = Object.keys(seasons).map(Number).sort((a, b) => b - a);
const seasonWithResults = seasonKeys.find((s) => seasons[String(s)].matches.some((m) => m.homeScore > 0 || m.awayScore > 0));
const SEASON = String(arg("season", seasonWithResults ?? seasonKeys[0]));
const matches = seasons[SEASON].matches.filter((m) => m.homeScore > 0 || m.awayScore > 0);
const gwsPlayed = [...new Set(matches.map((m) => m.gameweek))].sort((a, b) => a - b);
const GW = Number(arg("gw", gwsPlayed[gwsPlayed.length - 1] ?? 1));
const TYPE = arg("type", "results");

// ─── math helpers ─────────────────────────────────────────────────
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
const easeBack = (x) => { const c1 = 1.70158, c3 = c1 + 1, t = clamp(x) - 1; return 1 + c3 * t * t * t + c1 * t * t; };
const lerp = (a, b, t) => a + (b - a) * t;

// League table for a season computed from its played matches (EP from standings.json).
function computeTable(seasonMatches, season) {
  const epBySlug = Object.fromEntries((standingsData[String(season)] || []).map((r) => [r.slug, r.ep || 0]));
  const rec = {};
  for (const m of seasonMatches) {
    for (const [slug, gf, ga] of [[m.homeSlug, m.homeScore, m.awayScore], [m.awaySlug, m.awayScore, m.homeScore]]) {
      if (!rec[slug]) rec[slug] = { slug, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 };
      const r = rec[slug];
      r.played++; r.gf += gf; r.ga += ga;
      if (gf > ga) r.won++; else if (gf < ga) r.lost++; else r.drawn++;
    }
  }
  const rows = Object.values(rec).map((r) => ({
    ...r, team: nameBySlug[r.slug] || r.slug, gd: r.gf - r.ga, pts: r.won * 3 + r.drawn + (epBySlug[r.slug] || 0),
  }));
  rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  rows.forEach((r, i) => (r.pos = i + 1));
  return rows;
}

// ─── logo assets (rendered to PNG data URIs once) ─────────────────
const logoCache = {};
async function logoDataUri(slug) {
  if (slug in logoCache) return logoCache[slug];
  const file = resolve(LOGO_DIR, `${slug}.svg`);
  if (!existsSync(file)) return (logoCache[slug] = null);
  try {
    const png = await sharp(readFileSync(file)).resize(300, 300, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    return (logoCache[slug] = `data:image/png;base64,${png.toString("base64")}`);
  } catch {
    return (logoCache[slug] = null);
  }
}

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const FONT = "Arial, Helvetica, sans-serif";

// ─── persistent chrome ────────────────────────────────────────────
function chrome() {
  return `
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="${H}" fill="url(#glowG)"/>
    <rect width="${W}" height="${H}" fill="url(#glowB)"/>
    <rect x="0" y="0" width="${W}" height="12" fill="url(#accent)"/>
    <text x="60" y="130" font-family="${FONT}" font-size="32" font-weight="700" fill="#5b6b85" letter-spacing="9">BALLER LEAGUE UK HUB</text>
    <rect x="0" y="${H - 130}" width="${W}" height="130" fill="#080d17"/>
    <rect x="0" y="${H - 130}" width="${W}" height="3" fill="url(#accent)"/>
    <text x="${W / 2}" y="${H - 54}" text-anchor="middle" font-family="${FONT}" font-size="42" font-weight="800" fill="#00e676">ballerleagueukhub.com</text>`;
}

function defs() {
  return `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#06060e"/><stop offset="55%" stop-color="#0b1220"/><stop offset="100%" stop-color="#101a2e"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#00e676"/><stop offset="100%" stop-color="#00b0ff"/>
    </linearGradient>
    <radialGradient id="glowG" cx="82%" cy="14%" r="55%">
      <stop offset="0%" stop-color="#00e676" stop-opacity="0.20"/><stop offset="100%" stop-color="#00e676" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="10%" cy="88%" r="60%">
      <stop offset="0%" stop-color="#00b0ff" stop-opacity="0.16"/><stop offset="100%" stop-color="#00b0ff" stop-opacity="0"/>
    </radialGradient>
  </defs>`;
}

function wrap(content) {
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  ${defs()}${chrome()}${content}</svg>`;
}

// logo plate + image, with entrance scale
function logoBadge(slug, uri, cx, cy, size, scale = 1) {
  const s = size * scale;
  const plate = `<rect x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" rx="${size / 2}" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.12)" stroke-width="3"/>`;
  const img = uri
    ? `<image x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" xlink:href="${uri}" preserveAspectRatio="xMidYMid meet"/>`
    : `<text x="${cx}" y="${cy + size * 0.16}" text-anchor="middle" font-family="${FONT}" font-size="${size * 0.5}" font-weight="800" fill="${color(slug)}">${esc(slug.slice(0, 2).toUpperCase())}</text>`;
  return plate + img;
}

// ─── scenes ───────────────────────────────────────────────────────
function sceneIntro(lt) {
  const a = (d, dur = 0.6) => ease(clamp((lt - d) / dur));
  const rise = (p) => (1 - p) * 70;
  const e1 = a(0.15), e2 = a(0.45), e3 = a(0.75);
  return `
    <text x="60" y="${760 + rise(e1)}" opacity="${e1}" font-family="${FONT}" font-size="150" font-weight="800" fill="#ffffff">SEASON</text>
    <text x="60" y="${935 + rise(e2)}" opacity="${e2}" font-family="${FONT}" font-size="150" font-weight="800" fill="url(#accent)">${SEASON}</text>
    <text x="62" y="${1110 + rise(e3)}" opacity="${e3}" font-family="${FONT}" font-size="80" font-weight="800" fill="#ffffff">GAMEWEEK ${GW}</text>
    <text x="64" y="${1200 + rise(e3)}" opacity="${e3 * 0.9}" font-family="${FONT}" font-size="56" font-weight="600" fill="#8b9bb8" letter-spacing="2">RESULTS &amp; SCORES</text>
    <rect x="60" y="${1300}" width="${(W - 200) * ease(clamp((lt - 0.9) / 0.7))}" height="6" rx="3" fill="url(#accent)"/>`;
}

function sceneMatch(m, lt, uriHome, uriAway, index) {
  const winnerHome = m.homeScore > m.awayScore;
  const draw = m.homeScore === m.awayScore;
  const ent = ease(clamp(lt / 0.5));
  const countP = ease(clamp((lt - 0.25) / 0.7));
  const pop = 1 + Math.max(0, 0.25 * (easeBack(clamp((lt - 0.25) / 0.5)) - 1) + 0.12 * Math.sin(clamp((lt - 0.95) / 0.4) * Math.PI));
  const hs = Math.round(m.homeScore * countP), as = Math.round(m.awayScore * countP);

  const chip = `${String(index + 1).padStart(2, "0")}`;
  const rowY = [780, 1010];
  const row = (y, side, name, slug, uri, score, isWinner) => {
    const dx = (1 - ent) * (side === "home" ? -60 : 60);
    const nameColor = draw ? "#ffffff" : isWinner ? "#ffffff" : "#7f8ea9";
    const scoreColor = draw ? "#ffffff" : isWinner ? "#00e676" : "#94a3b8";
    return `
      <g opacity="${ent}" transform="translate(${dx},0)">
        <rect x="60" y="${y - 70}" width="10" height="140" rx="5" fill="${color(slug)}"/>
        ${logoBadge(slug, uri, 165, y, 120, clamp(ent * 1.1))}
        <text x="255" y="${y + 22}" font-family="${FONT}" font-size="66" font-weight="800" fill="${nameColor}">${esc(name)}</text>
        <text x="${W - 60}" y="${y + 30}" text-anchor="end" font-family="${FONT}" font-size="110" font-weight="800" fill="${scoreColor}">${score}</text>
      </g>`;
  };
  return `
    <text x="60" y="470" font-family="${FONT}" font-size="40" font-weight="700" fill="#5b6b85" letter-spacing="6">GAMEWEEK ${m.gameweek} · MATCH ${chip}</text>
    ${row(rowY[0], "home", m.homeTeam, m.homeSlug, uriHome, hs, winnerHome)}
    ${row(rowY[1], "away", m.awayTeam, m.awaySlug, uriAway, as, !winnerHome)}
    <g opacity="${ease(clamp((lt - 0.5) / 0.5))}">
      <line x1="255" y1="${rowY[0] + 70}" x2="${W - 60}" y2="${rowY[0] + 70}" stroke="#1e2a40" stroke-width="3"/>
      <line x1="255" y1="${rowY[1] + 70}" x2="${W - 60}" y2="${rowY[1] + 70}" stroke="#1e2a40" stroke-width="3"/>
    </g>
    ${draw ? "" : `<text x="60" y="${1180}" opacity="${ease(clamp((lt - 0.9) / 0.5))}" font-family="${FONT}" font-size="46" font-weight="700" fill="#00e676">${esc(winnerHome ? m.homeTeam : m.awayTeam)} win</text>`}
    <g transform="translate(${W - 90},${1230}) scale(${pop})" opacity="${ease(clamp((lt - 0.9) / 0.4))}">
      <text text-anchor="end" font-family="${FONT}" font-size="34" font-weight="700" fill="#5b6b85" letter-spacing="4">FT</text>
    </g>`;
}

function sceneTable(lt, allRows) {
  const rows = allRows.slice(0, 6);
  const titleP = ease(clamp(lt / 0.5));
  let out = `<text x="60" y="${470 - (1 - titleP) * 30}" opacity="${titleP}" font-family="${FONT}" font-size="72" font-weight="800" fill="#ffffff">TOP OF THE TABLE</text>`;
  let y = 660;
  rows.forEach((r, i) => {
    const p = ease(clamp((lt - 0.35 - i * 0.16) / 0.5));
    const dx = (1 - p) * 60;
    const leader = i === 0;
    out += `
      <g opacity="${p}" transform="translate(${dx},0)">
        ${leader ? `<rect x="60" y="${y - 62}" width="${W - 120}" height="90" rx="16" fill="rgba(0,230,118,0.10)" stroke="rgba(0,230,118,0.35)" stroke-width="2"/>` : ""}
        <text x="110" y="${y}" font-family="${FONT}" font-size="58" font-weight="800" fill="${leader ? "#00e676" : "#5b6b85"}">${r.pos}</text>
        <rect x="180" y="${y - 20}" width="14" height="28" rx="4" fill="${color(r.slug)}"/>
        <text x="225" y="${y}" font-family="${FONT}" font-size="58" font-weight="700" fill="#ffffff">${esc(r.team)}</text>
        <text x="${W - 90}" y="${y}" text-anchor="end" font-family="${FONT}" font-size="58" font-weight="800" fill="${leader ? "#00e676" : "#8b9bb8"}">${r.pts}</text>
      </g>`;
    y += 120;
  });
  return out;
}

function sceneScorers(lt, season) {
  const players = playerData.players;
  const st = (p) => p.seasons?.[season] || {};
  const top = [...players].sort((a, b) => (st(b).goals || 0) - (st(a).goals || 0)).slice(0, 5);
  const titleP = ease(clamp(lt / 0.5));
  let out = `<text x="60" y="${470 - (1 - titleP) * 30}" opacity="${titleP}" font-family="${FONT}" font-size="72" font-weight="800" fill="#ffffff">TOP SCORERS</text>
    <text x="60" y="${545}" opacity="${titleP}" font-family="${FONT}" font-size="42" font-weight="600" fill="#8b9bb8">Season ${season}</text>`;
  let y = 720;
  top.forEach((p, i) => {
    const pr = ease(clamp((lt - 0.35 - i * 0.16) / 0.5));
    const dx = (1 - pr) * 60;
    out += `
      <g opacity="${pr}" transform="translate(${dx},0)">
        <text x="110" y="${y}" font-family="${FONT}" font-size="56" font-weight="800" fill="#00e676">${i + 1}</text>
        <text x="185" y="${y}" font-family="${FONT}" font-size="56" font-weight="700" fill="#ffffff">${esc(p.name)}</text>
        <text x="${W - 90}" y="${y}" text-anchor="end" font-family="${FONT}" font-size="56" font-weight="800" fill="#00e676">${st(p).goals || 0}</text>
      </g>`;
    y += 130;
  });
  return out;
}

function sceneOutro(lt) {
  const a = (d) => ease(clamp((lt - d) / 0.6));
  const pulse = 1 + 0.035 * Math.sin(lt * 5);
  return `
    <text x="${W / 2}" y="${800}" text-anchor="middle" opacity="${a(0.1)}" font-family="${FONT}" font-size="74" font-weight="800" fill="#ffffff">FULL TABLE,</text>
    <text x="${W / 2}" y="${900}" text-anchor="middle" opacity="${a(0.25)}" font-family="${FONT}" font-size="74" font-weight="800" fill="#ffffff">STATS &amp; REPORTS</text>
    <g transform="translate(${W / 2},${1060}) scale(${pulse})" opacity="${a(0.4)}">
      <text text-anchor="middle" font-family="${FONT}" font-size="66" font-weight="800" fill="url(#accent)">ballerleagueukhub.com</text>
    </g>
    <text x="${W / 2}" y="${1180}" text-anchor="middle" opacity="${a(0.6)}" font-family="${FONT}" font-size="40" font-weight="600" fill="#8b9bb8">Follow for matchday updates</text>`;
}

// ─── ffmpeg resolution ────────────────────────────────────────────
async function resolveFfmpeg() {
  try {
    const mod = await import("ffmpeg-static");
    if (mod?.default && existsSync(mod.default)) return mod.default;
  } catch {}
  return "ffmpeg";
}

// ─── build scene list ─────────────────────────────────────────────
async function buildScenes() {
  const scenes = [];
  const seasonTable = computeTable(matches.filter((m) => m.gameweek <= 11), SEASON);
  if (TYPE === "scorers") {
    scenes.push({ dur: 3.0, render: (lt) => sceneIntro(lt) });
    scenes.push({ dur: 5.5, render: (lt) => sceneScorers(lt, SEASON) });
    scenes.push({ dur: 3.2, render: (lt) => sceneOutro(lt) });
    return { scenes, name: "scorers" };
  }
  if (TYPE === "table") {
    scenes.push({ dur: 3.0, render: (lt) => sceneIntro(lt) });
    scenes.push({ dur: 5.5, render: (lt) => sceneTable(lt, seasonTable) });
    scenes.push({ dur: 3.2, render: (lt) => sceneOutro(lt) });
    return { scenes, name: "table" };
  }
  // results
  const gwMatches = matches.filter((m) => m.gameweek === GW).slice(0, 6);
  scenes.push({ dur: 3.0, render: (lt) => sceneIntro(lt) });
  for (let i = 0; i < gwMatches.length; i++) {
    const m = gwMatches[i];
    const uriHome = await logoDataUri(m.homeSlug);
    const uriAway = await logoDataUri(m.awaySlug);
    scenes.push({ dur: 2.4, render: (lt) => sceneMatch(m, lt, uriHome, uriAway, i) });
  }
  scenes.push({ dur: 5.0, render: (lt) => sceneTable(lt, seasonTable) });
  scenes.push({ dur: 3.2, render: (lt) => sceneOutro(lt) });
  return { scenes, name: "results" };
}

// ─── render + encode ──────────────────────────────────────────────
async function main() {
  const ffmpeg = await resolveFfmpeg();
  const { scenes, name } = await buildScenes();

  const FADE = 0.5;
  const starts = [];
  let cursor = 0;
  for (const s of scenes) { starts.push(cursor); cursor += s.dur - FADE; }
  const total = cursor + FADE;

  mkdirSync(OUT_DIR, { recursive: true });
  rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(TMP_DIR, { recursive: true });

  const frames = Math.ceil(total * FPS);
  console.log(`Rendering ${scenes.length} scenes · ${total.toFixed(1)}s · ${frames} frames...`);

  for (let i = 0; i < frames; i++) {
    const t = i / FPS;
    let groups = "";
    for (let s = 0; s < scenes.length; s++) {
      const start = starts[s], end = start + scenes[s].dur;
      if (t <= start - 0.001 || t >= end + 0.001) continue;
      const inA = s === 0 ? 1 : clamp((t - start) / FADE);
      const outA = s === scenes.length - 1 ? 1 : clamp((end - t) / FADE);
      const a = clamp(Math.min(inA, outA));
      if (a <= 0.001) continue;
      groups += `<g opacity="${a.toFixed(3)}">${scenes[s].render(t - start)}</g>`;
    }
    const png = resolve(TMP_DIR, `f-${String(i).padStart(4, "0")}.png`);
    await sharp(Buffer.from(wrap(groups))).png({ compressionLevel: 3 }).toFile(png);
    if (i % 50 === 0) process.stdout.write(`\r  ${i}/${frames}`);
  }
  console.log(`\r  ${frames}/${frames} frames rendered.`);

  const outFile = resolve(OUT_DIR, `baller-league-s${SEASON}-gw${GW}-${name}.mp4`);
  const args = [
    "-y", "-framerate", String(FPS), "-i", resolve(TMP_DIR, "f-%04d.png"),
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", outFile,
  ];
  console.log("Encoding with ffmpeg...");
  try {
    execFileSync(ffmpeg, args, { stdio: ["ignore", "ignore", "inherit"] });
  } catch {
    console.error("\nffmpeg failed. Install it: npm i ffmpeg-static --no-save (or system ffmpeg).");
    process.exit(1);
  }
  rmSync(TMP_DIR, { recursive: true, force: true });
  console.log(`\n✓ Video written: ${outFile}`);
}

main();
