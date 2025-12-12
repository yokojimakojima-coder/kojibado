console.log("🔥 common.js 最新版 読み込まれてるよ！");

/* ======================================================
   共通：localStorage
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
   players 正規化（Set を必ず持たせる）
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
   参加可否
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
  const pairs = [
    [teamA[0], teamA[1]],
    [teamB[0], teamB[1]],
  ];

  const opponents = [
    [teamA[0], teamB[0]], [teamA[0], teamB[1]],
    [teamA[1], teamB[0]], [teamA[1], teamB[1]],
  ];

  pairs.forEach(([x, y]) => {
    players[x].partners.add(y);
    players[y].partners.add(x);
  });

  opponents.forEach(([x, y]) => {
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

  if (players[a].opponents.has(c)) score -= w.opponentBias;
  if (players[a].opponents.has(d)) score -= w.opponentBias;
  if (players[b].opponents.has(c)) score -= w.opponentBias;
  if (players[b].opponents.has(d)) score -= w.opponentBias;

  group.forEach(i => {
    score -= (round - players[i].lastRoundPlayed) * w.fatigueBias;
  });

  return score + Math.random() * 0.01;
}

/* ======================================================
   審判選択（候補配列から）
====================================================== */

function chooseReferee(candidates, players, round, refBias) {
  let best = candidates[0];
  let bestScore = Infinity;

  candidates.forEach(i => {
    const score = players[i].refs * refBias;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });

  return best;
}

/* ======================================================
   ラウンド生成（★最重要修正版★）
====================================================== */

function generateRound(players, roundNumber, courtCount, weights, schedule) {
  const activeIdx = getAvailablePlayerIndexes(players, roundNumber, schedule);
  if (activeIdx.length < 5) return null; // 4人＋審判

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
            if (group.some(i => used.has(i))) continue;

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

    // ★ 審判は「試合に出てない人」から選ぶ
    const refCandidates = activeIdx.filter(
      i => !best.includes(i) && !used.has(i)
    );

    if (refCandidates.length === 0) continue;

    const refIndex = chooseReferee(
      refCandidates,
      players,
      roundNumber,
      weights.refBias
    );

    const teamA = [best[0], best[1]];
    const teamB = [best[2], best[3]];

    rounds.push({ teamA, teamB });
    refs.push(refIndex);

    best.forEach(i => used.add(i));
    used.add(refIndex);

    players[refIndex].refs++;
    players[refIndex].lastRefRound = roundNumber;

    best.forEach(i => {
      players[i].games++;
      players[i].lastRoundPlayed = roundNumber;
    });

    updateHistory(players, teamA, teamB);
  }

  const restPlayers = activeIdx.filter(i => !used.has(i));
  restPlayers.forEach(i => {
    players[i].rests++;
    players[i].lastRestRound = roundNumber;
  });

  return { rounds, refs, benches: restPlayers };
}
