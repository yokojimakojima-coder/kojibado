/* ======================================================
   共通データ管理
====================================================== */

// ★ 名簿（players.html で管理）
function getAllPlayers() {
  return JSON.parse(localStorage.getItem("allPlayers") || "[]");
}

// ★ 今日の参加者（attendance.html でチェックした人）
function getActivePlayers() {
  return JSON.parse(localStorage.getItem("activePlayers") || "[]");
}

// ★ スケジュール（途中参加 / 途中抜け）
//   { 名前: [ {from:1, to:9999}, ... ] } みたいな形
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
   AI モード（最強公平型のみ）
====================================================== */

function getAiWeights() {
  return {
    refBias: 2.0,       // 審判の偏りを強く嫌う
    restBias: 2.0,      // 休憩の偏りも強く嫌う
    opponentBias: 1.6,  // 対戦相手の偏り
    partnerBias: 1.6,   // ペアの偏り
    fatigueBias: 1.8    // 連続出場（疲れ）の偏り
  };
}

/* ======================================================
   ラウンド生成（1試合分）
====================================================== */

function generateRound(players, roundNumber, courtCount, weights, schedule) {

  // 今のラウンドで参加可能な人だけを抽出
  const activeIdx = getAvailablePlayerIndexes(players, roundNumber, schedule);
  if (activeIdx.length < 4) return null;

  const used = new Set();   // このラウンドで既に使った人
  const rounds = [];
  const refs = [];
  const benches = [];

  for (let c = 0; c < courtCount; c++) {

    let best = null;
    let bestScore = -999999;

    // 4人組み合わせを総当りで評価
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

            // すでにこのラウンドで出場している人がいたら除外
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

    // 審判を4人の中から選ぶ
    const refIndex = chooseReferee(best, players, roundNumber, weights.refBias);

    // 審判以外3人
    const base = best.filter(i => i !== refIndex);

    // もう1人を他から補充（休憩・試合数が少ない人優先）
    const spare = activeIdx.filter(i => !used.has(i) && !base.includes(i));

    let add = null;
    if (spare.length > 0) {
      add = spare.sort((a, b) =>
        (players[a].rests - players[b].rests) ||
        (players[a].games - players[b].games)
      )[0];
    } else {
      // どうしても補充できないときは base の中から
      add = base[Math.floor(Math.random() * base.length)];
    }

    const finalFour = [...base, add];

    const teamA = [finalFour[0], finalFour[1]];
    const teamB = [finalFour[2], finalFour[3]];

    rounds.push({ teamA, teamB });
    refs.push(refIndex);

    // 使用済みに登録
    used.add(refIndex);
    finalFour.forEach(x => used.add(x));

    // ステータス更新
    players[refIndex].refs++;
    players[refIndex].lastRefRound = roundNumber;

    finalFour.forEach(i => {
      players[i].games++;
      players[i].lastRoundPlayed = roundNumber;
    });
  }

  // 休憩メンバー
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
    // できるだけ均等に出場・審判・休憩させたい
    score -= (round - p.lastRoundPlayed) * w.fatigueBias;
    score -= p.refs * w.refBias;
    score -= p.rests * w.restBias;
  });
  return score + Math.random() * 0.01; // 同点対策でほんの少しランダム
}

function chooseReferee(group, players, round, refBias) {
  let best = group[0];
  let bestScore = 99999;

  group.forEach(i => {
    const p = players[i];
    const s = p.refs * refBias + Math.random();
    if (s < bestScore) {
      bestScore = s;
      best = i;
    }
  });

  return best;
}
