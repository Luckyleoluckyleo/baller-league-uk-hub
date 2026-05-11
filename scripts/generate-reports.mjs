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

// ─── Narrative Generators ──────────────────────────────────────

function matchSummaryNarrative(home, away, hs, as, gw, homePosBefore, awayPosBefore, homeForm, awayForm, gc1, gc2, gc1g, gc2g) {
  const totalGoals = hs + as;
  const margin = Math.abs(hs - as);
  const winner = hs > as ? home : as > hs ? away : null;
  const loser = winner === home ? away : home;
  const gcTotal = gc1g + gc2g;

  const kickoffs = [
    `${home} and ${away} faced off at Baller Arena`,
    `${home} took on ${away} in a Gameweek ${gw} clash`,
    `Gameweek ${gw} brought ${home} and ${away} together at Baller Arena`,
    `The Gameweek ${gw} schedule pitted ${home} against ${away}`,
    `All eyes were on Baller Arena as ${home} met ${away}`,
  ];

  let narrative = pick(kickoffs);

  if (homePosBefore && awayPosBefore) {
    if (homePosBefore <= 4 && awayPosBefore <= 4) {
      narrative += ` in a top-of-the-table showdown, with ${home} sitting ${homePosBefore}${ordinalSuffix(homePosBefore)} and ${away} ${awayPosBefore}${ordinalSuffix(awayPosBefore)}.`;
    } else if (homePosBefore <= 4) {
      narrative += `, with ${home} sitting ${homePosBefore}${ordinalSuffix(homePosBefore)} and looking to strengthen their playoff push against ${awayPosBefore}${ordinalSuffix(awayPosBefore)}-placed ${away}.`;
    } else if (awayPosBefore <= 4) {
      narrative += `, where ${homePosBefore}${ordinalSuffix(homePosBefore)}-placed ${home} looked to upset ${awayPosBefore}${ordinalSuffix(awayPosBefore)}-placed ${away}.`;
    } else {
      narrative += `, two sides looking to climb the table from ${homePosBefore}${ordinalSuffix(homePosBefore)} and ${awayPosBefore}${ordinalSuffix(awayPosBefore)} respectively.`;
    }
  }

  narrative += "\n\n";

  if (winner) {
    const blowout = margin >= 5;
    const dominant = margin >= 3 && margin < 5;
    const closeGame = margin <= 1;

    if (blowout) {
      narrative += pick([
        `${winner} produced a statement performance, dismantling ${loser} ${hs}-${as} with a ruthless attacking display that will send a message to the rest of the league.`,
        `In a breathtaking display of attacking football, ${winner} ran riot against ${loser}, putting ${hs} past them in a ${hs}-${as} demolition.`,
        `${winner} were simply unstoppable as they crushed ${loser} ${hs}-${as}, delivering one of the most emphatic results of Gameweek ${gw}.`,
      ]);
    } else if (dominant) {
      narrative += pick([
        `${winner} controlled proceedings from start to finish, running out ${hs}-${as} winners in a performance that underlined their quality.`,
        `${winner} proved too strong for ${loser}, taking a convincing ${hs}-${as} victory that never looked in doubt.`,
        `A composed, professional display from ${winner} saw them dispatch ${loser} ${hs}-${as} to claim all three points.`,
      ]);
    } else if (closeGame) {
      narrative += pick([
        `${winner} edged past ${loser} ${hs}-${as} in a nail-biting encounter that could have gone either way.`,
        `In a tense, tightly-contested affair, ${winner} held their nerve to beat ${loser} ${hs}-${as}.`,
        `${winner} scraped a hard-fought ${hs}-${as} win over ${loser} in a match where fine margins proved decisive.`,
      ]);
    } else {
      narrative += pick([
        `${winner} emerged ${hs}-${as} victors over ${loser} after a competitive clash that showcased the best of Baller League football.`,
        `${winner} claimed a well-deserved ${hs}-${as} win against ${loser} in an entertaining Gameweek ${gw} encounter.`,
      ]);
    }

    narrative += ` The Game Changer period played a key role, with the ${gc1} and ${gc2} activations contributing ${gcTotal} goals to a match that saw ${totalGoals} in total.`;
  } else {
    narrative += pick([
      `${home} and ${away} played out a thrilling ${hs}-${as} draw in a match where neither side deserved to lose.`,
      `${home} and ${away} could not be separated as they battled to a ${hs}-${as} stalemate at Baller Arena.`,
      `Honours were even as ${home} and ${away} shared the spoils in an entertaining ${hs}-${as} draw.`,
    ]);
    narrative += ` The ${totalGoals} goals kept the crowd on the edge of their seats, with the Game Changer period adding extra drama through ${gc1} and ${gc2}.`;
  }

  return narrative;
}

