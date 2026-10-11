import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CONTENT_DIR = resolve(ROOT, "src", "content", "news");
const TEAMS_DIR = resolve(ROOT, "src", "content", "teams");

const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));
const tableData = read("src/data/table.json");
const playerData = read("src/data/players.json");
const fixturesData = read("src/data/fixtures.json");
const season4 = read("src/data/season4.json");

if (!existsSync(CONTENT_DIR)) mkdirSync(CONTENT_DIR, { recursive: true });

const CURRENT_SEASON = fixturesData.upcoming[0]?.season ?? 4;
const players = playerData.players;
const upcoming = fixturesData.upcoming;

// Most recent season with results (used for "last season" figures).
const gcData = read("src/data/gamechangers.json");
const statsSeason = String(
  Object.keys(gcData.seasons)
    .map(Number)
    .sort((a, b) => b - a)
    .find((s) => (gcData.seasons[String(s)]?.matches || []).some((m) => m.homeScore > 0 || m.awayScore > 0)) ?? CURRENT_SEASON - 1
);

const managersFor = (slug) => (season4.managers || []).filter((m) => m.teamSlug === slug);
const changeFor = (slug) => (season4.teamChanges || []).find((c) => (c.note || "").toLowerCase().includes((tableData.find((t) => t.slug === slug)?.team || "").toLowerCase()));

