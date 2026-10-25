import assert from 'node:assert';
import fs from 'node:fs';
import http from 'node:http';
import { checkSystemHealth, isStatusStale, formatRelativeTime } from './src/utils/systemHealth.js';

console.log('Testing ASTRA System Health & Sync Audit implementation...');

// 1. Verify Header.jsx implementation
const headerJsx = fs.readFileSync('./src/components/Header.jsx', 'utf-8');

// Ensure hardcoded "All systems synced" is removed
assert.ok(!headerJsx.includes('<span>All systems synced</span>'), 'Must remove hardcoded "All systems synced"');

// Ensure status states and labels
assert.ok(headerJsx.includes('checkSystemHealth'), 'Must import and use checkSystemHealth');
assert.ok(headerJsx.includes('system-status-indicator'), 'Must use .system-status-indicator');
assert.ok(headerJsx.includes('system-status-popover'), 'Must provide details popover');
assert.ok(headerJsx.includes('FastAPI Backend'), 'Must audit FastAPI Backend core in popover');
assert.ok(headerJsx.includes('SQLite Memory DB'), 'Must audit SQLite Memory DB in popover');
assert.ok(headerJsx.includes('Qdrant Vector Store'), 'Must audit Qdrant Vector Store in popover');
assert.ok(headerJsx.includes('Client State Sync'), 'Must audit Client State Sync in popover');
assert.ok(headerJsx.includes('Check Now'), 'Must provide manual "Check Now" refresh capability');

// Accessibility & Security checks
assert.ok(headerJsx.includes('aria-expanded='), 'Must include aria-expanded attribute');
assert.ok(headerJsx.includes('aria-haspopup="dialog"'), 'Must include aria-haspopup="dialog" attribute');
assert.ok(!headerJsx.includes('process.env'), 'Must not expose environment variables or secrets');
assert.ok(!headerJsx.includes('password'), 'Must not expose credentials or passwords');

console.log('✓ Header.jsx structure, accessibility, and security verified.');

// 2. Scenario A: Backend Offline (Testing currently offline localhost:8000)
console.log('Testing Scenario A: Backend Offline...');
const offlineReport = await checkSystemHealth('http://localhost:8000/api', 1000);
assert.strictEqual(offlineReport.isOnline, false, 'Offline backend must report isOnline: false');
assert.strictEqual(offlineReport.state, 'offline', 'Offline backend must report state: offline');
assert.strictEqual(offlineReport.services.api, 'offline', 'Offline backend API service must be offline');
assert.strictEqual(offlineReport.sync.mode, 'local_fallback', 'Offline backend must use local_fallback mode');
console.log('✓ Scenario A passed: Real-world offline backend correctly identified without claiming synced.');

// 3. Scenario B: Mock Server with Healthy Systems
console.log('Testing Scenario B: Healthy Backend Response...');
const healthyServer = http.createServer((req, res) => {
  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      system: 'ASTRA AI Command Engine',
      version: '2.0.0',
      services: {
        api: 'healthy',
        database: 'healthy',
        vector_store: 'healthy'
      },
      sync: {
        status: 'synced',
        state_version: '2.0.0'
      },
      time: { short_date: 'Oct 22', display_date: 'Wed, Oct 22, 2026' }
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

await new Promise(resolve => healthyServer.listen(8091, resolve));

try {
  const healthyReport = await checkSystemHealth('http://localhost:8091/api', 2000);
  assert.strictEqual(healthyReport.isOnline, true, 'Healthy backend must report isOnline: true');
  assert.strictEqual(healthyReport.state, 'healthy', 'Healthy backend must report state: healthy');
  assert.strictEqual(healthyReport.services.database, 'healthy', 'Database must report healthy');
  assert.strictEqual(healthyReport.services.vector_store, 'healthy', 'Vector store must report healthy');
  assert.strictEqual(healthyReport.sync.status, 'synced', 'Sync status must report synced');
  assert.strictEqual(healthyReport.sync.mode, 'live', 'Sync mode must report live');
  console.log('✓ Scenario B passed: Fully healthy system returns positive status only after genuine checks.');
} finally {
  await new Promise(resolve => healthyServer.close(resolve));
}

// 4. Scenario C: Mock Server with Degraded Subsystems
console.log('Testing Scenario C: Degraded Backend Subsystems...');
const degradedServer = http.createServer((req, res) => {
  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'degraded',
      system: 'ASTRA AI Command Engine',
      version: '2.0.0',
      services: {
        api: 'healthy',
        database: 'healthy',
        vector_store: 'degraded'
      },
      sync: {
        status: 'pending',
        state_version: '2.0.0'
      }
    }));
  }
});

await new Promise(resolve => degradedServer.listen(8092, resolve));

try {
  const degradedReport = await checkSystemHealth('http://localhost:8092/api', 2000);
  assert.strictEqual(degradedReport.isOnline, true, 'Degraded backend must report isOnline: true');
  assert.strictEqual(degradedReport.state, 'degraded', 'Degraded backend must report state: degraded');
  assert.strictEqual(degradedReport.services.vector_store, 'degraded', 'Vector store must report degraded');
  assert.strictEqual(degradedReport.sync.status, 'pending', 'Sync status must report pending');
  console.log('✓ Scenario C passed: Degraded subsystems correctly distinguished from healthy.');
} finally {
  await new Promise(resolve => degradedServer.close(resolve));
}

// 5. Scenario D: Timeout Handling
console.log('Testing Scenario D: Timeout Handling...');
const hangingServer = http.createServer((req, res) => {
  // Hang indefinitely to test client abort controller timeout
});

await new Promise(resolve => hangingServer.listen(8093, resolve));

try {
  const timeoutReport = await checkSystemHealth('http://localhost:8093/api', 150);
  assert.strictEqual(timeoutReport.isOnline, false, 'Timed out backend must report isOnline: false');
  assert.strictEqual(timeoutReport.state, 'timeout', 'Timed out backend must report state: timeout');
  assert.ok(timeoutReport.error.includes('timed out'), 'Error must note timeout');
  console.log('✓ Scenario D passed: Request abort and timeout handled gracefully without hanging.');
} finally {
  await new Promise(resolve => hangingServer.close(resolve));
}

// 6. Scenario E: Staleness & Formatting Utilities
console.log('Testing Scenario E: Staleness and Time Formatting...');
assert.strictEqual(isStatusStale(null), true, 'Null timestamp is stale');
assert.strictEqual(isStatusStale(new Date().toISOString()), false, 'Immediate timestamp is not stale');
assert.strictEqual(isStatusStale(new Date(Date.now() - 100000).toISOString()), true, '100s old timestamp is stale');

assert.strictEqual(formatRelativeTime(new Date().toISOString()), 'Just now');
assert.strictEqual(formatRelativeTime(new Date(Date.now() - 25000).toISOString()), '25s ago');
assert.strictEqual(formatRelativeTime(new Date(Date.now() - 180000).toISOString()), '3m ago');
console.log('✓ Scenario E passed: Staleness thresholds and relative time formatting work as expected.');

console.log('All System Health & Synchronization audit tests passed successfully!');
