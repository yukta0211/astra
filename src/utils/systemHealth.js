/**
 * ASTRA System Health & Synchronization Service
 * 
 * Accurately audits and reports genuine backend health and frontend synchronization.
 * Distinguishes service availability (API, DB, Vector Store) from state synchronization.
 * Prevents false "All systems synced" claims when backend is offline or degraded.
 */

const DEFAULT_API_BASE = 'http://localhost:8000/api';
const DEFAULT_TIMEOUT_MS = 3500;
const STALE_THRESHOLD_MS = 90000; // 90 seconds

/**
 * Perform genuine health and synchronization check
 * @param {string} apiBase - API base URL
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<SystemHealthReport>}
 */
export async function checkSystemHealth(apiBase = DEFAULT_API_BASE, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startTime = Date.now();

  try {
    const res = await fetch(`${apiBase}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (!res.ok) {
      return {
        state: 'degraded',
        isOnline: false,
        latencyMs,
        availability: 'degraded',
        services: {
          api: 'degraded',
          database: 'unknown',
          vector_store: 'unknown'
        },
        sync: {
          status: 'pending',
          mode: 'local_fallback',
          version: 'unknown'
        },
        lastChecked: new Date().toISOString(),
        error: `HTTP ${res.status}: ${res.statusText}`
      };
    }

    const data = await res.json();
    const services = data.services || {
      api: data.status === 'online' || data.status === 'healthy' ? 'healthy' : 'degraded',
      database: 'unknown',
      vector_store: 'unknown'
    };

    const isHealthy = data.status === 'healthy' && services.database === 'healthy';
    const isDegraded = data.status === 'degraded' || (services.database === 'healthy' && services.vector_store === 'degraded');
    const state = isHealthy ? 'healthy' : (isDegraded ? 'degraded' : 'unhealthy');

    return {
      state,
      isOnline: true,
      latencyMs,
      availability: state,
      services,
      sync: {
        status: data.sync?.status || (isHealthy ? 'synced' : 'pending'),
        mode: 'live',
        version: data.version || '2.0.0'
      },
      lastChecked: new Date().toISOString(),
      error: null
    };

  } catch (err) {
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    const isTimeout = err.name === 'AbortError';

    return {
      state: isTimeout ? 'timeout' : 'offline',
      isOnline: false,
      latencyMs,
      availability: isTimeout ? 'timeout' : 'offline',
      services: {
        api: 'offline',
        database: 'offline',
        vector_store: 'offline'
      },
      sync: {
        status: 'offline',
        mode: 'local_fallback',
        version: 'offline-cache'
      },
      lastChecked: new Date().toISOString(),
      error: isTimeout ? 'Connection timed out (>3.5s)' : 'Backend unreachable (Connection refused)'
    };
  }
}

/**
 * Determine if a status check has become stale
 * @param {string|null} lastCheckedIso 
 * @returns {boolean}
 */
export function isStatusStale(lastCheckedIso) {
  if (!lastCheckedIso) return true;
  const elapsed = Date.now() - new Date(lastCheckedIso).getTime();
  return elapsed > STALE_THRESHOLD_MS;
}

/**
 * Format timestamp into human-readable relative string
 * @param {string|null} lastCheckedIso 
 * @returns {string}
 */
export function formatRelativeTime(lastCheckedIso) {
  if (!lastCheckedIso) return 'Never checked';
  const elapsedSec = Math.floor((Date.now() - new Date(lastCheckedIso).getTime()) / 1000);
  if (elapsedSec < 5) return 'Just now';
  if (elapsedSec < 60) return `${elapsedSec}s ago`;
  const elapsedMin = Math.floor(elapsedSec / 60);
  if (elapsedMin < 60) return `${elapsedMin}m ago`;
  return new Date(lastCheckedIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
