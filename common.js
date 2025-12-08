/* ===============================================
   common.js  
   名簿管理 / 参加者管理 / 試合作成 共通ロジック
=============================================== */

// ---------- 名簿読み込み（players.html） ----------
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

// ---------- 名簿追加 ----------
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

// ---------- 名簿削除 ----------
function deletePlayer(index) {
  const players = JSON.parse(localStorage.getItem("allPlayers") || "[]");
  players.splice(index, 1);
  localStorage.setItem("allPlayers", JSON.stringify(players));
  loadPlayers();
}

// ---------- 名簿保存（並び順反映） ----------
function savePlayers() {
  const items = document.querySelectorAll("#playerList .name");
  const newList = [];
  items.forEach(el => newList.push(el.textContent));

  localStorage.setItem("allPlayers", JSON.stringify(newList));
  alert("名簿を保存しました！");
}

// ---------------------------------------------------
// 試合作成メインロジック
// ---------------------------------------------------

/**
 * generateRound(players, roundNumber, courts, aiWeights)
 * → { rounds, refs, benches }
 */
function generateRound(players, roundNumber, courts, weights) {
  const startRounds = JSON.parse(localStorage.getItem("activePlayersStartRound") || "{}");

  // まだ参加開始ラウンドに達していない人は休憩強制
  const unavailable = new Set(
    players.filter(p => roundNumber < (startRounds[p.name] || 1)).map(p => p.idx)
  );

  // 参加可能なメンバー
  const active = players.filter(p => !unavailable.has(p.idx));

  if (active.length < courts * 4) return null; // 成立不可

  // AI のペア作成アルゴリズム（簡易）
  const selected = active.slice().sort(() => Math.random() - 0.5);
  const rounds = [];
  const refs = [];
  const benches = [];

  let ptr = 0;

  for (let c = 0; c < courts; c++) {
    const A1 = selected[ptr++];
    const A2 = selected[ptr++];
    const B1 = selected[ptr++];
    const B2 = selected[ptr++];

    rounds.push({
      teamA: [A1.idx, A2.idx],
      teamB: [B1.idx, B2.idx],
    });

    // 審判は次の人（仮）
    const ref = selected[ptr++] || selected[0];
    refs.push(ref.idx);

    // 更新
    players[A1.idx].games++;
    players[A2.idx].games++;
    players[B1.idx].games++;
    players[B2.idx].games++;
    players[ref.idx].refs++;
  }

  // 余った人はベンチ
  for (; ptr < selected.length; ptr++) {
    benches.push(selected[ptr].idx);
    players[selected[ptr].idx].rests++;
  }

  return { rounds, refs, benches };
}
