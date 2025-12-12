console.log("🔥 common.js 最終版 読み込まれたよ！");
/* ======================================================
   localStorage
====================================================== */

function getAllPlayers() {
  return JSON.parse(localStorage.getItem("allPlayers") || "[]");
}

function getActivePlayers() {
  return JSON.parse(localStorage.getItem("activePlayers") || "[]");
}

function getSchedule() {
  return JSON.parse(localStorage.getItem("scheduleData") || "{}");
}

function saveSchedule(s) {
  localStorage.setItem("scheduleData", JSON.stringify(s));
}

/* ======================================================
   players 正規化
====================================================== */

function normalizePlayers(names) {
  return names.map((name, idx) => ({
    name,
    idx,
    games: 0,
    refs: 0,
    rests: 0,
    partners: new Set(),
    opponents: new Set(),
    lastRoundPlayed: 0,
    lastRefRound: 0,
    lastRestRound: 0,
  }));
}

/* ======================================================
   参加判定
====================================================== */

function isAvailableAtRound(name, roundNumber, schedule) {
  const segs = schedule[name] || [];
  return segs.some(seg => seg.from <= roundNumber && roundNumber <= seg.to);
}

function getAvailablePlayerIndexes(players, roundNumber, schedule) {
  return players
    .map((p, i) => isAvailableAtRound(p.name, roundNumber, schedule) ? i : null)
    .filter(i => i !== null);
}

/* ======================================================
   AI 重み
====================================================== */

function getAiWeights() {
  return {
    partnerBias: 15,
    opponentBias: 12,
    fatigueBias: 1.2,
    refBias: 2.0,
    restBias: 2.0,
  };
}

/* ======================================================
   履歴更新
====================================================== */

function updateHistory(players, teamA, teamB) {
  [[teamA[0], teamA[1]], [teamB[0], teamB[1]]].forEach(([x, y]) => {
    players[x].partners.add(y);
    players[y].partners.add(x);
  });

  [
    [teamA[0], teamB[0]], [teamA[0], teamB[1]],
    [teamA[1], teamB[0]], [teamA[1], teamB[1]],
  ].forEach(([x, y]) => {
    players[x].opponents.add(y);
    players[y].opponents.add(x);
  });
}

/* ======================================================
   評価関数
====================================================== */

function calcGroupScore(players, group, round, w) {
  let score = 0;
  const [a, b, c, d] = group;

  if (players[a].partners.has(b)) score -= w.partnerBias;
  if (players[c].partners.has(d)) score -= w.partnerBias;

  [a, b].forEach(x => {
    [c, d].forEach(y => {
      if (players[x].opponents.has(y)) score -= w.opponentBias;
    });
  });

  group.forEach(i => {
    score -= (round - players[i].lastRoundPlayed) * w.fatigueBias;
  });

  return score + Math.random() * 0.01;
}

/* ======================================================
   審判選択
====================================================== */

function chooseReferee(group, players, round, refBias) {
  return group.reduce((best, i) =>
    players[i].refs < players[best].refs ? i : best
  );
}

/* ======================================================
   ラウンド生成
====================================================== */

function generateRound(players, roundNumber, courtCount, weights, schedule) {
  const activeIdx = getAvailablePlayerIndexes(players, roundNumber, schedule);
  if (activeIdx.length < 4) return null;

  const rounds = [];
  const refs = [];
  const used = new Set();

  for (let court = 0; court < courtCount; court++) {
    let best = null;
    let bestScore = -Infinity;

    for (let a = 0; a < activeIdx.length; a++) {
      for (let b = a + 1; b < activeIdx.length; b++) {
        for (let c = b + 1; c < activeIdx.length; c++) {
          for (let d = c + 1; d < activeIdx.length; d++) {
            const group = [activeIdx[a], activeIdx[b], activeIdx[c], activeIdx[d]];
            if (group.some(x => used.has(x))) continue;

            const score = calcGroupScore(players, group, roundNumber, weights);
            if (score > bestScore) {
              bestScore = score;
              best = group;
            }
          }
        }
      }
    }

    if (!best) break;

    const ref = chooseReferee(best, players, roundNumber, weights.refBias);
    const play = best.filter(i => i !== ref);
    if (play.length !== 4) continue;

    rounds.push({ teamA: [play[0], play[1]], teamB: [play[2], play[3]] });
    refs.push(ref);

    used.add(ref);
    play.forEach(i => used.add(i));

    players[ref].refs++;
    players[ref].lastRefRound = roundNumber;

    play.forEach(i => {
      players[i].games++;
      players[i].lastRoundPlayed = roundNumber;
    });

    updateHistory(players, [play[0], play[1]], [play[2], play[3]]);
  }

  activeIdx.filter(i => !used.has(i)).forEach(i => {
    players[i].rests++;
    players[i].lastRestRound = roundNumber;
  });

  return { rounds, refs };
}
