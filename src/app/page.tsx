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
  disallow: string
  timeUsed: number
  timeMax: number
}

interface SyncStatus {
  status: string
  lastSync: string | null
  detail: string | null
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
  if (m === 0) return `${h}h`
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
  const [syncStatus, setSyncStatus] = useState<{ time: string; action: string } | null>(null)
  const [nowMin, setNowMin] = useState(nowMinutes)
  const [lastAutoSync, setLastAutoSync] = useState<SyncStatus | null>(null)

  const allowedStart = '10:00'
  const allowedEnd = isWeekend ? '23:30' : '21:30'
  const maxHours = isWeekend ? 4.5 : 3
  const maxMin = maxHours * 60

  const allTimeOptions = useMemo(() => getTimeOptions(allowedStart, allowedEnd), [allowedStart, allowedEnd])

  useEffect(() => {
    loadSchedule()
    checkSyncStatus()
    const tick = setInterval(() => {
      setNowMin(nowMinutes())
      checkSyncStatus()
    }, 30000)
    return () => clearInterval(tick)
  }, [])

  async function checkSyncStatus() {
    try {
      const res = await fetch('/api/sync-log?date=' + today)
      const result = await res.json()
      if (result.success && result.data?.length > 0) {
        const last = result.data[result.data.length - 1]
        setLastAutoSync({
          status: last.success ? 'success' : 'error',
          lastSync: last.createdAt,
          detail: last.errorMessage,
        })
      }
    } catch {}
  }

  async function loadSchedule() {
    try {
      const res = await fetch(`/api/schedule?date=${today}`)
      const result = await res.json()
      if (result.success && result.data?.timeWindows?.length) {
        setTimeWindows(result.data.timeWindows)
      } else {
        setTimeWindows([])
      }
    } catch {
      setTimeWindows([])
    } finally {
      setLoading(false)
    }
  }

  function isRunning(window: TimeWindow) {
    return parseTime(window.start) <= nowMin && nowMin < parseTime(window.end)
  }

  function isPast(window: TimeWindow) {
    return nowMin >= parseTime(window.end)
  }

  function isEditable(window: TimeWindow) {
    return !isRunning(window)
  }

  const calcTotalMinutes = useCallback((windows: TimeWindow[]) => {
    let total = 0
    for (const w of windows) {
      const startMin = parseTime(w.start)
      const endMin = parseTime(w.end)
      total += endMin - startMin
    }
    return total
  }, [])

  const [totalMinutes, setTotalMinutes] = useState(0)

  useEffect(() => {
    setTotalMinutes(calcTotalMinutes(timeWindows))
  }, [timeWindows, calcTotalMinutes])

  const addWindow = () => {
    if (calcTotalMinutes(timeWindows) >= maxMin) return
    const last = timeWindows[timeWindows.length - 1]
    let start: string, end: string
    if (last) {
      const [h, m] = last.end.split(':').map(Number)
      const [ah, am] = allowedEnd.split(':').map(Number)
      if (h < ah || (h === ah && m < am)) {
        const newH = Math.min(h + 1, ah)
        start = `${String(newH).padStart(2, '0')}:00`
        const newEndH = Math.min(newH + 1, ah)
        const newEndM = newEndH === ah ? am : 30
        end = `${String(newEndH).padStart(2, '0')}:${String(newEndM).padStart(2, '0')}`
      } else {
        return
      }
    } else {
      start = getDefaultStart()
      const [sh] = start.split(':').map(Number)
      const [ah] = allowedEnd.split(':').map(Number)
      const endH = Math.min(sh + 1, ah)
      end = `${String(endH).padStart(2, '0')}:00`
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

    const total = calcTotalMinutes(timeWindows)
    if (total > maxMin) {
      return `Gesamtzeit (${formatDuration(total)}) überschreitet Maximum von ${maxHours}h`
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

      // Auto-sync to Fritzbox after save
      setSyncing(true)
      try {
        const now = new Date()
        const hh = String(now.getHours()).padStart(2, '0')
        const mm = String(now.getMinutes()).padStart(2, '0')
        const syncRes = await fetch('/api/fritzbox/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: today, currentTime: `${hh}:${mm}` }),
        })
        const syncResult = await syncRes.json()
        if (syncResult.success) {
          const action = syncResult.data?.action === 'granted' ? 'freigegeben' : 'gesperrt'
          setSyncStatus({ time: `${hh}:${mm}`, action })
          if (syncResult.data?.devices) setDevices(syncResult.data.devices)
          setSuccess(`Zeiten gespeichert und in Fritzbox übertragen (${action})`)
        } else {
          setWarnings(prev => [...prev, 'Sync fehlgeschlagen: ' + (syncResult.error || 'unbekannter Fehler')])
        }
      } catch {
        setWarnings(prev => [...prev, 'Auto-Sync fehlgeschlagen, Fritzbox nicht erreichbar?'])
      } finally {
        setSyncing(false)
      }
    } catch {
      setError('Fehler beim Speichern')
    }
  }