function firstHalfNarrative(home, away, hs, as, gc1, gc1g, gc2g, margin) {
  const winner = hs > as ? home : as > hs ? away : null;
  const gcTotal = gc1g + gc2g;

  const gcLines = [
    `The first half saw the ${gc1} Game Changer activate at the 12th minute`,
    `At the 12-minute mark, the ${gc1} Game Changer came into effect`,
    `The ${gc1} Game Changer kicked in at the 12th minute`,
  ];

  let n = pick(gcLines);

  if (gc1g > 0) {
    n += pick([
      `, generating ${gc1g} goal${gc1g > 1 ? 's' : ''} that set the tempo for the half`,
      `, producing ${gc1g} goal${gc1g > 1 ? 's' : ''} in a frantic period of play`,
      ` and the teams made it count with ${gc1g} goal${gc1g > 1 ? 's' : ''} being scored`,
    ]);
  } else {
    n += pick([
      `, but neither side could find the breakthrough during the activation`,
      `, though goals proved elusive as both defences held firm`,
      `, yet the deadlock remained unbroken`,
    ]);
  }

  n += ". ";

  if (winner) {
    const halfMargin = Math.abs(hs - as);
    if (halfMargin >= 3) {
      n += pick([
        `${winner} seized the initiative early and never looked back, building a commanding lead.`,
        `${winner} flew out of the blocks, overwhelming ${winner === home ? away : home} with wave after wave of attacks.`,
      ]);
    } else if (halfMargin >= 1) {
      n += pick([
        `${winner} edged the opening exchanges with a more clinical edge in front of goal.`,
        `${winner} shaded a competitive first period, taking their chances well.`,
      ]);
    } else {
      n += `The sides went into the break level after an evenly-matched first period.`;
    }
  } else {
    n += `The two sides were inseparable at the break, with the contest finely poised.`;
  }

  return n;
}

function secondHalfNarrative(home, away, hs, as, gc2, gc2g, margin, gw) {
  const winner = hs > as ? home : as > hs ? away : null;
  const loser = winner === home ? away : home;
  const totalGoals = hs + as;

  let n = pick([
    `The ${gc2} Game Changer activated at the 27th minute`,
    `At the 27-minute mark, the ${gc2} Game Changer came into play`,
    `The ${gc2} Game Changer kicked in at the 27th minute of the second half`,
  ]);

  if (gc2g > 0) {
    n += pick([
      `, adding ${gc2g} goal${gc2g > 1 ? 's' : ''} and injecting fresh energy into the contest`,
      ` and delivered ${gc2g} goal${gc2g > 1 ? 's' : ''} that shifted the momentum`,
      `, producing ${gc2g} goal${gc2g > 1 ? 's' : ''} at a crucial stage`,
    ]);
  } else {
    n += pick([
      `, but neither side could capitalise on the modified rules`,
      `, though the goals dried up as the match wore on`,
    ]);
  }

  n += ". ";

  if (winner) {
    if (margin >= 5) {
      n += pick([
        `${winner} continued their onslaught, putting the game well beyond ${loser}'s reach in a relentless second-half showing.`,
        `${winner} showed no mercy after the break, piling on the goals to complete a resounding victory.`,
      ]);
    } else if (margin >= 3) {
      n += pick([
        `${winner} managed the game superbly after the interval, seeing out a professional victory.`,
        `${winner} maintained their grip on the match throughout the second period to secure a comfortable win.`,
      ]);
    } else if (margin === 1 || margin === 2) {
      n += pick([
        `${loser} pushed hard for an equaliser${margin === 2 ? ' but ' + winner + ' held firm' : ''}, with ${winner} defending resolutely to protect their lead.`,
        `The closing stages were nervy as ${loser} threw everything forward, but ${winner} stood strong to claim the points.`,
      ]);
    }
  } else {
    n += pick([
      `Both sides pushed for a winner but ultimately had to settle for a share of the points.`,
      `Despite late pressure, neither team could find the decisive goal and the spoils were shared.`,
    ]);
  }

  if (totalGoals >= 10) {
    n += ` The ${totalGoals}-goal spectacle was one of the highest-scoring matches of Gameweek ${gw}.`;
  }

  return n;
}

