import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import sharp from "sharp";

// Short-form (vertical 1080x1920) Baller League UK data videos, generated from our
// own data — no third-party footage, so they're clean to post on YouTube/Shorts,
// TikTok, Reels and X. This is a manual/offline tool (not part of `npm run update`).
//
// Usage:
//   node scripts/generate-video.mjs                 # latest season + latest gameweek, results
//   node scripts/generate-video.mjs --gw=10
//   node scripts/generate-video.mjs --season=3 --type=scorers
//
// Requires ffmpeg. Either install it system-wide, or run `npm i ffmpeg-static --no-save`.

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "output");
const TMP_DIR = resolve(OUT_DIR, ".frames");

const W = 1080, H = 1920, FPS = 30;

const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));
const gcData = read("src/data/gamechangers.json");
const playerData = read("src/data/players.json");
const tableData = read("src/data/table.json");

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

// ─── ffmpeg resolution ────────────────────────────────────────────
async function resolveFfmpeg() {
  try {
    const mod = await import("ffmpeg-static");
    if (mod?.default && existsSync(mod.default)) return mod.default;
  } catch {}
  return "ffmpeg"; // hope it's on PATH
}

// ─── SVG scene builder ────────────────────────────────────────────
const ESC = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const FONT = "Arial, Helvetica, sans-serif";

