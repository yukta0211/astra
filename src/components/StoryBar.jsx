import React, { useState } from 'react';
import { Play, Sparkles, CheckCircle2, ChevronRight, RefreshCw } from 'lucide-react';

export default function StoryBar({ runScenarioStep, currentStepIndex }) {
  const [autoRunning, setAutoRunning] = useState(false);

  const steps = [
    { num: 1, label: 'Morning Briefing', desc: 'Voice welcome & shape of day' },
    { num: 2, label: 'Voice Schedule Ask', desc: 'Ask AI about today\'s schedule' },
    { num: 3, label: 'Store Memory', desc: 'Add DBMS exam Friday to DB' },
    { num: 4, label: 'RAG Citation', desc: 'Query notes & check citation' },
    { num: 5, label: 'Exam Planner', desc: 'Build 5-day revision countdown' },
    { num: 6, label: 'Reschedule', desc: 'Simulate missed yesterday session' },
    { num: 7, label: 'Quiz & 65% Ring', desc: 'Complete quiz & update progress' }
  ];

  const handlePlayAll = async () => {
    setAutoRunning(true);
    for (let i = 0; i < steps.length; i++) {
      runScenarioStep(i + 1);
      await new Promise(r => setTimeout(r, 2200));
    }
    setAutoRunning(false);
  };

  return (
    <div style={{
      background: 'linear-gradient(90deg, rgba(0,242,254,0.08) 0%, rgba(168,85,247,0.08) 100%)',
      borderBottom: '1px solid rgba(0, 242, 254, 0.25)',
      padding: '10px 28px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px',
      overflowX: 'auto'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 'max-content' }}>
        <Sparkles size={16} className="text-cyan-glow" />
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--cyan-primary)', letterSpacing: '0.05em' }}>
          DEMO STORY WALKTHROUGH:
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', padding: '2px 0' }}>
        {steps.map((step) => {
          const isActive = currentStepIndex === step.num;
          const isDone = currentStepIndex > step.num;
          return (
            <button
              key={step.num}
              onClick={() => runScenarioStep(step.num)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 10px',
                borderRadius: '6px',
                border: isActive ? '1px solid var(--cyan-primary)' : isDone ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255,255,255,0.08)',
                background: isActive ? 'rgba(0, 242, 254, 0.15)' : isDone ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.02)',
                color: isActive ? '#fff' : isDone ? '#34d399' : 'var(--text-secondary)',
                fontSize: '11px',
                fontWeight: isActive ? 600 : 400,
                cursor: 'pointer',
                className: 'interactive-chip',
                transition: 'transform var(--duration-press) var(--ease-out), background-color var(--duration-hover) var(--ease-out), border-color var(--duration-hover) var(--ease-out)',
                whiteSpace: 'nowrap'
              }}
              title={step.desc}
            >
              {isDone ? (
                <CheckCircle2 size={12} color="#10b981" />
              ) : (
                <span style={{ 
                  width: '15px', 
                  height: '15px', 
                  borderRadius: '50%', 
                  background: isActive ? 'var(--cyan-primary)' : 'rgba(255,255,255,0.1)',
                  color: isActive ? '#000' : 'var(--text-muted)',
                  fontSize: '9px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {step.num}
                </span>
              )}
              <span>{step.label}</span>
            </button>
          );
        })}
      </div>

      <button
        onClick={handlePlayAll}
        disabled={autoRunning}
        className="btn-cyan"
        style={{ fontSize: '11px', padding: '6px 12px', minWidth: 'max-content' }}
      >
        {autoRunning ? <RefreshCw size={13} className="spin" /> : <Play size={13} />}
        <span>{autoRunning ? 'Running Walkthrough...' : 'Play Auto Walkthrough'}</span>
      </button>
    </div>
  );
}
