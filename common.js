/*  
==========================================
  common.js（コジバド!! 共通ロジック）
  - 名簿管理（players.html 用）
  - 最強公平AIマッチング（index.html 用）
==========================================
*/

/* ===============================
   ★ 名簿管理（players.html 用）
=============================== */

// 名簿読み込み
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

// 名簿保存
function savePlayers() {
  const items = document.querySelectorAll("#playerList .name");
  const newList = [];
  items.forEach(el => newList.push(el.textContent));

  localStorage.setItem("allPlayers", JSON.stringify(newList));
  alert("名簿を保存しました！");
}


/* ===============================
   ★ 最強公平AI マッチ生成
   - index.html から generateRound() が呼ばれる
=============================== */

/**
 * players: {name, idx, games, refs, rests, partners, opponents, joinRound}[]
 * roundNumber: 今何試合目か（1スタート）
 * courtCount: コート数
 * weights: {restBias, refBias, gamesBias, partnerBias, opponentBias}
 *
 * return: { rounds: [{teamA:[i,j], teamB:[k,l]}...],
 *           refs: [refIndex,...],
 *           benches: [playerIndex,...] }
 */
function generateRound(players, roundNumber, courtCount, weights) {
  const n = players.length;
  if (n < 4) return null;

  // 途中参加：今ラウンドに参加できるプレイヤーだけ抽出
  const activeIndices = [];
  for (let i = 0; i < n; i++) {
    const p = players[i];
    const jr = p.joinRound || 1;
    if (jr <= roundNumber) {
      activeIndices.push(i);
    }
  }

  if (activeIndices.length < 4) return null;

  // 全体の統計（試合数 / 休憩数）
  let maxGames = 0;
  let minRests = Infinity;
  activeIndices.forEach(i => {
    const p = players[i];
    if (p.games > maxGames) maxGames = p.games;
    if (p.rests < minRests) minRests = p.rests;
  });

  const rounds = [];
  const refs = [];
  const used = new Set();

  // 各コートごとに4人を決める
  for (let c = 0; c < courtCount; c++) {
    let bestGroup = null;
    let bestScore = -Infinity;

    // activeIndices から4人組み合わせ全探索
    const m = activeIndices.length;
    for (let ai = 0; ai < m; ai++) {
      const i = activeIndices[ai];
      if (used.has(i)) continue;
      for (let aj = ai + 1; aj < m; aj++) {
        const j = activeIndices[aj];
        if (used.has(j)) continue;
        for (let ak = aj + 1; ak < m; ak++) {
          const k = activeIndices[ak];
          if (used.has(k)) continue;
          for (let al = ak + 1; al < m; al++) {
            const l = activeIndices[al];
            if (used.has(l)) continue;

            const group = [i, j, k, l];
            const score = scoreGroup(players, group, maxGames, minRests, weights);

            if (score > bestScore) {
              bestScore = score;
              bestGroup = group;
            }
          }
        }
      }
    }

    if (!bestGroup) break;

    // 選ばれた4人を使用済みに
    bestGroup.forEach(idx => used.add(idx));

    // ★ 審判：refs が最も少ない人
    let refIndex = bestGroup[0];
    let minRef = players[refIndex].refs || 0;
    bestGroup.forEach(idx => {
      const r = players[idx].refs || 0;
      if (r < minRef) {
        minRef = r;
        refIndex = idx;
      }
    });

    // ★ TEAM A / TEAM B の組み合わせを最適化
    const pairing = chooseTeams(bestGroup, players, weights);

    // ステータス更新
    players[refIndex].refs = (players[refIndex].refs || 0) + 1;

    const allInCourt = [...pairing.teamA, ...pairing.teamB];
    allInCourt.forEach(i => {
      players[i].games = (players[i].games || 0) + 1;
    });

    updateRelations(players, pairing.teamA, pairing.teamB);

    rounds.push({ teamA: pairing.teamA, teamB: pairing.teamB });
    refs.push(refIndex);
  }

  // ベンチ（今回ラウンドに参加資格あり＋未使用＋コートに入ってない人）
  const benches = [];
  activeIndices.forEach(i => {
    if (!used.has(i)) {
      benches.push(i);
      players[i].rests = (players[i].rests || 0) + 1;
    }
  });

  if (rounds.length === 0) return null;
  return { rounds, refs, benches };
}