function gcAnalysis(gc1, gc2, gc1g, gc2g, totalGoals, home, away, hs, as) {
  const gcTotal = gc1g + gc2g;
  const gcPct = totalGoals > 0 ? Math.round((gcTotal / totalGoals) * 100) : 0;

  let analysis = `The Game Changer period proved ${gcTotal >= 5 ? 'decisive' : gcTotal >= 2 ? 'influential' : 'quiet'} in this match, with the ${gc1} and ${gc2} activations combining for ${gcTotal} goals — accounting for ${gcPct}% of the match's total scoring.\n\n`;

  analysis += `| GC Activation | Type | Goals |\n`;
  analysis += `|---------------|------|-------|\n`;
  analysis += `| 1st Half (12') | ${gc1} | ${gc1g} |\n`;
  analysis += `| 2nd Half (27') | ${gc2} | ${gc2g} |\n`;
  analysis += `| **Total** | | **${gcTotal}** |\n\n`;

  if (gcTotal >= 7) {
    analysis += `The Game Changer period exploded into life, with the ${gc1g > gc2g ? gc1 : gc2} activation proving particularly devastating. `;
    analysis += `Matches where the Game Changer produces this volume of goals often become instant classics, and this was no exception. The high-scoring nature of the GC period meant the usual tactical calculations went out the window, with both teams forced to adapt on the fly.`;
  } else if (gcTotal >= 4) {
    analysis += `The Game Changers provided a genuine spectacle, with both activations contributing meaningfully to the scoreline. The ${gc1g > gc2g ? 'first-half ' + gc1 : 'second-half ' + gc2} was the more impactful of the two, and the teams' approaches to managing these periods proved crucial to the outcome.`;
  } else if (gcTotal >= 1) {
    analysis += `The Game Changer period brought a modest ${gcTotal} goal${gcTotal > 1 ? 's' : ''}, with the modified rules creating chances but not overwhelming the flow of the match. This was more about tactical adjustments than the chaos that sometimes defines GC activations.`;
  } else {
    analysis += `In a rarity for Baller League, neither Game Changer activation yielded a goal. Both defences deserve immense credit for staying disciplined during the modified-rule periods — it takes serious concentration to navigate the GC without conceding.`;
  }

  return analysis;
}

function keyPerformersSection(home, away, homeScorers, awayScorers) {
  let s = '';

  s += `### ${home} — Top Scorers\n\n`;
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

  s += `### ${away} — Top Scorers\n\n`;
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
      s += `- **${homeScorer.name}** — ${home}'s leading marksman with ${hs.goals || 0} goals in ${hs.apps || 0} appearances${hs.assists > 0 ? `, plus ${hs.assists} assists` : ''}. `;
      if ((hs.goals || 0) >= 5) s += `One of the most consistent finishers in the league. `;
      s += `\n`;
    }
    if (awayScorer) {
      const as = awayScorer.seasons?.["3"] || {};
      s += `- **${awayScorer.name}** — ${away}'s top scorer with ${as.goals || 0} goals${as.assists > 0 ? ` and ${as.assists} assists` : ''} from ${as.apps || 0} outings. `;
      if ((as.goals || 0) >= 5) s += `A reliable source of goals for his side. `;
      s += `\n`;
    }
  }

  return s;
}

