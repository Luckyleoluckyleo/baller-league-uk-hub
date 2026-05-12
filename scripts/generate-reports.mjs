import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = resolve(__dirname, "..", "src", "content", "news");
const MATCHES_PATH = resolve(__dirname, "..", "src", "data", "gamechangers.json");
const PLAYERS_PATH = resolve(__dirname, "..", "src", "data", "players.json");
const TABLE_PATH = resolve(__dirname, "..", "src", "data", "table.json");
const FIXTURES_PATH = resolve(__dirname, "..", "src", "data", "fixtures.json");

if (!existsSync(CONTENT_DIR)) mkdirSync(CONTENT_DIR, { recursive: true });

const gcData = JSON.parse(readFileSync(MATCHES_PATH, "utf8"));
const playerData = JSON.parse(readFileSync(PLAYERS_PATH, "utf8"));
const tableData = JSON.parse(readFileSync(TABLE_PATH, "utf8"));
const fixturesData = JSON.parse(readFileSync(FIXTURES_PATH, "utf8"));

const allMatches = Object.values(gcData.seasons).flatMap(s => s.matches)
  .filter(m => (m.homeScore > 0 || m.awayScore > 0) && m.gamechanger1.type !== "unknown");

const targetSeason = process.argv.includes("--season=all") ? null : "3";
const matches = targetSeason
  ? gcData.seasons[targetSeason]?.matches.filter(m => (m.homeScore > 0 || m.awayScore > 0) && m.gamechanger1.type !== "unknown") || []
  : allMatches;

const players = playerData.players;

// ─── Helpers ───────────────────────────────────────────────────

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function getTopScorers(teamSlug, limit = 5) {
  const squad = players.filter(p => p.teamSlug === teamSlug && (p.seasons?.["3"]?.goals || 0) > 0);
  squad.sort((a, b) => (b.seasons?.["3"]?.goals || 0) - (a.seasons?.["3"]?.goals || 0));
  return squad.slice(0, limit);
}

function getTopScorer(teamSlug) {
  const s = getTopScorers(teamSlug, 1);
  return s[0] || null;
}

function getSquad(teamSlug) {
  return players.filter(p => p.teamSlug === teamSlug);
}

function getTeamForm(teamSlug, beforeGW, maxGames = 5) {
  const teamMatches = allMatches
    .filter(m => m.gameweek < beforeGW)
    .filter(m => m.homeSlug === teamSlug || m.awaySlug === teamSlug)
    .sort((a, b) => b.gameweek - a.gameweek)
    .slice(0, maxGames);
  return teamMatches.map(m => {
    const isHome = m.homeSlug === teamSlug;
    const gd = isHome ? m.homeScore - m.awayScore : m.awayScore - m.homeScore;
    if (gd > 0) return 'W';
    if (gd < 0) return 'L';
    return 'D';
  });
}

function getTeamFormWithScores(teamSlug, beforeGW, maxGames = 5) {
  const teamMatches = allMatches
    .filter(m => m.gameweek < beforeGW)
    .filter(m => m.homeSlug === teamSlug || m.awaySlug === teamSlug)
    .sort((a, b) => b.gameweek - a.gameweek)
    .slice(0, maxGames);
  return teamMatches.map(m => {
    const isHome = m.homeSlug === teamSlug;
    const gf = isHome ? m.homeScore : m.awayScore;
    const ga = isHome ? m.awayScore : m.homeScore;
    const opponent = isHome ? m.awayTeam : m.homeTeam;
    return { gf, ga, opponent, gameweek: m.gameweek };
  });
}

function getH2H(homeSlug, awaySlug, beforeGW) {
  const prev = allMatches.filter(m =>
    m.gameweek < beforeGW &&
    ((m.homeSlug === homeSlug && m.awaySlug === awaySlug) ||
     (m.homeSlug === awaySlug && m.awaySlug === homeSlug))
  );
  let hw = 0, aw = 0, dr = 0, hgf = 0, hga = 0;
  const results = [];
  for (const m of prev) {
    const isHome = m.homeSlug === homeSlug;
    if (isHome) {
      hgf += m.homeScore; hga += m.awayScore;
      if (m.homeScore > m.awayScore) hw++;
      else if (m.awayScore > m.homeScore) aw++;
      else dr++;
      results.push({ homeScore: m.homeScore, awayScore: m.awayScore, gw: m.gameweek });
    } else {
      hgf += m.awayScore; hga += m.homeScore;
      if (m.awayScore > m.homeScore) hw++;
      else if (m.homeScore > m.awayScore) aw++;
      else dr++;
      results.push({ homeScore: m.awayScore, awayScore: m.homeScore, gw: m.gameweek });
    }
  }
  return { played: prev.length, won: hw, drawn: dr, lost: aw, gf: hgf, ga: hga, results };
}

function computeStandings(beforeGW) {
  const records = {};
  const prevMatches = allMatches.filter(m => m.gameweek < beforeGW);
  for (const m of prevMatches) {
    if (!records[m.homeTeam]) records[m.homeTeam] = { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 };
    if (!records[m.awayTeam]) records[m.awayTeam] = { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 };
    records[m.homeTeam].played++; records[m.awayTeam].played++;
    records[m.homeTeam].gf += m.homeScore; records[m.homeTeam].ga += m.awayScore;
    records[m.awayTeam].gf += m.awayScore; records[m.awayTeam].ga += m.homeScore;
    if (m.homeScore > m.awayScore) { records[m.homeTeam].won++; records[m.awayTeam].lost++; }
    else if (m.awayScore > m.homeScore) { records[m.awayTeam].won++; records[m.homeTeam].lost++; }
    else { records[m.homeTeam].drawn++; records[m.awayTeam].drawn++; }
  }
  const epMap = {};
  tableData.forEach(r => { epMap[r.team] = r.ep || 0; });
  const table = Object.entries(records).map(([team, r]) => {
    const gd = r.gf - r.ga;
    const pts = r.won * 3 + r.drawn * 1 + (epMap[team] || 0);
    return { team, ...r, gd, pts };
  });
  table.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  table.forEach((row, i) => { row.pos = i + 1; });
  return table;
}

function findTeamPos(standings, teamSlug) {
  const row = standings.find(s => {
    const fromTable = tableData.find(t => t.slug === teamSlug);
    return fromTable && s.team === fromTable.team;
  });
  return row ? row.pos : null;
}

function findTeamInStandings(standings, teamSlug) {
  const fromTable = tableData.find(t => t.slug === teamSlug);
  return standings.find(s => fromTable && s.team === fromTable.team) || null;
}

