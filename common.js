/* ======================================================
   共通データ管理
====================================================== */

// ★ 全名簿
function getAllPlayers() {
  return JSON.parse(localStorage.getItem("allPlayers") || "[]");
}

// ★ 今日の参加者（名簿 → チェックされた人）
function getActivePlayers() {
  return JSON.parse(localStorage.getItem("activePlayers") || "[]");
}

// ★ スケジュール（途中参加／抜け）
function getSchedule() {
  return JSON.parse(localStorage.getItem("scheduleData") || "{}");
}

function saveSchedule(s) {
  localStorage.setItem("scheduleData", JSON.stringify(s));
}

/* ======================================================
   スケジュール判定（あるラウンドで参加可能か？）
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
   AI モード（最強公平のみ）
====================================================== */
function getAiWeights() {
  return {
    refBias: 2.0,
    restBias: 2.0,
    opponentBias: 1.6,
    partnerBias: 1.6,
    fatigueBias: 1.8
  };
}

/* ======================================================
   ラウンド生成
====================================================== */

function generateRound(players, roundNumber, courtCount, weights, schedule) {

  const activeIdx = getAvailablePlayerIndexes(players, roundNumber, schedule);
  if (activeIdx.length < 4) return null;

  const used = new Set();
  const rounds = [];
  const refs = [];
  const benches = [];

  for (let c = 0; c < courtCount; c++) {

    let best = null;
    let bestScore = -999999;

    for (let a = 0; a < activeIdx.length; a++) {
      for (let b = a + 1; b < activeIdx.length; b++) {
        for (let c1 = b + 1; c1 < activeIdx.length; c1++) {
          for (let d = c1 + 1; d < activeIdx.length; d++) {

            const group = [
              activeIdx[a],
              activeIdx[b],
              activeIdx[c1],
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

    const base = best.filter(i => i !== refIndex);
    const spare = activeIdx.filter(i => !used.has(i) && !base.includes(i));

    let add = null;

    if (spare.length > 0) {
      add = spare.sort((a, b) =>
        (players[a].rests - players[b].rests) ||
        (players[a].games - players[b].games)
      )[0];
    } else {
      add = base[Math.floor(Math.random() * base.length)];
    }

    const finalFour = [...base, add];

    const teamA = [finalFour[0], finalFour[1]];
    const teamB = [finalFour[2], finalFour[3]];

    rounds.push({ teamA, teamB });
    refs.push(refIndex);

    used.add(refIndex);
    finalFour.forEach(x => used.add(x));

    players[refIndex].refs++;
    players[refIndex].lastRefRound = roundNumber;

    finalFour.forEach(i => {
      players[i].games++;
      players[i].lastRoundPlayed = roundNumber;
    });
  }

  const restCandidates = activeIdx.filter(i => !used.has(i));
  restCandidates.forEach(i => {
    players[i].rests++;
    players[i].lastRestRound = roundNumber;
  });

  return { rounds, refs, benches: restCandidates };
}

/* ======================================================
   評価関数
====================================================== */

function calcGroupScore(players, group, round, w) {
  let score = 0;
  group.forEach(i => {
    const p = players[i];
    score -= (round - p.lastRoundPlayed) * w.fatigueBias;
    score -= p.refs * w.refBias;
    score -= p.rests * w.restBias;
  });
  return score + Math.random() * 0.01;
}

function chooseReferee(group, players, round, refBias) {
  let best = group[0];
  let bestScore = 99999;

  group.forEach(i => {
    const p = players[i];
    const score = p.refs * refBias + Math.random();
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });

  return best;
}