function seasonContextNarrative(home, away, homeSlug, awaySlug, homePosBefore, awayPosBefore, gw) {
  const totalGWs = 11;
  const remaining = totalGWs - gw;
  let n = '';

  const homeTeamGoals = teamGoals(homeSlug);
  const awayTeamGoals = teamGoals(awaySlug);
  const homeAvg = teamAvgGoals(homeSlug);
  const awayAvg = teamAvgGoals(awaySlug);
  const leagueAvg = leagueAvgGoals();

  n += `**${home}** came into this fixture averaging **${homeAvg} goals per game** (${homeTeamGoals} total from ${gw} matches), `;
  n += homeAvg > leagueAvg ? `making them one of the more prolific attacking sides in the competition. ` : `with room for improvement in the final third. `;

  n += `**${away}** arrived averaging **${awayAvg} goals per game** (${awayTeamGoals} total), `;
  n += awayAvg > leagueAvg ? `showcasing their own attacking credentials. ` : `looking to find a sharper edge in front of goal. `;

  n += `\n\nWith the league average sitting at **${leagueAvg} goals per match**, `;
  if (parseFloat(homeAvg) > parseFloat(leagueAvg) && parseFloat(awayAvg) > parseFloat(leagueAvg)) {
    n += `this fixture promised goals — and both sides have consistently delivered above-par attacking output this season.`;
  } else if (parseFloat(homeAvg) > parseFloat(leagueAvg)) {
    n += `${home} have been among the league's entertainers while ${away} have been more conservative in their approach.`;
  } else {
    n += `the tactical contrast between these two sides added an intriguing layer to the pre-match narrative.`;
  }

  if (remaining > 0) {
    n += `\n\nWith just **${remaining} gameweek${remaining > 1 ? 's' : ''} remaining** in the regular season, every point was vital. `;
    if (homePosBefore && homePosBefore <= 4) {
      n += `${home} — sitting ${homePosBefore}${ordinalSuffix(homePosBefore)} — ${playoffContention(homePosBefore, gw) || 'are firmly in the playoff picture'}. `;
    }
    if (awayPosBefore && awayPosBefore <= 4) {
      n += `${away} — ${awayPosBefore}${ordinalSuffix(awayPosBefore)} before kick-off — ${playoffContention(awayPosBefore, gw) || 'are well in the mix'}. `;
    }
  }

  return n;
}

function tableImpactSection(home, away, homeSlug, awaySlug, homePosBefore, awayPosBefore, homePosAfter, awayPosAfter, gw) {
  let s = '';

  function posChange(team, slug, before, after) {
    if (before === null || after === null) return `${team} held steady in the standings.`;
    if (after < before) return `${team} climbed from ${before}${ordinalSuffix(before)} to ${after}${ordinalSuffix(after)}.`;
    if (after > before) return `${team} dropped from ${before}${ordinalSuffix(before)} to ${after}${ordinalSuffix(after)}.`;
    return `${team} remained ${after}${ordinalSuffix(after)} in the table.`;
  }

  s += `| Team | Before GW${gw} | After GW${gw} | Change |\n`;
  s += `|------|-------------|-------------|--------|\n`;
  s += `| ${home} | ${homePosBefore !== null ? homePosBefore + ordinalSuffix(homePosBefore) : '—'} | ${homePosAfter !== null ? homePosAfter + ordinalSuffix(homePosAfter) : '—'} | ${posChange(home, homeSlug, homePosBefore, homePosAfter)} |\n`;
  s += `| ${away} | ${awayPosBefore !== null ? awayPosBefore + ordinalSuffix(awayPosBefore) : '—'} | ${awayPosAfter !== null ? awayPosAfter + ordinalSuffix(awayPosAfter) : '—'} | ${posChange(away, awaySlug, awayPosBefore, awayPosAfter)} |\n`;

  return s;
}

