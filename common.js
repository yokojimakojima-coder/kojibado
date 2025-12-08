/*  
==========================================
   common.js  
   名簿管理 / 参加者管理 / 試合作成AIロジック
==========================================
*/

// 1日のターゲット試合数
const TOTAL_ROUNDS = 20;

/* =========================
   名簿管理（players.html 用）
   ========================= */

// 名簿を読み込み
function loadPlayers() {
  const list = document.getElementById("playerList");
  if (!list) return;

  list.innerHTML = "";
  const players = JSON.parse(localStorage.getItem("allPlayers") || "[]");

  players.forEach((name, index) => {
    const li = document.createElement("li");
    li.className = "list-item";
    li.innerHTML = `
      <span class="drag">☰</span>
      <span class="name">${name}</span>
      <button class="del-btn" onclick="deletePlayer(${index})">削除</button>
    `;
    list.appendChild(li);
  });
}

// 名簿に追加
function addPlayer() {
  const input = document.getElementById("newPlayer");
  if (!input) return;
  const name = input.value.trim();
  if (!name) return;

  const players = JSON.parse(localStorage.getItem("allPlayers") || "[]");
  players.push(name);
  localStorage.setItem("allPlayers", JSON.stringify(players));

  input.value = "";
  loadPlayers();
}

// 名簿から削除
function deletePlayer(index) {
  const players = JSON.parse(localStorage.getItem("allPlayers") || "[]");
  players.splice(index, 1);
  localStorage.setItem("allPlayers", JSON.stringify(players));
  loadPlayers();
}

// 名簿保存（並び替え反映）
function savePlayers() {
  const items = document.querySelectorAll("#playerList .name");
  const newList = [];
  items.forEach(el => newList.push(el.textContent));

  localStorage.setItem("allPlayers", JSON.stringify(newList));
  alert("名簿を保存しました！");
}

/* =========================
   参加者管理（必要なら呼び出し）
   ========================= */

// listSelector で指定したリストから当日の参加者を保存
function saveActivePlayersFromList(listSelector) {
  const items = document.querySelectorAll(listSelector + " li");
  const active = [];
  items.forEach(li => {
    const chk = li.querySelector("input[type='checkbox']");
    const nameEl = li.querySelector(".name");
    if (chk && chk.checked && nameEl) {
      active.push(nameEl.textContent);
    }
  });

  if (active.length < 4) {
    alert("参加者は最低4人必要です！");
    return false;
  }

  localStorage.setItem("activePlayers", JSON.stringify(active));
  return true;
}

/* =========================
   共通ユーティリティ
   ========================= */

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* =========================
   AIモードの重み設定
   ========================= */

function getCommonAiWeights(mode, players) {
  const base = {
    partnerRepeat: 8,   // 同じペア
    opponentRepeat: 4,  // 同じ相手
    backToBackPlay: 2,  // 連続試合
    backToBackRest: 2,  // 連続休憩
    refBias: 2,         // 審判偏り
    gameBias: 3         // 試合数偏り
  };

  switch (mode) {
    case "A": // 最強公平型
      return {
        ...base,
        partnerRepeat: 10,
        opponentRepeat: 6,
        backToBackPlay: 3,
        backToBackRest: 3,
        refBias: 3,
        gameBias: 4
      };
    case "B": // ペア重視
      return {
        ...base,
        partnerRepeat: 12,
        opponentRepeat: 4,
        gameBias: 2
      };
    case "C": // 体力重視
      return {
        ...base,
        backToBackPlay: 5,
        backToBackRest: 4,
        gameBias: 3
      };
    case "ML": // それっぽいモード
      return {
        ...base,
        partnerRepeat: 9,
        opponentRepeat: 5,
        backToBackPlay: 3,
        backToBackRest: 3,
        refBias: 3,
        gameBias: 3
      };
    case "D": // 全部バランス（おすすめ）
    default:
      return base;
  }
}

/* =========================
   試合作成ロジック本体
   ========================= */

/**
 * players: index.html 側で作られたプレイヤー配列（オブジェクト）
 * roundNumber: 今何試合目か（1,2,3,...）
 * courtCount: コート数（1〜4）
 * weights: getCommonAiWeights() の戻り値
 *
 * return:
 *   { rounds: [{teamA:[idx,idx], teamB:[idx,idx]}, ...],
 *     refs: [playerIndex,...],
 *     benches: [playerIndex,...] }
 *   作れないときは null
 */
function generateRound(players, roundNumber, courtCount, weights) {
  const n = players.length;
  if (n < 4) return null;

  let usableCourts = Math.min(courtCount, Math.floor(n / 4));
  if (usableCourts <= 0) return null;

  const needPlayers = usableCourts * 4;
  const allIdx = players.map((_, i) => i);

  let bestPlan = null;
  let bestScore = Infinity;

  // 公平性アップのため試行回数を増やす
  const TRY_COUNT = 800;

  for (let t = 0; t < TRY_COUNT; t++) {
    const shuffled = shuffleArray(allIdx);

    const playing = shuffled.slice(0, needPlayers);
    const benches = shuffled.slice(needPlayers);

    const rounds = [];
    let valid = true;
    for (let c = 0; c < usableCourts; c++) {
      const base = c * 4;
      const p0 = playing[base];
      const p1 = playing[base + 1];
      const p2 = playing[base + 2];
      const p3 = playing[base + 3];

      if ([p0, p1, p2, p3].includes(undefined)) {
        valid = false;
        break;
      }

      rounds.push({
        teamA: [p0, p1],
        teamB: [p2, p3]
      });
    }
    if (!valid) continue;

    const refs = [];
    const benchesCopy = benches.slice();

    for (let c = 0; c < usableCourts; c++) {
      let refIdx = null;

      if (benchesCopy.length > 0) {
        refIdx = benchesCopy.shift();
      } else {
        refIdx = playing[(c * 4) % playing.length];
      }

      refs.push(refIdx);
    }

    const score = scoreCandidate(players, rounds, refs, benches, roundNumber, weights, courtCount);

    if (score < bestScore) {
      bestScore = score;
      bestPlan = { rounds, refs, benches };
    }
  }

  if (!bestPlan) return null;

  applyRoundResult(players, bestPlan.rounds, bestPlan.refs, bestPlan.benches, roundNumber);

  return bestPlan;
}

