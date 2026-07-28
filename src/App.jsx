import { useState, useRef } from 'react'
import './App.css'

const COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
]

function round1(n) {
  return Math.round(n * 10) / 10
}

// Fixes floating point drift so odds always sum to exactly 100.
function fixDrift(players, priorityId) {
  const total = players.reduce((s, p) => s + p.odds, 0)
  const drift = round1(100 - total)
  if (drift === 0) return players

  let targetId = priorityId
  if (!targetId || !players.find((p) => p.id === targetId && !p.locked)) {
    const candidate = [...players]
      .filter((p) => !p.locked)
      .sort((a, b) => b.odds - a.odds)[0]
    targetId = candidate ? candidate.id : players[players.length - 1]?.id
  }

  return players.map((p) =>
    p.id === targetId ? { ...p, odds: round1(p.odds + drift) } : p,
  )
}

// Splits `amount` equally among `targets`, keeping them all in sync.
function distribute(targets, amount) {
  if (targets.length === 0) return {}
  const share = round1(amount / targets.length)
  const result = {}
  targets.forEach((p) => {
    result[p.id] = share
  })
  return result
}

let idCounter = 0
function nextId() {
  idCounter += 1
  return idCounter
}

function makePlayer(name, odds) {
  return { id: nextId(), name, odds: round1(odds), locked: false }
}