function mgrSlug(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function teamContent(slug) {
  const p = resolve(TEAMS_DIR, `${slug}.md`);
  if (!existsSync(p)) return { name: slug, description: "", body: "" };
  const raw = readFileSync(p, "utf8");
  const end = raw.indexOf("---", 3);
  const front = raw.slice(3, end);
  const body = raw.slice(end + 3).trim();
  const get = (k) => {
    const m = front.match(new RegExp("^" + k + ":\\s*(.*)$", "m"));
    return m ? m[1].trim().replace(/^"|"$/g, "") : "";
  };
  return { name: get("name"), description: get("description"), body };
}

function squadPlayers(slug, limit = 6) {
  const team = players.filter((p) => p.teamSlug === slug);
  const withStats = team
    .filter((p) => (p.seasons?.[statsSeason]?.apps || 0) > 0)
    .sort((a, b) => (b.seasons?.[statsSeason]?.goals || 0) - (a.seasons?.[statsSeason]?.goals || 0));
  if (withStats.length >= 4) return { list: withStats.slice(0, limit), hasStats: true };
  const rest = team.filter((p) => !withStats.includes(p));
  return { list: [...withStats, ...rest].slice(0, limit), hasStats: withStats.length > 0 };
}

function teamFixture(slug) {
  return upcoming.find((f) => f.homeSlug === slug || f.awaySlug === slug) || null;
}

function outlook(name, changeNote) {
  if (changeNote && /new .*franchise/i.test(changeNote)) {
    return [
      `${name} are a brand-new entry, so there is no formbook to lean on — just a clean slate, a famous name in the dugout and the freedom to surprise everyone. An opening-night statement would announce them perfectly.`,
      `As newcomers, ${name} arrive with no pressure and plenty of intrigue. If their squad clicks early, they could be the story of the season.`,
    ][Math.floor(Math.random() * 2)];
  }
  if (changeNote && /rebrand/i.test(changeNote)) {
    return [
      `With a new identity and a fresh voice in the dugout, ${name} enter the season with a point to prove. A fast start would do wonders for momentum.`,
      `${name} are one of the great unknowns of the new campaign — a rebranded side with everything to play for and a squad keen to make an early statement.`,
    ][Math.floor(Math.random() * 2)];
  }
  return [
    `Consistency will be the aim for ${name} as they look to build on recent campaigns and push towards the Final Four.`,
    `${name} will fancy their chances of a strong season if they can convert last year's promise into points. The margins in this league are famously small.`,
  ][Math.floor(Math.random() * 2)];
}

function buildTeamPreview(slug) {
  const meta = teamContent(slug);
  const name = meta.name || slug;
  const tableRow = tableData.find((t) => t.slug === slug);
  const managerList = managersFor(slug);
  const change = changeFor(slug);
  const { list: squad, hasStats } = squadPlayers(slug);
  const fixture = teamFixture(slug);

  const mgrNames = managerList.map((m) => m.name).join(" and ");
  const mgrLinks = managerList
    .filter((m) => /[A-Za-z]/.test(m.name) && !m.name.includes("TBC") && !m.name.toLowerCase().includes("to be announced"))
    .map((m) => `[${m.name}](/managers/${mgrSlug(m.name)})`)
    .join(" and ");

  const dateStr = new Date().toISOString().split("T")[0];
  const title = `${name} — Baller League UK Season ${CURRENT_SEASON} Preview & Squad`;
  const excerpt = `Everything you need to know about ${name} for Baller League UK Season ${CURRENT_SEASON}: their manager, key players, opening fixture and season outlook.`;

  let s = `---\ntitle: "${title}"\ndate: ${dateStr}\ncategory: "Team Preview"\nexcerpt: "${excerpt.replace(/"/g, "'")}"\nauthor: "Baller League UK Fan Site"\nfeatured: false\n---\n\n`;
  s += `## ${name}: Season ${CURRENT_SEASON} Preview\n\n`;
  s += `${meta.description ? meta.description + " " : ""}Here is the full lowdown on ${name} ahead of Baller League UK Season ${CURRENT_SEASON} — the manager, the squad, the opening fixture and what to expect.\n\n`;

  if (meta.body) {
    s += `${meta.body}\n\n`;
  }

  // Manager
  s += `## The manager\n\n`;
  if (mgrLinks) {
    s += `${name} are led by ${mgrLinks}. ${managerList.length > 1 ? "It is a management partnership worth watching." : "Their experience and personality will shape how this side plays and how the touchline feels every matchday."} Read the full profile${managerList.length > 1 ? "s" : ""} on our [managers hub](/managers).\n\n`;
  } else {
    s += `${name}'s manager has not yet been confirmed by the league. Keep an eye on our [managers hub](/managers) for the announcement.\n\n`;
  }
  if (change?.note) {
    s += `> **Season ${CURRENT_SEASON} change:** ${change.note}\n\n`;
  }

  // Squad
  s += `## Squad and ones to watch\n\n`;
  if (squad.length) {
    s += hasStats
      ? `Here are some of ${name}'s players to watch, with last season's (Season ${statsSeason}) figures where available:\n\n`
      : `Meet some of the ${name} squad for Season ${CURRENT_SEASON}:\n\n`;
    for (const p of squad) {
      const st = p.seasons?.[statsSeason] || {};
      if (hasStats && (st.apps || 0) > 0) {
        s += `- **[${p.name}](/players/${p.slug})**${p.position ? ` (${p.position})` : ""} — ${st.goals || 0} goals and ${st.assists || 0} assists in ${st.apps || 0} appearance${st.apps === 1 ? "" : "s"}.\n`;
      } else {
        s += `- **[${p.name}](/players/${p.slug})**${p.position ? ` (${p.position})` : ""}.\n`;
      }
    }
    s += `\nSee the full squad on the [${name} team page](/teams/${slug}).\n\n`;
  } else {
    s += `${name}'s squad is being finalised ahead of the new season. Check back soon.\n\n`;
  }

  // Fixtures
  s += `## Season ${CURRENT_SEASON} fixtures\n\n`;
  if (fixture) {
    const home = fixture.homeSlug === slug;
    const opp = home ? fixture.awayTeam : fixture.homeTeam;
    const oppSlug = home ? fixture.awaySlug : fixture.homeSlug;
    s += `${name} open their campaign in **Gameweek ${fixture.gameweek}** against **[${opp}](/teams/${oppSlug})**${fixture.date ? ` on **${fixture.date}**` : ""}${fixture.time ? `, with kick-off at **${fixture.time}**` : ""}${home ? " at home" : " on the road"}.\n\n`;
    s += `Every matchday is a Monday night, with the regular season running for **11 gameweeks** and the top four reaching the **Final Four**.\n\n`;
  } else {
    s += `${name}'s opening fixture will be confirmed shortly. Visit the [Season ${CURRENT_SEASON} hub](/season-4) for the full schedule.\n\n`;
  }

  // Outlook
  s += `## Season outlook\n\n`;
  s += `${outlook(name, change?.note)}\n\n`;
  s += `Follow ${name} all season long on the [teams hub](/teams) and keep up with standings on the live [league table](/table).\n`;

  return { slug: `season-${CURRENT_SEASON}-team-preview-${slug}`, content: s };
}

const teams = tableData.map((t) => t.slug);
console.log(`Generating ${teams.length} team previews for Season ${CURRENT_SEASON}...\n`);
let n = 0;
for (const slug of teams) {
  const { slug: file, content } = buildTeamPreview(slug);
  writeFileSync(resolve(CONTENT_DIR, `${file}.md`), content);
  console.log(`  ${file}.md`);
  n++;
}
console.log(`\nDone! ${n} team previews generated.`);