function ordinalSuffix(n) {
  if (n > 3 && n < 21) return "th";
  const mod = n % 10;
  if (mod === 1) return "st";
  if (mod === 2) return "nd";
  if (mod === 3) return "rd";
  return "th";
}

function formString(form) {
  return form.map(f => f === 'W' ? '✅' : f === 'L' ? '❌' : '🤝').join(' ');
}

function formStringText(form) {
  return form.join('-');
}

function gcName(type) {
  const map = {
    onside: "Onside", plusone: "Plus One", "3play": "3Play",
    "1on1": "1-on-1", theline: "The Line", fairplay: "Fairplay",
  };
  return map[type] || type;
}

function teamGoals(teamSlug) {
  return allMatches
    .filter(m => m.homeSlug === teamSlug || m.awaySlug === teamSlug)
    .reduce((sum, m) => sum + (m.homeSlug === teamSlug ? m.homeScore : m.awayScore), 0);
}

function teamGoalsConceded(teamSlug) {
  return allMatches
    .filter(m => m.homeSlug === teamSlug || m.awaySlug === teamSlug)
    .reduce((sum, m) => sum + (m.homeSlug === teamSlug ? m.awayScore : m.homeScore), 0);
}

function teamAvgGoals(teamSlug) {
  const games = allMatches.filter(m => m.homeSlug === teamSlug || m.awaySlug === teamSlug).length;
  return games > 0 ? (teamGoals(teamSlug) / games).toFixed(1) : "0";
}

function leagueAvgGoals() {
  const all = allMatches.filter(m => m.homeScore > 0 || m.awayScore > 0);
  const total = all.reduce((s, m) => s + m.homeScore + m.awayScore, 0);
  return all.length > 0 ? (total / all.length).toFixed(1) : "0";
}

function playoffContention(pos, beforeGW) {
  if (pos === null) return null;
  if (beforeGW >= 8) {
    if (pos <= 2) return "are on the verge of securing a Final Four place";
    if (pos <= 4) return "are locked in a battle for the Final Four playoff spots";
    if (pos <= 6) return "need results to go their way to sneak into the top 4";
    return "face an uphill battle to reach the Final Four";
  }
  if (pos <= 2) return "look strong contenders for the Final Four";
  if (pos <= 4) return "are well placed in the Final Four race";
  if (pos <= 6) return "are within striking distance of the top 4";
  return "are looking to climb the table";
}

let playerTeamMapCache = null;
function getPlayerTeamMap() {
  if (playerTeamMapCache) return playerTeamMapCache;
  playerTeamMapCache = {};
  for (const p of players) {
    playerTeamMapCache[p.name.toLowerCase()] = p.teamSlug;
  }
  return playerTeamMapCache;
}

function getScorerTeam(name, playerStats, homeSlug, awaySlug) {
  const ps = playerStats.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (ps && ps.team) return ps.team === homeSlug ? 'home' : 'away';
  const pm = getPlayerTeamMap();
  if (pm && pm[name.toLowerCase()]) return pm[name.toLowerCase()] === homeSlug ? 'home' : 'away';
  return null;
}

function hsGuess(goalscorers, playerStats, homeSlug, awaySlug) {
  let h = 0, a = 0;
  for (const g of goalscorers) {
    const side = getScorerTeam(g.player, playerStats, homeSlug, awaySlug);
    if (side === 'home') h++;
    else if (side === 'away') a++;
  }
  return { home: h, away: a };
}

// ─── Narrative Generators ──────────────────────────────────────

function matchSummaryNarrative(home, away, hs, as, gw, homePosBefore, awayPosBefore, homeForm, awayForm, gc1, gc2, gc1g, gc2g, goalscorers, playerStats, homeSlug, awaySlug) {
  const totalGoals = hs + as;
  const margin = Math.abs(hs - as);
  const winner = hs > as ? home : as > hs ? away : null;
  const loser = winner === home ? away : home;
  const gcTotal = gc1g + gc2g;
  const isBlowout = margin >= 5;
  const isThriller = totalGoals >= 8;
  const isTight = margin <= 1 && winner;

  const loserFormStr = awayForm.join(''); // track which team is in-form badly
  const homeFormStr = homeForm.join('');

  const leadIns = [
    `Baller Arena played host to an absorbing Gameweek ${gw} clash as **${home}** locked horns with **${away}** in what would prove to be`,
    `The lights were bright at Baller Arena on Gameweek ${gw}, where **${home}** and **${away}** served up`,
    `Gameweek ${gw} delivered fireworks at Baller Arena with **${home}** taking on **${away}** in`,
    `Tensions were high at Baller Arena as **${home}** squared off against **${away}** in`,
    `Football took center stage at Baller Arena when **${home}** met **${away}** in`,
    `The Gameweek ${gw} spotlight fell on Baller Arena for **${home}** versus **${away}** —`,
    `A pivotal Gameweek ${gw} encounter saw **${home}** go head-to-head with **${away}** in`,
    `Baller Arena buzzed with anticipation as **${home}** and **${away}** delivered`,
    `All roads led to Baller Arena for Gameweek ${gw}, where **${home}** and **${away}** produced`,
    `The crowd at Baller Arena were treated to a spectacle as **${home}** faced **${away}** in`,
  ];

  let narrative = pick(leadIns);

  if (isThriller && winner) {
    narrative += pick([
      ` a breathtaking goal-fest.`,
      ` an unforgettable thriller packed with drama and goals.`,
      ` a rollercoaster of emotions that had everything you could want from a Baller League match.`,
      ` a pulsating encounter that had fans on the edge of their seats from the first whistle to the last.`,
    ]);
  } else if (isThriller && !winner) {
    narrative += pick([
      ` a breathtaking stalemate that somehow had no winner but absolutely no shortage of entertainment.`,
      ` an end-to-end classic where neither side deserved to walk away empty-handed.`,
      ` a scoring bonanza that had the crowd on their feet — and somehow still ended level.`,
    ]);
  } else if (isBlowout) {
    narrative += pick([
      ` a ruthless demolition job that will echo around the league.`,
      ` a merciless display of attacking firepower that left no doubt about the gulf between the sides.`,
      ` a statement victory — emphatic, relentless, and utterly dominant.`,
    ]);
  } else if (isTight) {
    narrative += pick([
      ` a tense, knife-edge contest where the smallest of margins made all the difference.`,
      ` a nail-biter that could have swung either way, decided by the finest of details.`,
      ` a battle of attrition where every tackle, every pass, and every decision carried enormous weight.`,
    ]);
  } else {
    narrative += pick([
      ` a thoroughly entertaining contest with plenty of talking points.`,
      ` a match that ebbed and flowed, keeping everyone guessing until the final whistle.`,
      ` a compelling advert for Baller League football — competitive, dramatic, and hard-fought.`,
    ]);
  }

  narrative += "\n\n";

  // Position context woven into narrative
  if (homePosBefore && awayPosBefore) {
    if (homePosBefore <= 2 && awayPosBefore <= 2) {
      narrative += pick([
        `This was a genuine top-of-the-table blockbuster, with ${homePosBefore}${ordinalSuffix(homePosBefore)} facing ${awayPosBefore}${ordinalSuffix(awayPosBefore)}. `,
        `A clash of titans — the league's ${homePosBefore}${ordinalSuffix(homePosBefore)} and ${awayPosBefore}${ordinalSuffix(awayPosBefore)}-ranked sides colliding at the business end of the season. `,
      ]);
    } else if (homePosBefore <= 4 || awayPosBefore <= 4) {
      const playoffTeam = homePosBefore <= 4 ? home : away;
      const playoffPos = homePosBefore <= 4 ? homePosBefore : awayPosBefore;
      const otherTeam = playoffTeam === home ? away : home;
      narrative += pick([
        `${playoffTeam}, sitting pretty in the Final Four places at ${playoffPos}${ordinalSuffix(playoffPos)}, knew a win here would tighten their grip. `,
        `${playoffTeam} came in occupying a coveted playoff spot at ${playoffPos}${ordinalSuffix(playoffPos)}, while ${otherTeam} were desperate to crash the party. `,
      ]);
    }
  }

  // The result
  if (winner) {
    narrative += `When the dust settled, it was **${winner}** who emerged **${hs}-${as}** victors`;

    if (homeFormStr.includes('WWW')) {
      narrative += pick([
        `, extending their red-hot run of form in spectacular fashion.`,
        `, making it a hat-trick of wins as their momentum continues to build.`,
        `, adding another triumph to what is becoming a formidable winning streak.`,
      ]);
    } else if (loserFormStr.includes('WWW')) {
      narrative += `, ending ${loser}'s impressive winning run in the process.`;
    } else if (isBlowout) {
      narrative += ` in a performance that will send shockwaves through the division.`;
    } else {
      narrative += `.`;
    }
  } else {
    narrative += `The final whistle confirmed a **${hs}-${as} draw**`;
    if (totalGoals >= 8) {
      narrative += ` in a contest that had absolutely everything — goals, drama, and relentless entertainment.`;
    } else {
      narrative += `, a result that felt about right in a match where both sides gave everything.`;
    }
  }

  if (gcTotal > 0) {
    narrative += ` The Game Changer window — **${gc1}** and **${gc2}** — proved pivotal, contributing **${gcTotal}** of the match's **${totalGoals}** goals.`;
  } else {
    narrative += ` In a rarity for Baller League, neither Game Changer activation managed to breach either defence.`;
  }

  return narrative;
}

