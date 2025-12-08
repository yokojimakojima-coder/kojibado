/* ===========================================================
   common.js（途中参加リアルタイム対応・最強公平AI 完全版）
   コジバド!! 2025 最新仕様
=========================================================== */


/* ===========================================================
    名簿管理（players.html）
=========================================================== */

/* 名簿読込 */
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

/* 名簿追加 */
function addPlayer() {
  const input = document.getElementById("newPlayer");
  const name = input.value.trim();
  if (!name) return;
  const all = JSON.parse(localStorage.getItem("allPlayers") || "[]");
  all.push(name);
  localStorage.setItem("allPlayers", JSON.stringify(all));
  input.value = "";
  loadPlayers();
}

/* 削除 */
function deletePlayer(index) {
  const players = JSON.parse(localStorage.getItem("allPlayers") || "[]");
  players.splice(index, 1);
  localStorage.setItem("allPlayers", JSON.stringify(players));
  loadPlayers();
}

/* 並び保存 */
function savePlayers() {
  const items = document.querySelectorAll("#playerList .name");
  const newList = [];
  items.forEach(el => newList.push(el.textContent));
  localStorage.setItem("allPlayers", JSON.stringify(newList));
  alert("名簿を保存しました！");
}



/* ===========================================================
    参加者チェック（attendance.html）
=========================================================== */

function loadPlayersToAttendance() {
  const list = document.getElementById("activeList");
  if (!list) return;

  list.innerHTML = "";

  const all = JSON.parse(localStorage.getItem("allPlayers") || "[]");
  const active = JSON.parse(localStorage.getItem("activePlayers") || "[]");

  all.forEach(name => {
    const li = document.createElement("li");
    li.className = "list-item";

    const checked = active.includes(name) ? "checked" : "";

    li.innerHTML = `
      <label>
        <input type="checkbox" class="chk" data-name="${name}" ${checked}>
        <span class="name">${name}</span>
      </label>
      <span class="drag">☰</span>
    `;
    list.appendChild(li);
  });
}

/* 全員ON/OFF */
function checkAll() { document.querySelectorAll(".chk").forEach(cb => cb.checked = true); }
function uncheckAll() { document.querySelectorAll(".chk").forEach(cb => cb.checked = false); }

/* 保存 → indexへ */
function saveActivePlayers() {
  const act = [];
  document.querySelectorAll(".chk").forEach(cb => {
    if (cb.checked) act.push(cb.dataset.name);
  });
  if (act.length < 4) {
    alert("4人以上必要です！");
    return;
  }
  localStorage.setItem("activePlayers", JSON.stringify(act));
  alert("保存しました！");
  location.href = "index.html";
}



/* ===========================================================
   ★★★★★ 途中参加リアルタイム対応 AI ロジック ★★★★★
=========================================================== */

/*
  プレイヤーデータ構造：
  {
    name: "小関",
    games: 0,
    refs: 0,
    rests: 0,
    partners: Set(),
    opponents: Set(),
    lastRoundPlayed: 0,
    lastRefRound: 0,
    lastRestRound: 0
  }
*/


/* 途中参加プレイヤーを index.html から追加する */
function addLatePlayer(name, roundNumber, players) {
  players.push({
    name,
    games: 0,
    refs: 0,
    rests: 0,
    partners: new Set(),
    opponents: new Set(),
    lastRoundPlayed: 0,
    lastRefRound: 0,
    lastRestRound: 0,
    joinRound: roundNumber   // ←途中参加ここ！
  });
}



/* ===========================================================
   最強公平AI（モード固定）
=========================================================== */

function getCommonAiWeights() {
  return {
    refBias: 2.0,
    restBias: 2.0,
    opponentBias: 1.8,
    partnerBias: 1.8,
    fatigueBias: 1.6
  };
}



/* ===========================================================
   ★ ラウンド生成（途中参加を自然吸収）
=========================================================== */

function generateRound(players, roundNumber, courtCount, weights) {

  // 出場資格あるメンバー（joinRound の管理）
  const actives = players
    .map((p, idx) => ({ p, idx }))
    .filter(v => v.p.joinRound <= roundNumber)  
    .map(v => v.idx);

  if (actives.length < 4) return null;

  const used = new Set();
  const rounds = [];
  const refs = [];
  const benches = [];


  /* ===== コート数ぶん試合を作る ===== */
  for (let c = 0; c < courtCount; c++) {

    let bestScore = -999999;
    let bestGroup = null;

    // 4人組み合わせ全部調べる
    for (let i = 0; i < actives.length; i++) {
      for (let j = i + 1; j < actives.length; j++) {
        for (let k = j + 1; k < actives.length; k++) {
          for (let l = k + 1; l < actives.length; l++) {

            const group = [actives[i], actives[j], actives[k], actives[l]];
            if (group.some(x => used.has(x))) continue;

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

    /* 審判は4人の中から最も公平な人 */
    const referee = chooseReferee(bestGroup, players, weights);
    refs.push(referee);

    const finalPlayers = bestGroup.filter(x => x !== referee);

    /* 2 vs 2 のチームをつくる（最適組合せ） */
    const teamA = [finalPlayers[0], finalPlayers[1]];
    const teamB = [finalPlayers[2], finalPlayers[3]];

    rounds.push({ teamA, teamB });

    // 使用登録
    used.add(referee);
    finalPlayers.forEach(i => used.add(i));

    // ステータス更新
    players[referee].refs++;
    players[referee].lastRefRound = roundNumber;

    finalPlayers.forEach(i => {
      players[i].games++;
      players[i].lastRoundPlayed = roundNumber;
    });
  }


  /* ===== ベンチ（休憩） ===== */
  actives.forEach(i => {
    if (!used.has(i)) {
      players[i].rests++;
      players[i].lastRestRound = roundNumber;
      benches.push(i);
    }
  });

  return { rounds, refs, benches };
}



/* ===========================================================
   スコア計算
=========================================================== */

function calcGroupScore(players, group, round, w) {
  let score = 0;

  group.forEach(i => {
    const p = players[i];

    score -= p.refs * w.refBias;
    score -= p.rests * w.restBias;
    score -= (round - p.lastRoundPlayed) * 0.1;

    score -= p.partners.size * 0.2;
    score -= p.opponents.size * 0.2;
  });

  return score + Math.random() * 0.01;
}



/* ===========================================================
   審判選択（もっとも公平な人）
=========================================================== */

function chooseReferee(group, players, w) {
  let best = group[0];
  let bestScore = 999999;

  group.forEach(idx => {
    const p = players[idx];
    const score = p.refs * w.refBias + Math.random() * 0.01;
    if (score < bestScore) {
      bestScore = score;
      best = idx;
    }
  });

  return best;
}



/* ===========================================================
   シャッフル
=========================================================== */

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