/**
 * 候補ラウンドのスコアを計算（低いほど良い）
 * 「20試合トータルでの理想値」を意識して偏りを評価
 */
function scoreCandidate(players, rounds, refs, benches, roundNumber, w, courtCount) {
  let score = 0;
  const n = players.length;

  const playingSet = new Set();
  rounds.forEach(r => {
    r.teamA.forEach(i => playingSet.add(i));
    r.teamB.forEach(i => playingSet.add(i));
  });
  const refSet = new Set(refs);
  const benchSet = new Set(benches);

  // 20試合を想定した理想値（1人あたり）
  const playRatioPerRound = Math.min(1, (4 * courtCount) / n);
  const refRatioPerRound  = Math.min(1, courtCount / n);
  const restRatioPerRound = Math.max(0, 1 - playRatioPerRound - refRatioPerRound);

  const targetGamesTotal = playRatioPerRound * TOTAL_ROUNDS;
  const targetRefsTotal  = refRatioPerRound  * TOTAL_ROUNDS;
  const targetRestsTotal = restRatioPerRound * TOTAL_ROUNDS;

  // 各プレイヤーごとの偏り＋連続ペナルティ
  players.forEach((p, idx) => {
    const isPlaying = playingSet.has(idx);
    const isRef = refSet.has(idx);
    const isBench = benchSet.has(idx);

    const futureGames = p.games + (isPlaying ? 1 : 0);
    const futureRefs  = p.refs  + (isRef ? 1 : 0);
    const futureRests = p.rests + (isBench ? 1 : 0);

    // 連続試合・連続休憩ペナルティ（少し強め）
    if (isPlaying && p.lastRoundPlayed === roundNumber - 1) {
      score += w.backToBackPlay * 2;
    }
    if (isBench && p.lastRestRound === roundNumber - 1) {
      score += w.backToBackRest * 2;
    }

    // 試合・審判・休憩回数の「理想値からのズレ」
    const gameDiff = Math.abs(futureGames - targetGamesTotal);
    const refDiff  = Math.abs(futureRefs  - targetRefsTotal);
    const restDiff = Math.abs(futureRests - targetRestsTotal);

    score += gameDiff * w.gameBias * 1.5;
    score += refDiff  * w.refBias  * 2.0;
    score += restDiff * w.backToBackRest * 1.8;
  });

  // パートナー・対戦相手のペナルティ
  rounds.forEach(r => {
    const [a1, a2] = r.teamA;
    const [b1, b2] = r.teamB;

    // パートナー重複
    if (players[a1].partners && players[a1].partners.has(a2)) score += w.partnerRepeat;
    if (players[a2].partners && players[a2].partners.has(a1)) score += w.partnerRepeat;
    if (players[b1].partners && players[b1].partners.has(b2)) score += w.partnerRepeat;
    if (players[b2].partners && players[b2].partners.has(b1)) score += w.partnerRepeat;

    // 対戦相手重複
    [a1, a2].forEach(ai => {
      [b1, b2].forEach(bj => {
        if (players[ai].opponents && players[ai].opponents.has(bj)) {
          score += w.opponentRepeat;
        }
      });
    });
  });

  return score;
}

/**
 * 採用されたラウンド結果を players に反映
 */
function applyRoundResult(players, rounds, refs, benches, roundNumber) {
  const playingSet = new Set();

  rounds.forEach(r => {
    const [a1, a2] = r.teamA;
    const [b1, b2] = r.teamB;

    [a1, a2, b1, b2].forEach(idx => {
      const p = players[idx];
      p.games += 1;
      p.lastRoundPlayed = roundNumber;
      playingSet.add(idx);
    });

    // パートナー登録
    players[a1].partners.add(a2);
    players[a2].partners.add(a1);
    players[b1].partners.add(b2);
    players[b2].partners.add(b1);

    // 対戦相手登録
    [a1, a2].forEach(ai => {
      players[ai].opponents.add(b1);
      players[ai].opponents.add(b2);
    });
    [b1, b2].forEach(bi => {
      players[bi].opponents.add(a1);
      players[bi].opponents.add(a2);
    });
  });

  // 審判
  refs.forEach(idx => {
    if (idx == null) return;
    const p = players[idx];
    p.refs += 1;
    p.lastRefRound = roundNumber;
  });

  // 休憩
  benches.forEach(idx => {
    const p = players[idx];
    p.rests += 1;
    p.lastRestRound = roundNumber;
  });

  // （参考用）現時点の平均値との差を記録しておくこともできる
  const avgGames = players.reduce((s,p)=>s+p.games,0) / players.length;
  const avgRefs  = players.reduce((s,p)=>s+p.refs ,0) / players.length;
  const avgRests = players.reduce((s,p)=>s+p.rests,0) / players.length;

  players.forEach(p => {
    p.gamesBias = p.games - avgGames;
    p.refsBias  = p.refs  - avgRefs;
    p.restsBias = p.rests - avgRests;
  });
}
