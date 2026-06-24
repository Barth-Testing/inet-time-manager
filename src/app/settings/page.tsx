'use client'

import { useState, useEffect } from 'react'

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    fritzboxHost: 'fritz.box',
    fritzboxUsername: '',
    accessProfileName: 'Kind',
    childDeviceIPs: [] as string[],
    maxHoursSunThu: 3,
    maxHoursFriSat: 4.5,
    allowedStartSunThu: '10:00',
    allowedEndSunThu: '21:30',
    allowedStartFriSat: '10:00',
    allowedEndFriSat: '23:30',
  })

  const [newDeviceIP, setNewDeviceIP] = useState('')
  
  const [currentCode, setCurrentCode] = useState('')
  const [newCode, setNewCode] = useState('')
  const [confirmCode, setConfirmCode] = useState('')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState('')
  
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(result => {
        if (result.success) {
          setSettings(prev => ({ ...prev, ...result.data }))
        }
      })
  }, [])
  
  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      
      const result = await res.json()
      if (result.success) {
        setMessageType('success')
        setMessage('Einstellungen gespeichert')
      } else {
        setMessageType('error')
        setMessage(result.error || 'Fehler beim Speichern')
      }
    } catch {
      setMessageType('error')
      setMessage('Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }
  
  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult('')
    
    try {
      const res = await fetch('/api/fritzbox/test', { method: 'POST' })
      const result = await res.json()
      
      if (result.success) {
        setTestResult('Verbindung erfolgreich! Profile: ' + (result.data?.availableProfiles?.join(', ') || 'Keine'))
        setMessageType('success')
        setMessage('')
      } else {
        setTestResult('')
        setMessageType('error')
        setMessage(result.error || 'Verbindung fehlgeschlagen')
      }
    } catch {
      setMessageType('error')
      setMessage('Fehler bei der Verbindung')
    } finally {
      setTesting(false)
    }
  }
  
  const handleChangeCode = async () => {
    if (newCode !== confirmCode) {
      setMessageType('error')
      setMessage('Codes stimmen nicht überein')
      return
    }
    
    if (newCode.length < 4) {
      setMessageType('error')
      setMessage('Code muss mindestens 4 Zeichen lang sein')
      return
    }
    
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentCode, newCode }),
      })
      
      const result = await res.json()
      if (result.success) {
        setMessageType('success')
        setMessage('Code geändert')
        setCurrentCode('')
        setNewCode('')
        setConfirmCode('')
      } else {
        setMessageType('error')
        setMessage(result.error || 'Fehler beim Ändern')
      }
    } catch {
      setMessageType('error')
      setMessage('Fehler beim Ändern')
    }
  }
  
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Einstellungen</h1>
      
      {message && (
        <div className={`rounded-lg p-3 text-sm ${
          messageType === 'success'
            ? 'bg-green-50 text-green-700'
            : 'bg-red-50 text-red-700'
        }`}>
          {message}
        </div>
      )}
      
      {/* Fritzbox Configuration */}
      <section className="bg-card border rounded-lg p-4 space-y-4">
        <h2 className="font-semibold">Fritzbox Verbindung</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Host</label>
            <input
              type="text"
              value={settings.fritzboxHost}
              onChange={(e) => setSettings({ ...settings, fritzboxHost: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              placeholder="fritz.box"
            />
          </div>
          
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Benutzername</label>
            <input
              type="text"
              value={settings.fritzboxUsername}
              onChange={(e) => setSettings({ ...settings, fritzboxUsername: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              placeholder="Fritzbox Benutzername"
            />
          </div>
          
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Passwort</label>
            <input
              type="password"
              onChange={(e) => setSettings({ ...settings, fritzboxPassword: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              placeholder="Fritzbox Passwort"
            />
          </div>
          
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Access-Profil Name</label>
            <input
              type="text"
              value={settings.accessProfileName}
              onChange={(e) => setSettings({ ...settings, accessProfileName: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              placeholder="Kind"
            />
          </div>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={handleTestConnection}
            disabled={testing}
            className="border rounded-lg px-4 py-2 text-sm hover:bg-accent transition-colors disabled:opacity-50"
          >
            {testing ? 'Teste...' : 'Verbindung testen'}
          </button>
        </div>
        
        {testResult && (
          <div className="text-sm text-green-700">{testResult}</div>
        )}
      </section>
      
      {/* Child Devices */}
      <section className="bg-card border rounded-lg p-4 space-y-4">
        <h2 className="font-semibold">Kind-Geräte</h2>
        <p className="text-sm text-muted-foreground">
          IP-Adressen der Geräte, deren Internetzugriff gesteuert werden soll.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            value={newDeviceIP}
            onChange={(e) => setNewDeviceIP(e.target.value)}
            className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background"
            placeholder="z.B. 192.168.178.62"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newDeviceIP.trim()) {
                if (!settings.childDeviceIPs.includes(newDeviceIP.trim())) {
                  setSettings({
                    ...settings,
                    childDeviceIPs: [...settings.childDeviceIPs, newDeviceIP.trim()],
                  })
                }
                setNewDeviceIP('')
              }
            }}
          />
          <button
            onClick={() => {
              if (newDeviceIP.trim() && !settings.childDeviceIPs.includes(newDeviceIP.trim())) {
                setSettings({
                  ...settings,
                  childDeviceIPs: [...settings.childDeviceIPs, newDeviceIP.trim()],
                })
                setNewDeviceIP('')
              }
            }}
            className="border rounded-lg px-4 py-2 text-sm hover:bg-accent transition-colors"
          >
            Hinzufügen
          </button>
        </div>

        {settings.childDeviceIPs.length > 0 && (
          <div className="space-y-2">
            {settings.childDeviceIPs.map((ip, i) => (
              <div key={i} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
                <span>{ip}</span>
                <button
                  onClick={() => {
                    setSettings({
                      ...settings,
                      childDeviceIPs: settings.childDeviceIPs.filter((_, j) => j !== i),
                    })
                  }}
                  className="text-red-500 hover:text-red-700 transition-colors"
                >
                  Entfernen
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Time Settings */}
      <section className="bg-card border rounded-lg p-4 space-y-4">
        <h2 className="font-semibold">Zeit-Einstellungen</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Max. Stunden (So-Do)</label>
            <input
              type="number"
              step="0.5"
              min="0"
              max="24"
              value={settings.maxHoursSunThu}
              onChange={(e) => setSettings({ ...settings, maxHoursSunThu: parseFloat(e.target.value) || 0 })}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
            />
          </div>
          
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Max. Stunden (Fr-Sa)</label>
            <input
              type="number"
              step="0.5"
              min="0"
              max="24"
              value={settings.maxHoursFriSat}
              onChange={(e) => setSettings({ ...settings, maxHoursFriSat: parseFloat(e.target.value) || 0 })}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
            />
          </div>
          
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Erlaubte Zeit (So-Do)</label>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={settings.allowedStartSunThu}
                onChange={(e) => setSettings({ ...settings, allowedStartSunThu: e.target.value })}
                className="border rounded-lg px-3 py-2 text-sm bg-background"
              />
              <span>bis</span>
              <input
                type="time"
                value={settings.allowedEndSunThu}
                onChange={(e) => setSettings({ ...settings, allowedEndSunThu: e.target.value })}
                className="border rounded-lg px-3 py-2 text-sm bg-background"
              />
            </div>
          </div>
          
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Erlaubte Zeit (Fr-Sa)</label>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={settings.allowedStartFriSat}
                onChange={(e) => setSettings({ ...settings, allowedStartFriSat: e.target.value })}
                className="border rounded-lg px-3 py-2 text-sm bg-background"
              />
              <span>bis</span>
              <input
                type="time"
                value={settings.allowedEndFriSat}
                onChange={(e) => setSettings({ ...settings, allowedEndFriSat: e.target.value })}
                className="border rounded-lg px-3 py-2 text-sm bg-background"
              />
            </div>
          </div>
        </div>
      </section>
      
      {/* Parent Code */}
      <section className="bg-card border rounded-lg p-4 space-y-4">
        <h2 className="font-semibold">Eltern-Code</h2>
        <p className="text-sm text-muted-foreground">
          Mit diesem Code können Ausnahmen (z.B. Ferienmodus) freigegeben werden.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Aktueller Code</label>
            <input
              type="password"
              value={currentCode}
              onChange={(e) => setCurrentCode(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
            />
          </div>
          
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Neuer Code</label>
            <input
              type="password"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
            />
          </div>
          
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Neuer Code bestätigen</label>
            <input
              type="password"
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
            />
          </div>
        </div>
        
        <button
          onClick={handleChangeCode}
          className="border rounded-lg px-4 py-2 text-sm hover:bg-accent transition-colors"
        >
          Code ändern
        </button>
      </section>
      
      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-primary text-primary-foreground rounded-lg py-3 font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {saving ? 'Speichere...' : 'Einstellungen speichern'}
      </button>
    </div>
  )
}