function firstHalfNarrative(home, away, hs, as, gc1, gc1g, gc2g, margin, goalscorers, playerStats, homeSlug, awaySlug) {
  const winner = hs > as ? home : as > hs ? away : null;
  const gcTotal = gc1g + gc2g;

  const openings = [
    `The first half sprang into life at the 12-minute mark with the **${gc1}** Game Changer flicking the switch`,
    `At the 12th minute, the **${gc1}** Game Changer roared into action`,
    `The game's complexion changed at the 12th minute when the **${gc1}** Game Changer activated`,
    `Twelve minutes in and the **${gc1}** Game Changer came alive, reshaping the contest entirely`,
    `The tactical landscape shifted dramatically at 12 minutes as the **${gc1}** Game Changer took hold`,
    `Barely a dozen minutes had passed when **${gc1}** transformed the match into something altogether different`,
  ];

  let n = pick(openings);

  if (gc1g >= 3) {
    n += pick([
      ` — and the goals flowed. **${gc1g}** times the net bulged during the activation period, a frantic, breathless spell of attacking football.`,
      ` — and the floodgates opened with **${gc1g}** goals flying in, the crowd barely able to keep up with the relentless action.`,
      ` — the result was chaos, in the best possible way. **${gc1g}** goals poured in as both sides abandoned any defensive caution.`,
    ]);
  } else if (gc1g >= 1) {
    n += pick([
      ` — a **${gc1g}-goal** window that gave the half an electric pulse.`,
      ` — the period yielded **${gc1g}** goal${gc1g > 1 ? 's' : ''}, just enough to set the contest alight.`,
    ]);
  } else {
    n += pick([
      ` — but remarkably, neither side could find the net. A tactical stalemate that owed as much to disciplined defending as to the specific rule change.`,
      ` — yet for all the altered rules, the defences stood tall and the deadlock remained stubbornly intact.`,
      ` — but the goalkeepers and back-lines rose to the occasion, keeping the scoreboard operator idle throughout the activation.`,
    ]);
  }

  n += " ";

  if (winner) {
    const halfMargin = Math.abs(hs - as);
    if (halfMargin >= 4) {
      n += pick([
        `${winner} were absolutely rampant, carving ${winner === home ? away : home} open at will. By the break, they had built an intimidating lead that felt insurmountable.`,
        `${winner} simply blew ${winner === home ? away : home} away in a devastating opening period, sending a powerful message to everyone watching.`,
      ]);
    } else if (halfMargin >= 2) {
      n += pick([
        `${winner} controlled the tempo and carried a deserved lead into the interval, their composure and cutting edge proving the difference.`,
        `${winner} held the upper hand at the break, having shown just enough quality to edge ahead in a closely-fought half.`,
      ]);
    } else {
      n += pick([
        `${winner} took a slender lead into half-time — nothing decisive, but enough to shift the psychological battle in their favour.`,
        `The sides went in with ${winner} just in front, a narrow advantage that kept everything delicately poised.`,
      ]);
    }
  } else {
    n += pick([
      `The two sides trudged off level at the break — nothing separating them in what was shaping up to be a classic arm-wrestle.`,
      `By the interval it was impossible to call a winner. The contest was beautifully balanced, with everything still to play for.`,
      `Half-time arrived with honours even, both managers undoubtedly pleased with elements of their side's performance.`,
    ]);
  }

  return n;
}

