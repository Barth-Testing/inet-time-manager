'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { format, getDay } from 'date-fns'
import { de } from 'date-fns/locale'

interface TimeWindow {
  start: string
  end: string
}

interface DeviceStatus {
  hostName: string
  ipAddress: string
  wanAccess: string
  timeUsed: number
  timeMax: number
}

const MINUTES = ['00', '15', '30', '45']

function getTimeOptions(start: string, end: string) {
  const options: string[] = []
  const [startH, startM] = start.split(':').map(Number)
  const [endH, endM] = end.split(':').map(Number)

  for (let h = startH; h <= endH; h++) {
    const hour = String(h).padStart(2, '0')
    const isLast = h === endH
    const isFirst = h === startH

    for (const m of MINUTES) {
      if (isFirst && Number(m) < startM) continue
      if (isLast && (m !== '00' || endM === 0)) {
        if (h === startH && Number(m) > endM) continue
        if (h > startH && m !== '00') continue
      }
      if (isLast && Number(m) > endM) continue
      options.push(`${hour}:${m}`)
    }
  }

  return options
}

function nowMinutes() {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

function parseTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function formatDuration(min: number) {
  const h = Math.floor(Math.abs(min) / 60)
  const m = Math.abs(min) % 60
  return `${h}h ${m}min`
}

export default function HomePage() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const dayOfWeek = getDay(new Date())
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
  const dayName = format(new Date(), 'EEEE', { locale: de })

  const [timeWindows, setTimeWindows] = useState<TimeWindow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [success, setSuccess] = useState('')
  const [showParentDialog, setShowParentDialog] = useState(false)
  const [parentCode, setParentCode] = useState('')
  const [parentError, setParentError] = useState('')
  const [pendingAction, setPendingAction] = useState<'holiday' | 'override' | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [devices, setDevices] = useState<DeviceStatus[]>([])
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const [nowMin, setNowMin] = useState(nowMinutes)

  const allowedStart = '10:00'
  const allowedEnd = isWeekend ? '23:30' : '21:30'
  const maxHours = isWeekend ? 4.5 : 3
  const maxMin = maxHours * 60

  const allTimeOptions = useMemo(() => getTimeOptions(allowedStart, allowedEnd), [allowedStart, allowedEnd])

  useEffect(() => {
    loadSchedule()
    const tick = setInterval(() => setNowMin(nowMinutes()), 60000)
    return () => clearInterval(tick)
  }, [])

  async function loadSchedule() {
    try {
      const res = await fetch(`/api/schedule?date=${today}`)
      const result = await res.json()
      if (result.success && result.data?.timeWindows?.length) {
        setTimeWindows(result.data.timeWindows)
      } else {
        setTimeWindows([{ start: '14:00', end: '15:00' }])
      }
    } catch {
      setTimeWindows([{ start: '14:00', end: '15:00' }])
    } finally {
      setLoading(false)
    }
  }

  function isFuture(window: TimeWindow) {
    return parseTime(window.start) > nowMin
  }

  function isRunning(window: TimeWindow) {
    return parseTime(window.start) <= nowMin && nowMin < parseTime(window.end)
  }

  function isPast(window: TimeWindow) {
    return nowMin >= parseTime(window.end)
  }

  const calcRemainingTotal = useCallback((windows: TimeWindow[]) => {
    let total = 0
    for (const w of windows) {
      if (isPast(w)) continue
      const startMin = parseTime(w.start)
      const endMin = parseTime(w.end)
      if (isRunning(w)) {
        total += endMin - nowMin
      } else {
        total += endMin - startMin
      }
    }
    return Math.max(0, total)
  }, [nowMin])

  const [totalMinutes, setTotalMinutes] = useState(0)

  useEffect(() => {
    setTotalMinutes(calcRemainingTotal(timeWindows))
  }, [timeWindows, calcRemainingTotal, nowMin])

  const addWindow = () => {
    const last = timeWindows[timeWindows.length - 1]
    let start = '14:00'
    let end = '15:00'
    if (last) {
      const [h, m] = last.end.split(':').map(Number)
      if (h < 21 || (h === 21 && m < 30)) {
        const newH = Math.min(h + 1, 21)
        start = `${String(newH).padStart(2, '0')}:00`
        end = `${String(newH).padStart(2, '0')}:30`
      }
    }
    setTimeWindows([...timeWindows, { start, end }])
  }

  const removeWindow = (index: number) => {
    if (timeWindows.length <= 1) return
    setTimeWindows(timeWindows.filter((_, i) => i !== index))
  }

  const updateWindow = (index: number, field: 'start' | 'end', value: string) => {
    setTimeWindows(prev => prev.map((w, i) => i !== index ? w : { ...w, [field]: value }))
  }

  const getEndOptions = (start: string) => {
    return getTimeOptions(start, allowedEnd).filter(t => t > start)
  }

  const validateWindows = (): string | null => {
    for (const w of timeWindows) {
      if (w.start >= w.end) {
        return `Startzeit muss vor Endzeit liegen (${w.start} - ${w.end})`
      }
      if (w.start < allowedStart || w.end > allowedEnd) {
        return `Zeiten müssen zwischen ${allowedStart} und ${allowedEnd} Uhr liegen`
      }
    }

    const sorted = [...timeWindows].sort((a, b) => a.start.localeCompare(b.start))
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].end > sorted[i + 1].start) {
        return 'Zeitfenster dürfen sich nicht überschneiden'
      }
    }

    return null
  }

  const handleSave = async () => {
    setError('')
    setWarnings([])
    setSuccess('')

    const validationError = validateWindows()
    if (validationError) {
      setError(validationError)
      return
    }

    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today, timeWindows, isHolidayMode: false }),
      })

      const result = await res.json()
      if (!result.success) {
        setError(result.error)
        if (result.warnings) setWarnings(result.warnings)
        return
      }

      setSuccess('Zeiten gespeichert!')
      if (result.warnings) setWarnings(result.warnings)
    } catch {
      setError('Fehler beim Speichern')
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    setError('')
    setSuccess('')
    setSyncStatus(null)
    setDevices([])

    try {
      const now = new Date()
      const hh = String(now.getHours()).padStart(2, '0')
      const mm = String(now.getMinutes()).padStart(2, '0')
      const res = await fetch('/api/fritzbox/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today, currentTime: `${hh}:${mm}` }),
      })

      const result = await res.json()
      if (!result.success) {
        setError(result.error)
        return
      }

      const action = result.data?.action === 'granted' ? 'Zugriff erlaubt' : 'Zugriff gesperrt'
      setSyncStatus(action)
      if (result.data?.devices) setDevices(result.data.devices)
      setSuccess(`Zeiten in Fritzbox übertragen (${action})`)
    } catch {
      setError('Sync fehlgeschlagen')
    } finally {
      setSyncing(false)
    }
  }

  const handleCheckStatus = async () => {
    setCheckingStatus(true)
    setError('')
    try {
      const res = await fetch('/api/fritzbox/status')
      const result = await res.json()
      if (!result.success) { setError(result.error); return }
      if (result.data?.devices) setDevices(result.data.devices)
    } catch {
      setError('Status abfragen fehlgeschlagen')
    } finally {
      setCheckingStatus(false)
    }
  }

  const handleParentVerify = async () => {
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: parentCode }),
      })

      const result = await res.json()
      if (!result.success) {
        setParentError('Falscher Code')
        return
      }

      setParentError('')
      setShowParentDialog(false)
      if (pendingAction === 'override') {
        setSuccess('Freigabe erteilt')
      }
      setPendingAction(null)
      setParentCode('')
    } catch {
      setParentError('Fehler bei Überprüfung')
    }
  }

  const handleHolidayMode = () => {
    setPendingAction('holiday')
    setShowParentDialog(true)
  }

  if (loading) {
    return <div className="text-center text-muted-foreground py-8">Lade...</div>
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">{dayName}, {format(new Date(), 'dd.MM.yyyy')}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Erlaubte Zeiten: {allowedStart} - {allowedEnd} Uhr · Max: {maxHours}h
        </p>
      </div>

      <div className="bg-card border rounded-lg p-4 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold">Zeitfenster</h2>
          <button onClick={addWindow} className="text-sm text-primary hover:underline">
            + Fenster hinzufügen
          </button>
        </div>

        <div className="space-y-3">
          {timeWindows.map((window, i) => {
            const future = isFuture(window)
            const running = isRunning(window)
            const past = isPast(window)
            const locked = !future

            return (
              <div key={i} className={`flex items-center gap-3 ${locked ? 'opacity-70' : ''}`}>
                <select
                  value={window.start}
                  onChange={(e) => updateWindow(i, 'start', e.target.value)}
                  disabled={locked}
                  className={`border rounded px-2 py-1.5 text-sm bg-background ${locked ? 'cursor-not-allowed' : ''}`}
                >
                  {allTimeOptions.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <span className="text-muted-foreground">bis</span>
                <select
                  value={window.end}
                  onChange={(e) => updateWindow(i, 'end', e.target.value)}
                  disabled={locked}
                  className={`border rounded px-2 py-1.5 text-sm bg-background ${locked ? 'cursor-not-allowed' : ''}`}
                >
                  {getEndOptions(window.start).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {running && (
                  <span className="text-xs text-green-600 font-medium whitespace-nowrap">läuft</span>
                )}
                {past && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">abgelaufen</span>
                )}
                {future && timeWindows.length > 1 && (
                  <button
                    onClick={() => removeWindow(i)}
                    className="text-destructive hover:text-destructive/80 text-sm ml-1"
                  >
                    ✕
                  </button>
                )}
                {locked && timeWindows.length > 1 && (
                  <span className="text-muted-foreground text-xs ml-1">🔒</span>
                )}
              </div>
            )
          })}
        </div>

        <div className="border-t pt-3 flex items-center justify-between">
          <span className="text-sm font-medium">Verbleibend: {formatDuration(totalMinutes)}</span>
          <div className="h-2 bg-muted rounded-full flex-1 mx-4 max-w-xs">
            <div
              className={`h-full rounded-full transition-all ${
                totalMinutes > maxMin ? 'bg-destructive' : totalMinutes > maxMin * 0.9 ? 'bg-yellow-500' : 'bg-primary'
              }`}
              style={{ width: `${Math.min((totalMinutes / maxMin) * 100, 100)}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {formatDuration(Math.max(0, maxMin - totalMinutes))} übrig
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">{error}</div>
      )}
      {warnings.map((w, i) => (
        <div key={i} className="bg-yellow-50 text-yellow-800 rounded-lg p-3 text-sm">⚠ {w}</div>
      ))}
      {success && (
        <div className="bg-green-50 text-green-700 rounded-lg p-3 text-sm">✓ {success}</div>
      )}
      {syncStatus && (
        <div className="bg-blue-50 text-blue-700 rounded-lg p-3 text-sm">
          Fritzbox: {syncStatus === 'Zugriff erlaubt' ? '✅' : '🔒'} {syncStatus}
        </div>
      )}

      {devices.length > 0 && (
        <div className="bg-card border rounded-lg p-3 space-y-2">
          <h3 className="text-sm font-semibold">Fritzbox Geräte-Status</h3>
          {devices.map(d => {
            const allowed = d.wanAccess === '1'
            return (
              <div key={d.ipAddress} className="flex items-center justify-between text-sm">
                <span className="font-medium">{d.hostName || d.ipAddress}</span>
                <span className={allowed ? 'text-green-600' : 'text-red-600'}>
                  {allowed ? '✅ Zugriff erlaubt' : '🔒 Zugriff gesperrt'}
                </span>
                <span className="text-xs text-muted-foreground">
                  Budget: {Math.round(d.timeUsed / 60)}/{Math.round(d.timeMax / 60)}min
                </span>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          className="flex-1 bg-primary text-primary-foreground rounded-lg py-2.5 font-medium hover:bg-primary/90 transition-colors"
        >
          Speichern
        </button>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex-1 bg-secondary text-secondary-foreground rounded-lg py-2.5 font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50"
        >
          {syncing ? 'Übertrage...' : 'In Fritzbox übertragen'}
        </button>
        <button
          onClick={handleCheckStatus}
          disabled={checkingStatus}
          className="border rounded-lg px-3 py-2.5 text-sm hover:bg-accent transition-colors disabled:opacity-50"
          title="Aktuellen Status von der Fritzbox abrufen"
        >
          {checkingStatus ? '...' : '🔄 Status'}
        </button>
      </div>

      <details className="text-sm border rounded-lg">
        <summary className="px-4 py-2 cursor-pointer text-muted-foreground hover:text-foreground">
          Eltern-Zugriff (Code erforderlich)
        </summary>
        <div className="px-4 pb-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Hier können Ausnahmen eingerichtet werden.
          </p>
          <button
            onClick={handleHolidayMode}
            className="block w-full text-left px-3 py-2 rounded bg-accent hover:bg-accent/80 transition-colors"
          >
            Ferienmodus aktivieren (10:00 - 23:30, 4.5h)
          </button>
        </div>
      </details>

      {showParentDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <h3 className="font-semibold">Eltern-Code erforderlich</h3>
            <p className="text-sm text-muted-foreground">
              Bitte gib den Eltern-Code ein, um diese Aktion zu bestätigen.
            </p>
            <input
              type="password"
              value={parentCode}
              onChange={(e) => { setParentCode(e.target.value); setParentError('') }}
              placeholder="Code eingeben"
              className="w-full border rounded-lg px-3 py-2 text-lg tracking-widest text-center bg-background"
              maxLength={20}
              autoFocus
            />
            {parentError && (<p className="text-destructive text-sm">{parentError}</p>)}
            <div className="flex gap-2">
              <button
                onClick={() => { setShowParentDialog(false); setParentCode(''); setParentError(''); setPendingAction(null) }}
                className="flex-1 border rounded-lg py-2 text-sm hover:bg-accent transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleParentVerify}
                className="flex-1 bg-primary text-primary-foreground rounded-lg py-2 text-sm hover:bg-primary/90 transition-colors"
              >
                Bestätigen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