function headToHeadSection(home, away, h2h) {
  let s = '';
  if (h2h.played === 0) {
    s += `This was the **first ever competitive meeting** between ${home} and ${away} — a historic occasion that adds a new chapter to the Baller League record books.\n\n`;
  } else {
    s += `${home} and ${away} had faced each other **${h2h.played} time${h2h.played > 1 ? 's' : ''}** prior to this match. `;
    if (h2h.won > h2h.lost) {
      s += `${home} held the upper hand with **${h2h.won} win${h2h.won > 1 ? 's' : ''}** to ${away}'s ${h2h.lost}, with ${h2h.drawn} draw${h2h.drawn !== 1 ? 's' : ''} between them.`;
    } else if (h2h.lost > h2h.won) {
      s += `${away} had the historical edge with **${h2h.lost} win${h2h.lost > 1 ? 's' : ''}** to ${home}'s ${h2h.won}, alongside ${h2h.drawn} draw${h2h.drawn !== 1 ? 's' : ''}.`;
    } else {
      s += `The rivalry was finely balanced with **${h2h.won} win${h2h.won > 1 ? 's' : ''} each** and ${h2h.drawn} draw${h2h.drawn !== 1 ? 's' : ''}.`;
    }

    if (h2h.results.length > 0) {
      s += `\n\n`;
      s += `| GW | Result |\n|-----|--------|\n`;
      for (const r of h2h.results) {
        s += `| ${r.gw} | ${home} ${r.homeScore}-${r.awayScore} ${away} |\n`;
      }
      s += '\n';
    }

    s += `\n| Stat | ${home} | ${away} |\n`;
    s += `|------|${'-'.repeat(Math.max(home.length + 2, 4))}|${'-'.repeat(Math.max(away.length + 2, 4))}|\n`;
    s += `| Wins in H2H | ${h2h.won} | ${h2h.lost} |\n`;
    s += `| Draws | ${h2h.drawn} | ${h2h.drawn} |\n`;
    s += `| Goals Scored | ${h2h.gf} | ${h2h.ga} |\n\n`;
  }

  return s;
}

function matchFacts(home, away, hs, as, gc1, gc2, gc1g, gc2g, gw, margin, homeTopScorer, awayTopScorer) {
  const totalGoals = hs + as;
  const gcTotal = gc1g + gc2g;
  const facts = [];

  facts.push(`This was a Gameweek ${gw} fixture at Baller Arena`);
  facts.push(`The Game Changers selected were ${gc1} and ${gc2}`);

  if (totalGoals >= 10) facts.push(`This ${totalGoals}-goal thriller was one of the highest-scoring matches of Gameweek ${gw}`);
  if (totalGoals <= 2) facts.push(`A tight defensive battle with just ${totalGoals} goal${totalGoals > 1 ? 's' : ''} scored`);
  if (gcTotal >= 7) facts.push(`The Game Changer period produced an extraordinary ${gcTotal} goals`);
  if (gcTotal === 0) facts.push(`This was a rare match where neither Game Changer produced a goal`);
  if (margin >= 5) facts.push(`The ${margin}-goal winning margin was among the biggest of Gameweek ${gw}`);

  if (homeTopScorer) {
    const hg = homeTopScorer.seasons?.["3"]?.goals || 0;
    facts.push(`${homeTopScorer.name} leads ${home} with ${hg} goals this season`);
  }
  if (awayTopScorer) {
    const ag = awayTopScorer.seasons?.["3"]?.goals || 0;
    facts.push(`${awayTopScorer.name} tops ${away}'s scoring charts with ${ag} goals`);
  }

  if (gc1g + gc2g > 0) {
    facts.push(`${gcTotal} of the ${totalGoals} goals (${Math.round(gcTotal / totalGoals * 100)}%) came from Game Changer activations`);
  }

  return facts.map(f => `- ${f}`).join('\n');
}

