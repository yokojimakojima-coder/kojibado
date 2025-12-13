console.log("🔥 common.js 完全版 読み込まれたよ！");

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
   players 正規化（Set 必須）
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
  const arr = [];
  players.forEach((p, i) => {
    if (isAvailableAtRound(p.name, roundNumber, schedule)) arr.push(i);
  });
  return arr;
}

/* ======================================================
   AI 重み（最終調整）
====================================================== */

function getAiWeights() {
  return {
    partnerBias: 15,
    opponentBias: 12,
    fatigueBias: 1.2,
    refBias: 2.0,
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
   評価関数（偏り抑制・完成形）
====================================================== */

function calcGroupScore(players, group, round, w) {
  let score = 0;

  const [a, b, c, d] = group;

  // ペア被り
  if (players[a].partners.has(b)) score -= w.partnerBias;
  if (players[c].partners.has(d)) score -= w.partnerBias;

  // 対戦被り
  if (players[a].opponents.has(c)) score -= w.opponentBias;
  if (players[a].opponents.has(d)) score -= w.opponentBias;
  if (players[b].opponents.has(c)) score -= w.opponentBias;
  if (players[b].opponents.has(d)) score -= w.opponentBias;

  // 平均試合数との差（超重要）
  const avgGames =
    players.reduce((s, p) => s + p.games, 0) / players.length;

  group.forEach(i => {
    score -= Math.abs(players[i].games - avgGames) * 5;
  });

  // 連続出場を強く嫌う
  group.forEach(i => {
    if (players[i].lastRoundPlayed === round - 1) {
      score -= 20;
    }
  });

  // 微ランダム
  return score + Math.random() * 0.01;
}

/* ======================================================
   審判選択（連続回避）
====================================================== */

function chooseReferee(group, players, round, refBias) {
  let best = group[0];
  let bestScore = Infinity;

  group.forEach(i => {
    let score = players[i].refs * refBias;
    if (players[i].lastRefRound === round - 1) score += 10;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });

  return best;
}

/* ======================================================
   ラウンド生成（最終安定版）
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

            const group = [
              activeIdx[a],
              activeIdx[b],
              activeIdx[c],
              activeIdx[d]
            ];

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

    const refIndex = chooseReferee(best, players, roundNumber, weights.refBias);

    // ★ 全員プレイ版（審判も含める）
    const play = best;

    const teamA = [play[0], play[1]];
    const teamB = [play[2], play[3]];

    rounds.push({ teamA, teamB });
    refs.push(refIndex);

    play.forEach(i => used.add(i));

    players[refIndex].refs++;
    players[refIndex].lastRefRound = roundNumber;

    play.forEach(i => {
      players[i].games++;
      players[i].lastRoundPlayed = roundNumber;
    });

    updateHistory(players, teamA, teamB);
  }

  // 休憩
  activeIdx
    .filter(i => !used.has(i))
    .forEach(i => {
      players[i].rests++;
      players[i].lastRestRound = roundNumber;
    });

  return { rounds, refs };
}
