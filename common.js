/*  
==========================================
   common.js（途中参加 & 公平性対応 安定版）
   名簿管理 / 参加者チェック / 試合作成 共通関数
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
  const active  = JSON.parse(localStorage.getItem("activePlayers") || "[]");

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
   ★ AI 重み（index.html から呼ばれる）
====================================================== */

function getCommonAiWeights(mode, players) {
  switch (mode) {
    case "A": // 最強公平型（全部かなり厳しめ）
      return {
        refBias:      2.0,
        restBias:     2.0,
        opponentBias: 1.6,
        partnerBias:  1.6,
        fatigueBias:  1.8,
      };

    case "B": // ペア重視
      return {
        refBias:      1.0,
        restBias:     1.2,
        opponentBias: 1.0,
        partnerBias:  2.2,
        fatigueBias:  1.2,
      };

    case "C": // 体力重視（休憩多め）
      return {
        refBias:      1.2,
        restBias:     1.6,
        opponentBias: 1.0,
        partnerBias:  1.0,
        fatigueBias:  2.4,
      };

    case "ML": // 機械学習ぽいバランス
      return {
        refBias:      1.3,
        restBias:     1.3,
        opponentBias: 1.4,
        partnerBias:  1.4,
        fatigueBias:  1.3,
      };

    default:   // D：全部バランス（おすすめ）
      return {
        refBias:      1.4,
        restBias:     1.4,
        opponentBias: 1.4,
        partnerBias:  1.4,
        fatigueBias:  1.4,
      };
  }
}



/* ======================================================
   ★ ラウンド生成（index.html → createNextRound から呼ばれる）
   - 途中参加 / 退場：任意で joinRound / leaveRound を持っていても OK
   - 足りなければ普通に全員対象で動く
====================================================== */

function generateRound(players, roundNumber, courtCount, weights) {
  if (!players || players.length < 4) return null;

  // ---------- まず安全な数値に正規化 ----------
  players.forEach(p => normalizePlayerStats(p));

  // ---------- このラウンドに参加できる人だけ抽出 ----------
  const active = [];
  const absent = []; // 途中参加前 / 退場後（ベンチには含めない）

  for (let i = 0; i < players.length; i++) {
    if (isActiveThisRound(players[i], roundNumber)) {
      active.push(i);
    } else {
      absent.push(i);
    }
  }

  if (active.length < 4) {
    // そもそも4人未満なら試合は組めない
    return { rounds: [], refs: [], benches: active.slice() };
  }

  const used   = new Set(); // このラウンドで「プレー or 審判」で使った人
  const rounds = [];
  const refs   = [];

  // ---------- コートごとに試合を作る ----------
  for (let c = 0; c < courtCount; c++) {
    // まだ使われていないアクティブメンバー
    const remaining = active.filter(i => !used.has(i));
    if (remaining.length < 4) break;

    let bestScore = -Infinity;
    let bestGroup = null; // 4人のプレーヤー

    // 残りメンバーから4人組を全探索（人数少ないのでOK）
    for (let a = 0; a < remaining.length; a++) {
      const i = remaining[a];
      for (let b = a + 1; b < remaining.length; b++) {
        const j = remaining[b];
        for (let d = b + 1; d < remaining.length; d++) {
          const k = remaining[d];
          for (let e = d + 1; e < remaining.length; e++) {
            const l = remaining[e];

            const group = [i, j, k, l];
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

    // この4人はこのラウンドでプレー確定
    bestGroup.forEach(idx => used.add(idx));

    // 審判候補：まだ誰にも使われていないアクティブメンバー
    let refPool = active.filter(i => !used.has(i));

    // もし審判専任がいなければ、プレーメンバーから選ぶ (レアケース)
    if (refPool.length === 0) refPool = bestGroup.slice();

    const refIndex = chooseReferee(refPool, players, roundNumber, weights.refBias);
    refs.push(refIndex);
    used.add(refIndex); // 審判も「使われた」扱い

    // ゲーム数更新（審判がプレーメンバーに含まれている場合は試合も＋１）
    bestGroup.forEach(idx => {
      players[idx].games += 1;
      players[idx].lastRoundPlayed = roundNumber;
    });

    // チーム分け（4人を 2 vs 2）
    const [p1, p2, p3, p4] = bestGroup;
    const teamA = [p1, p2];
    const teamB = [p3, p4];

    rounds.push({ teamA, teamB });
  }

  // ---------- ベンチ（このラウンドにアクティブで、使われなかった人） ----------
  const benches = [];
  active.forEach(idx => {
    if (!used.has(idx)) {
      benches.push(idx);
      players[idx].rests += 1;
      players[idx].lastRestRound = roundNumber;
    }
  });

  return { rounds, refs, benches };
}



/* ======================================================
   ★ スコア計算など内部処理
====================================================== */

/* このラウンドに参加可能かどうか（joinRound / leaveRound があれば利用） */
function isActiveThisRound(p, round) {
  const join  = Number.isFinite(p.joinRound)  ? p.joinRound  : 1;
  const leave = Number.isFinite(p.leaveRound) ? p.leaveRound : 9999;
  return round >= join && round <= leave;
}

/* stats が undefined でも確実に数値になるようにする */
function normalizePlayerStats(p) {
  p.games          = Number.isFinite(p.games)          ? p.games          : 0;
  p.refs           = Number.isFinite(p.refs)           ? p.refs           : 0;
  p.rests          = Number.isFinite(p.rests)          ? p.rests          : 0;
  p.lastRoundPlayed= Number.isFinite(p.lastRoundPlayed)? p.lastRoundPlayed: 0;
  p.lastRefRound   = Number.isFinite(p.lastRefRound)   ? p.lastRefRound   : 0;
  p.lastRestRound  = Number.isFinite(p.lastRestRound)  ? p.lastRestRound  : 0;
}

/* グループ（4人）のスコア計算 */
function calcGroupScore(players, group, round, w) {
  let score = 0;

  group.forEach(idx => {
    const p = players[idx];
    const games   = p.games;
    const refs    = p.refs;
    const rests   = p.rests;
    const last    = p.lastRoundPlayed;
    const gap     = round - last; // 最近どれだけ出てないか

    // ゲーム回数が多い人はちょいマイナス
    score -= games * 0.3;

    // 審判・休憩偏りの調整
    score -= refs  * w.refBias;
    score -= rests * w.restBias * 0.5;

    // しばらく出てない人には軽いボーナス
    score += gap * w.fatigueBias * 0.3;
  });

  // ほんの少しランダムで同点をバラす
  return score + Math.random() * 0.01;
}

/* 審判を選ぶ（候補配列から1人） */
function chooseReferee(candidateIndices, players, round, refBias) {
  let best    = candidateIndices[0];
  let bestVal = Infinity;

  candidateIndices.forEach(i => {
    const p = players[i];
    const score =
      p.refs * refBias +           // 審判回数多い人は不利
      (round - p.lastRefRound) * -0.2 + // 最近審判した人はさらに不利
      Math.random();               // 少しランダム

    if (score < bestVal) {
      bestVal = score;
      best    = i;
    }
  });

  players[best].refs += 1;
  players[best].lastRefRound = round;

  return best;
}

/* Fisher–Yates shuffle（今は使ってないけど一応残す） */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