/* グループのスコア計算（休憩・試合数・ペア偏り） */
function scoreGroup(players, group, maxGames, minRests, w) {
  let score = 0;

  // ① 休憩バランス：休憩が多い人を優先して試合へ（休憩差を詰める）
  group.forEach(i => {
    const p = players[i];
    const r = p.rests || 0;
    const restTerm = (r - minRests) * w.restBias;
    score += restTerm;
  });

  // ② 試合数バランス：試合数が少ない人を優先
  group.forEach(i => {
    const p = players[i];
    const g = p.games || 0;
    const gameTerm = (maxGames - g) * w.gamesBias;
    score += gameTerm;
  });

  // ③ ペア偏り・対戦偏り：同じ顔ぶれは減点
  let partnerPenalty = 0;
  let opponentPenalty = 0;

  for (let a = 0; a < group.length; a++) {
    for (let b = a + 1; b < group.length; b++) {
      const i = group[a];
      const j = group[b];

      const pA = players[i];
      const partnerCount = (pA.partners && pA.partners[j]) || 0;
      const oppCount = (pA.opponents && pA.opponents[j]) || 0;

      partnerPenalty += partnerCount;
      opponentPenalty += oppCount;
    }
  }

  score -= partnerPenalty * w.partnerBias;
  score -= opponentPenalty * w.opponentBias;

  // 少しランダム性（同点対策）
  score += Math.random() * 0.01;

  return score;
}

/* TEAM A / TEAM B の最適な分け方を選ぶ */
function chooseTeams(group, players, w) {
  const a = group[0], b = group[1], c = group[2], d = group[3];

  const patterns = [
    { teamA: [a, b], teamB: [c, d] },
    { teamA: [a, c], teamB: [b, d] },
    { teamA: [a, d], teamB: [b, c] }
  ];

  let best = patterns[0];
  let bestScore = Infinity;

  patterns.forEach(pat => {
    const penalty = pairingPenalty(players, pat.teamA, pat.teamB, w);
    if (penalty < bestScore) {
      bestScore = penalty;
      best = pat;
    }
  });

  return best;
}

/* ペア・対戦の偏りペナルティ */
function pairingPenalty(players, teamA, teamB, w) {
  let partnerPenalty = 0;
  let opponentPenalty = 0;

  // パートナー回数
  const pairs = [teamA, teamB];
  pairs.forEach(team => {
    const x = team[0], y = team[1];
    const pX = players[x];
    const countP = (pX.partners && pX.partners[y]) || 0;
    partnerPenalty += countP;
  });

  // 対戦回数
  teamA.forEach(i => {
    teamB.forEach(j => {
      const pI = players[i];
      const countO = (pI.opponents && pI.opponents[j]) || 0;
      opponentPenalty += countO;
    });
  });

  return partnerPenalty * w.partnerBias + opponentPenalty * w.opponentBias;
}

/* パートナー・対戦履歴を更新 */
function updateRelations(players, teamA, teamB) {
  const [a1, a2] = teamA;
  const [b1, b2] = teamB;

  function incPartner(i, j) {
    const p = players[i];
    if (!p.partners) p.partners = {};
    p.partners[j] = (p.partners[j] || 0) + 1;
  }

  function incOpp(i, j) {
    const p = players[i];
    if (!p.opponents) p.opponents = {};
    p.opponents[j] = (p.opponents[j] || 0) + 1;
  }

  // パートナー
  incPartner(a1, a2);
  incPartner(a2, a1);
  incPartner(b1, b2);
  incPartner(b2, b1);

  // 対戦相手
  [a1, a2].forEach(i => {
    [b1, b2].forEach(j => {
      incOpp(i, j);
      incOpp(j, i);
    });
  });
}
