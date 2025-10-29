// =============== SCHEDULER UTILITIES (Equalized + Bye-avoid) ===============
// Exports used by the app:
// - buildPlayers
// - splitIntoGroups
// - buildGroupPairings
// - buildGlobalSchedule   <-- equal-games if feasible (strict), else lowers target
// - toCSVWithOff

export function buildPlayers(n) {
  n = Math.max(0, Number(n) || 0)
  return Array.from({ length: n }, (_, i) => `P${i + 1}`)
}

export function splitIntoGroups(players, numGroups) {
  const g = Math.max(1, Number(numGroups) || 1)
  const groups = Array.from({ length: g }, () => [])
  players.forEach((p, i) => { groups[i % g].push(p) })
  return groups
}

function roundRobinPairs(group) {
  const arr = [...group]
  const odd = arr.length % 2 === 1
  if (odd) arr.push('__BYE__')

  const n = arr.length
  const half = n / 2
  const rounds = []

  let a = arr.slice(0, half)
  let b = arr.slice(half).reverse()

  for (let r = 0; r < n - 1; r++) {
    const pairs = []
    for (let i = 0; i < half; i++) {
      const p1 = a[i], p2 = b[i]
      if (p1 !== '__BYE__' && p2 !== '__BYE__') pairs.push([p1, p2])
    }
    rounds.push(pairs)

    const fixed = a[0]
    const rest = a.slice(1).concat(b.slice(0, 1))
    const newA = [fixed, ...rest.slice(0, half - 1)]
    const newB = rest.slice(half - 1).concat(b.slice(1)).reverse()
    a = newA
    b = newB
  }
  return rounds
}

export function buildGroupPairings(groups) {
  return groups.map(g => roundRobinPairs(g))
}

// Strict-equal scheduler with secondary preference to avoid back-to-back BYEs.
export function buildGlobalSchedule(groupRounds, boards, preferredRounds) {
  boards = Math.max(1, Number(boards) || 1)
  const totalRounds = Math.max(1, Number(preferredRounds) || 1)

  const groups = groupRounds.map((gr) => {
    const s = new Set()
    gr.forEach(r => r.forEach(([A, B]) => { s.add(A); s.add(B) }))
    return Array.from(s)
  })
  const allPlayers = Array.from(new Set(groups.flat()))

  const allMatches = []
  groups.forEach((gPlayers, gi) => {
    for (let i = 0; i < gPlayers.length; i++) {
      for (let j = i + 1; j < gPlayers.length; j++) {
        allMatches.push({ A: gPlayers[i], B: gPlayers[j], group: gi + 1 })
      }
    }
  })

  const N = allPlayers.length || 1
  const capByBoards = Math.floor((boards * totalRounds * 2) / N)
  const capByRounds = totalRounds
  const capByOpponents = groups.length
    ? Math.min(...groups.map(g => Math.max(0, g.length - 1)))
    : 0
  let target = Math.max(0, Math.min(capByBoards, capByRounds, capByOpponents))

  function tryBuild(targetGames) {
    const gamesPlayed = Object.fromEntries(allPlayers.map(p => [p, 0]))
    const pairPlayed = new Set()
    const lastPlayedRound = Object.fromEntries(allPlayers.map(p => [p, 0]))
    const schedule = []

    for (let r = 1; r <= totalRounds; r++) {
      const usedThisRound = new Set()
      const round = []

      let candidates = allMatches.filter(m => {
        const key = m.A < m.B ? `${m.A}|${m.B}` : `${m.B}|${m.A}`
        if (pairPlayed.has(key)) return false
        if (gamesPlayed[m.A] >= targetGames) return false
        if (gamesPlayed[m.B] >= targetGames) return false
        return true
      })

      function hadByePrev(p) {
        if (r === 1) return false
        return lastPlayedRound[p] !== (r - 1)
      }

      candidates.sort((m1, m2) => {
        const byeScore1 = (hadByePrev(m1.A) ? 1 : 0) + (hadByePrev(m1.B) ? 1 : 0)
        const byeScore2 = (hadByePrev(m2.A) ? 1 : 0) + (hadByePrev(m2.B) ? 1 : 0)
        if (byeScore2 !== byeScore1) return byeScore2 - byeScore1

        const d1 = (targetGames - gamesPlayed[m1.A]) + (targetGames - gamesPlayed[m1.B])
        const d2 = (targetGames - gamesPlayed[m2.A]) + (targetGames - gamesPlayed[m2.B])
        if (d2 !== d1) return d2 - d1

        const mx1 = Math.max(targetGames - gamesPlayed[m1.A], targetGames - gamesPlayed[m1.B])
        const mx2 = Math.max(targetGames - gamesPlayed[m2.A], targetGames - gamesPlayed[m2.B])
        return mx2 - mx1
      })

      for (const m of candidates) {
        if (round.length >= boards) break
        if (usedThisRound.has(m.A) || usedThisRound.has(m.B)) continue

        round.push({ round: r, board: round.length + 1, A: m.A, B: m.B, group: m.group })
        usedThisRound.add(m.A); usedThisRound.add(m.B)
        gamesPlayed[m.A]++; gamesPlayed[m.B]++
        lastPlayedRound[m.A] = r; lastPlayedRound[m.B] = r
        const key = m.A < m.B ? `${m.A}|${m.B}` : `${m.B}|${m.A}`
        pairPlayed.add(key)
      }

      schedule.push(round)
    }

    const counts = allPlayers.map(p => gamesPlayed[p])
    const mn = Math.min(...counts), mx = Math.max(...counts)
    const equal = (mn === mx && mx === targetGames)
    return { schedule, equal }
  }

  while (target >= 0) {
    const attempt = tryBuild(target)
    if (attempt.equal) return attempt.schedule
    target -= 1
  }
  return Array.from({ length: totalRounds }, () => [])
}

export function toCSVWithOff(players, playerGroupMap, schedule) {
  const lines = []
  lines.push(['Round', 'Board', 'Group', 'Player', 'Opponent'].join(','))

  for (let r = 0; r < schedule.length; r++) {
    const matches = schedule[r]
    const assigned = new Map()

    matches.forEach(m => {
      assigned.set(m.A, { board: m.board, group: m.group, opp: m.B })
      assigned.set(m.B, { board: m.board, group: m.group, opp: m.A })
    })

    players.forEach(p => {
      const a = assigned.get(p)
      if (a) {
        lines.push([r + 1, a.board, a.group ?? '', p, a.opp].join(','))
      } else {
        lines.push([r + 1, 'OFF', playerGroupMap[p] ?? '', p, ''].join(','))
      }
    })
  }
  return lines.join('\n') + '\n'
}