function App() {
  const [players, setPlayers] = useState(() => [])
  const [winner, setWinner] = useState(null)
  const [spinning, setSpinning] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newPlayerName, setNewPlayerName] = useState('')
  const spinTimeout = useRef(null)

  const colorFor = (id) => {
    const idx = players.findIndex((p) => p.id === id)
    return COLORS[idx % COLORS.length]
  }

  function openAddModal() {
    setNewPlayerName(`Jugador ${players.length + 1}`)
    setShowAddModal(true)
  }

  function confirmAddPlayer(e) {
    e.preventDefault()
    addPlayer(newPlayerName.trim() || `Jugador ${players.length + 1}`)
    setShowAddModal(false)
  }

  function addPlayer(name) {
    setWinner(null)
    setPlayers((prev) => {
      const lockedSum = prev
        .filter((p) => p.locked)
        .reduce((s, p) => s + p.odds, 0)
      const unlocked = prev.filter((p) => !p.locked)
      const pool = round1(100 - lockedSum)
      const count = unlocked.length + 1
      const shareForNew = round1(pool / count)
      const remainingForOthers = round1(pool - shareForNew)

      const newValues = distribute(unlocked, remainingForOthers)
      const updated = prev.map((p) =>
        p.locked ? p : { ...p, odds: newValues[p.id] ?? 0 },
      )

      const newPlayer = makePlayer(name, shareForNew)
      return fixDrift([...updated, newPlayer], newPlayer.id)
    })
  }

  function resetAll() {
    setWinner(null)
    setPlayers((prev) => {
      if (prev.length === 0) return prev
      const share = round1(100 / prev.length)
      const updated = prev.map((p) => ({ ...p, odds: share, locked: false }))
      return fixDrift(updated)
    })
  }

  function removePlayer(id) {
    setWinner(null)
    setPlayers((prev) => {
      const removed = prev.find((p) => p.id === id)
      const remaining = prev.filter((p) => p.id !== id)
      if (!removed || remaining.length === 0) return remaining

      const unlocked = remaining.filter((p) => !p.locked)
      if (unlocked.length === 0) {
        const updated = remaining.map((p, i) =>
          i === 0 ? { ...p, odds: round1(p.odds + removed.odds) } : p,
        )
        return fixDrift(updated, updated[0]?.id)
      }

      const newValues = distribute(unlocked, round1(removed.odds + unlocked.reduce((s, p) => s + p.odds, 0)))
      const updated = remaining.map((p) =>
        p.locked ? p : { ...p, odds: newValues[p.id] ?? p.odds },
      )
      return fixDrift(updated)
    })
  }

  function toggleLock(id) {
    setPlayers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, locked: !p.locked } : p)),
    )
  }

  function renamePlayer(id, name) {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)))
  }

  function changeOdds(id, rawValue) {
    setWinner(null)
    setPlayers((prev) => {
      const target = prev.find((p) => p.id === id)
      if (!target) return prev

      const lockedOthersSum = prev
        .filter((p) => p.locked && p.id !== id)
        .reduce((s, p) => s + p.odds, 0)
      const maxAllowed = round1(100 - lockedOthersSum)

      let newValue = round1(Number(rawValue))
      if (Number.isNaN(newValue)) newValue = target.odds
      newValue = Math.min(Math.max(newValue, 0), Math.max(maxAllowed, 0))

      const unlockedOthers = prev.filter((p) => p.id !== id && !p.locked)

      if (unlockedOthers.length === 0) {
        // Nothing else to absorb the difference, this player takes the full pool.
        const updated = prev.map((p) =>
          p.id === id ? { ...p, odds: maxAllowed } : p,
        )
        return fixDrift(updated, id)
      }

      const remaining = round1(maxAllowed - newValue)
      const newOthers = distribute(unlockedOthers, remaining)

      const updated = prev.map((p) => {
        if (p.id === id) return { ...p, odds: newValue }
        if (p.locked) return p
        return { ...p, odds: newOthers[p.id] ?? 0 }
      })

      return fixDrift(updated, id)
    })
  }

  function fillPercent(value, max) {
    if (max <= 0) return 0
    return Math.min(100, Math.max(0, (value / max) * 100))
  }

  function maxFor(id) {
    const lockedOthersSum = players
      .filter((p) => p.locked && p.id !== id)
      .reduce((s, p) => s + p.odds, 0)
    return round1(100 - lockedOthersSum)
  }

  function spin() {
    if (players.length === 0 || spinning) return
    setSpinning(true)
    setWinner(null)

    let r = Math.random() * 100
    let chosen = players[players.length - 1]
    for (const p of players) {
      if (r < p.odds) {
        chosen = p
        break
      }
      r -= p.odds
    }

    let ticks = 0
    const maxTicks = 18
    const tick = () => {
      ticks += 1
      const flash = players[Math.floor(Math.random() * players.length)]
      setWinner({ ...flash, isFinal: false })
      if (ticks < maxTicks) {
        const delay = 60 + ticks * 12
        spinTimeout.current = setTimeout(tick, delay)
      } else {
        setWinner({ ...chosen, isFinal: true })
        setSpinning(false)
      }
    }
    tick()
  }

  const total = round1(players.reduce((s, p) => s + p.odds, 0))

  return (
    <div className="app">
      <header className="app-header">
        <h1>SorteOdds</h1>
        <p className="subtitle">Configurá las probabilidades y sorteá un ganador</p>
      </header>

      <div className="players">
        {players.length === 0 && (
          <p className="empty-state">Todavía no agregaste jugadores.</p>
        )}
        {players.map((p) => {
          const color = colorFor(p.id)
          const max = maxFor(p.id)
          const disabled = players.filter((x) => x.id !== p.id && !x.locked).length === 0
          return (
            <div className="player-row" key={p.id} style={{ '--accent': color }}>
              <div className="player-top">
                <span className="swatch" style={{ background: color }} />
                <input
                  className="name-input"
                  type="text"
                  value={p.name}
                  onChange={(e) => renamePlayer(p.id, e.target.value)}
                />
                <label className="lock-label">
                  <input
                    type="checkbox"
                    checked={p.locked}
                    onChange={() => toggleLock(p.id)}
                  />
                  Fijar
                </label>
                <button
                  className="remove-btn"
                  onClick={() => removePlayer(p.id)}
                  aria-label={`Eliminar ${p.name}`}
                >
                  ×
                </button>
              </div>
              <div className="player-controls">
                <input
                  type="range"
                  min="0"
                  max={Math.max(max, 0)}
                  step="0.1"
                  value={p.odds}
                  disabled={disabled}
                  onChange={(e) => changeOdds(p.id, e.target.value)}
                  style={{
                    background: `linear-gradient(to right, var(--accent) ${fillPercent(p.odds, max)}%, color-mix(in srgb, var(--accent) 25%, transparent) ${fillPercent(p.odds, max)}%)`,
                  }}
                />
                <div className="odds-value">
                  <input
                    type="number"
                    min="0"
                    max={Math.max(max, 0)}
                    step="0.1"
                    value={p.odds}
                    disabled={disabled}
                    onChange={(e) => changeOdds(p.id, e.target.value)}
                  />
                  <span>%</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="toolbar">
        <div className="toolbar-actions">
          <button className="add-btn" onClick={openAddModal}>+ Agregar jugador</button>
          <button className="reset-btn" onClick={resetAll} disabled={players.length === 0}>
            Resetear odds
          </button>
        </div>
        <span className={`total ${total === 100 ? 'ok' : 'warn'}`}>
          Total: {total}%
        </span>
      </div>

      <button
        className="spin-btn"
        onClick={spin}
        disabled={players.length === 0 || spinning}
      >
        {spinning ? 'Sorteando...' : 'Sortear'}
      </button>

      {winner && (
        <div className={`winner-banner ${winner.isFinal ? 'final' : ''}`} style={{ '--accent': colorFor(winner.id) }}>
          {winner.isFinal ? '🏆 Ganador: ' : ''}{winner.name}
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={confirmAddPlayer}
          >
            <h2>Nuevo jugador</h2>
            <input
              autoFocus
              type="text"
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              placeholder="Nombre del jugador"
            />
            <div className="modal-actions">
              <button type="button" className="modal-cancel" onClick={() => setShowAddModal(false)}>
                Cancelar
              </button>
              <button type="submit" className="modal-confirm">
                Agregar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

export default App
