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
function generateRound(players, roundNumber, courtCount, weights, availablePlayers) {

  // 試合に出られるメンバーだけに絞る
  const actives = availablePlayers.slice();
  if (actives.length < 4) return null;

  const rounds = [];
  const refs = [];
  const benches = [];
  const used = new Set();

  // 各コートごとに試合を作る
  for (let c = 0; c < courtCount; c++) {

    // ------------------------
    // ★ 審判は必ず「その4人の中から」選ぶ方式
    // ------------------------

    let bestScore = -999999;
    let bestGroup = null;

    // 全パターン（組み合わせ）を調査
    for (let i = 0; i < actives.length; i++) {
      for (let j = i + 1; j < actives.length; j++) {
        for (let k = j + 1; k < actives.length; k++) {
          for (let l = k + 1; l < actives.length; l++) {

            const group = [actives[i], actives[j], actives[k], actives[l]];

            // すでに今回のラウンドで使われた人は除外
            if (group.some(x => used.has(x))) continue;

            const score =
              calcGroupScore(players, group, roundNumber, weights);

            if (score > bestScore) {
              bestScore = score;
              bestGroup = group;
            }
          }
        }
      }
    }

    if (!bestGroup) break;

    // ------------------------
    // ★ 審判を4人の中から選ぶ（絶対固定）
    // ------------------------
    const refIndex = chooseReferee(bestGroup, players, roundNumber, weights.refBias);

    // ------------------------
    // ★ 残り3人 + 別の1名 = 試合4名
    // ------------------------
    const base = bestGroup.filter(i => i !== refIndex);

    // ベンチ候補 = まだ使われていない & 登録済 & base にない
    const spare = actives.filter(i => !used.has(i) && !base.includes(i));

    let add = null;

    if (spare.length > 0) {
      // 一番 "休憩回数が少ない" or "試合数が少ない" 人を優先
      add = spare.sort((a, b) => {
        // 休憩の少ない順 → 試合数の少ない順
        return (players[a].rests - players[b].rests) ||
               (players[a].games - players[b].games);
      })[0];
    } else {
      // どうしてもいないときは base の中から選ぶ
      add = base[Math.floor(Math.random() * base.length)];
    }

    const finalFour = [...base, add];

    // 2 vs 2
    const teamA = [finalFour[0], finalFour[1]];
    const teamB = [finalFour[2], finalFour[3]];

    // 登録
    rounds.push({ teamA, teamB });
    refs.push(refIndex);

    // 使用済みに登録
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

  // ------------------------
  // ★ ベンチ（休憩）
  // ------------------------
  const allActiveSet = new Set(actives);
  used.forEach(u => allActiveSet.delete(u));
  const restList = [...allActiveSet];

  restList.forEach(i => {
    players[i].rests++;
    players[i].lastRestRound = roundNumber;
  });

  return { rounds, refs, benches: restList };
}

