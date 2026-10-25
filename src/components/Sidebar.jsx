import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  BrainCircuit, 
  BookOpen, 
  CalendarDays, 
  HelpCircle, 
  Settings, 
  ChevronRight,
  Atom,
  PanelLeftClose,
  PanelLeft
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, memoryCount = 3 }) {
  const [collapsed, setCollapsed] = useState(false);

  const navItems = [
    { id: 'mission', label: 'Mission Control', icon: LayoutDashboard },
    { id: 'memory', label: 'Memory', icon: BrainCircuit, badge: memoryCount },
    { id: 'knowledge', label: 'Knowledge', icon: BookOpen },
    { id: 'planner', label: 'Planner', icon: CalendarDays },
    { id: 'quiz', label: 'Quizmode', icon: HelpCircle },
  ];

  return (
    <aside 
      className={`app-sidebar ${collapsed ? 'collapsed' : ''}`}
      aria-label="Main Navigation"
      style={{
        width: collapsed ? '72px' : '240px',
        backgroundColor: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100vh',
        position: 'sticky',
        top: 0,
        zIndex: 40,
        padding: collapsed ? '24px 10px' : '24px 16px',
        flexShrink: 0,
        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1), padding 0.25s ease'
      }}
    >
      <div>
        {/* Brand Header with Collapse Toggle */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: collapsed ? 'center' : 'space-between', 
          marginBottom: '32px', 
          paddingLeft: collapsed ? '0' : '4px' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              background: 'radial-gradient(circle, rgba(0,242,254,0.3) 0%, rgba(0,242,254,0.05) 100%)',
              border: '1px solid rgba(0,242,254,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--cyan-primary)',
              boxShadow: '0 0 12px rgba(0,242,254,0.2)',
              flexShrink: 0
            }}>
              <Atom size={20} className="text-cyan-glow" aria-hidden="true" />
            </div>
            {!collapsed && (
              <div className="sidebar-brand-text">
                <div style={{ 
                  fontFamily: 'var(--font-display)', 
                  fontWeight: 700, 
                  fontSize: '16px', 
                  letterSpacing: '0.05em',
                  color: '#fff' 
                }}>
                  ASTRA
                </div>
                <div style={{ fontSize: '10px', letterSpacing: '0.12em', color: 'var(--text-muted)', fontWeight: 600 }}>
                  STUDY OS
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className="btn-icon"
          >
            {collapsed ? <PanelLeft size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
          </button>
        </div>

        {/* Workspace Section */}
        <div style={{ marginBottom: '24px' }}>
          {!collapsed && (
            <div className="sidebar-label" style={{ 
              fontSize: '11px', 
              fontWeight: 700, 
              letterSpacing: '0.1em', 
              color: 'var(--text-muted)', 
              marginBottom: '12px',
              paddingLeft: '8px'
            }}>
              WORKSPACE
            </div>
          )}

          <nav aria-label="Workspace navigation" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              const accessibleLabel = item.badge !== undefined 
                ? `${item.label}, ${item.badge} active records` 
                : item.label;

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  title={item.label}
                  aria-label={accessibleLabel}
                  aria-current={isActive ? 'page' : undefined}
                  className={`sidebar-nav-item ${isActive ? 'is-active' : ''}`}
                  style={{
                    justifyContent: collapsed ? 'center' : 'space-between',
                    padding: collapsed ? '8px 10px' : '8px 12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Icon size={18} color={isActive ? 'var(--cyan-primary)' : 'var(--text-muted)'} strokeWidth={1.85} aria-hidden="true" />
                    {!collapsed && <span className="sidebar-label">{item.label}</span>}
                  </div>

                  {!collapsed && item.badge !== undefined && (
                    <span className="sidebar-badge" aria-hidden="true" style={{
                      backgroundColor: isActive ? 'var(--cyan-primary)' : 'rgba(255, 255, 255, 0.08)',
                      color: isActive ? '#040914' : 'var(--cyan-text)',
                      fontSize: '11px',
                      fontWeight: 700,
                      borderRadius: '10px',
                      padding: '2px 7px',
                      minWidth: '20px',
                      textAlign: 'center'
                    }}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Account Section */}
        <div>
          {!collapsed && (
            <div className="sidebar-label" style={{ 
              fontSize: '11px', 
              fontWeight: 700, 
              letterSpacing: '0.1em', 
              color: 'var(--text-muted)', 
              marginBottom: '12px',
              paddingLeft: '8px'
            }}>
              ACCOUNT
            </div>
          )}
          <nav aria-label="Account navigation">
            <button
              onClick={() => setActiveTab('settings')}
              title="Settings"
              aria-label="Settings"
              aria-current={activeTab === 'settings' ? 'page' : undefined}
              className={`sidebar-nav-item ${activeTab === 'settings' ? 'is-active' : ''}`}
              style={{
                width: '100%',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: '12px',
                padding: collapsed ? '8px 10px' : '8px 12px'
              }}
            >
              <Settings size={18} color={activeTab === 'settings' ? 'var(--cyan-primary)' : 'var(--text-muted)'} strokeWidth={1.85} aria-hidden="true" />
              {!collapsed && <span className="sidebar-label">Settings</span>}
            </button>
          </nav>
        </div>
      </div>

      {/* User Account Footer Control (Accessible Button) */}
      <button 
        type="button"
        onClick={() => setActiveTab('settings')}
        aria-label="Student profile: Yuna, Student account. Open settings."
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: '16px 0 0 0',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          cursor: 'pointer',
          textAlign: 'left',
          borderRadius: '4px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
            color: '#fff',
            fontWeight: 700,
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(255,255,255,0.2)',
            flexShrink: 0
          }} aria-hidden="true">
            Y
          </div>
          {!collapsed && (
            <div className="sidebar-footer-text">
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>Yuna</div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Student account</div>
            </div>
          )}
        </div>
        {!collapsed && <ChevronRight size={14} color="var(--text-muted)" aria-hidden="true" />}
      </button>
    </aside>
  );
}
