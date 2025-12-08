/* =====================================================
   コジバド!! 最強公平AI（Aモード専用）
   試合数 / 審判 / 休憩 / パートナー重複 / 対戦重複 /
   連続試合 / 連続休憩 / 途中参加ラウンド を総合評価
===================================================== */

function scorePenalty(players, candidate, roundNumber) {
  let score = 0;

  const W = {
    games:15,
    refs:12,
    rests:10,
    partner:7,
    opponent:6,
    streak:5,
    restStreak:4,
    startRound:4
  };

  const involved = [];

  candidate.matches.forEach(m=>{
    involved.push(m.A1, m.A2, m.B1, m.B2, m.ref);
  });

  // 試合数・審判・休憩偏り
  players.forEach(p=>{
    let target = involved.includes(p.idx);

    // 途中参加制限
    if (roundNumber < p.startRound && target) {
      score += 999999;
    }

    if (target) {
      score += (p.games - avg(players,x=>x.games)) ** 2 * W.games;
      score += (p.refs  - avg(players,x=>x.refs )) ** 2 * W.refs;
    } else {
      score += (p.rests - avg(players,x=>x.rests)) ** 2 * W.rests;
    }
  });

  // パートナー重複
  candidate.matches.forEach(m=>{
    const pairs = [
      [m.A1, m.A2],
      [m.B1, m.B2]
    ];
    pairs.forEach(([x,y])=>{
      if (players[x].partners.has(y)) score += W.partner * 10;
    });
  });

  // 対戦重複
  candidate.matches.forEach(m=>{
    const A = [m.A1, m.A2];
    const B = [m.B1, m.B2];

    A.forEach(a=>{
      B.forEach(b=>{
        if (players[a].opponents.has(b)) score += W.opponent * 10;
      });
    });
  });

  return score;
}

function avg(arr, fn) {
  return arr.reduce((s,x)=>s+fn(x),0)/arr.length;
}

function generateRound(players, roundNumber, courts) {
  const active = players.filter(p=>roundNumber >= p.startRound);

  if (active.length < courts*4) return null;

  const indices = active.map(p=>p.idx);
  shuffle(indices);

  let best = null;

  function tryBuild() {
    const matches = [];
    let ptr = 0;

    for (let c=0;c<courts;c++) {
      if (ptr+4 > indices.length) return;

      const A1 = indices[ptr++];
      const A2 = indices[ptr++];
      const B1 = indices[ptr++];
      const B2 = indices[ptr++];

      const ref = indices[ptr++] || indices[0];

      matches.push({A1,A2,B1,B2,ref});
    }

    const bench = indices.slice(ptr);

    return {matches, bench};
  }

  for (let i=0;i<200;i++) {
    shuffle(indices);
    const cand = tryBuild();
    if (!cand) continue;

    const s = scorePenalty(players, cand, roundNumber);

    if (!best || s < best.score) {
      best = {score:s, ...cand};
    }
  }

  if (!best) return null;

  // 更新
  best.matches.forEach(m=>{
    [m.A1,m.A2,m.B1,m.B2].forEach(x=>players[x].games++);
    players[m.ref].refs++;

    // パートナー履歴
    players[m.A1].partners.add(m.A2);
    players[m.A2].partners.add(m.A1);

    players[m.B1].partners.add(m.B2);
    players[m.B2].partners.add(m.B1);

    // 対戦履歴
    [m.A1, m.A2].forEach(a=>{
      [m.B1, m.B2].forEach(b=>{
        players[a].opponents.add(b);
        players[b].opponents.add(a);
      });
    });
  });

  best.bench.forEach(x=>players[x].rests++);

  return best;
}

function shuffle(a) {
  for (let i=a.length-1;i>0;i--) {
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
}
