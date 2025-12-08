/*  
==========================================
  common.js（最新・全部入り版）
  名簿管理 / 参加者チェック / 試合作成 共通ロジック
==========================================
*/


/* ======================================================
   ★ 名簿管理（players.html 用）
====================================================== */

/** 名簿を読み込んで表示 */
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

/** 名簿に追加 */
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

/** 名簿から削除 */
function deletePlayer(index) {
  const players = JSON.parse(localStorage.getItem("allPlayers") || "[]");
  players.splice(index, 1);
  localStorage.setItem("allPlayers", JSON.stringify(players));
  loadPlayers();
}

/** 並び替え結果を保存 */
function savePlayers() {
  const items = document.querySelectorAll("#playerList .name");
  const newList = [];
  items.forEach(el => newList.push(el.textContent));

  localStorage.setItem("allPlayers", JSON.stringify(newList));
  alert("名簿を保存しました！");
}



/* ======================================================
   ★ 参加者チェック（attendance.html 用）
====================================================== */

/** 名簿→参加者チェック画面に読み込み */
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

/** 全員 ON */
function checkAll() {
  document.querySelectorAll(".chk").forEach(cb => cb.checked = true);
}

/** 全員 OFF */
function uncheckAll() {
  document.querySelectorAll(".chk").forEach(cb => cb.checked = false);
}

/** 当日の参加者を保存 → index.html へ遷移 */
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
   ★ AI 重み（index.html から getCommonAiWeights で呼ぶ）
====================================================== */

function getCommonAiWeights(mode, players) {
  switch (mode) {
    case "A": // 最強公平型
      return {
        refBias: 2.0,
        restBias: 2.0,
        opponentBias: 1.6,
        partnerBias: 1.6,
        fatigueBias: 1.8,
      };

    case "B": // ペア重視型
      return {
        refBias: 1.0,
        restBias: 1.2,
        opponentBias: 1.0,
        partnerBias: 2.2,
        fatigueBias: 1.2,
      };

    case "C": // 体力重視型
      return {
        refBias: 1.2,
        restBias: 1.6,
        opponentBias: 1.0,
        partnerBias: 1.0,
        fatigueBias: 2.4,
      };

    case "ML": // 機械学習ぽいおまかせ（中庸寄り）
      return {
        refBias: 1.3,
        restBias: 1.3,
        opponentBias: 1.4,
        partnerBias: 1.4,
        fatigueBias: 1.3,
      };

    default:   // D：全部バランス
      return {
        refBias: 1.4,
        restBias: 1.4,
        opponentBias: 1.4,
        partnerBias: 1.4,
        fatigueBias: 1.4,
      };
  }
}



/* ======================================================
   ★ ラウンド生成（index.html から呼び出し）
   generateRound(players, roundNumber, courtCount, weights, availablePlayers)
====================================================== */

function generateRound(players, roundNumber, courtCount, weights, availablePlayers) {
  // 試合に出られるメンバーだけ
  const actives = availablePlayers.slice();
  if (actives.length < 4) return null;

  const rounds = [];
  const refs = [];
  const benches = [];
  const used = new Set();

  // コートごとに試合を作る
  for (let c = 0; c < courtCount; c++) {
    let bestScore = -999999;
    let bestGroup = null;

    // 4人組の全パターンをチェック
    for (let i = 0; i < actives.length; i++) {
      for (let j = i + 1; j < actives.length; j++) {
        for (let k = j + 1; k < actives.length; k++) {
          for (let l = k + 1; l < actives.length; l++) {

            const group = [actives[i], actives[j], actives[k], actives[l]];

            // 同じラウンドで重複参加しないように
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

    // ★ 審判は必ず、その4人の中から選ぶ
    const refIndex = chooseReferee(bestGroup, players, roundNumber, weights.refBias);

    // 審判以外の3人
    const base = bestGroup.filter(i => i !== refIndex);

    // ベンチ候補 = まだ使ってない & base に含まれていない人
    const spare = actives.filter(i => !used.has(i) && !base.includes(i));

    let add = null;
    if (spare.length > 0) {
      // 休憩少ない→試合数少ない人を優先
      add = spare.sort((a, b) => {
        return (players[a].rests - players[b].rests) ||
               (players[a].games - players[b].games);
      })[0];
    } else {
      // どうしてもいないときは base からランダム
      add = base[Math.floor(Math.random() * base.length)];
    }

    const finalFour = [...base, add];

    const teamA = [finalFour[0], finalFour[1]];
    const teamB = [finalFour[2], finalFour[3]];

    rounds.push({ teamA, teamB });
    refs.push(refIndex);

    // このラウンドで使用した人を登録
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

  // ベンチ（休憩）
  const activeSet = new Set(actives);
  used.forEach(u => activeSet.delete(u));
  const restList = [...activeSet];

  restList.forEach(i => {
    players[i].rests++;
    players[i].lastRestRound = roundNumber;
  });

  return { rounds, refs, benches: restList };
}



/* ======================================================
   ★ スコア計算 & 審判選び
====================================================== */

/** グループの評価：値が大きいほど「出したい」 */
function calcGroupScore(players, group, round, w) {
  let score = 0;

  group.forEach(i => {
    const p = players[i];

    // 試合数が少ない人を優先（games 小さいほどプラス）
    score += (Math.max(0, 50 - p.games * 2)) * w.fatigueBias;

    // 審判が少ない人を優先（refs 小さいほどプラス）
    score += (Math.max(0, 50 - p.refs * 3)) * w.refBias;

    // 休憩が少ない人も少しだけ優遇
    score += (Math.max(0, 50 - p.rests * 3)) * w.restBias;
  });

  // 完全固定にならないように、わずかにランダム性
  return score + Math.random() * 0.01;
}

/** 審判にする人を4人の中から選ぶ（この関数ではステータス更新しない） */
function chooseReferee(group, players, round, refBias) {
  let best = group[0];
  let bestScore = 999999;

  group.forEach(i => {
    const p = players[i];
    // 審判回数が少ない人を優先 → 同数なら試合数が少ない人
    const score = p.refs * 10 * refBias + p.games;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });

  return best;
}

/** Fisher–Yates shuffle（今は使ってないけどお守りで残しておく） */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
