import React, { useMemo, useState } from 'react'
import {
  buildPlayers,
  splitIntoGroups,
  buildGroupPairings,
  buildGlobalSchedule,
  toCSVWithOff
} from './scheduler.js'

export default function App() {
  const [numPlayers, setNumPlayers] = useState(8)
  const [numGroups, setNumGroups] = useState(2)
  const [numBoards, setNumBoards] = useState(3)
  const [numRounds, setNumRounds] = useState(6)
  const [namesText, setNamesText] = useState(buildPlayers(8).join(', '))

  // Players from the input; auto-fill P1..Pn for any missing names
  const players = useMemo(() => {
    const entered = namesText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
    const count = Math.max(0, Number(numPlayers) || 0)
    const out = [...entered]
    for (let i = entered.length; i < count; i++) out.push(`P${i + 1}`)
    return out.slice(0, count)
  }, [namesText, numPlayers])

  const groups = useMemo(() => splitIntoGroups(players, numGroups), [players, numGroups])
  const groupRounds = useMemo(() => buildGroupPairings(groups), [groups])
  const rawSchedule = useMemo(
    () => buildGlobalSchedule(groupRounds, numBoards, numRounds),
    [groupRounds, numBoards, numRounds]
  )

  // ---- Board Rebalance Layer (App.jsx only; no changes to scheduler.js) ----
  // Heuristic: For each round, if a player has the same board as the previous round,
  // try swapping board numbers with another match in the SAME round that reduces
  // conflicts for BOTH matches' players. Repeat a few times per round.
  function rebalanceBoards(schedule) {
    // deep-ish clone: we only mutate .board numbers
    const rounds = schedule.map(r => r.map(m => ({ ...m })))
    const lastBoard = {} // player -> board used in previous round

    for (let r = 0; r < rounds.length; r++) {
      const matches = rounds[r]
      // compute conflict score for each match
      const conflictForMatch = (m) => {
        let c = 0
        if (lastBoard[m.A] === m.board) c++
        if (lastBoard[m.B] === m.board) c++
        return c
      }

      // attempt a few improvement passes
      let improved = true
      let guard = 0
      while (improved && guard < 10) {
        improved = false
        guard++

        // try pairwise swaps of board numbers
        for (let i = 0; i < matches.length; i++) {
          for (let j = i + 1; j < matches.length; j++) {
            const m1 = matches[i], m2 = matches[j]
            const before = conflictForMatch(m1) + conflictForMatch(m2)

            // swap boards
            const b1 = m1.board, b2 = m2.board
            m1.board = b2
            m2.board = b1
            const after = conflictForMatch(m1) + conflictForMatch(m2)

            if (after < before) {
              // keep swap; mark improvement
              improved = true
            } else {
              // revert
              m1.board = b1
              m2.board = b2
            }
          }
        }
      }

      // finalize this round: update lastBoard based on (possibly) improved matches
      for (const m of matches) {
        lastBoard[m.A] = m.board
        lastBoard[m.B] = m.board
      }
    }
    return rounds
  }

  // The schedule used for UI, CSV, and totals:
  const schedule = useMemo(() => rebalanceBoards(rawSchedule), [rawSchedule])

  // Player → Group mapping
  const playerGroupMap = useMemo(() => {
    const m = {}
    groups.forEach((g, gi) => g.forEach(p => (m[p] = gi + 1)))
    return m
  }, [groups])

  // Explicit totals: count a game if player appears in A or B for that round
  const totals = useMemo(() => {
    const counts = Object.fromEntries(players.map(p => [p, 0]))
    schedule.forEach((roundMatches) => {
      const playing = new Set()
      roundMatches.forEach(m => { playing.add(m.A); playing.add(m.B) })
      playing.forEach(p => { if (p in counts) counts[p] += 1 })
    })
    return counts
  }, [players, schedule])

  const downloadCSV = () => {
    const csv = toCSVWithOff(players, playerGroupMap, schedule)
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'schedule.csv'
    a.click()
  }

  // Assets (place in /public)
  const logoPath = '/scorecard-logo.png'
  const IMG_MATCHBLANK = '/Square_Without_Text.png' // used for Match cells & Total (non-BYE)

  const tournamentTitle = 'Games on Tap — Crokinole Singles'
  const tournamentSub = 'Louisville, KY • Nov 1, 2025'

  // ===================== PRINT LAYOUT: 2 CARDS PER PAGE =====================
  const printStyles = `
@page {
  size: Letter portrait;
  margin: 0.5in; /* standard US Letter margins */
}
@media print {
  body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; background:#fff !important; }
  .no-print { display: none !important; }
  .score-grid {
    display: grid !important;
    grid-template-columns: 1fr !important;
    gap: 0.4in !important;
  }
  .scorecard {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
    border: 1px solid #e5e7eb !important;
    height: 4.8in !important; /* 2 per page */
    box-sizing: border-box !important;
  }
  .scorecard .card-header { padding: 8px !important; gap: 8px !important; }
  .scorecard table { font-size: 12px !important; }
  .scorecard:nth-of-type(2n) { break-after: page !important; page-break-after: always !important; }
}
`

  // ==== Cell Styles ====
  const squareCell = { border:'1px solid #e5e7eb', padding:'0 6px', width:40, height:40, lineHeight:'40px', textAlign:'center', verticalAlign:'middle', boxSizing:'border-box' }
  const squareCellOffRow = { ...squareCell, background:'#000', color:'#fff' }
  const squareWithImage = (img) => ({ ...squareCell, backgroundImage:`url(${img})`, backgroundSize:'cover', backgroundRepeat:'no-repeat', backgroundPosition:'center' })

  const flexCell = { border:'1px solid #e5e7eb', padding:'6px 8px', height:40, lineHeight:'40px', textAlign:'center', verticalAlign:'middle' }
  const flexCellLeft = { ...flexCell, textAlign:'left' }
  const flexCellOffRow = { ...flexCell, background:'#000', color:'#fff' }
  const flexCellLeftOffRow = { ...flexCellLeft, background:'#000', color:'#fff' }

  const headerCell = { border:'1px solid #e5e7eb', background:'#f3f4f6', padding:'6px 8px', textAlign:'center', fontWeight:700, fontSize:13, lineHeight:'16px', whiteSpace:'nowrap', height:'auto', verticalAlign:'middle' }

  const W = { game:60, table:70, opponent:200, match:40, total:40, oppInit:40 }

  const TwoLineHeader = ({ top, bottom }) => (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', lineHeight:'14px' }}>
      <span>{top}</span>
      <span>{bottom}</span>
    </div>
  )

  return (
    <div style={{ maxWidth:1200, margin:'24px auto', padding:'0 16px' }}>
      <style>{printStyles}</style>

      <h1 className="no-print">Crokinole Round-Robin Scheduler</h1>

      {/* Controls */}
      <div className="no-print" style={{ display:'grid', gridTemplateColumns:'380px 1fr', gap:16, alignItems:'start', marginBottom:16 }}>
        <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, padding:12 }}>
          <div style={{ fontWeight:600, marginBottom:8 }}>Tournament Settings</div>

          <label style={{ display:'block', marginBottom:8 }}>Players
            <input type="number" step="1" min="0" value={numPlayers} onChange={e=>setNumPlayers(e.target.value)} style={{ width:'100%', marginTop:4 }} />
          </label>
          <label style={{ display:'block', marginBottom:8 }}>Groups
            <input type="number" step="1" min="1" value={numGroups} onChange={e=>setNumGroups(e.target.value)} style={{ width:'100%', marginTop:4 }} />
          </label>
          <label style={{ display:'block', marginBottom:8 }}>Boards
            <input type="number" step="1" min="1" value={numBoards} onChange={e=>setNumBoards(e.target.value)} style={{ width:'100%', marginTop:4 }} />
          </label>
          <label style={{ display:'block', marginBottom:8 }}>Rounds
            <input type="number" step="1" min="1" value={numRounds} onChange={e=>setNumRounds(e.target.value)} style={{ width:'100%', marginTop:4 }} />
          </label>

          <button onClick={downloadCSV} style={{ width:'100%', marginTop:8, padding:'10px 12px', borderRadius:6, border:0, background:'#15803d', color:'#fff', cursor:'pointer' }}>
            Download CSV (with OFF)
          </button>
          <button onClick={()=>window.print()} className="no-print" style={{ width:'100%', marginTop:8, padding:'10px 12px', borderRadius:6, border:0, background:'#0f172a', color:'#fff', cursor:'pointer' }}>
            Print Scorecards
          </button>
        </div>

        {/* Player Names */}
        <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, padding:12 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 220px', gap:12 }}>
            <div>
              <div style={{ fontWeight:600, marginBottom:8 }}>Player Names (comma or newline)</div>
              <textarea value={namesText} onChange={e=>setNamesText(e.target.value)} style={{ width:'100%', minHeight:180, fontFamily:'inherit', border:'1px solid #e5e7eb', borderRadius:6, padding:8 }} />
              <div style={{ marginTop:8, fontSize:12, color:'#64748b' }}>Missing names auto-fill as P1, P2…</div>
            </div>
            <div>
              <div style={{ fontWeight:600, marginBottom:8 }}>Quick Fill</div>
              <button onClick={()=>setNamesText(buildPlayers(Number(numPlayers)||0).join(', '))} style={{ width:'100%', padding:'10px 12px', borderRadius:6, border:0, background:'#334155', color:'#fff', cursor:'pointer' }}>
                Prefill P1…P{numPlayers}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Scorecards */}
      <h2 className="no-print">Scorecards</h2>
      <div className="score-grid" style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:16 }}>
        {players.map(pName => (
          <div key={pName} className="scorecard" style={{ border:'1px solid #e5e7eb', borderRadius:8, background:'white' }}>
            <div className="card-header" style={{ display:'flex', alignItems:'center', gap:12, padding:12, borderBottom:'1px solid #e5e7eb' }}>
              <img src={logoPath} alt="Logo" style={{ height:36 }} />
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700 }}>{tournamentTitle}</div>
                <div style={{ fontSize:12, color:'#64748b' }}>{tournamentSub}</div>
                <div style={{ marginTop:6, fontSize:14 }}><strong>Player:</strong> {pName}</div>
              </div>
              <div style={{ color:'#64748b', fontSize:12 }}>Group {playerGroupMap[pName] || ''}</div>
            </div>

            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, tableLayout:'fixed' }}>
              <thead>
                <tr>
                  <th style={{ ...headerCell, width: W.game }}>Game #</th>
                  <th style={{ ...headerCell, width: W.table }}>Table #</th>
                  <th style={{ ...headerCell, width: W.opponent }}>Opponent</th>
                  {['1','2','3','4'].map(num => (
                    <th key={num} style={{ ...headerCell, width: W.match, padding:'4px 6px' }}>
                      <TwoLineHeader top="Match" bottom={num} />
                    </th>
                  ))}
                  <th style={{ ...headerCell, width: W.total }}>Total</th>
                  <th style={{ ...headerCell, width: W.oppInit, padding:'4px 6px' }}>
                    <TwoLineHeader top="Opp" bottom="Initials" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((round, idx) => {
                  const m = round.find(x => x.A === pName || x.B === pName)
                  const isOff = !m
                  const opp = isOff ? '' : (m.A === pName ? m.B : m.A)
                  const table = isOff ? 'OFF' : m.board
                  return (
                    <tr key={idx}>
                      <td style={isOff ? flexCellOffRow : flexCell}>{idx+1}</td>
                      <td style={isOff ? flexCellOffRow : flexCell}>{table}</td>
                      <td style={isOff ? flexCellLeftOffRow : flexCellLeft}>{opp}</td>
                      {[0,1,2,3].map(i => (
                        <td key={i} style={isOff ? squareCellOffRow : squareWithImage(IMG_MATCHBLANK)}></td>
                      ))}
                      <td style={isOff ? squareCellOffRow : squareWithImage(IMG_MATCHBLANK)}></td>
                      <td style={isOff ? squareCellOffRow : squareCell}></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* Match Overview (non-print) */}
      <h2 className="no-print" style={{ marginTop:24 }}>Match Overview</h2>
      <div className="no-print" style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr style={{ background:'#f3f4f6' }}>
              <th style={{ border:'1px solid #e5e7eb', padding:6 }}>Round</th>
              <th style={{ border:'1px solid #e5e7eb', padding:6 }}>Board</th>
              <th style={{ border:'1px solid #e5e7eb', padding:6 }}>Group</th>
              <th style={{ border:'1px solid #e5e7eb', padding:6 }}>Player A</th>
              <th style={{ border:'1px solid #e5e7eb', padding:6 }}>Player B</th>
            </tr>
          </thead>
          <tbody>
            {schedule.flat().sort((a,b)=> a.round - b.round || a.board - b.board).map((m,i)=>(
              <tr key={i}>
                <td style={{ border:'1px solid #e5e7eb', padding:6 }}>{m.round}</td>
                <td style={{ border:'1px solid #e5e7eb', padding:6 }}>{m.board}</td>
                <td style={{ border:'1px solid #e5e7eb', padding:6 }}>{m.group ?? ''}</td>
                <td style={{ border:'1px solid #e5e7eb', padding:6 }}>{m.A}</td>
                <td style={{ border:'1px solid #e5e7eb', padding:6 }}>{m.B}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals (non-print) */}
      <h2 className="no-print" style={{ marginTop:24 }}>Player Game Totals</h2>
      <div className="no-print" style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr style={{ background:'#f3f4f6' }}>
              <th style={{ border:'1px solid #e5e7eb', padding:6 }}>Player</th>
              <th style={{ border:'1px solid #e5e7eb', padding:6 }}>Group</th>
              <th style={{ border:'1px solid #e5e7eb', padding:6 }}>Games Scheduled</th>
            </tr>
          </thead>
          <tbody>
            {[...players].sort((a,b)=> (playerGroupMap[a]||0)-(playerGroupMap[b]||0)).map(p => (
              <tr key={p}>
                <td style={{ border:'1px solid #e5e7eb', padding:6 }}>{p}</td>
                <td style={{ border:'1px solid #e5e7eb', padding:6 }}>{playerGroupMap[p]}</td>
                <td style={{ border:'1px solid #e5e7eb', padding:6 }}>{totals[p] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}