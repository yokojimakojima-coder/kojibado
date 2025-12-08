/*  
==========================================
   common.js（完全安定版）
==========================================
   名簿管理・参加者チェック・試合作成 すべて対応
==========================================
*/


/* ======================================================
   ★ 名簿管理（players.html）
====================================================== */

/* 名簿を読み込む */
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

/* 名簿に追加 */
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

/* 名簿から削除 */
function deletePlayer(index) {
  const players = JSON.parse(localStorage.getItem("allPlayers") || "[]");
  players.splice(index, 1);

  localStorage.setItem("allPlayers", JSON.stringify(players));
  loadPlayers();
}

/* 名簿保存（並び順反映） */
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

/* チェックリストに名簿を読み込む */
function loadPlayersToAttendance() {
  const list = document.getElementById("activeList");
  if (!list) return;

  list.innerHTML = "";

  const players = JSON.parse(localStorage.getItem("allPlayers") || "[]");
  const active = JSON.parse(localStorage.getItem("activePlayers") || "[]");
  const joinData = JSON.parse(localStorage.getItem("joinRoundData") || "{}");

  players.forEach(name => {
    const li = document.createElement("li");
    li.className = "list-item";

    const checked = active.includes(name) ? "checked" : "";
    const joinRound = joinData[name] || 1;

    li.innerHTML = `
      <label>
        <input type="checkbox" class="chk" data-name="${name}" ${checked}>
        <span class="name">${name}</span>
      </label>
      <span class="join-info">参加：${joinRound}試合目〜</span>
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

/* 参加者保存 */
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
  alert("保存しました！試合作成に戻ります。");
  location.href = "index.html";
}



/* ======================================================
   ★ AIモード（重み）
====================================================== */

function getCommonAiWeights(mode) {

  switch (mode) {
    case "A": // 最強公平型
      return {
        refBias: 2.0,
        restBias: 2.0,
        fatigueBias: 1.8,
        partnerBias: 1.6,
        opponentBias: 1.6
      };
    case "B": // ペア重視
      return {
        refBias: 1.0,
        restBias: 1.2,
        fatigueBias: 1.2,
        partnerBias: 2.2,
        opponentBias: 1.0
      };
    case "C": // 体力重視
      return {
        refBias: 1.2,
        restBias: 1.6,
        fatigueBias: 2.4,
        partnerBias: 1.0,
        opponentBias: 1.0
      };
    case "ML": // AIバランス
      return {
        refBias: 1.3,
        restBias: 1.3,
        fatigueBias: 1.3,
        partnerBias: 1.4,
        opponentBias: 1.4
      };
    default: // D：全部バランス
      return {
        refBias: 1.4,
        restBias: 1.4,
        fatigueBias: 1.4,
        partnerBias: 1.4,
        opponentBias: 1.4
      };
  }
}



/* ======================================================
   ★ ラウンド生成（偏り最小アルゴリズム）
====================================================== */

function generateRound(players, roundNumber, courtCount, weights, availablePlayers) {

  const actives = availablePlayers.slice();
  if (actives.length < 4) return null;

  const rounds = [];
  const refs = [];
  const benches = [];
  const used = new Set();

  for (let c = 0; c < courtCount; c++) {

    let bestScore = -999999;
    let bestGroup = null;

    // 4人の組み合わせ全探索
    for (let a = 0; a < actives.length; a++) {
      for (let b = a + 1; b < actives.length; b++) {
        for (let d = b + 1; d < actives.length; d++) {
          for (let e = d + 1; e < actives.length; e++) {

            const group = [actives[a], actives[b], actives[d], actives[e]];

            // 今ラウンドですでに使われた人は除外
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

    // 審判は必ずこの4人の中から
    const refIndex = chooseReferee(bestGroup, players, roundNumber, weights.refBias);

    const base = bestGroup.filter(i => i !== refIndex);
    const spare = actives.filter(i => !used.has(i) && !base.includes(i));

    let addPlayer = null;

    // ベンチ回数・試合数が少ない人が優先的に参加
    if (spare.length > 0) {
      addPlayer = spare.sort((x, y) => {
        return (players[x].rests - players[y].rests) ||
               (players[x].games - players[y].games);
      })[0];
    } else {
      // どうしても居ない場合はランダム
      addPlayer = base[Math.floor(Math.random() * base.length)];
    }

    const finalFour = [...base, addPlayer];

    rounds.push({
      teamA: [finalFour[0], finalFour[1]],
      teamB: [finalFour[2], finalFour[3]]
    });

    refs.push(refIndex);

    // このラウンドで使われた人を登録
    used.add(refIndex);
    finalFour.forEach(i => used.add(i));

    // ステータス更新
    players[refIndex].refs++;
    players[refIndex].lastRefRound = roundNumber;

    finalFour.forEach(i => {
      players[i].games++;
      players[i].lastRoundPlayed = roundNumber;
    });
  }

  // 休憩者
  const restSet = new Set(actives);
  used.forEach(u => restSet.delete(u));
  const restList = [...restSet];

  restList.forEach(i => {
    players[i].rests++;
    players[i].lastRestRound = roundNumber;
  });

  return { rounds, refs, benches: restList };
}



/* ======================================================
   ★ スコア（偏り最小のための評価式）
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
  let bestScore = 999999;

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



/* ======================================================
   ★ ユーティリティ
====================================================== */

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