function secondHalfNarrative(home, away, hs, as, gc2, gc2g, margin, gw, goalscorers, playerStats, homeSlug, awaySlug) {
  const winner = hs > as ? home : as > hs ? away : null;
  const loser = winner === home ? away : home;
  const totalGoals = hs + as;

  const reopeners = [
    `The second half resumed with all to play for, and at the 27-minute mark the **${gc2}** Game Changer cranked up the intensity once more`,
    `After the restart, the **${gc2}** Game Changer detonated at the 27th minute, turning the dial up to eleven`,
    `The 27th minute brought the **${gc2}** Game Changer thundering into the match — a moment that would prove pivotal`,
    `If the first half was intriguing, the second was about to become unmissable. At 27 minutes, **${gc2}** entered the fray`,
    `The tension was palpable at the restart, and the **${gc2}** Game Changer at 27 minutes only dialled it up`,
  ];

  let n = pick(reopeners);

  if (gc2g >= 3) {
    n += pick([
      ` — and the mayhem resumed. **${gc2g}** more goals erupted during the window, transforming the contest into a full-blown classic.`,
      ` — once again the goals rained down, **${gc2g}** of them, raw and relentless.`,
      ` — the defensive discipline of the first half evaporated as **${gc2g}** goals thundered in during the activation.`,
    ]);
  } else if (gc2g >= 1) {
    n += pick([
      ` — and it delivered **${gc2g}** goal${gc2g > 1 ? 's' : ''} at just the right moment to breathe fresh life into the match.`,
      ` — the **${gc2g}** goal${gc2g > 1 ? 's' : ''} it produced came at a crucial juncture, swinging momentum decisively.`,
    ]);
  } else {
    n += pick([
      ` — but for all the tactical upheaval, the net remained undisturbed. Both defences had clearly done their homework.`,
      ` — yet both sides held their nerve superbly through the rule change, refusing to blink.`,
    ]);
  }

  n += " ";

  if (winner) {
    if (margin >= 6) {
      n += pick([
        `${winner} showed absolutely no mercy, turning a commanding position into a full-blown annihilation. Every attack carried menace; every forward run spelled danger. ${loser} simply had no answer.`,
        `What followed was a masterclass in clinical finishing. ${winner} ran ${loser} ragged, the scoreline a fair reflection of their total dominance.`,
      ]);
    } else if (margin >= 3) {
      n += pick([
        `${winner} managed the occasion expertly, balancing attacking ambition with game-control to see out a thoroughly deserved victory.`,
        `The scoreboard didn't flatter ${winner} — they were simply better in every department, and ${loser} had no complaints.`,
      ]);
    } else if (margin >= 1) {
      n += pick([
        `The final exchanges were fraught with tension. ${loser} threw everything forward in search of a route back, but ${winner} held their nerve, defending with grit and intelligence to protect what they had.`,
        `It was edge-of-your-seat stuff in the closing minutes. ${loser} pressed and probed, but ${winner}'s back-line stood firm — resilient, organised, and ultimately heroic.`,
      ]);
    }
  } else {
    n += pick([
      `Both sides strained every sinew for a winner but the decisive blow never landed. A draw was the fairest outcome in a match where no team deserved to lose.`,
      `Late drama threatened but never materialised, both teams having to accept a point apiece in what felt like a war of attrition.`,
    ]);
  }

  if (totalGoals >= 10) {
    n += pick([
      ` The **${totalGoals}-goal** spectacle was the kind of match that Baller League was built for — pure, unfiltered entertainment.`,
      ` This was Baller League at its most chaotic and brilliant — **${totalGoals}** goals, endless drama, and a match nobody in attendance will forget in a hurry.`,
    ]);
  }

  return n;
}

function goalTimelineSection(goalscorers, playerStats, home, away, homeSlug, awaySlug) {
  if (!goalscorers || goalscorers.length === 0) return '';

  const sorted = [...goalscorers].sort((a, b) => a.minute - b.minute);
  const homeGoals = [];
  const awayGoals = [];
  for (const g of sorted) {
    const side = getScorerTeam(g.player, playerStats, homeSlug, awaySlug);
    if (side === 'home') homeGoals.push(g);
    else if (side === 'away') awayGoals.push(g);
    else {
      if (homeGoals.length < (hsGuess(goalscorers, playerStats, homeSlug, awaySlug).home || 0)) {
        homeGoals.push(g);
      } else {
        awayGoals.push(g);
      }
    }
  }

  let s = '';

  // Rich narrative timeline
  if (sorted.length > 0) {
    const describer = (g, idx) => {
      const prefix = idx === 0 ? pick([`Opened the scoring`, `Drew first blood`, `Broke the deadlock`]) : '';
      if (prefix) return `${prefix} —`;
      return '';
    };

    s += `The goals arrived in a dramatic sequence that told the story of the match:\n\n`;

    for (let i = 0; i < sorted.length; i++) {
      const g = sorted[i];
      const side = getScorerTeam(g.player, playerStats, homeSlug, awaySlug);
      const teamLabel = side === 'home' ? ` (${home})` : side === 'away' ? ` (${away})` : '';
      if (i === 0) {
        s += `- **${g.minute}′** — **${g.player}**${teamLabel} ${pick(['opened the scoring', 'drew first blood', 'broke the deadlock', 'fired the opener'])}\n`;
      } else {
        const verbs = ['struck', 'scored', 'netted', 'found the target', 'converted', 'fired home', 'slotted'];
        s += `- **${g.minute}′** — **${g.player}**${teamLabel} ${pick(verbs)}\n`;
      }
    }

    s += '\n';
  }

  // Timeline table
  s += `| Minute | Player | Team |\n|--------|--------|------|\n`;
  for (const g of sorted) {
    const side = getScorerTeam(g.player, playerStats, homeSlug, awaySlug);
    const teamName = side === 'home' ? home : side === 'away' ? away : '—';
    s += `| ${g.minute}′ | ${g.player} | ${teamName} |\n`;
  }

  return s;
}