function whatNextSection(home, away, homeNext, awayNext) {
  let s = '';

  s += `### ${home}\n`;
  if (homeNext) {
    const opp = homeNext.homeTeam === home ? homeNext.awayTeam : homeNext.homeTeam;
    s += `${home} face **${opp}** in Gameweek ${homeNext.gameweek}. `;
    s += `This will be another crucial fixture as the season enters its decisive phase.\n\n`;
  } else {
    s += `${home} await confirmation of their next fixture.\n\n`;
  }

  s += `### ${away}\n`;
  if (awayNext) {
    const opp = awayNext.homeTeam === away ? awayNext.awayTeam : awayNext.homeTeam;
    s += `${away} take on **${opp}** in Gameweek ${awayNext.gameweek}. `;
    s += `They will be looking to bounce back and keep their season on track.\n\n`;
  } else {
    s += `${away} await confirmation of their next fixture.\n\n`;
  }

  return s;
}

function titleVariations(home, away, hs, as, gw, winner, loser, margin) {
  if (winner) {
    if (margin >= 6) {
      return pick([
        `${winner} Run Riot Against ${loser} in ${hs}-${as} Demolition — GW${gw}`,
        `${winner} Annihilate ${loser} ${hs}-${as} in Statement Victory — GW${gw}`,
      ]);
    }
    if (margin >= 4) {
      return pick([
        `${winner} Overpower ${loser} ${hs}-${as} in Dominant Display — GW${gw}`,
        `${winner} Cruise Past ${loser} in ${hs}-${as} Rout — GW${gw}`,
      ]);
    }
    if (margin >= 2) {
      return pick([
        `${winner} Beat ${loser} ${hs}-${as} in Entertaining GW${gw} Clash`,
        `${winner} See Off ${loser} ${hs}-${as} in Gameweek ${gw}`,
      ]);
    }
    return pick([
      `${winner} Edge ${loser} ${hs}-${as} in GW${gw} Thriller`,
      `${winner} Scrape Past ${loser} ${hs}-${as} in Tight GW${gw} Contest`,
    ]);
  }
  // draw
  if (hs + as >= 8) {
    return pick([
      `${home} and ${away} Share ${hs}-${as} Goal Fest in GW${gw}`,
      `${home} and ${away} Play Out ${hs}-${as} Classic in Gameweek ${gw}`,
    ]);
  }
  return pick([
    `${home} and ${away} Deadlocked at ${hs}-${as} in GW${gw}`,
    `${home} and ${away} Play Out ${hs}-${as} Draw in Gameweek ${gw}`,
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

  const homeNext = fixturesData.upcoming.find(f => f.homeSlug === match.homeSlug || f.awaySlug === match.homeSlug);
  const awayNext = fixturesData.upcoming.find(f => f.homeSlug === match.awaySlug || f.awaySlug === match.awaySlug);

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

${matchSummaryNarrative(home, away, hs, as, gw, homePosBefore, awayPosBefore, homeForm, awayForm, gc1, gc2, gc1g, gc2g)}

${homeForm.length > 0 ? `**${home} form (before GW${gw}):** ${formString(homeForm)} (${formStringText(homeForm)})  \n` : ""}${awayForm.length > 0 ? `**${away} form (before GW${gw}):** ${formString(awayForm)} (${formStringText(awayForm)})` : ""}

---

## How the Match Unfolded

### First Half

${firstHalfNarrative(home, away, hs, as, gc1, gc1g, gc2g, margin)}

### Second Half

${secondHalfNarrative(home, away, hs, as, gc2, gc2g, Math.abs(margin), gw)}

---

## Game Changer Impact — ${gc1} & ${gc2}

${gcAnalysis(gc1, gc2, gc1g, gc2g, totalGoals, home, away, hs, as)}

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
