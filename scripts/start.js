const { execSync } = require('child_process');
const { join } = require('path');
const { existsSync, mkdirSync, writeFileSync } = require('fs');
const bcrypt = require('bcryptjs');

const dataDir = join(__dirname, '..', 'data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const dbPath = join(dataDir, 'app-data.json');

// Initialize default data if not exists
if (!existsSync(dbPath)) {
  const hash = bcrypt.hashSync('1234', 10);
  const defaultData = {
    settings: {
      fritzboxHost: 'fritz.box',
      fritzboxUsername: '',
      fritzboxPassword: '',
      accessProfileName: 'Kind',
      childDeviceIPs: [],
      parentCodeHash: hash,
      maxHoursSunThu: 3,
      maxHoursFriSat: 4.5,
      allowedStartSunThu: '10:00',
      allowedEndSunThu: '21:30',
      allowedStartFriSat: '10:00',
      allowedEndFriSat: '23:30',
    },
    schedules: [],
    syncLogs: [],
  };
  writeFileSync(dbPath, JSON.stringify(defaultData, null, 2), 'utf-8');
  console.log('Default-Daten erstellt. Standard Eltern-Code: 1234');
}

console.log('Datenbank initialisiert');

// Start Next.js
try {
  execSync('npx next start -H 0.0.0.0', { stdio: 'inherit', cwd: join(__dirname, '..') });
} catch (error) {
  console.error('Fehler beim Start von Next.js:', error.message);
  process.exit(1);
}
