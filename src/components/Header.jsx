import React, { useState, useEffect, useRef } from 'react';
import { 
  Bell, 
  Activity, 
  Server, 
  Database, 
  BrainCircuit, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Loader2, 
  X,
  ChevronDown
} from 'lucide-react';
import { getSystemTimeContext } from '../utils/dateTime';
import { checkSystemHealth, formatRelativeTime, isStatusStale } from '../utils/systemHealth';

export default function Header({ activeTab, systemTime }) {
  const getTabTitle = () => {
    switch (activeTab) {
      case 'mission': return 'MISSION CONTROL';
      case 'memory': return 'MEMORY STORE';
      case 'knowledge': return 'KNOWLEDGE BASE & RAG';
      case 'planner': return 'EXAM REVISION PLANNER';
      case 'quiz': return 'ADAPTIVE QUIZ MODE';
      case 'settings': return 'SYSTEM SETTINGS';
      default: return 'MISSION CONTROL';
    }
  };

  const timeCtx = getSystemTimeContext(systemTime);
  const formattedDate = timeCtx.display_date;

  // Real-time System Health & Sync Audit State
  const [health, setHealth] = useState(null);
  const [isChecking, setIsChecking] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const popoverRef = useRef(null);
  const indicatorBtnRef = useRef(null);

  const runHealthCheck = async () => {
    setIsChecking(true);
    const report = await checkSystemHealth();
    setHealth(report);
    setIsChecking(false);
  };

  // Perform genuine check on mount, periodic 60s check, and window focus recovery
  useEffect(() => {
    runHealthCheck();

    const intervalId = setInterval(() => {
      runHealthCheck();
    }, 60000);

    const onFocus = () => {
      runHealthCheck();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Dismiss popover on outside click or Escape key
  useEffect(() => {
    if (!showDetails) return;

    const handlePointerDown = (e) => {
      if (
        popoverRef.current && 
        !popoverRef.current.contains(e.target) &&
        indicatorBtnRef.current &&
        !indicatorBtnRef.current.contains(e.target)
      ) {
        setShowDetails(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowDetails(false);
        if (indicatorBtnRef.current) indicatorBtnRef.current.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showDetails]);

  // Derived status presentation
  const currentState = isChecking && !health ? 'loading' : (health?.state || 'loading');
  const isStale = isStatusStale(health?.lastChecked);

  const getStatusLabel = () => {
    if (isChecking && !health) return 'Checking systems...';
    if (currentState === 'healthy') return 'Systems Healthy • Synced';
    if (currentState === 'degraded') return 'Systems Degraded';
    if (currentState === 'timeout') return 'Connection Timeout • Local Cache';
    if (currentState === 'offline') return 'Backend Offline • Local Cache';
    return 'Status Unknown';
  };

  const getStatusDotClass = () => {
    if (isChecking && !health) return 'dot-loading';
    if (currentState === 'healthy') return 'dot-healthy';
    if (currentState === 'degraded' || currentState === 'timeout') return 'dot-degraded';
    if (currentState === 'offline') return 'dot-offline';
    return 'dot-loading';
  };

  return (
    <header 
      role="banner"
      style={{
        minHeight: '54px',
        borderBottom: '1px solid var(--border-color)',
        backgroundColor: 'rgba(9, 13, 22, 0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'env(safe-area-inset-top, 0px) 24px 0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 30
      }}
    >
      {/* Screen Reader Live Region for System Health Updates */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {health ? `System status: ${getStatusLabel()}` : 'Checking system health...'}
      </div>

      {/* Breadcrumb Navigation Landmark */}
      <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', letterSpacing: '0.08em', fontWeight: 600, minWidth: 0, flexShrink: 1 }}>
        <span style={{ color: '#94a3b8', flexShrink: 0 }}>ASTRA</span>
        <span style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden="true">/</span>
        <span className="break-ui-truncate-end" style={{ color: 'var(--text-primary)', letterSpacing: '0.1em' }} aria-current="page">{getTabTitle()}</span>
      </nav>

      {/* Right controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0, position: 'relative' }}>
        
        {/* Genuine System Health & Sync Indicator */}
        <div style={{ position: 'relative' }}>
          <button
            ref={indicatorBtnRef}
            type="button"
            onClick={() => setShowDetails(prev => !prev)}
            className={`system-status-indicator status-${currentState}`}
            title="Click to view detailed system health and synchronization status"
            aria-label={`System status: ${getStatusLabel()}. Click for detailed service breakdown.`}
            aria-expanded={showDetails}
            aria-haspopup="dialog"
          >
            {isChecking && !health ? (
              <Loader2 size={11} className="animate-spin" aria-hidden="true" />
            ) : (
              <span className={`status-indicator-dot ${getStatusDotClass()}`} aria-hidden="true" />
            )}
            <span>{getStatusLabel()}</span>
            <ChevronDown size={11} aria-hidden="true" style={{ opacity: 0.7, transform: showDetails ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
          </button>

          {/* Detailed System Health & Sync Audit Popover */}
          {showDetails && (
            <div 
              ref={popoverRef}
              className="system-status-popover" 
              role="dialog" 
              aria-modal="true"
              aria-label="System Health and Synchronization Details"
            >
              {/* Popover Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Activity size={14} color="var(--cyan-primary)" />
                  <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: '#fff', textTransform: 'uppercase' }}>
                    SYSTEM HEALTH & SYNC
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDetails(false)}
                  className="btn-icon"
                  style={{ width: '26px', height: '26px', minWidth: '26px', minHeight: '26px' }}
                  title="Close status popover"
                  aria-label="Close status popover"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Status Banner */}
              <div style={{ 
                padding: '8px 10px', 
                borderRadius: '8px', 
                marginBottom: '12px', 
                background: currentState === 'healthy' 
                  ? 'rgba(16, 185, 129, 0.08)' 
                  : (currentState === 'degraded' || currentState === 'timeout' ? 'rgba(245, 158, 11, 0.08)' : 'rgba(239, 68, 68, 0.08)'),
                border: currentState === 'healthy' 
                  ? '1px solid rgba(16, 185, 129, 0.25)' 
                  : (currentState === 'degraded' || currentState === 'timeout' ? '1px solid rgba(245, 158, 11, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)'),
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                {currentState === 'healthy' ? (
                  <CheckCircle2 size={16} color="#34d399" style={{ flexShrink: 0 }} />
                ) : currentState === 'degraded' || currentState === 'timeout' ? (
                  <AlertTriangle size={16} color="#fbbf24" style={{ flexShrink: 0 }} />
                ) : (
                  <XCircle size={16} color="#f87171" style={{ flexShrink: 0 }} />
                )}
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>
                    {currentState === 'healthy' 
                      ? 'Live Sync Verified' 
                      : (currentState === 'degraded' ? 'Degraded Subsystems' : (currentState === 'timeout' ? 'Connection Timeout' : 'Backend Unreachable'))}
                  </div>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.3 }}>
                    {currentState === 'healthy' 
                      ? 'FastAPI core, SQLite store, and Qdrant vector index are connected.' 
                      : (currentState === 'degraded'
                          ? 'Core API responded, but secondary sub-services reported warnings.'
                          : 'Port 8000 is inactive. ASTRA is running in resilient local cache fallback.')}
                  </div>
                </div>
              </div>

              {/* Genuine Services Audit Breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  AUDITED SUBSYSTEMS
                </span>

                {/* Service 1: API Core */}
                <div className="status-service-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Server size={13} color="var(--cyan-primary)" />
                    <span style={{ color: '#fff', fontWeight: 600 }}>FastAPI Backend</span>
                  </div>
                  <span style={{ 
                    fontSize: '10.5px', 
                    fontWeight: 700,
                    color: health?.services?.api === 'healthy' ? '#34d399' : (health?.services?.api === 'degraded' ? '#fbbf24' : '#f87171')
                  }}>
                    {health?.services?.api === 'healthy' ? `Online (${health.latencyMs}ms)` : (health?.services?.api === 'degraded' ? 'Degraded' : 'Offline')}
                  </span>
                </div>

                {/* Service 2: SQLite Database */}
                <div className="status-service-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Database size={13} color="var(--cyan-primary)" />
                    <span style={{ color: '#fff', fontWeight: 600 }}>SQLite Memory DB</span>
                  </div>
                  <span style={{ 
                    fontSize: '10.5px', 
                    fontWeight: 700,
                    color: health?.services?.database === 'healthy' ? '#34d399' : '#f87171'
                  }}>
                    {health?.services?.database === 'healthy' ? 'Connected' : (health?.isOnline ? 'Query Error' : 'Offline')}
                  </span>
                </div>

                {/* Service 3: Vector Store */}
                <div className="status-service-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BrainCircuit size={13} color="var(--cyan-primary)" />
                    <span style={{ color: '#fff', fontWeight: 600 }}>Qdrant Vector Store</span>
                  </div>
                  <span style={{ 
                    fontSize: '10.5px', 
                    fontWeight: 700,
                    color: health?.services?.vector_store === 'healthy' ? '#34d399' : '#fbbf24'
                  }}>
                    {health?.services?.vector_store === 'healthy' ? 'Ready' : (health?.isOnline ? 'Degraded' : 'Offline')}
                  </span>
                </div>

                {/* Service 4: State Synchronization */}
                <div className="status-service-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <RefreshCw size={13} color="var(--cyan-primary)" />
                    <span style={{ color: '#fff', fontWeight: 600 }}>Client State Sync</span>
                  </div>
                  <span style={{ 
                    fontSize: '10.5px', 
                    fontWeight: 700,
                    color: health?.sync?.mode === 'live' ? '#34d399' : '#fbbf24'
                  }}>
                    {health?.sync?.mode === 'live' ? 'Synchronized' : 'Local Fallback'}
                  </span>
                </div>
              </div>

              {/* Provenance & Action Footer */}
              <div style={{ 
                paddingTop: '10px', 
                borderTop: '1px solid rgba(255, 255, 255, 0.08)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                fontSize: '10.5px',
                color: 'var(--text-muted)'
              }}>
                <div>
                  Last check: <span style={{ color: isStale ? '#fbbf24' : '#cbd5e1' }}>{formatRelativeTime(health?.lastChecked)}</span>
                </div>

                <button
                  type="button"
                  onClick={runHealthCheck}
                  disabled={isChecking}
                  className="interactive-chip"
                  title="Trigger immediate system health audit"
                  style={{
                    background: 'rgba(0, 242, 254, 0.08)',
                    border: '1px solid rgba(0, 242, 254, 0.25)',
                    color: 'var(--cyan-primary)',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: isChecking ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <RefreshCw size={10} className={isChecking ? 'animate-spin' : ''} />
                  <span>{isChecking ? 'Checking...' : 'Check Now'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Notification bell */}
        <button 
          className="btn-icon"
          title="Notifications"
          aria-label="Notifications"
        >
          <Bell size={16} />
        </button>

        {/* Date string */}
        <div style={{ 
          fontSize: '11px', 
          fontFamily: 'var(--font-mono)', 
          fontWeight: 600, 
          color: '#94a3b8',
          letterSpacing: '0.05em'
        }}>
          {formattedDate}
        </div>
      </div>
    </header>
  );
}