function frame(inner) {
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#06060e"/>
      <stop offset="100%" stop-color="#10192b"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#00e676"/>
      <stop offset="100%" stop-color="#00b0ff"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${W}" height="10" fill="url(#accent)"/>
  <text x="60" y="120" font-family="${FONT}" font-size="34" font-weight="700" fill="#5b6b85" letter-spacing="8">BALLER LEAGUE UK HUB</text>
  <rect x="0" y="${H - 120}" width="${W}" height="120" fill="#0a0f1a"/>
  <text x="${W / 2}" y="${H - 52}" text-anchor="middle" font-family="${FONT}" font-size="40" font-weight="700" fill="#00e676">ballerleagueukhub.com</text>
  ${inner}
</svg>`;
}

function titleScene() {
  return frame(`
    <text x="60" y="760" font-family="${FONT}" font-size="170" font-weight="800" fill="#ffffff">SEASON</text>
    <text x="60" y="930" font-family="${FONT}" font-size="170" font-weight="800" fill="url(#accent)">${SEASON}</text>
    <text x="60" y="1120" font-family="${FONT}" font-size="76" font-weight="700" fill="#ffffff">GAMEWEEK ${GW}</text>
    <text x="60" y="1210" font-family="${FONT}" font-size="60" font-weight="600" fill="#8b9bb8">Results &amp; scores</text>`);
}

function matchScene(m) {
  return frame(`
    <text x="60" y="470" font-family="${FONT}" font-size="46" font-weight="700" fill="#5b6b85" letter-spacing="4">GAMEWEEK ${m.gameweek}</text>
    <text x="60" y="760" font-family="${FONT}" font-size="82" font-weight="700" fill="#ffffff">${ESC(m.homeTeam)}</text>
    <text x="60" y="960" font-family="${FONT}" font-size="82" font-weight="700" fill="#ffffff">${ESC(m.awayTeam)}</text>
    <text x="${W - 60}" y="775" text-anchor="end" font-family="${FONT}" font-size="110" font-weight="800" fill="#00e676">${m.homeScore}</text>
    <text x="${W - 60}" y="975" text-anchor="end" font-family="${FONT}" font-size="110" font-weight="800" fill="#00e676">${m.awayScore}</text>
    <rect x="60" y="1040" width="${W - 120}" height="3" fill="#1e2a40"/>`);
}

function tableScene() {
  const rows = tableData.slice(0, 6);
  let y = 520;
  let inner = `<text x="60" y="440" font-family="${FONT}" font-size="64" font-weight="800" fill="#ffffff">TOP OF THE TABLE</text>`;
  for (const r of rows) {
    inner += `
    <text x="60" y="${y}" font-family="${FONT}" font-size="54" font-weight="800" fill="#00e676">${r.pos}</text>
    <text x="150" y="${y}" font-family="${FONT}" font-size="54" font-weight="700" fill="#ffffff">${ESC(r.team)}</text>
    <text x="${W - 60}" y="${y}" text-anchor="end" font-family="${FONT}" font-size="54" font-weight="700" fill="#8b9bb8">${r.pts} pts</text>`;
    y += 100;
  }
  return frame(inner);
}

function scorerScene() {
  const players = playerData.players;
  const st = (p) => p.seasons?.[SEASON] || {};
  const top = [...players].sort((a, b) => (st(b).goals || 0) - (st(a).goals || 0)).slice(0, 5);
  let y = 620;
  let inner = `<text x="60" y="470" font-family="${FONT}" font-size="64" font-weight="800" fill="#ffffff">TOP SCORERS</text>
    <text x="60" y="545" font-family="${FONT}" font-size="44" font-weight="600" fill="#8b9bb8">Season ${SEASON}</text>`;
  top.forEach((p, i) => {
    inner += `
    <text x="60" y="${y}" font-family="${FONT}" font-size="52" font-weight="800" fill="#00e676">${i + 1}</text>
    <text x="140" y="${y}" font-family="${FONT}" font-size="52" font-weight="700" fill="#ffffff">${ESC(p.name)}</text>
    <text x="${W - 60}" y="${y}" text-anchor="end" font-family="${FONT}" font-size="52" font-weight="800" fill="#00e676">${st(p).goals || 0}</text>`;
    y += 110;
  });
  return frame(inner);
}

function outroScene() {
  return frame(`
    <text x="${W / 2}" y="820" text-anchor="middle" font-family="${FONT}" font-size="96" font-weight="800" fill="#ffffff">Full table,</text>
    <text x="${W / 2}" y="930" text-anchor="middle" font-family="${FONT}" font-size="96" font-weight="800" fill="#ffffff">stats &amp; reports</text>
    <text x="${W / 2}" y="1080" text-anchor="middle" font-family="${FONT}" font-size="60" font-weight="700" fill="url(#accent)">ballerleagueukhub.com</text>`);
}

// ─── Build scene list ─────────────────────────────────────────────
const scenes = [];
if (TYPE === "scorers") {
  scenes.push({ svg: titleScene(), d: 2.2, name: "scorers" });
  scenes.push({ svg: scorerScene(), d: 5.5, name: "scorers" });
  scenes.push({ svg: outroScene(), d: 3.0, name: "scorers" });
} else if (TYPE === "table") {
  scenes.push({ svg: titleScene(), d: 2.2, name: "table" });
  scenes.push({ svg: tableScene(), d: 5.0, name: "table" });
  scenes.push({ svg: outroScene(), d: 3.0, name: "table" });
} else {
  const gwMatches = matches.filter((m) => m.gameweek === GW).slice(0, 6);
  scenes.push({ svg: titleScene(), d: 2.2, name: "results" });
  for (const m of gwMatches) scenes.push({ svg: matchScene(m), d: 1.8, name: "results" });
  scenes.push({ svg: tableScene(), d: 4.0, name: "results" });
  scenes.push({ svg: outroScene(), d: 3.0, name: "results" });
}

// ─── Render + encode ──────────────────────────────────────────────
async function main() {
  const ffmpeg = await resolveFfmpeg();
  mkdirSync(OUT_DIR, { recursive: true });
  rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(TMP_DIR, { recursive: true });

  // Render frames
  const files = [];
  for (let i = 0; i < scenes.length; i++) {
    const png = resolve(TMP_DIR, `scene-${String(i).padStart(3, "0")}.png`);
    await sharp(Buffer.from(scenes[i].svg)).png().toFile(png);
    files.push(png);
  }

  // Concat list with per-scene durations
  const listPath = resolve(TMP_DIR, "list.txt");
  let list = "";
  for (let i = 0; i < scenes.length; i++) {
    list += `file '${files[i].replace(/\\/g, "/")}'\nduration ${scenes[i].d}\n`;
  }
  list += `file '${files[files.length - 1].replace(/\\/g, "/")}'\n`;
  writeFileSync(listPath, list);

  const outFile = resolve(OUT_DIR, `baller-league-s${SEASON}-gw${GW}-${scenes[0].name}.mp4`);
  const args = [
    "-y", "-f", "concat", "-safe", "0", "-i", listPath,
    "-vf", `fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
    "-c:v", "libx264", "-preset", "medium", "-crf", "20",
    "-movflags", "+faststart", outFile,
  ];

  console.log(`Rendering ${scenes.length} scenes → ${outFile}`);
  try {
    execFileSync(ffmpeg, args, { stdio: ["ignore", "ignore", "inherit"] });
  } catch (e) {
    console.error("\nffmpeg failed. Is it installed? Try: npm i ffmpeg-static --no-save (or install ffmpeg system-wide).");
    process.exit(1);
  }
  rmSync(TMP_DIR, { recursive: true, force: true });
  console.log(`\n✓ Video written: ${outFile}`);
}

main();
