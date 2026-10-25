import React, { useState } from 'react';
import { Settings, Volume2, Cpu, RefreshCw, Sliders } from 'lucide-react';
import { audioEngine } from '../utils/audioEngine';

export default function SettingsView({ resetDemo }) {
  const [isMuted, setIsMuted] = useState(audioEngine.isMuted);
  const [topK, setTopK] = useState(3);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.45);

  const handleMuteToggle = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    audioEngine.setMuted(nextMuted);
  };

  return (
    <div className="astra-page-container" style={{ maxWidth: '860px' }}>
      
      {/* Header */}
      <div className="astra-page-header" style={{ marginBottom: 'var(--section-gap, 28px)' }}>
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <div className="astra-eyebrow">
            <Settings size={16} aria-hidden="true" />
            <span>ASTRA SYSTEM CONFIGURATION</span>
          </div>
          <h1 className="astra-page-title">
            System Settings & AI Preferences
          </h1>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--grid-gap, 20px)' }}>
        
        {/* Voice & Speech Synthesis Panel */}
        <div className="glass-panel" style={{ padding: 'var(--card-padding, 24px)' }}>
          <h3 className="astra-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Volume2 size={18} color="var(--cyan-primary)" aria-hidden="true" />
            <span>Voice & Audio Synthesis</span>
          </h3>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
            <div>
              <div className="astra-label" style={{ fontSize: 'var(--text-body, 15px)' }}>Enable Natural AI Voice Output</div>
              <div className="astra-meta" style={{ fontSize: 'var(--text-meta, 12.5px)' }}>Reads AI responses aloud using browser SpeechSynthesis</div>
            </div>

            <button 
              type="button"
              onClick={handleMuteToggle}
              aria-pressed={!isMuted}
              className={isMuted ? 'btn-secondary' : 'btn-cyan'}
              style={{ fontSize: '12px' }}
            >
              {isMuted ? 'Unmute Audio' : 'Mute Voice Output'}
            </button>
          </div>
        </div>

        {/* Vector Search Parameters */}
        <div className="glass-panel" style={{ padding: 'var(--card-padding, 24px)' }}>
          <h3 className="astra-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cpu size={18} color="var(--purple-accent)" aria-hidden="true" />
            <span>RAG Vector Search Parameters</span>
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label htmlFor="topk-slider" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-label, 13.5px)', color: '#fff', marginBottom: '6px' }}>
                <span>Top-K Relevant Chunks Retracted</span>
                <span style={{ color: 'var(--cyan-primary)', fontFamily: 'var(--font-mono)' }}>{topK} Chunks</span>
              </label>
              <input 
                id="topk-slider"
                type="range" 
                min="1" 
                max="5" 
                value={topK} 
                aria-label="Top-K relevant chunks"
                aria-valuetext={`${topK} Chunks`}
                onChange={(e) => setTopK(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--cyan-primary)' }}
              />
            </div>

            <div>
              <label htmlFor="similarity-slider" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-label, 13.5px)', color: '#fff', marginBottom: '6px' }}>
                <span>Cosine Similarity Threshold</span>
                <span style={{ color: 'var(--cyan-primary)', fontFamily: 'var(--font-mono)' }}>{similarityThreshold}</span>
              </label>
              <input 
                id="similarity-slider"
                type="range" 
                min="0.1" 
                max="0.9" 
                step="0.05"
                value={similarityThreshold} 
                aria-label="Cosine similarity threshold"
                aria-valuetext={`${similarityThreshold}`}
                onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--cyan-primary)' }}
              />
            </div>
          </div>
        </div>

        {/* Reset Demo State */}
        <div className="glass-panel" style={{ padding: 'var(--card-padding, 24px)', border: '1px solid var(--color-error-border)' }}>
          <h3 className="astra-card-title" style={{ color: 'var(--color-error-text)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <RefreshCw size={18} aria-hidden="true" />
            <span>Reset Demo State</span>
          </h3>

          <p className="astra-description" style={{ marginBottom: '16px' }}>
            Restores Yuna's initial morning state, clearing newly added memories or rescheduling simulations.
          </p>

          <button type="button" onClick={resetDemo} className="btn-destructive">
            <RefreshCw size={14} aria-hidden="true" />
            <span>Reset ASTRA to Initial State</span>
          </button>
        </div>

      </div>

    </div>
  );
}