function gcAnalysis(gc1, gc2, gc1g, gc2g, totalGoals, home, away, hs, as) {
  const gcTotal = gc1g + gc2g;
  const gcPct = totalGoals > 0 ? Math.round((gcTotal / totalGoals) * 100) : 0;
  const dominantGC = gc1g > gc2g ? gc1 : gc1g < gc2g ? gc2 : null;
  const dominantGCGoals = gc1g > gc2g ? gc1g : gc1g < gc2g ? gc2g : gc1g;

  let analysis = '';

  if (gcTotal >= 6) {
    analysis += `The Game Changer period **took over this match**. With **${gcTotal}** of the **${totalGoals}** total goals coming during GC activations (${gcPct}%), the modified rules were not a sideshow — they *were* the show.\n\n`;
    analysis += `The **${dominantGC || gc1}** activation was particularly devastating, producing **${dominantGCGoals}** goals that fundamentally altered the trajectory of the contest. `;
    analysis += `When the GC window is this productive, traditional game plans go out the window — it becomes a test of who can adapt fastest to controlled chaos. On this evidence, the answer was both sides, and the paying fans were the real winners.`;
  } else if (gcTotal >= 3) {
    analysis += `The Game Changer period left a genuine imprint on this fixture, with the **${gc1}** and **${gc2}** activations generating **${gcTotal}** goals — **${gcPct}%** of the match's total output.\n\n`;
    if (dominantGC) {
      analysis += `The **${dominantGC}** window was the more impactful, its **${dominantGCGoals}** goal${dominantGCGoals > 1 ? 's' : ''} shifting the balance of the contest at a critical moment. `;
    }
    analysis += `Matches where the GC contributes this significantly tend to be remembered — the rule modifications force teams out of their comfort zones and into pure reactive mode, which is where the best (and worst) of Baller League football is often found.`;
  } else if (gcTotal >= 1) {
    analysis += `The Game Changer activations were relatively subdued by Baller League standards, yielding just **${gcTotal}** goal${gcTotal > 1 ? 's' : ''} from the two windows. That's **${gcPct}%** of the match's scoring — enough to matter, but far from dominant.\n\n`;
    analysis += `This was more a match decided by the regular 6v6 phases than by the GC interventions. Credit to both sets of players for adapting quickly to the shifting rules without losing their shape — a sign of well-drilled, tactically aware squads.`;
  } else {
    analysis += `This was a statistical anomaly in the Baller League ecosystem: **zero goals** across two Game Changer activations.\n\n`;
    analysis += `The **${gc1}** and **${gc2}** windows came and went with neither side able to capitalise on the modified rules. Defensive organisation won the day, with both teams demonstrating that even when the laws of the game shift beneath your feet, discipline and concentration can keep the door firmly shut. Matches like this serve as a reminder that Baller League isn't *all* about the GC — fundamentals still matter.`;
  }

  analysis += `\n\n| GC Activation | Type | Goals |\n`;
  analysis += `|---------------|------|-------|\n`;
  analysis += `| 1st Half (12′) | ${gc1} | ${gc1g} |\n`;
  analysis += `| 2nd Half (27′) | ${gc2} | ${gc2g} |\n`;
  analysis += `| **Total** | | **${gcTotal}** |\n`;

  return analysis;
}

function matchPerformersSection(playerStats, homeSlug, awaySlug, home, away, goalscorers) {
  if (!playerStats || playerStats.length === 0) return '';

  const homePlayers = playerStats.filter(p => p.team === homeSlug && (p.goals > 0 || p.assists > 0));
  const awayPlayers = playerStats.filter(p => p.team === awaySlug && (p.goals > 0 || p.assists > 0));

  if (homePlayers.length === 0 && awayPlayers.length === 0) return '';

  let s = '';

  // Find players who scored in this match
  const scoredNames = new Set((goalscorers || []).map(g => g.player.toLowerCase()));

  if (homePlayers.length > 0) {
    const homeScorersInMatch = homePlayers.filter(p => scoredNames.has(p.name.toLowerCase()));
    s += `### ${home}\n\n`;

    if (homeScorersInMatch.length > 0) {
      const topHome = homeScorersInMatch.sort((a, b) => b.goals - a.goals)[0];
      if (topHome.goals >= 2) {
        s += pick([
          `**${topHome.name}** was ${home}'s standout performer, bagging **${topHome.goals} goals** in a display of clinical finishing that powered his side's effort.`,
          `The standout for ${home} was undoubtedly **${topHome.name}**, whose **${topHome.goals}-goal** haul was the foundation of everything good about their display.`,
        ]);
        if (topHome.assists > 0) {
          s += ` As if scoring wasn't enough, he also turned provider with **${topHome.assists} assist${topHome.assists > 1 ? 's' : ''}**.`;
        }
        s += '\n\n';
      }
    }

    s += `| Player | Goals | Assists | Shots | Passes |\n|--------|-------|---------|-------|--------|\n`;
    for (const p of homePlayers.sort((a, b) => b.goals - a.goals || b.assists - a.assists)) {
      s += `| ${p.name} | ${p.goals} | ${p.assists} | ${p.shots || 0} | ${p.passes || 0} |\n`;
    }
    s += '\n';
  }

  if (awayPlayers.length > 0) {
    const awayScorersInMatch = awayPlayers.filter(p => scoredNames.has(p.name.toLowerCase()));
    s += `### ${away}\n\n`;

    if (awayScorersInMatch.length > 0) {
      const topAway = awayScorersInMatch.sort((a, b) => b.goals - a.goals)[0];
      if (topAway.goals >= 2) {
        s += pick([
          `**${topAway.name}** led the charge for ${away}, his **${topAway.goals} goal${topAway.goals > 1 ? 's' : ''}** a testament to the kind of ruthless finishing that makes him a nightmare for opposing defences.`,
          `${away} had **${topAway.name}** to thank, the forward delivering a **${topAway.goals}-goal** performance of the highest calibre.`,
        ]);
        if (topAway.assists > 0) {
          s += ` He also chipped in with **${topAway.assists} assist${topAway.assists > 1 ? 's' : ''}** for good measure.`;
        }
        s += '\n\n';
      }
    }

    s += `| Player | Goals | Assists | Shots | Passes |\n|--------|-------|---------|-------|--------|\n`;
    for (const p of awayPlayers.sort((a, b) => b.goals - a.goals || b.assists - a.assists)) {
      s += `| ${p.name} | ${p.goals} | ${p.assists} | ${p.shots || 0} | ${p.passes || 0} |\n`;
    }
    s += '\n';
  }

  return s;
}

