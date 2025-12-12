/* ======================================================
   共通：ローカルストレージ取得
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
   そのラウンドで参加可能か？
====================================================== */

function isAvailableAtRound(name, roundNumber, schedule) {
  const segs = schedule[name] || [];
  return segs.some(seg => seg.from <= roundNumber && roundNumber <= seg.to);
}

function getAvailablePlayerIndexes(players, roundNumber, schedule) {
  const result = [];
  players.forEach((p, i) => {
    if (isAvailableAtRound(p.name, roundNumber, schedule)) {
      result.push(i);
    }
  });
  return result;
}

/* ======================================================
   最強公平 AI パラメータ（固定）
====================================================== */

function getAiWeights() {
  return {
    partnerBias: 15,
    opponentBias: 12,
    fatigueBias: 1.2,
    refBias: 2.0,
    restBias: 2.0
  };
}

/* ======================================================
   ラウンド生成（完全安定版）
====================================================== */

function generateRound(players, roundNumber, courtCount, weights, schedule) {

  const activeIdx = getAvailablePlayerIndexes(players, roundNumber, schedule);
  if (activeIdx.length < 4) return null;

  const rounds = [];
  const refs = [];
  const benches = [];
  const used = new Set();

  for (let court = 0; court < courtCount; court++) {

    let bestGroup = null;
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

            if (group.some(i => used.has(i))) continue;

            const score = calcGroupScore(players, group, roundNumber, weights);
            if (score > bestScore) {
              bestScore = score;
              bestGroup = group;
            }
          }
        }
      }
    }

    if (!bestGroup) break;

    const refIndex = chooseReferee(bestGroup, players, weights.refBias);

    const playMembers = bestGroup.filter(i => i !== refIndex);
    const teamA = [playMembers[0], playMembers[1]];
    const teamB = [playMembers[2], playMembers[3]];

    rounds.push({ teamA, teamB });
    refs.push(refIndex);

    used.add(refIndex);
    playMembers.forEach(i => used.add(i));

    // カウント更新
    players[refIndex].refs++;

    playMembers.forEach(i => {
      players[i].games++;
      players[i].lastRoundPlayed = roundNumber;
    });

    updateHistory(players, teamA, teamB);
  }

  // 休憩
  activeIdx.forEach(i => {
    if (!used.has(i)) {
      players[i].rests++;
      benches.push(i);
    }
  });

  return { rounds, refs, benches };
}

/* ======================================================
   ペア・対戦履歴更新（Set 使用）
====================================================== */

function updateHistory(players, teamA, teamB) {
  // ペア
  players[teamA[0]].partners.add(teamA[1]);
  players[teamA[1]].partners.add(teamA[0]);
  players[teamB[0]].partners.add(teamB[1]);
  players[teamB[1]].partners.add(teamB[0]);

  // 対戦
  teamA.forEach(a => {
    teamB.forEach(b => {
      players[a].opponents.add(b);
      players[b].opponents.add(a);
    });
  });
}

/* ======================================================
   評価関数（偏り最小化）
====================================================== */

function calcGroupScore(players, group, round, w) {
  let score = 0;

  const [a, b, c, d] = group;

  // ペア被り
  if (players[a].partners.has(b)) score -= w.partnerBias;
  if (players[c].partners.has(d)) score -= w.partnerBias;

  // 対戦被り
  [a, b].forEach(x => {
    [c, d].forEach(y => {
      if (players[x].opponents.has(y)) score -= w.opponentBias;
    });
  });

  // 出場間隔
  group.forEach(i => {
    score -= (round - players[i].lastRoundPlayed) * w.fatigueBias;
  });

  return score + Math.random() * 0.01;
}

/* ======================================================
   審判選出（回数最小）
====================================================== */

function chooseReferee(group, players, refBias) {
  let best = group[0];
  let bestScore = Infinity;

  group.forEach(i => {
    const score = players[i].refs * refBias;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });

  return best;
}
