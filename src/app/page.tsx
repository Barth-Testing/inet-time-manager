'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, getDay, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'

interface TimeWindow {
  start: string
  end: string
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = ['00', '15', '30', '45']

function getTimeOptions(start: string, end: string) {
  const options: string[] = []
  const [startH] = start.split(':').map(Number)
  const [endH] = end.split(':').map(Number)
  
  for (let h = startH; h <= endH; h++) {
    const hour = String(h).padStart(2, '0')
    const mins = h === endH ? [] : MINUTES
    const actualMins = h === endH ? ['00'] : mins
    
    if (h === startH) {
      actualMins.unshift(...MINUTES.filter(m => Number(m) >= Number(start.split(':')[1])))
    }
    
    for (const m of actualMins) {
      options.push(`${hour}:${m}`)
    }
  }
  
  // Add end time
  if (endH >= startH) {
    options.push(end)
  }
  
  return [...new Set(options)]
}

export default function HomePage() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const dayOfWeek = getDay(new Date())
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
  
  const dayName = format(new Date(), 'EEEE', { locale: de })
  
  const [timeWindows, setTimeWindows] = useState<TimeWindow[]>([
    { start: '14:00', end: '15:00' }
  ])
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [success, setSuccess] = useState('')
  const [showParentDialog, setShowParentDialog] = useState(false)
  const [parentCode, setParentCode] = useState('')
  const [parentError, setParentError] = useState('')
  const [pendingAction, setPendingAction] = useState<'holiday' | 'override' | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [totalMinutes, setTotalMinutes] = useState(0)
  
  const allowedStart = isWeekend ? '10:00' : '10:00'
  const allowedEnd = isWeekend ? '23:30' : '21:30'
  const maxHours = isWeekend ? 4.5 : 3
  
  const calcTotal = useCallback((windows: TimeWindow[]) => {
    let total = 0
    for (const w of windows) {
      const [sh, sm] = w.start.split(':').map(Number)
      const [eh, em] = w.end.split(':').map(Number)
      total += (eh * 60 + em) - (sh * 60 + sm)
    }
    return total
  }, [])
  
  useEffect(() => {
    setTotalMinutes(calcTotal(timeWindows))
  }, [timeWindows, calcTotal])
  
  const addWindow = () => {
    setTimeWindows([...timeWindows, { start: '14:00', end: '15:00' }])
  }
  
  const removeWindow = (index: number) => {
    if (timeWindows.length <= 1) return
    setTimeWindows(timeWindows.filter((_, i) => i !== index))
  }
  
  const updateWindow = (index: number, field: 'start' | 'end', value: string) => {
    const updated = timeWindows.map((w, i) => {
      if (i !== index) return w
      return { ...w, [field]: value }
    })
    setTimeWindows(updated)
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
    
    // Check overlap
    const sorted = [...timeWindows].sort((a, b) => a.start.localeCompare(b.start))
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].end > sorted[i + 1].start) {
        return 'Zeitfenster dürfen sich nicht überschneiden'
      }
    }
    
    const total = calcTotal(timeWindows)
    const maxMin = maxHours * 60
    if (total > maxMin) {
      const h = Math.floor(total / 60)
      const m = total % 60
      return `Gesamtzeit (${h}h ${m}min) überschreitet Maximum von ${maxHours}h`
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
        body: JSON.stringify({
          date: today,
          timeWindows,
          isHolidayMode: false,
        }),
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
    
    try {
      const res = await fetch('/api/fritzbox/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today }),
      })
      
      const result = await res.json()
      if (!result.success) {
        setError(result.error)
        return
      }
      
      setSuccess('Zeiten in Fritzbox übertragen!')
    } catch {
      setError('Sync fehlgeschlagen')
    } finally {
      setSyncing(false)
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
      
      // Execute pending action
      if (pendingAction === 'override') {
        // Save with override
        await handleSaveWithOverride(result.token)
      }
      
      setPendingAction(null)
      setParentCode('')
    } catch {
      setParentError('Fehler bei Überprüfung')
    }
  }
  
  const handleSaveWithOverride = async (token: string) => {
    // Placeholder for override logic
    setSuccess('Freigabe erteilt')
  }
  
  const handleHolidayMode = () => {
    setPendingAction('holiday')
    setShowParentDialog(true)
  }
  
  const t = (min: number) => {
    const h = Math.floor(Math.abs(min) / 60)
    const m = Math.abs(min) % 60
    return `${h}h ${m}min`
  }
  
  const maxMin = maxHours * 60
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold">{dayName}, {format(new Date(), 'dd.MM.yyyy')}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Erlaubte Zeiten: {allowedStart} - {allowedEnd} Uhr · Max: {maxHours}h
        </p>
      </div>
      
      {/* Time window entry */}
      <div className="bg-card border rounded-lg p-4 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold">Zeitfenster</h2>
          <button
            onClick={addWindow}
            className="text-sm text-primary hover:underline"
          >
            + Fenster hinzufügen
          </button>
        </div>
        
        <div className="space-y-3">
          {timeWindows.map((window, i) => (
            <div key={i} className="flex items-center gap-3">
              <select
                value={window.start}
                onChange={(e) => updateWindow(i, 'start', e.target.value)}
                className="border rounded px-2 py-1.5 text-sm bg-background"
              >
                {getTimeOptions(allowedStart, allowedEnd).filter(t => !timeWindows.some((w, j) => j !== i && w.start === t && w.end === window.end)).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <span className="text-muted-foreground">bis</span>
              <select
                value={window.end}
                onChange={(e) => updateWindow(i, 'end', e.target.value)}
                className="border rounded px-2 py-1.5 text-sm bg-background"
              >
                {getTimeOptions(window.start, allowedEnd).filter(t => t > window.start).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              {timeWindows.length > 1 && (
                <button
                  onClick={() => removeWindow(i)}
                  className="text-destructive hover:text-destructive/80 text-sm ml-1"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        
        {/* Total time display */}
        <div className="border-t pt-3 flex items-center justify-between">
          <span className="text-sm font-medium">
            Gesamtzeit: {t(totalMinutes)}
          </span>
          <div className="h-2 bg-muted rounded-full flex-1 mx-4 max-w-xs">
            <div
              className={`h-full rounded-full transition-all ${
                totalMinutes > maxMin ? 'bg-destructive' : totalMinutes > maxMin * 0.9 ? 'bg-yellow-500' : 'bg-primary'
              }`}
              style={{ width: `${Math.min((totalMinutes / maxMin) * 100, 100)}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {t(Math.max(0, maxMin - totalMinutes))} übrig
          </span>
        </div>
      </div>
      
      {/* Messages */}
      {error && (
        <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
          {error}
        </div>
      )}
      {warnings.map((w, i) => (
        <div key={i} className="bg-yellow-50 text-yellow-800 rounded-lg p-3 text-sm">
          ⚠ {w}
        </div>
      ))}
      {success && (
        <div className="bg-green-50 text-green-700 rounded-lg p-3 text-sm">
          ✓ {success}
        </div>
      )}
      
      {/* Action buttons */}
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
      </div>
      
      {/* Parent section */}
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
      
      {/* Parent code dialog */}
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
            {parentError && (
              <p className="text-destructive text-sm">{parentError}</p>
            )}
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
