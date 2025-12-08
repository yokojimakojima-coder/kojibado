/*  
==========================================
   common.js（完全安定版）
   名簿管理 / 参加者チェック / 試合作成 共通関数
==========================================
*/


/* ======================================================
   ★ 名簿管理（players.html）
====================================================== */

/* 名簿を読み込む */
function loadPlayers() {
  const list = document.getElementById("playerList");
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

/* 名簿に追加 */
function addPlayer() {
  const input = document.getElementById("newPlayer");
  const name = input.value.trim();
  if (!name) return;

  const players = JSON.parse(localStorage.getItem("allPlayers") || "[]");
  players.push(name);

  localStorage.setItem("allPlayers", JSON.stringify(players));
  input.value = "";

  loadPlayers();
}

/* 名簿から削除 */
function deletePlayer(index) {
  const players = JSON.parse(localStorage.getItem("allPlayers") || "[]");
  players.splice(index, 1);

  localStorage.setItem("allPlayers", JSON.stringify(players));
  loadPlayers();
}

/* 名簿保存（並び替え反映） */
function savePlayers() {
  const items = document.querySelectorAll("#playerList .name");
  const newList = [];

  items.forEach(el => newList.push(el.textContent));

  localStorage.setItem("allPlayers", JSON.stringify(newList));
  alert("名簿を保存しました！");
}



/* ======================================================
   ★ 参加者チェック（attendance.html）
====================================================== */

/* 名簿を参加者チェック画面に読み込む */
function loadPlayersToAttendance() {
  const list = document.getElementById("activeList");
  if (!list) return;

  list.innerHTML = "";

  const players = JSON.parse(localStorage.getItem("allPlayers") || "[]");
  const active = JSON.parse(localStorage.getItem("activePlayers") || "[]");

  players.forEach(name => {
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

/* 全員 ON */
function checkAll() {
  document.querySelectorAll(".chk").forEach(cb => cb.checked = true);
}

/* 全員 OFF */
function uncheckAll() {
  document.querySelectorAll(".chk").forEach(cb => cb.checked = false);
}

/* 参加者保存（試合作成へ） */
function saveActivePlayers() {
  const items = document.querySelectorAll(".chk");

  const active = [];
  items.forEach(cb => {
    if (cb.checked) active.push(cb.dataset.name);
  });

  if (active.length < 4) {
    alert("参加者は最低4人必要です！");
    return;
  }

  localStorage.setItem("activePlayers", JSON.stringify(active));

  alert("参加者を保存しました！試合作成へ移動します。");
  location.href = "index.html";
}



/* ======================================================
   ★ AI 生成ロジック（index.html 用に呼ばれる）
====================================================== */

/* AI の重み：index.html → getAiWeights() で呼ばれる */
function getCommonAiWeights(mode, players) {

  switch (mode) {
    case "A":
      return {
        refBias: 2.0,
        restBias: 2.0,
        opponentBias: 1.6,
        partnerBias: 1.6,
        fatigueBias: 1.8
      };

    case "B":
      return {
        refBias: 1.0,
        restBias: 1.2,
        opponentBias: 1.0,
        partnerBias: 2.2,
        fatigueBias: 1.2
      };

    case "C":
      return {
        refBias: 1.2,
        restBias: 1.6,
        opponentBias: 1.0,
        partnerBias: 1.0,
        fatigueBias: 2.4
      };

    case "ML":
      return {
        refBias: 1.3,
        restBias: 1.3,
        opponentBias: 1.4,
        partnerBias: 1.4,
        fatigueBias: 1.3
      };

    default:
      return {
        refBias: 1.4,
        restBias: 1.4,
        opponentBias: 1.4,
        partnerBias: 1.4,
        fatigueBias: 1.4
      };
  }
}


/* ======================================================
   ★ ラウンド生成（index.html から呼び出される）
====================================================== */

/* 4人単位で試合を作る AI ロジック */
function generateRound(players, roundNumber, courtCount, weights) {

  const n = players.length;
  if (n < 4) return null;

  const indices = [...Array(n).keys()];
  shuffle(indices);

  const rounds = [];
  const refs = [];
  const benches = [];

  let used = new Set();

  for (let c = 0; c < courtCount; c++) {

    let bestScore = -99999;
    let best = null;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        for (let k = j + 1; k < n; k++) {
          for (let l = k + 1; l < n; l++) {

            const group = [i, j, k, l];
            if (group.some(x => used.has(x))) continue;

            const score =
              calcGroupScore(players, group, roundNumber, weights);

            if (score > bestScore) {
              bestScore = score;
              best = group;
            }
          }
        }
      }
    }

    if (!best) break;

    used.add(best[0]);
    used.add(best[1]);
    used.add(best[2]);
    used.add(best[3]);

    const refIndex = chooseReferee(best, players, roundNumber, weights.refBias);
    refs.push(refIndex);

    const teamA = best.filter(i => i !== refIndex).slice(0, 2);
    const teamB = best.filter(i => i !== refIndex).slice(2, 4);

    rounds.push({ teamA, teamB });
  }

  for (let i = 0; i < n; i++) {
    if (!Array.from(used).includes(i)) benches.push(i);
  }

  return { rounds, refs, benches };
}



/* ======================================================
   ★ スコア計算など内部処理
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

  players[best].refs++;
  players[best].lastRefRound = round;

  return best;
}

/* Fisher–Yates shuffle */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