function keyPerformersSection(home, away, homeScorers, awayScorers) {
  let s = '';

  s += `### ${home} — Top Scorers (Season)\n\n`;
  if (homeScorers.length === 0) {
    s += `No goalscorers recorded for ${home} this season.\n\n`;
  } else {
    s += `| Player | Goals | Assists | Apps |\n|--------|-------|---------|------|\n`;
    for (const p of homeScorers) {
      const st = p.seasons?.["3"] || {};
      s += `| ${p.name} | ${st.goals || 0} | ${st.assists || 0} | ${st.apps || 0} |\n`;
    }
    s += '\n';
  }

  s += `### ${away} — Top Scorers (Season)\n\n`;
  if (awayScorers.length === 0) {
    s += `No goalscorers recorded for ${away} this season.\n\n`;
  } else {
    s += `| Player | Goals | Assists | Apps |\n|--------|-------|---------|------|\n`;
    for (const p of awayScorers) {
      const st = p.seasons?.["3"] || {};
      s += `| ${p.name} | ${st.goals || 0} | ${st.assists || 0} | ${st.apps || 0} |\n`;
    }
    s += '\n';
  }

  const homeScorer = homeScorers[0] || null;
  const awayScorer = awayScorers[0] || null;

  if (homeScorer || awayScorer) {
    s += `**Key Attacking Threats**\n\n`;
    if (homeScorer) {
      const hs = homeScorer.seasons?.["3"] || {};
      s += `- **${homeScorer.name}** — ${home}'s talisman with **${hs.goals || 0} goals** from **${hs.apps || 0} appearances**`;
      if (hs.assists > 0) s += ` and **${hs.assists} assists**`;
      s += `. `;
      if ((hs.goals || 0) >= 12) s += `One of the league's elite finishers and the focal point of virtually every ${home} attack.`;
      else if ((hs.goals || 0) >= 6) s += `A reliable and consistent outlet who defences have learned to fear.`;
      else s += `A developing attacking presence with room to grow.`;
      s += `\n`;
    }
    if (awayScorer) {
      const as = awayScorer.seasons?.["3"] || {};
      s += `- **${awayScorer.name}** — ${away}'s leading marksman with **${as.goals || 0} goals** from **${as.apps || 0} outings**`;
      if (as.assists > 0) s += `, plus **${as.assists} assists**`;
      s += `. `;
      if ((as.goals || 0) >= 12) s += `A proven match-winner who carries ${away}'s main goal threat game after game.`;
      else if ((as.goals || 0) >= 6) s += `${away} look to him whenever they need a moment of magic in the final third.`;
      else s += `Still finding his rhythm but showing promising signs.`;
      s += `\n`;
    }
  }

  return s;
}

function seasonContextNarrative(home, away, homeSlug, awaySlug, homePosBefore, awayPosBefore, gw) {
  const totalGWs = 11;
  const remaining = totalGWs - gw;
  const homeTeamGoals = teamGoals(homeSlug);
  const awayTeamGoals = teamGoals(awaySlug);
  const homeAvg = teamAvgGoals(homeSlug);
  const awayAvg = teamAvgGoals(awaySlug);
  const leagueAvg = leagueAvgGoals();

  let n = '';

  n += `With **${remaining} gameweek${remaining > 1 ? 's' : ''}** left in the regular season, the stakes couldn't have been higher. `;

  n += `**${home}** entered this match averaging **${homeAvg} goals per game** — `;
  n += parseFloat(homeAvg) > parseFloat(leagueAvg)
    ? `a healthy attacking output that made them one of the division's more entertaining sides to watch. `
    : `a number that reflected their struggles in front of goal this campaign. `;

  n += `**${away}**, by contrast, arrived with an average of **${awayAvg} per outing** — `;
  n += parseFloat(awayAvg) > parseFloat(leagueAvg)
    ? `their forward line among the most feared in the league. `
    : `a figure that highlighted the work still to be done in the final third. `;

  n += `\n\nThe league-wide average stood at **${leagueAvg} goals per game**, a benchmark that underlined the high-octane nature of Baller League football. `;

  if (remaining <= 3 && homePosBefore && homePosBefore <= 4) {
    n += `For ${home}, sitting **${homePosBefore}${ordinalSuffix(homePosBefore)}** before kick-off, every remaining match carried the weight of a cup final. They ${homePosBefore <= 2 ? 'had one foot in the Final Four' : 'were right in the thick of the playoff scramble'}. `;
  }
  if (remaining <= 3 && awayPosBefore && awayPosBefore <= 4) {
    n += `${away}, **${awayPosBefore}${ordinalSuffix(awayPosBefore)}** in the standings, knew that dropping points at this stage could prove catastrophic to their Final Four ambitions. `;
  }

  return n;
}

function headToHeadSection(home, away, h2h) {
  let s = '';
  if (h2h.played === 0) {
    s += `This was the **maiden competitive meeting** between ${home} and ${away} — a historic first that will be recorded in the Baller League annals. Fresh rivalries are forged on nights like these.\n\n`;
  } else {
    s += `${home} and ${away} had locked horns **${h2h.played} time${h2h.played > 1 ? 's' : ''}** before this encounter, and the history books painted an intriguing picture. `;
    if (h2h.won > h2h.lost) {
      s += `${home} had the historical edge with **${h2h.won} win${h2h.won > 1 ? 's' : ''}** to ${away}'s **${h2h.lost}**, with **${h2h.drawn} draw${h2h.drawn !== 1 ? 's' : ''}** completing the record.`;
    } else if (h2h.lost > h2h.won) {
      s += `${away} held bragging rights with **${h2h.lost} win${h2h.lost > 1 ? 's' : ''}** to ${home}'s **${h2h.won}**, and **${h2h.drawn}** stalemate${h2h.drawn !== 1 ? 's' : ''} between them.`;
    } else {
      s += `The rivalry was dead even — **${h2h.won} win${h2h.won > 1 ? 's' : ''} each** with **${h2h.drawn} draw${h2h.drawn !== 1 ? 's' : ''}** — making every fresh meeting feel like a tie-breaker.`;
    }

    if (h2h.results.length > 0) {
      s += `\n\n| GW | Result |\n|-----|--------|\n`;
      for (const r of h2h.results) {
        s += `| ${r.gw} | ${home} ${r.homeScore}-${r.awayScore} ${away} |\n`;
      }
    }

    s += `\n`;
    s += `\n| H2H Stat | ${home} | ${away} |\n`;
    s += `|----------|${'-'.repeat(Math.max(home.length + 2, 4))}|${'-'.repeat(Math.max(away.length + 2, 4))}|\n`;
    s += `| Wins | ${h2h.won} | ${h2h.lost} |\n`;
    s += `| Draws | ${h2h.drawn} | ${h2h.drawn} |\n`;
    s += `| Goals Scored | ${h2h.gf} | ${h2h.ga} |\n\n`;
    s += `Total head-to-head goals: **${h2h.gf + h2h.ga}** across all meetings.\n\n`;
  }

  return s;
}