  const handleManualSync = async () => {
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

      const action = result.data?.action === 'granted' ? 'freigegeben' : 'gesperrt'
      setSyncStatus({ time: `${hh}:${mm}`, action })
      if (result.data?.devices) setDevices(result.data.devices)
      setSuccess(`Fritzbox Sync erfolgreich (${action})`)
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
      if (pendingAction === 'holiday') {
        setSuccess('Ferienmodus aktiviert (kommt in zukünftiger Version)')
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

  function getDefaultStart(): string {
    const now = new Date()
    const h = now.getHours()
    const m = now.getMinutes()
    const roundedMin = Math.ceil(m / 15) * 15
    if (roundedMin >= 60) {
      return `${String(Math.min(h + 1, 21)).padStart(2, '0')}:00`
    }
    return `${String(h).padStart(2, '0')}:${String(roundedMin).padStart(2, '0')}`
  }

  const suggestedStart = getDefaultStart()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">{dayName}, {format(new Date(), 'dd.MM.yyyy')}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Erlaubte Zeiten: {allowedStart} - {allowedEnd} Uhr &middot; Max: {maxHours}h
        </p>
      </div>

      {lastAutoSync && (
        <div className={`rounded-lg p-3 text-sm flex items-center gap-2 ${
          lastAutoSync.status === 'success'
            ? 'bg-green-50 text-green-700'
            : lastAutoSync.status === 'error'
            ? 'bg-red-50 text-red-700'
            : 'bg-blue-50 text-blue-700'
        }`}>
          <span className="text-lg">
            {lastAutoSync.status === 'success' ? '✓' : lastAutoSync.status === 'error' ? '✗' : '⟳'}
          </span>
          <span>
            Auto-Sync:{' '}
            {lastAutoSync.detail || (lastAutoSync.status === 'success' ? 'Aktiv' : 'Fehler')}
            {lastAutoSync.lastSync && (
              <span className="text-xs ml-1 opacity-70">
                ({format(new Date(lastAutoSync.lastSync), 'HH:mm')} Uhr)
              </span>
            )}
          </span>
        </div>
      )}

      <div className="bg-card border rounded-lg p-4 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold">Zeitfenster</h2>
          <button onClick={addWindow} disabled={calcTotalMinutes(timeWindows) >= maxMin} className="text-sm text-primary hover:underline font-medium disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed">
            + Zeitfenster hinzufügen
          </button>
        </div>

        <div className="space-y-3">
          {timeWindows.map((window, i) => {
            const running = isRunning(window)
            const past = isPast(window)
            const editable = isEditable(window)

            return (
              <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border ${
                running ? 'bg-green-50 border-green-200' :
                past ? 'bg-gray-50 border-gray-200' :
                'hover:bg-accent/50'
              }`}>
                <select
                  value={window.start}
                  onChange={(e) => updateWindow(i, 'start', e.target.value)}
                  disabled={!editable}
                  className={`border rounded px-2 py-1.5 text-sm bg-background ${!editable ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  {allTimeOptions.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <span className="text-muted-foreground">bis</span>
                <select
                  value={window.end}
                  onChange={(e) => updateWindow(i, 'end', e.target.value)}
                  disabled={!editable}
                  className={`border rounded px-2 py-1.5 text-sm bg-background ${!editable ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  {getEndOptions(window.start).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {running && (
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                    Läuft
                  </span>
                )}
                {past && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full whitespace-nowrap">
                    Abgelaufen
                  </span>
                )}
                {editable && timeWindows.length > 1 && (
                  <button
                    onClick={() => removeWindow(i)}
                    className="text-destructive hover:text-destructive/80 text-sm ml-auto p-1"
                    title="Entfernen"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                )}
                {!editable && (
                  <span className="text-muted-foreground text-xs ml-auto px-1">
                    {past ? '✓' : '🔒'}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {timeWindows.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <p className="text-sm">Noch keine Zeitfenster für heute.</p>
            <p className="text-xs mt-1">Füge ein Fenster hinzu, um die Spielzeit zu planen.</p>
          </div>
        )}

        <div className="border-t pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Geplant: {formatDuration(totalMinutes)}</span>
            <span className={`text-xs font-medium ${
              totalMinutes > maxMin ? 'text-destructive' :
              totalMinutes > maxMin * 0.9 ? 'text-yellow-600' :
              'text-muted-foreground'
            }`}>
              {formatDuration(Math.max(0, maxMin - totalMinutes))} übrig
            </span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                totalMinutes > maxMin ? 'bg-destructive' :
                totalMinutes > maxMin * 0.9 ? 'bg-yellow-500' :
                'bg-primary'
              }`}
              style={{ width: `${Math.min((totalMinutes / maxMin) * 100, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm flex items-start gap-2">
          <span className="mt-0.5">✗</span>
          <span>{error}</span>
        </div>
      )}
      {warnings.map((w, i) => (
        <div key={i} className="bg-yellow-50 text-yellow-800 rounded-lg p-3 text-sm flex items-start gap-2">
          <span className="mt-0.5">⚠</span>
          <span>{w}</span>
        </div>
      ))}
      {success && (
        <div className="bg-green-50 text-green-700 rounded-lg p-3 text-sm flex items-start gap-2">
          <span className="mt-0.5">✓</span>
          <span>{success}</span>
        </div>
      )}
      {syncStatus && (
        <div className={`rounded-lg p-3 text-sm flex items-start gap-2 ${
          syncStatus.action === 'freigegeben' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'
        }`}>
          <span className="mt-0.5">{syncStatus.action === 'freigegeben' ? '✓' : '🔒'}</span>
          <div>
            <div>Fritzbox: Zugriff {syncStatus.action} (um {syncStatus.time} Uhr)</div>
          </div>
        </div>
      )}

      {devices.length > 0 && (
        <div className="bg-card border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30">
            <h3 className="text-sm font-semibold">Fritzbox Geräte-Status</h3>
          </div>
          <div className="divide-y">
            {devices.map(d => {
              const allowed = d.disallow === '0'
              return (
                <div key={d.ipAddress} className="px-4 py-3 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{d.hostName || d.ipAddress}</span>
                    <span className="text-xs text-muted-foreground">{d.ipAddress}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium ${allowed ? 'text-green-600' : 'text-red-600'}`}>
                      {allowed ? 'Zugriff erlaubt' : 'Zugriff gesperrt'}
                    </span>
                    <span className={`w-2 h-2 rounded-full ${allowed ? 'bg-green-500' : 'bg-red-500'}`} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={syncing}
          className="flex-1 bg-primary text-primary-foreground rounded-lg py-2.5 font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {syncing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Speichere &amp; Sync...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              Speichern &amp; Sync
            </>
          )}
        </button>
        <button
          onClick={handleManualSync}
          disabled={syncing}
          className="bg-secondary text-secondary-foreground rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50 flex items-center gap-2"
          title="Manuell mit Fritzbox synchronisieren"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
          Sync
        </button>
        <button
          onClick={handleCheckStatus}
          disabled={checkingStatus}
          className="border rounded-lg px-4 py-2.5 text-sm hover:bg-accent transition-colors disabled:opacity-50 flex items-center gap-2"
          title="Aktuellen Status von der Fritzbox abrufen"
        >
          {checkingStatus ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          )}
          Status
        </button>
      </div>

      <details className="text-sm border rounded-lg group">
        <summary className="px-4 py-3 cursor-pointer text-muted-foreground hover:text-foreground font-medium flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Eltern-Bereich (Code erforderlich)
        </summary>
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Hier können Ausnahmen wie der Ferienmodus eingerichtet werden. Der Ferienmodus erlaubt Zeiten von 10:00 bis 23:30 Uhr mit bis zu 4,5 Stunden täglich.
          </p>
          <button
            onClick={handleHolidayMode}
            className="block w-full text-left px-3 py-2.5 rounded-lg bg-accent hover:bg-accent/80 transition-colors font-medium"
          >
            Ferienmodus aktivieren (10:00 - 23:30, 4,5h)
          </button>
        </div>
      </details>

      {showParentDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl p-6 max-w-sm w-full mx-4 space-y-4 shadow-xl">
            <h3 className="font-semibold text-lg">Eltern-Code erforderlich</h3>
            <p className="text-sm text-muted-foreground">
              Bitte gib den Eltern-Code ein, um diese Aktion zu bestätigen.
            </p>
            <input
              type="password"
              value={parentCode}
              onChange={(e) => { setParentCode(e.target.value); setParentError('') }}
              placeholder="Code eingeben"
              className="w-full border rounded-lg px-3 py-2.5 text-lg tracking-widest text-center bg-background"
              maxLength={20}
              autoFocus
            />
            {parentError && (<p className="text-destructive text-sm text-center">{parentError}</p>)}
            <div className="flex gap-2">
              <button
                onClick={() => { setShowParentDialog(false); setParentCode(''); setParentError(''); setPendingAction(null) }}
                className="flex-1 border rounded-lg py-2.5 text-sm hover:bg-accent transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleParentVerify}
                className="flex-1 bg-primary text-primary-foreground rounded-lg py-2.5 text-sm hover:bg-primary/90 transition-colors"
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
