/*  
==========================================
   common.js  
   名簿管理 / 参加者管理 / 共通関数
==========================================
*/

// ------------------------------
// 名簿を読み込み（players.html）
// ------------------------------
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

// ------------------------------
// 名簿に追加（players.html）
// ------------------------------
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

// ------------------------------
// 名簿から削除
// ------------------------------
function deletePlayer(index) {
  const players = JSON.parse(localStorage.getItem("allPlayers") || "[]");
  players.splice(index, 1);
  localStorage.setItem("allPlayers", JSON.stringify(players));
  loadPlayers();
}

// ------------------------------
// 名簿保存（並び替え反映）
// ------------------------------
function savePlayers() {
  const items = document.querySelectorAll("#playerList .name");
  const newList = [];
  items.forEach(el => newList.push(el.textContent));

  localStorage.setItem("allPlayers", JSON.stringify(newList));

  alert("名簿を保存しました！");
}

// ------------------------------
// 名簿を attendance.html に読み込む
// ------------------------------
function loadPlayersToAttendance() {
  const list = document.getElementById("activeList");
  list.innerHTML = "";

  const players = JSON.parse(localStorage.getItem("allPlayers") || "[]");

  players.forEach((name, index) => {
    const li = document.createElement("li");
    li.className = "list-item";

    li.innerHTML = `
      <label>
        <input type="checkbox" class="chk" checked>
        <span class="name">${name}</span>
      </label>
      <span class="drag">☰</span>
    `;
    list.appendChild(li);
  });
}

// ------------------------------
// 当日の参加者を保存
// ------------------------------
function saveActivePlayers() {
  const items = document.querySelectorAll("#activeList li");

  const active = [];
  items.forEach(li => {
    const chk = li.querySelector(".chk").checked;
    const name = li.querySelector(".name").textContent;
    if (chk) active.push(name);
  });

  if (active.length < 4) {
    alert("参加者は最低4人必要です！");
    return;
  }

  localStorage.setItem("activePlayers", JSON.stringify(active));

  alert("参加者を保存しました！");
}