function tableImpactSection(home, away, homeSlug, awaySlug, homePosBefore, awayPosBefore, homePosAfter, awayPosAfter, gw) {
  let s = '';

  function posChange(team, before, after) {
    if (before === null || after === null) return `${team} held steady`;
    if (after < before) return `${team} climbed to **${after}${ordinalSuffix(after)}**`;
    if (after > before) return `${team} dropped to **${after}${ordinalSuffix(after)}**`;
    return `${team} stayed at **${after}${ordinalSuffix(after)}**`;
  }

  s += `${posChange(home, homePosBefore, homePosAfter)}, `;
  s += `${posChange(away, awayPosBefore, awayPosAfter).toLowerCase()}.\n\n`;

  s += `| Team | Before GW${gw} | After GW${gw} |\n`;
  s += `|------|-------------|-------------|\n`;
  s += `| ${home} | ${homePosBefore !== null ? homePosBefore + ordinalSuffix(homePosBefore) : '—'} | ${homePosAfter !== null ? homePosAfter + ordinalSuffix(homePosAfter) : '—'} |\n`;
  s += `| ${away} | ${awayPosBefore !== null ? awayPosBefore + ordinalSuffix(awayPosBefore) : '—'} | ${awayPosAfter !== null ? awayPosAfter + ordinalSuffix(awayPosAfter) : '—'} |\n`;

  return s;
}

function matchFacts(home, away, hs, as, gc1, gc2, gc1g, gc2g, gw, margin, homeTopScorer, awayTopScorer) {
  const totalGoals = hs + as;
  const gcTotal = gc1g + gc2g;
  const facts = [];

  if (totalGoals >= 12) facts.push(`A staggering **${totalGoals}-goal spectacle** — one of the highest-scoring matches in Baller League history`);
  else if (totalGoals >= 8) facts.push(`A **${totalGoals}-goal thriller** that lived up to every pre-match expectation`);
  else if (totalGoals <= 2) facts.push(`A tight defensive contest with just **${totalGoals} goal${totalGoals > 1 ? 's' : ''}** — proof that low-scoring doesn't mean low-drama`);

  if (gcTotal >= 7) facts.push(`The GC period exploded with **${gcTotal} goals** — an extraordinary return from just two rule-change windows`);
  else if (gcTotal === 0) facts.push(`A rare clean sheet for both defences during the GC periods — neither the **${gc1}** nor the **${gc2}** forced a breakthrough`);
  else if (gcTotal > 0) facts.push(`**${gcTotal} of ${totalGoals} goals (${Math.round(gcTotal / totalGoals * 100)}%)** came during Game Changer activations`);

  if (margin >= 5) facts.push(`The **${margin}-goal margin** represented a statement victory, one of the most one-sided results of Gameweek ${gw}`);
  if (margin <= 1 && hs !== as) facts.push(`A **one-goal game** decided by the narrowest of margins — the small details made all the difference`);

  if (homeTopScorer) {
    const hg = homeTopScorer.seasons?.["3"]?.goals || 0;
    if (hg >= 10) facts.push(`${homeTopScorer.name} continues to lead ${home} with **${hg} goals** — firmly among the league's elite marksmen`);
  }
  if (awayTopScorer) {
    const ag = awayTopScorer.seasons?.["3"]?.goals || 0;
    if (ag >= 10) facts.push(`${awayTopScorer.name} heads ${away}'s scoring charts with **${ag} goals**, a tally any forward would be proud of`);
  }

  return facts.map(f => `- ${f}`).join('\n');
}

function whatNextSection(home, away, homeNext, awayNext) {
  let s = '';

  s += `### ${home}\n`;
  if (homeNext) {
    const opp = homeNext.homeTeam === home ? homeNext.awayTeam : homeNext.homeTeam;
    s += `Next up: **${opp}** in Gameweek ${homeNext.gameweek}. `;
  } else {
    s += `Their next fixture is yet to be confirmed — check back for the Gameweek 11 schedule. `;
  }
  s += `\n\n`;

  s += `### ${away}\n`;
  if (awayNext) {
    const opp = awayNext.homeTeam === away ? awayNext.awayTeam : awayNext.homeTeam;
    s += `Next up: **${opp}** in Gameweek ${awayNext.gameweek}. `;
  } else {
    s += `Their next fixture is yet to be confirmed — check back for the Gameweek 11 schedule. `;
  }
  s += `\n\n`;

  return s;
}

function titleVariations(home, away, hs, as, gw, winner, loser, margin) {
  if (winner) {
    if (margin >= 6) {
      return pick([
        `${winner} Run Riot Against ${loser} in ${hs}-${as} Demolition — GW${gw}`,
        `${winner} Annihilate ${loser} ${hs}-${as} in Statement Victory — GW${gw}`,
        `${winner} Obliterate ${loser} ${hs}-${as} in Crushing GW${gw} Display`,
        `${winner} Destroy ${loser} ${hs}-${as} in Total Domination — GW${gw}`,
      ]);
    }
    if (margin >= 4) {
      return pick([
        `${winner} Overpower ${loser} ${hs}-${as} in Dominant Display — GW${gw}`,
        `${winner} Cruise Past ${loser} in ${hs}-${as} Rout — GW${gw}`,
        `${winner} Brush ${loser} Aside ${hs}-${as} in Confident Showing — GW${gw}`,
        `${winner} Too Strong for ${loser} in ${hs}-${as} Victory — GW${gw}`,
      ]);
    }
    if (margin >= 2) {
      return pick([
        `${winner} Beat ${loser} ${hs}-${as} in Entertaining GW${gw} Clash`,
        `${winner} See Off ${loser} ${hs}-${as} in Gameweek ${gw}`,
        `${winner} Claim ${hs}-${as} Win Over ${loser} in GW${gw}`,
        `${winner} Down ${loser} ${hs}-${as} in Hard-Fought GW${gw} Battle`,
      ]);
    }
    return pick([
      `${winner} Edge ${loser} ${hs}-${as} in GW${gw} Thriller`,
      `${winner} Scrape Past ${loser} ${hs}-${as} in Tight GW${gw} Contest`,
      `${winner} Narrowly Beat ${loser} ${hs}-${as} in GW${gw} Nail-biter`,
      `${winner} Pip ${loser} ${hs}-${as} in Tense GW${gw} Encounter`,
    ]);
  }
  // draw
  if (hs + as >= 8) {
    return pick([
      `${home} and ${away} Share ${hs}-${as} Goal Fest in GW${gw}`,
      `${home} and ${away} Play Out ${hs}-${as} Classic in Gameweek ${gw}`,
      `${home} and ${away} Serve Up ${hs}-${as} Epic in GW${gw}`,
    ]);
  }
  return pick([
    `${home} and ${away} Deadlocked at ${hs}-${as} in GW${gw}`,
    `${home} and ${away} Play Out ${hs}-${as} Draw in Gameweek ${gw}`,
    `${home} and ${away} Finish ${hs}-${as} in Hard-Fought GW${gw} Draw`,
    `${home} and ${away} Split the Points in ${hs}-${as} GW${gw} Stalemate`,
  ]);
}

