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
   AI 重み（均等化重視）
====================================================== */

function getAiWeights() {
  return {
    // 被り回避
    partnerBias: 18,
    opponentBias: 14,

    // 均等化（超重要）
    gameBias: 6.0,     // 試合回数の均等
    restPickBias: 7.0, // 休みが多い人を優先して試合へ
    refPickBias: 0.0,  // 試合メンバー選定に審判回数は混ぜない（審判は別ロジックで完全均等化）

    // ランダム同点割り
    tinyRandom: 0.02,
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
    if (!players[x].partners) players[x].partners = new Set();
    if (!players[y].partners) players[y].partners = new Set();
    players[x].partners.add(y);
    players[y].partners.add(x);
  });

  opponents.forEach(([x, y]) => {
    if (!players[x].opponents) players[x].opponents = new Set();
    if (!players[y].opponents) players[y].opponents = new Set();
    players[x].opponents.add(y);
    players[y].opponents.add(x);
  });
}

/* ======================================================
   評価関数（試合メンバー選定のスコア）
   - ペア/対戦被りを強く避ける
   - games / rests を超均等化
====================================================== */

function calcGroupScore(players, group, round, w, mins) {
  let score = 0;
  const [a, b, c, d] = group;

  // Set 再保証（念のため）
  [a, b, c, d].forEach(i => {
    if (!(players[i].partners instanceof Set)) players[i].partners = new Set();
    if (!(players[i].opponents instanceof Set)) players[i].opponents = new Set();
  });

  // ペア被り
  if (players[a].partners.has(b)) score -= w.partnerBias;
  if (players[c].partners.has(d)) score -= w.partnerBias;

  // 対戦被り
  if (players[a].opponents.has(c)) score -= w.opponentBias;
  if (players[a].opponents.has(d)) score -= w.opponentBias;
  if (players[b].opponents.has(c)) score -= w.opponentBias;
  if (players[b].opponents.has(d)) score -= w.opponentBias;

  // ✅ 試合回数の均等化（少ない人を優先）
  group.forEach(i => {
    score -= (players[i].games - mins.minGames) * w.gameBias;
  });

  // ✅ 休憩回数の均等化（休み多い人を優先して試合へ）
  group.forEach(i => {
    score += (players[i].rests - mins.minRests) * w.restPickBias;
  });

  // ちょいランダム（同点割れ）
  score += Math.random() * w.tinyRandom;

  return score;
}

/* ======================================================
   審判選択（完全均等化）
   - 試合に出ない人から選ぶ
   - refs が最小の人
   - 同点なら lastRefRound が古い人（最近やってない人）
====================================================== */

function chooseRefereeFair(candidates, players, roundNumber) {
  if (!candidates || candidates.length === 0) return null;

  let best = candidates[0];
  let bestKey = null;

  candidates.forEach(i => {
    const p = players[i];
    const key = [
      p.refs,                  // 少ないほど優先
      -(roundNumber - (p.lastRefRound || 0)), // 最近やってないほど優先（差が大きいほど良い）→負号で「小さいほど良い」にする
      p.games,                 // 念のため：試合多すぎる人は審判でバランス
      i
    ];

    if (!bestKey) {
      bestKey = key;
      best = i;
      return;
    }

    // lexicographic compare（小さい方が勝ち）
    for (let k = 0; k < key.length; k++) {
      if (key[k] < bestKey[k]) {
        bestKey = key;
        best = i;
        break;
      }
      if (key[k] > bestKey[k]) break;
    }
  });

  return best;
}

/* ======================================================
   ラウンド生成（確定版・審判かぶり絶対なし）
   - 各コート：試合4人を選ぶ
   - 審判は「その4人以外」から選ぶ（完全均等化）
   - used で同ラウンドの重複出場を禁止
====================================================== */

function generateRound(players, roundNumber, courtCount, weights, schedule) {
  const activeIdx = getAvailablePlayerIndexes(players, roundNumber, schedule);
  if (activeIdx.length < 4) return null;

  // min値（均等化用）
  const mins = {
    minGames: Math.min(...players.map(p => p.games)),
    minRests: Math.min(...players.map(p => p.rests)),
  };

  const rounds = [];
  const refs = [];
  const benches = [];
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

            const score = calcGroupScore(players, group, roundNumber, weights, mins);
            if (score > bestScore) {
              bestScore = score;
              best = group;
            }
          }
        }
      }
    }

    if (!best) break;

    // ✅ 試合に出る4人（固定）
    const play = best;

    // ✅ 審判候補：試合に出ない＆まだこのラウンドで使ってない人
    const refereeCandidates = activeIdx.filter(i => !used.has(i) && !play.includes(i));

    // 審判が取れないなら「審判なしで進める」選択もあるけど、今回は厳格に「審判必須」でいく
    const refIndex = chooseRefereeFair(refereeCandidates, players, roundNumber);
    if (refIndex === null) break;

    // チーム割（固定：先頭2人 vs 後ろ2人）
    const teamA = [play[0], play[1]];
    const teamB = [play[2], play[3]];

    rounds.push({ teamA, teamB });
    refs.push(refIndex);

    // 使用済み登録（試合4人＋審判）
    play.forEach(i => used.add(i));
    used.add(refIndex);

    // カウント更新：審判
    players[refIndex].refs++;
    players[refIndex].lastRefRound = roundNumber;

    // カウント更新：試合
    play.forEach(i => {
      players[i].games++;
      players[i].lastRoundPlayed = roundNumber;
    });

    // 履歴更新
    updateHistory(players, teamA, teamB);
  }

  // 休憩：そのラウンドで使われなかった人
  activeIdx.filter(i => !used.has(i)).forEach(i => {
    players[i].rests++;
    players[i].lastRestRound = roundNumber;
    benches.push(i);
  });

  return { rounds, refs, benches };
}
