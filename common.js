/* ======================================================
   プレイヤーデータ取得
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
   そのラウンドに参加できるか？
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
   最強公平モードのパラメータ
====================================================== */

function getAiWeights() {
  return {
    partnerBias: 15,    // 🔥 ペアの重複を強く避ける
    opponentBias: 12,   // 🔥 対戦の重複も強く避ける
    fatigueBias: 1.2,   // 最近出てない人を優先
    refBias: 2.0,       // 審判偏り防止
    restBias: 2.0       // 休憩偏り防止
  };
}

/* ======================================================
   ラウンド生成（最強公平）
====================================================== */

function generateRound(players, roundNumber, courtCount, weights, schedule) {

  const activeIdx = getAvailablePlayerIndexes(players, roundNumber, schedule);
  if (activeIdx.length < 4) return null;

  const rounds = [];
  const refs = [];
  const benches = [];
  const used = new Set();

  for (let court = 0; court < courtCount; court++) {

    let best = null;
    let bestScore = -999999;

    // 4人を選ぶためにループ
    for (let a = 0; a < activeIdx.length; a++) {
      for (let b = a + 1; b < activeIdx.length; b++) {
        for (let c = b + 1; c < activeIdx.length; c++) {
          for (let d = c + 1; d < activeIdx.length; d++) {

            const group = [activeIdx[a], activeIdx[b], activeIdx[c], activeIdx[d]];

            // 重複チェック
            if (group.some(x => used.has(x))) continue;

            // スコアを計算して
            const score = calcGroupScore(players, group, roundNumber, weights);

            // 最良のグループを見つける
            if (score > bestScore) {
              bestScore = score;
              best = group;
            }
          }
        }
      }
    }

    // 最良のグループがなければ抜ける
    if (!best) break;

    // 審判選択
    const refIndex = chooseReferee(best, players, roundNumber, weights.refBias);

    const playMembers = best.filter(i => i !== refIndex);
    const finalFour = [...playMembers];

    const teamA = [finalFour[0], finalFour[1]];
    const teamB = [finalFour[2], finalFour[3]];

    rounds.push({ teamA, teamB });
    refs.push(refIndex);

    used.add(refIndex);
    finalFour.forEach(i => used.add(i));

    // 試合の情報更新
    players[refIndex].refs++;
    players[refIndex].lastRefRound = roundNumber;

    finalFour.forEach(i => {
      players[i].games++;
      players[i].lastRoundPlayed = roundNumber;
    });

    // 履歴更新
    updateHistory(players, teamA, teamB);
  }

  // 休憩プレイヤーの設定
  const restPlayers = activeIdx.filter(i => !used.has(i));
  restPlayers.forEach(i => {
    players[i].rests++;
    players[i].lastRestRound = roundNumber;
  });

  return { rounds, refs, benches: restPlayers };
}

/* ======================================================
   ペア/対戦 履歴更新（Set には idx を入れる）
====================================================== */

function updateHistory(players, teamA, teamB) {
  const pairs = [
    [teamA[0], teamA[1]],
    [teamB[0], teamB[1]]
  ];
  const opponents = [
    [teamA[0], teamB[0]], [teamA[0], teamB[1]],
    [teamA[1], teamB[0]], [teamA[1], teamB[1]]
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
   評価関数（最強公平）
====================================================== */

function calcGroupScore(players, group, round, w) {
  let score = 0;

  const a = group[0], b = group[1], c = group[2], d = group[3];

  // ペア被り
  if (players[a].partners.has(b)) score -= w.partnerBias;
  if (players[c].partners.has(d)) score -= w.partnerBias;

  // 対戦被り
  if (players[a].opponents.has(c)) score -= w.opponentBias;
  if (players[a].opponents.has(d)) score -= w.opponentBias;
  if (players[b].opponents.has(c)) score -= w.opponentBias;
  if (players[b].opponents.has(d)) score -= w.opponentBias;

  // 出場間隔
  group.forEach(i => {
    score -= (round - players[i].lastRoundPlayed) * w.fatigueBias;
  });

  return score + Math.random() * 0.01;
}

/* ======================================================
   審判選択
====================================================== */
function chooseReferee(group, players, round, refBias) {
  let best = group[0];
  let bestScore = 999999;

  group.forEach(i => {
    const p = players[i];
    const score = p.refs * refBias;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });

  return best;
}