// ─── Report Generator ─────────────────────────────────────────

function generateReport(match) {
  const home = match.homeTeam;
  const away = match.awayTeam;
  const hs = match.homeScore;
  const as = match.awayScore;
  const gw = match.gameweek;
  const margin = hs - as;
  const winner = hs > as ? home : as > hs ? away : null;
  const loser = winner === home ? away : home;
  const totalGoals = hs + as;

  const standingsBefore = computeStandings(gw);
  const standingsAfter = computeStandings(gw + 1);
  const homePosBefore = findTeamPos(standingsBefore, match.homeSlug);
  const awayPosBefore = findTeamPos(standingsBefore, match.awaySlug);
  const homePosAfter = findTeamPos(standingsAfter, match.homeSlug);
  const awayPosAfter = findTeamPos(standingsAfter, match.awaySlug);

  const homeForm = getTeamForm(match.homeSlug, gw);
  const awayForm = getTeamForm(match.awaySlug, gw);

  const h2h = getH2H(match.homeSlug, match.awaySlug, gw);

  const homeScorers = getTopScorers(match.homeSlug);
  const awayScorers = getTopScorers(match.awaySlug);
  const homeTopScorer = homeScorers[0] || null;
  const awayTopScorer = awayScorers[0] || null;

  const gc1 = gcName(match.gamechanger1.type);
  const gc2 = gcName(match.gamechanger2.type);
  const gc1g = match.gamechanger1.goalsScored;
  const gc2g = match.gamechanger2.goalsScored;
  const gcTotal = gc1g + gc2g;

  const homeNext = fixturesData.upcoming.find(f => f.gameweek > gw && (f.homeSlug === match.homeSlug || f.awaySlug === match.homeSlug));
  const awayNext = fixturesData.upcoming.find(f => f.gameweek > gw && (f.homeSlug === match.awaySlug || f.awaySlug === match.awaySlug));

  const goalscorers = match.goalscorers || [];
  const playerStats = match.playerStats || [];

  const title = titleVariations(home, away, hs, as, gw, winner, loser, Math.abs(margin));

  const slug = `${match.homeSlug}-vs-${match.awaySlug}-gw${gw}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");

  const excerpt = `${home} ${hs}-${as} ${away} — Gameweek ${gw} match report. ` +
    (homeTopScorer ? `${homeTopScorer.name} (${homeTopScorer.seasons?.["3"]?.goals || 0} goals) leads ${home}'s attack. ` : "") +
    `Game Changers: ${gc1} (${gc1g}) & ${gc2} (${gc2g}). ` +
    `Read the full match report, player stats, table impact and head-to-head analysis.`;

  const date = new Date();
  const dateStr = date.toISOString().split("T")[0];

  const content = `---
title: "${title}"
date: ${dateStr}
category: "Match Report"
excerpt: "${excerpt}"
author: "Baller League UK Fan Site"
featured: ${totalGoals >= 10}
---

## Match Summary — ${home} ${hs}-${as} ${away}

${matchSummaryNarrative(home, away, hs, as, gw, homePosBefore, awayPosBefore, homeForm, awayForm, gc1, gc2, gc1g, gc2g, goalscorers, playerStats, match.homeSlug, match.awaySlug)}

${homeForm.length > 0 ? `**${home} form (before GW${gw}):** ${formString(homeForm)} (${formStringText(homeForm)})  \n` : ""}${awayForm.length > 0 ? `**${away} form (before GW${gw}):** ${formString(awayForm)} (${formStringText(awayForm)})` : ""}

---

## How the Match Unfolded

### First Half

${firstHalfNarrative(home, away, hs, as, gc1, gc1g, gc2g, margin, goalscorers, playerStats, match.homeSlug, match.awaySlug)}

### Second Half

${secondHalfNarrative(home, away, hs, as, gc2, gc2g, Math.abs(margin), gw, goalscorers, playerStats, match.homeSlug, match.awaySlug)}

---

## Goal Timeline

${goalTimelineSection(goalscorers, playerStats, home, away, match.homeSlug, match.awaySlug)}

---

## Game Changer Impact — ${gc1} & ${gc2}

${gcAnalysis(gc1, gc2, gc1g, gc2g, totalGoals, home, away, hs, as)}

---

## Match Performers

${matchPerformersSection(playerStats, match.homeSlug, match.awaySlug, home, away, goalscorers)}

---

## Key Players & Season Stats

${keyPerformersSection(home, away, homeScorers, awayScorers)}

---

## Season Context

${seasonContextNarrative(home, away, match.homeSlug, match.awaySlug, homePosBefore, awayPosBefore, gw)}

---

## Head-to-Head History

${headToHeadSection(home, away, h2h)}

---

## Table Impact

${tableImpactSection(home, away, match.homeSlug, match.awaySlug, homePosBefore, awayPosBefore, homePosAfter, awayPosAfter, gw)}

---

## Match Stats at a Glance

| Stat | ${home} | ${away} |
|------|${'-'.repeat(Math.max(home.length + 2, 4))}|${'-'.repeat(Math.max(away.length + 2, 4))}|
| Goals | ${hs} | ${as} |
| GC Goals | ${gcTotal} | ${gcTotal} |
| GC 1st Half (${gc1}) | ${gc1g} | ${gc1g} |
| GC 2nd Half (${gc2}) | ${gc2g} | ${gc2g} |

---

## Match Facts

${matchFacts(home, away, hs, as, gc1, gc2, gc1g, gc2g, gw, Math.abs(margin), homeTopScorer, awayTopScorer)}

---

## What's Next

${whatNextSection(home, away, homeNext, awayNext)}

---

*All stats via [Baller League UK Hub](https://ballerleagueukhub.com). Match reports auto-generated from official data.*

*Looking for more Gameweek ${gw} coverage? Check out the [full GW${gw} roundup](/roundup/${gw}) for all ${matches.filter(m => m.gameweek === gw).length} matches, stats, and analysis.*
`;

  return { slug, content };
}

// ─── Main ──────────────────────────────────────────────────────

console.log(`Generating match reports for ${matches.length} matches (Season ${targetSeason || "all"})...\n`);

let generated = 0;
const seen = new Set();

for (const match of matches) {
  const { slug, content } = generateReport(match);
  if (seen.has(slug)) continue;
  seen.add(slug);
  const filePath = resolve(CONTENT_DIR, `${slug}.md`);
  writeFileSync(filePath, content);
  generated++;
  console.log(`  ${slug}.md`);
}

console.log(`\nDone! ${generated} match reports generated in ${CONTENT_DIR}`);
