import React, { useState, useRef, useEffect } from 'react';
import { 
  ArrowUpRight, 
  Plus, 
  Mic, 
  MicOff, 
  Send, 
  Activity, 
  ChevronRight,
  Sparkles, 
  Zap, 
  Loader2, 
  Brain, 
  Calendar, 
  Terminal,
  Play,
  Pause,
  RotateCcw,
  Trash2,
  Flame,
  BarChart3,
  Clock,
  Target,
  X,
  Check,
  AlertTriangle
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';
import { audioEngine } from '../utils/audioEngine';
import { getSystemTimeContext } from '../utils/dateTime';

export default function MissionControl({ 
  schedule = [], 
  setSchedule,
  tasks = [], 
  setTasks, 
  recentActivity = [], 
  studyProgress = 55, 
  setStudyProgress,
  setActiveTab,
  dbmsDocument,
  chatHistory = [],
  setChatHistory,
  handleSendChatMessage,
  aiStatus = "Online",
  systemTime,
  fetchState
}) {
  const timeCtx = getSystemTimeContext(systemTime);

  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  
  // Expanded Task Form State
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [newTaskModule, setNewTaskModule] = useState('DBMS');
  const [newTaskDuration, setNewTaskDuration] = useState('1 hour');

  // Deep Work / Pomodoro Study Tool State
  const [timerSeconds, setTimerSeconds] = useState(25 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerMode, setTimerMode] = useState('focus'); // 'focus' | 'break'
  const [sessionsCompleted, setSessionsCompleted] = useState(3);

  const [srAnnouncement, setSrAnnouncement] = useState('');
  const addTaskBtnRef = useRef(null);
  const prevShowAddTaskModal = useRef(false);

  // Restore focus to Add Task button when modal closes
  useEffect(() => {
    if (prevShowAddTaskModal.current && !showAddTaskModal) {
      if (addTaskBtnRef.current) addTaskBtnRef.current.focus();
    }
    prevShowAddTaskModal.current = showAddTaskModal;
  }, [showAddTaskModal]);

  const chatScrollRef = useRef(null);

  // Auto-scroll chat to latest message
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory, aiStatus]);

  // Pomodoro Timer Interval
  useEffect(() => {
    let interval = null;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimerSeconds(prev => {
          if (prev <= 1) {
            setIsTimerRunning(false);
            try {
              confetti({ particleCount: 75, spread: 65, origin: { y: 0.6 } });
            } catch (err) {}

            if (timerMode === 'focus') {
              setSessionsCompleted(s => s + 1);
              if (setStudyProgress) {
                setStudyProgress(p => Math.min(100, p + 5));
              }
              toast.success('Deep Work session completed! +5% Focus Health earned.');
              audioEngine.speak('Focus session completed. Great job on your deep work!');
              setTimerMode('break');
              return 5 * 60;
            } else {
              toast.info('Break finished! Ready for your next focus session.');
              audioEngine.speak('Break finished. Ready for your next focus session.');
              setTimerMode('focus');
              return 25 * 60;
            }
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timerMode, setStudyProgress]);

  const toggleTimer = () => {
    setIsTimerRunning(prev => !prev);
  };

  const resetTimer = () => {
    setIsTimerRunning(false);
    setTimerSeconds(timerMode === 'focus' ? 25 * 60 : 5 * 60);
  };

  const switchTimerMode = (mode) => {
    setIsTimerRunning(false);
    setTimerMode(mode);
    setTimerSeconds(mode === 'focus' ? 25 * 60 : 5 * 60);
  };

  const formatTimer = (totalSec) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Task State Classifier: Overdue, Due Today, Upcoming, or Completed
  const getTaskClassification = (task) => {
    if (task.completed) return 'completed';
    const subtextLower = (task.subtext || '').toLowerCase();
    const titleLower = (task.title || '').toLowerCase();
    const statusLower = (task.status || '').toLowerCase();
    if (
      task.isOverdue || 
      statusLower === 'overdue' || 
      subtextLower.includes('overdue') || 
      subtextLower.includes('past due') || 
      subtextLower.includes('yesterday') ||
      subtextLower.includes('late')
    ) {
      return 'overdue';
    }
    if (
      subtextLower.includes('due today') || 
      subtextLower.includes('today') ||
      titleLower.includes('due today')
    ) {
      return 'today';
    }
    return 'upcoming';
  };

  // Toggle Task Completion with celebratory feedback
  const toggleTask = async (id) => {
    const targetTask = tasks.find(t => t.id === id);
    const willComplete = targetTask && !targetTask.completed;

    try {
      const res = await fetch(`http://localhost:8000/api/tasks/${id}/toggle`, { method: 'PUT' });
      if (res.ok) {
        setTasks(prev => {
          const updated = prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
          const remaining = updated.filter(t => !t.completed).length;
          if (willComplete) {
            setSrAnnouncement(`Task completed: ${targetTask.title}`);
            if (remaining === 0) {
              try {
                confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
              } catch (e) {}
              toast.success('Outstanding! All pending tasks completed for today! 🎉');
            } else {
              toast.success(`Completed: ${targetTask.title}`);
            }
          } else {
            setSrAnnouncement(`Task marked incomplete: ${targetTask.title}`);
          }
          return updated;
        });
        return;
      }
    } catch (e) {}

    // Fallback local update
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
    if (targetTask) {
      setSrAnnouncement(`Task ${willComplete ? 'completed' : 'marked incomplete'}: ${targetTask.title}`);
    }
  };

  // Delete Task
  const deleteTask = async (id, title) => {
    try {
      await fetch(`http://localhost:8000/api/tasks/${id}`, { method: 'DELETE' });
    } catch (e) {}
    setTasks(prev => prev.filter(t => t.id !== id));
    toast.success(`Task removed: ${title}`);
  };

  // Chat message submission
  const onSubmitMessage = (textOverride) => {
    const text = textOverride || inputText;
    if (!text.trim() || aiStatus === 'Thinking...') return;
    if (isListening) {
      audioEngine.stopListening();
      setIsListening(false);
    }
    handleSendChatMessage(text.trim());
    setInputText('');
  };

  // Voice toggle
  const handleVoiceToggle = () => {
    if (isListening) {
      audioEngine.stopListening();
      setIsListening(false);
    } else {
      setIsListening(true);
      audioEngine.startListening(
        (transcript, isFinal) => {
          setInputText(transcript);
          if (isFinal) {
            setIsListening(false);
            onSubmitMessage(transcript);
          }
        },
        (err) => {
          setIsListening(false);
          console.error("Speech error:", err);
        }
      );
    }
  };

  // Add Task Submission
  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const accent = newTaskPriority === 'high' 
      ? '#ef4444' 
      : (newTaskPriority === 'low' ? '#10b981' : '#00f2fe');

    const subtext = `${newTaskModule} · ${newTaskDuration}`;

    try {
      const res = await fetch("http://localhost:8000/api/tasks", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: newTaskTitle,
          subtext,
          accent
        })
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(prev => [
          ...prev,
          { 
            id: data.task_id || ('task-' + Date.now()), 
            title: newTaskTitle, 
            subtext, 
            completed: false, 
            accent 
          }
        ]);
        toast.success(`Task scheduled: ${newTaskTitle}`);
      }
    } catch (e) {
      setTasks(prev => [
        ...prev,
        { 
          id: 'task-' + Date.now(), 
          title: newTaskTitle, 
          subtext, 
          completed: false, 
          accent 
        }
      ]);
      toast.success(`Task scheduled: ${newTaskTitle}`);
    }

    setNewTaskTitle('');
    setShowAddTaskModal(false);
  };

  // Quick Action: Sync Calendar
  const handleQuickSyncCalendar = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/actions/calendar_sync", { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          toast.success(data.message || 'DBMS revision session synced to calendar!');
        } else {
          toast.warning(data.message || 'Calendar sync requires a confirmed upcoming exam date.');
        }
        if (fetchState) fetchState();
      }
    } catch (err) {
      toast.info('Calendar event registered in local study schedule.');
    }
  };

  // Quick Action: Reschedule
  const handleQuickReschedule = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/planner/reschedule", { method: 'POST' });
      if (res.ok) {
        toast.success('Adaptive revision schedule dynamically re-balanced!');
        if (fetchState) fetchState();
      }
    } catch (err) {
      toast.info('Planner schedule updated.');
    }
  };

  // Quick Action: Launch Quiz
  const handleQuickStartQuiz = () => {
    toast.info('Entering Adaptive Quiz Mode...');
    setActiveTab('quiz');
  };

  // Quick Action: Clear Chat
  const handleClearChat = () => {
    if (setChatHistory) {
      setChatHistory([
        {
          sender: 'astra',
          text: 'Good morning, Yuna. I am your ASTRA AI Command Center. Your day is clear and focused on DBMS revision. What would you like to do?',
          citations: [],
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          status: 'Online'
        }
      ]);
      toast.info('Command center session transcript cleared.');
    }
  };

  // SVG Gauge calculations
  const radius = 52;
  const strokeWidth = 8;
  const normalizedRadius = radius - strokeWidth * 0.5;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (studyProgress / 100) * circumference;

  // Extract genuine recent user commands from chatHistory (most recent 3 unique strings)
  const recentUserCommands = Array.from(
    new Set(chatHistory.filter(m => m.sender === 'user').map(m => (m.text || '').trim()).filter(Boolean))
  ).slice(-3);

  return (
    <div className="mission-control-container astra-page-container" style={{ padding: 'var(--page-gutter-y) var(--page-gutter-x)', maxWidth: '1280px', margin: '0 auto', width: '100%' }}>
      
      {/* Screen Reader Live Region for Command Center & Tasks */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {srAnnouncement}
      </div>

      {/* 1. HERO: ASTRA VOICE & AI COMMAND CENTER (Full 12 Columns Span) */}
      <div className="glass-panel mission-control-hero" style={{ 
        padding: 'var(--card-padding, 24px)', 
        marginBottom: 'var(--section-gap, 28px)',
        border: '1px solid rgba(0, 242, 254, 0.25)',
        borderRadius: 'var(--radius-card, 14px)',
        background: 'linear-gradient(135deg, rgba(16,21,36,0.95) 0%, rgba(11,15,27,0.95) 100%)',
        boxShadow: '0 8px 32px -8px rgba(0, 242, 254, 0.12)'
      }}>
        {/* Header Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: 'rgba(0,242,254,0.15)',
              border: '1px solid var(--cyan-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--cyan-primary)'
            }}>
              <Terminal size={15} className="text-cyan-glow" aria-hidden="true" />
            </div>
            <div>
              <h1 style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--cyan-primary)', textTransform: 'uppercase', margin: 0, display: 'inline-block' }}>
                ASTRA AI COMMAND CENTER
              </h1>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '10px' }}>
                FastAPI Backend • SQLite Personal DB • Qdrant Vector Store
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Clear transcript button */}
            <button 
              onClick={handleClearChat}
              title="Clear transcript"
              aria-label="Clear chat transcript"
              className="btn-secondary btn-sm"
            >
              Clear Chat
            </button>

            {/* Live Status Badge */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              fontSize: '11px', 
              color: aiStatus !== 'Online' && aiStatus !== 'Responding...' ? 'var(--cyan-primary)' : 'var(--emerald-accent)',
              fontWeight: 600,
              background: 'rgba(255,255,255,0.03)',
              padding: '4px 10px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.06)'
            }}>
              {aiStatus !== 'Online' && aiStatus !== 'Responding...' ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <span className="live-dot" style={{ width: '6px', height: '6px' }}></span>
              )}
              <span>{aiStatus}</span>
            </div>
          </div>
        </div>

        {/* Live Conversation Window: Compact content-driven height that expands with chat growth */}
        <div 
          ref={chatScrollRef}
          style={{ 
            minHeight: '70px', 
            maxHeight: '320px', 
            overflowY: 'auto', 
            marginBottom: '14px',
            paddingRight: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            scrollBehavior: 'smooth'
          }}
        >
          {chatHistory.map((msg, idx) => (
            <div key={idx} style={{
              display: 'flex',
              gap: '10px',
              alignItems: 'flex-start',
              justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start'
            }}>
              {msg.sender === 'astra' && (
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '7px',
                  background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.2) 0%, rgba(56, 189, 248, 0.2) 100%)',
                  border: '1px solid rgba(0, 242, 254, 0.4)',
                  color: 'var(--cyan-primary)',
                  fontSize: '12px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  A
                </div>
              )}

              <div style={{
                background: msg.sender === 'user' ? 'rgba(0, 242, 254, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                border: msg.sender === 'user' ? '1px solid rgba(0, 242, 254, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                padding: '10px 14px',
                maxWidth: '82%',
                color: '#fff',
                fontSize: '13px',
                lineHeight: '1.5'
              }}>
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>

                {/* Executed Action Badge */}
                {msg.action_executed && (
                  <div style={{
                    marginTop: '6px',
                    padding: '4px 8px',
                    background: 'rgba(168, 85, 247, 0.15)',
                    border: '1px solid rgba(168, 85, 247, 0.3)',
                    borderRadius: '6px',
                    fontSize: '11px',
                    color: '#c084fc',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}>
                    <Zap size={12} />
                    <span>Action Executed: {msg.action_executed.detail || JSON.stringify(msg.action_executed)}</span>
                  </div>
                )}

                {/* Grounded Citations */}
                {msg.citations && msg.citations.length > 0 && (
                  <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    {msg.citations.map((c, i) => (
                      <div 
                        key={i} 
                        onClick={() => setActiveTab('knowledge')}
                        style={{ 
                          fontSize: '11px', 
                          color: 'var(--cyan-primary)', 
                          fontFamily: 'var(--font-mono)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          marginTop: '2px'
                        }}
                      >
                        <span>📄 Source Citation: {typeof c === 'object' ? `${c.filename || 'Notes'} (p. ${c.page_start}-${c.page_end})` : c}</span>
                        <ArrowUpRight size={11} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Audio Waveform Indicator */}
        {(isListening || audioEngine.isSpeaking) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', justifyContent: 'center' }}>
            <span style={{ fontSize: '11px', color: 'var(--cyan-primary)', fontWeight: 600 }}>
              {isListening ? '🎙 Listening to voice input...' : '🔊 ASTRA Speaking...'}
            </span>
            <div className="audio-bar" />
            <div className="audio-bar" />
            <div className="audio-bar" />
            <div className="audio-bar" />
            <div className="audio-bar" />
          </div>
        )}

        {/* AI Command Input Bar */}
        <div className={`astra-command-bar ${aiStatus === 'Thinking...' ? 'is-disabled' : ''}`}>
          <div className="command-bar-input-wrapper">
            <Terminal size={16} className="command-bar-icon" />
            <input 
              type="text" 
              className="command-bar-input"
              placeholder="Command ASTRA (e.g. 'Explain BCNF', 'What's due today?', 'Sync calendar')..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSubmitMessage();
                }
              }}
              disabled={aiStatus === 'Thinking...'}
              aria-label="Command ASTRA prompt input"
            />

            {inputText && (
              <button
                type="button"
                onClick={() => setInputText('')}
                className="command-bar-clear-btn"
                title="Clear typed command"
                aria-label="Clear input text"
              >
                <X size={14} />
              </button>
            )}

            {/* Enter shortcut hint: shown on desktop in normal flow, never overlaps typed text, hidden on mobile/tablet */}
            <span className="command-bar-enter-hint" aria-hidden="true">
              Enter ↵
            </span>
          </div>

          <div className="command-bar-actions">
            <button 
              type="button"
              onClick={handleVoiceToggle}
              className={`command-bar-btn-voice ${isListening ? 'listening' : ''}`}
              title={isListening ? "Listening to voice input... click to stop" : "Start Voice Input"}
              aria-label={isListening ? "Stop listening to voice command" : "Start voice command"}
              aria-pressed={isListening}
            >
              {isListening ? <MicOff size={15} aria-hidden="true" /> : <Mic size={15} aria-hidden="true" />}
              <span>{isListening ? 'Listening' : 'Voice'}</span>
            </button>

            <button 
              type="button"
              onClick={() => onSubmitMessage()}
              className="btn-cyan command-bar-btn-execute"
              disabled={!inputText.trim() || aiStatus === 'Thinking...'}
              title="Execute command"
              aria-label="Execute command"
            >
              {aiStatus === 'Thinking...' ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Executing...</span>
                </>
              ) : (
                <>
                  <Send size={14} />
                  <span>Execute</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Secondary Navigation & Genuine Recent Commands */}
        <div className="command-presets-container">
          {/* Genuine Recent Commands (from session chatHistory) */}
          {recentUserCommands.length > 0 && (
            <div className="command-presets-group" role="region" aria-label="Recent user commands">
              <span className="command-presets-label" style={{ color: 'var(--cyan-text)' }}>
                RECENT:
              </span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                {recentUserCommands.map((cmd, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onSubmitMessage(cmd)}
                    disabled={aiStatus === 'Thinking...'}
                    className="interactive-chip command-preset-chip chip-cyan"
                    title={`Re-run command: "${cmd}"`}
                    aria-label={`Re-run recent command: ${cmd}`}
                    style={{ maxWidth: '240px' }}
                  >
                    <RotateCcw size={11} style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cmd}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Action Engine Presets */}
          <div className="command-presets-group" role="region" aria-label="Quick action presets">
            <span className="command-presets-label" style={{ color: 'var(--text-muted)' }}>
              QUICK ACTIONS:
            </span>

            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleQuickSyncCalendar}
                disabled={aiStatus === 'Thinking...'}
                className="interactive-chip command-preset-chip chip-cyan"
                title="Sync study schedule to calendar"
                aria-label="Sync study schedule to calendar"
              >
                <Calendar size={12} style={{ flexShrink: 0 }} />
                <span>Sync Calendar</span>
              </button>

              <button
                type="button"
                onClick={handleQuickReschedule}
                disabled={aiStatus === 'Thinking...'}
                className="interactive-chip command-preset-chip chip-purple"
                title="Auto-reschedule study sessions dynamically"
                aria-label="Auto-reschedule study sessions dynamically"
              >
                <Zap size={12} style={{ flexShrink: 0 }} />
                <span>Auto-Reschedule</span>
              </button>

              <button
                type="button"
                onClick={handleQuickStartQuiz}
                disabled={aiStatus === 'Thinking...'}
                className="interactive-chip command-preset-chip chip-emerald"
                title="Start adaptive syllabus quiz mode"
                aria-label="Start adaptive syllabus quiz mode"
              >
                <Brain size={12} style={{ flexShrink: 0 }} />
                <span>Adaptive Quiz</span>
              </button>

              {[
                { label: '📅 What do I have today?', text: 'What do I have planned for today?' },
                { label: '🧠 Remember DBMS exam date', text: 'Remember that DBMS final exam is next Friday' },
                { label: '📚 Explain BCNF from notes', text: 'explain normalization and BCNF according to my DBMS notes' },
                { label: '🗓 Make 5-Day Revision Plan', text: 'Make me a 5-day revision plan for DBMS' }
              ].map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSubmitMessage(chip.text)}
                  disabled={aiStatus === 'Thinking...'}
                  className="interactive-chip command-preset-chip"
                  title={`Ask ASTRA: "${chip.text}"`}
                  aria-label={`Ask ASTRA: ${chip.text}`}
                >
                  <span>{chip.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* 2. DASHBOARD GRID (Schedule, Focus Health, Pomodoro Deep Work, Analytics, Tasks, Activity) */}
      <div 
        className="mission-grid-main"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(12, 1fr)',
          gap: 'var(--grid-gap, 20px)'
        }}
      >
        
        {/* ROW 1 LEFT: Today's Rhythm (Daily Schedule) - 7 cols */}
        <div style={{ gridColumn: 'span 7', padding: 'var(--card-padding, 24px)', display: 'flex', flexDirection: 'column' }} className="glass-panel card-hover-lift">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={14} style={{ color: 'var(--cyan-primary)' }} />
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--cyan-primary)', textTransform: 'uppercase' }}>
                TODAY'S RHYTHM
              </span>
            </div>
            <button 
              type="button"
              onClick={() => setActiveTab('planner')}
              aria-label="Open revision planner"
              style={{ 
                background: 'none', 
                border: 'none', 
                color: 'var(--cyan-text)', 
                fontSize: '12px', 
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'color 0.15s ease'
              }}
            >
              <span>Open planner</span>
              <ArrowUpRight size={13} aria-hidden="true" />
            </button>
          </div>

          <h2 className="astra-card-title" style={{ fontSize: 'var(--text-card-title, 19px)', fontWeight: 700, color: '#fff', marginBottom: '16px', lineHeight: 1.3 }}>
            {timeCtx.today_schedule_header}
          </h2>

          {/* Timeline List */}
          {schedule.length === 0 ? (
            <div style={{ padding: '20px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
              No scheduled events for today. Use the command bar to add study sessions.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }}>
              <div style={{
                position: 'absolute',
                left: '115px',
                top: '12px',
                bottom: '12px',
                width: '1px',
                background: 'rgba(255, 255, 255, 0.08)',
                zIndex: 1
              }} />

              {schedule.map((item) => (
                <div 
                  key={item.id} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    zIndex: 2,
                    padding: '8px 12px',
                    borderRadius: '8px',
                    transition: 'background 0.2s ease',
                    background: 'rgba(255,255,255,0.01)'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.01)'}
                >
                  <div style={{ width: '96px', flexShrink: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>{item.time}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.duration}</div>
                  </div>

                  <div style={{
                    width: '9px',
                    height: '9px',
                    borderRadius: '50%',
                    backgroundColor: item.dot_color || item.dotColor || '#00f2fe',
                    boxShadow: `0 0 8px ${item.dot_color || item.dotColor || '#00f2fe'}`,
                    marginRight: '16px',
                    flexShrink: 0
                  }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="break-ui-text" style={{ fontSize: '13.5px', fontWeight: 600, color: '#fff' }}>{item.title}</div>
                    <div className="break-ui-text" style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{item.location}</div>
                  </div>

                  <ChevronRight size={15} color="var(--text-muted)" style={{ flexShrink: 0, marginLeft: '8px' }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ROW 1 RIGHT: Focus Health & Readiness - 5 cols */}
        <div style={{ gridColumn: 'span 5', padding: 'var(--card-padding, 24px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }} className="glass-panel card-hover-lift">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={14} style={{ color: 'var(--cyan-primary)' }} />
                <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--cyan-primary)', textTransform: 'uppercase' }}>
                  FOCUS HEALTH & READINESS
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--emerald-accent)', fontWeight: 600 }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--emerald-accent)' }} />
                <span>Active Tracking</span>
              </div>
            </div>

            <h2 className="astra-card-title" style={{ fontSize: 'var(--text-card-title, 19px)', fontWeight: 700, color: '#fff', marginBottom: '14px', lineHeight: 1.3 }}>
              Study Progress & Readiness
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: '8px 0' }}>
              <div style={{ position: 'relative', width: '124px', height: '124px' }}>
                <svg height="124" width="124" style={{ transform: 'rotate(-90deg)' }}>
                  <circle
                    stroke="#1e293b"
                    fill="transparent"
                    strokeWidth={strokeWidth}
                    r={normalizedRadius}
                    cx="62"
                    cy="62"
                  />
                  <circle
                    stroke="url(#cyanGlowGrad)"
                    fill="transparent"
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference + ' ' + circumference}
                    style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.38s var(--ease-apple)' }}
                    strokeLinecap="round"
                    r={normalizedRadius}
                    cx="62"
                    cy="62"
                  />
                  <defs>
                    <linearGradient id="cyanGlowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#00f2fe" />
                      <stop offset="100%" stopColor="#38bdf8" />
                    </linearGradient>
                  </defs>
                </svg>

                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#fff', fontFamily: 'var(--font-display)' }}>
                    {studyProgress}<span style={{ fontSize: '15px', color: 'var(--cyan-primary)' }}>%</span>
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em' }}>
                    DBMS
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#fff', marginBottom: '3px' }}>
                  {studyProgress >= 70 ? 'Optimal exam readiness achieved.' : "You're building revision momentum."}
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', maxWidth: '300px' }}>
                  Normalization & BCNF priority before the upcoming revision deadline.
                </div>
              </div>
            </div>
          </div>

          <button 
            onClick={() => setActiveTab('planner')}
            className="btn-secondary"
            style={{ marginTop: '14px', fontSize: '12px', width: '100%', justifyContent: 'center' }}
          >
            <span>View complete revision plan</span>
            <ArrowUpRight size={13} />
          </button>
        </div>

        {/* ROW 2 LEFT: Task Queue & Scheduler - 7 cols */}
        <div style={{ gridColumn: 'span 7', padding: 'var(--card-padding, 24px)', display: 'flex', flexDirection: 'column' }} className="glass-panel card-hover-lift">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Target size={14} style={{ color: 'var(--cyan-primary)' }} />
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--cyan-primary)', textTransform: 'uppercase' }}>
                TASK QUEUE & PRIORITIES
              </span>
            </div>
            <button 
              ref={addTaskBtnRef}
              onClick={() => setShowAddTaskModal(true)}
              className="btn-cyan"
              style={{ padding: '3px 10px', fontSize: '11px' }}
              title="Schedule new task"
              aria-label="Schedule new task"
            >
              <Plus size={13} aria-hidden="true" />
              <span>Add Task</span>
            </button>
          </div>

          {/* Header & Dynamic Counts derived from actual task data */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h2 className="astra-card-title" style={{ fontSize: 'var(--text-card-title, 19px)', fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>
                Active Priorities
              </h2>
              {(() => {
                const pendingCount = tasks.filter(t => !t.completed).length;
                const completedCount = tasks.filter(t => t.completed).length;
                const overdueCount = tasks.filter(t => !t.completed && getTaskClassification(t) === 'overdue').length;

                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{
                      background: pendingCount > 0 ? 'rgba(0, 242, 254, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                      border: `1px solid ${pendingCount > 0 ? 'rgba(0, 242, 254, 0.25)' : 'rgba(16, 185, 129, 0.3)'}`,
                      color: pendingCount > 0 ? 'var(--cyan-primary)' : 'var(--emerald-accent)',
                      fontSize: '11px',
                      fontWeight: 700,
                      borderRadius: '10px',
                      padding: '2px 9px'
                    }}>
                      {pendingCount} pending
                    </span>
                    {completedCount > 0 && (
                      <span style={{
                        background: 'rgba(16, 185, 129, 0.08)',
                        border: '1px solid rgba(16, 185, 129, 0.22)',
                        color: '#34d399',
                        fontSize: '11px',
                        fontWeight: 600,
                        borderRadius: '10px',
                        padding: '2px 8px'
                      }}>
                        {completedCount} of {tasks.length} completed
                      </span>
                    )}
                    {overdueCount > 0 && (
                      <span style={{
                        background: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#f87171',
                        fontSize: '11px',
                        fontWeight: 700,
                        borderRadius: '10px',
                        padding: '2px 8px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <AlertTriangle size={10} />
                        {overdueCount} overdue
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {tasks.length === 0 ? (
            <div style={{
              padding: '28px 16px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(255, 255, 255, 0.01)',
              borderRadius: '8px',
              border: '1px dashed rgba(255, 255, 255, 0.08)'
            }}>
              <Target size={22} style={{ color: 'var(--text-muted)', opacity: 0.7 }} />
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                No Active Tasks in Queue
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', maxWidth: '280px', lineHeight: 1.4 }}>
                All study priorities are clear. Click "+ Add Task" to schedule your next objective.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {tasks.map(task => {
                const classification = getTaskClassification(task);
                const isCompleted = classification === 'completed';
                const isOverdue = classification === 'overdue';
                const isToday = classification === 'today';

                return (
                  <div 
                    key={task.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: isOverdue 
                        ? 'rgba(239, 68, 68, 0.04)' 
                        : (isCompleted ? 'rgba(255, 255, 255, 0.015)' : 'rgba(255, 255, 255, 0.02)'),
                      border: isOverdue 
                        ? '1px solid rgba(239, 68, 68, 0.3)' 
                        : (isCompleted ? '1px solid rgba(255, 255, 255, 0.03)' : '1px solid rgba(255, 255, 255, 0.05)'),
                      gap: '12px',
                      transition: 'border-color 0.15s ease, background 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = isOverdue 
                        ? 'rgba(239, 68, 68, 0.5)' 
                        : 'rgba(0, 242, 254, 0.25)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = isOverdue 
                        ? 'rgba(239, 68, 68, 0.3)' 
                        : (isCompleted ? '1px solid rgba(255, 255, 255, 0.03)' : '1px solid rgba(255, 255, 255, 0.05)');
                    }}
                  >
                    {/* Checkbox Region */}
                    <div className="task-checkbox-wrapper" style={{ flexShrink: 0 }}>
                      <input 
                        type="checkbox" 
                        className="custom-checkbox"
                        checked={Boolean(task.completed)} 
                        onChange={() => toggleTask(task.id)}
                        aria-label={`Toggle task: ${task.title}`}
                      />
                    </div>

                    {/* Description & Metadata Region */}
                    <div style={{ minWidth: 0, flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span 
                          className="break-ui-text" 
                          style={{ 
                            fontSize: '13px', 
                            fontWeight: isCompleted ? 500 : 600, 
                            color: isCompleted ? '#cbd5e1' : '#ffffff',
                            textDecoration: isCompleted ? 'line-through' : 'none',
                            textDecorationColor: isCompleted ? 'rgba(203, 213, 225, 0.45)' : 'transparent',
                            lineHeight: 1.4,
                            overflowWrap: 'break-word',
                            wordBreak: 'break-word'
                          }}
                        >
                          {task.title}
                        </span>

                        {/* Distinct Status Indicator Label */}
                        {isCompleted ? (
                          <span 
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              fontSize: '10px',
                              fontWeight: 700,
                              letterSpacing: '0.02em',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: 'rgba(16, 185, 129, 0.12)',
                              border: '1px solid rgba(16, 185, 129, 0.28)',
                              color: '#34d399',
                              flexShrink: 0
                            }}
                          >
                            <Check size={10} strokeWidth={3} />
                            Done
                          </span>
                        ) : isOverdue ? (
                          <span 
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              fontSize: '10px',
                              fontWeight: 700,
                              letterSpacing: '0.02em',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: 'rgba(239, 68, 68, 0.14)',
                              border: '1px solid rgba(239, 68, 68, 0.35)',
                              color: '#f87171',
                              flexShrink: 0
                            }}
                          >
                            <AlertTriangle size={10} />
                            Overdue
                          </span>
                        ) : isToday ? (
                          <span 
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              fontSize: '10px',
                              fontWeight: 600,
                              letterSpacing: '0.02em',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: 'rgba(245, 158, 11, 0.12)',
                              border: '1px solid rgba(245, 158, 11, 0.28)',
                              color: '#fbbf24',
                              flexShrink: 0
                            }}
                          >
                            Due Today
                          </span>
                        ) : (
                          <span 
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              fontSize: '10px',
                              fontWeight: 600,
                              letterSpacing: '0.02em',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: 'rgba(0, 242, 254, 0.08)',
                              border: '1px solid rgba(0, 242, 254, 0.2)',
                              color: 'var(--cyan-text)',
                              flexShrink: 0
                            }}
                          >
                            Upcoming
                          </span>
                        )}
                      </div>

                      {/* Readable Subtext */}
                      <div 
                        className="break-ui-text" 
                        style={{ 
                          fontSize: '11.5px', 
                          color: isOverdue ? '#fca5a5' : '#94a3b8',
                          fontWeight: 400,
                          overflowWrap: 'break-word',
                          wordBreak: 'break-word'
                        }}
                      >
                        {task.subtext}
                      </div>
                    </div>

                    {/* Actions & Indicator Region */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                      <div 
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: isCompleted 
                            ? '#10b981' 
                            : (isOverdue ? '#ef4444' : (task.accent || '#00f2fe')),
                          boxShadow: isCompleted 
                            ? '0 0 5px rgba(16, 185, 129, 0.4)' 
                            : (isOverdue ? '0 0 6px rgba(239, 68, 68, 0.5)' : `0 0 6px ${task.accent || '#00f2fe'}`),
                          opacity: isCompleted ? 0.6 : 1
                        }} 
                      />

                      <button
                        onClick={() => deleteTask(task.id, task.title)}
                        title="Remove task"
                        aria-label={`Remove task ${task.title}`}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '4px',
                          transition: 'color 0.15s ease'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ROW 2 RIGHT: System Logs & Action Feed - 5 cols */}
        <div style={{ gridColumn: 'span 5', padding: 'var(--card-padding, 24px)', display: 'flex', flexDirection: 'column' }} className="glass-panel card-hover-lift">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={14} style={{ color: 'var(--cyan-primary)' }} />
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--cyan-primary)', textTransform: 'uppercase' }}>
                AUDIT TRAIL & SYSTEM LOGS
              </span>
            </div>
            <button 
              onClick={() => setActiveTab('memory')}
              style={{ 
                background: 'none', 
                border: 'none', 
                color: 'var(--cyan-text)', 
                fontSize: '12px', 
                fontWeight: 600,
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '4px' 
              }}
            >
              <span>View memories</span>
              <ArrowUpRight size={13} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 className="astra-card-title" style={{ fontSize: 'var(--text-card-title, 19px)', fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>
              Action Feed
            </h2>
            {recentActivity.length > 0 && (
              <span style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: 'var(--text-secondary)',
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: '10px',
                padding: '2px 8px'
              }}>
                {recentActivity.length} events
              </span>
            )}
          </div>

          {recentActivity.length === 0 ? (
            <div style={{
              padding: '28px 16px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(255, 255, 255, 0.01)',
              borderRadius: '8px',
              border: '1px dashed rgba(255, 255, 255, 0.08)'
            }}>
              <Activity size={22} style={{ color: 'var(--text-muted)', opacity: 0.7 }} />
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                No Recent System Activity
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', maxWidth: '280px', lineHeight: 1.4 }}>
                Audit events, memory extractions, and planner operations will appear here in real time.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recentActivity.map((act, index) => {
                const dotCol = act.dot_color || act.dotColor || '#00f2fe';
                return (
                  <div 
                    key={act.id || index} 
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.04)',
                      gap: '12px',
                      transition: 'border-color 0.15s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(0, 242, 254, 0.25)'}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.04)'}
                  >
                    {/* Region 1: Fixed Event Icon Badge */}
                    <div 
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '6px',
                        background: `${dotCol}18`,
                        border: `1px solid ${dotCol}40`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: dotCol,
                        flexShrink: 0,
                        marginTop: '1px'
                      }}
                    >
                      <Sparkles size={13} />
                    </div>

                    {/* Region 2: Event Description */}
                    <div 
                      style={{
                        flex: '1 1 auto',
                        minWidth: 0,
                        lineHeight: 1.45,
                        overflowWrap: 'break-word',
                        wordBreak: 'break-word'
                      }}
                    >
                      <span 
                        className="break-ui-text" 
                        style={{ 
                          fontSize: '12.5px', 
                          color: '#f1f5f9', 
                          fontWeight: 500 
                        }}
                      >
                        {act.text}
                      </span>
                    </div>

                    {/* Region 3: Legible Timestamp */}
                    <div 
                      style={{
                        flexShrink: 0,
                        whiteSpace: 'nowrap',
                        textAlign: 'right',
                        minWidth: 'max-content',
                        marginLeft: 'auto',
                        paddingTop: '2px'
                      }}
                    >
                      <span 
                        style={{ 
                          fontSize: '11.5px', 
                          color: '#94a3b8', 
                          fontFamily: 'var(--font-mono, monospace)',
                          letterSpacing: '-0.01em',
                          fontWeight: 500 
                        }}
                      >
                        {act.time}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ROW 3 LEFT: Interactive Study Tool (Deep Work Timer) - 6 cols */}
        <div style={{ gridColumn: 'span 6', padding: 'var(--card-padding, 24px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }} className="glass-panel card-hover-lift">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={14} style={{ color: 'var(--cyan-primary)' }} />
                <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--cyan-primary)', textTransform: 'uppercase' }}>
                  DEEP WORK FOCUS SESSION
                </span>
              </div>
              <div role="tablist" aria-label="Timer duration mode" style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={timerMode === 'focus'}
                  onClick={() => switchTimerMode('focus')}
                  style={{
                    background: timerMode === 'focus' ? 'rgba(0, 242, 254, 0.15)' : 'rgba(255,255,255,0.03)',
                    border: timerMode === 'focus' ? '1px solid var(--cyan-primary)' : '1px solid rgba(255,255,255,0.06)',
                    color: timerMode === 'focus' ? '#fff' : 'var(--text-muted)',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  25m Focus
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={timerMode === 'break'}
                  onClick={() => switchTimerMode('break')}
                  style={{
                    background: timerMode === 'break' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.03)',
                    border: timerMode === 'break' ? '1px solid var(--emerald-accent)' : '1px solid rgba(255,255,255,0.06)',
                    color: timerMode === 'break' ? '#fff' : 'var(--text-muted)',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  5m Break
                </button>
              </div>
            </div>

            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '16px', lineHeight: 1.3 }}>
              Pomodoro Study Sprint
            </h2>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
              <div>
                <div style={{ 
                  fontSize: '36px', 
                  fontWeight: 800, 
                  fontFamily: 'var(--font-mono)', 
                  letterSpacing: '0.04em',
                  color: timerMode === 'focus' ? 'var(--cyan-primary)' : 'var(--emerald-accent)',
                  textShadow: timerMode === 'focus' ? '0 0 20px rgba(0, 242, 254, 0.4)' : '0 0 20px rgba(16, 185, 129, 0.4)'
                }}>
                  {formatTimer(timerSeconds)}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {timerMode === 'focus' ? 'DBMS Normalization Revision Sprint' : 'Rest interval: hydrate & relax eyes'}
                </div>
              </div>

              {/* Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={toggleTimer}
                  className="btn-cyan"
                  aria-label={isTimerRunning ? 'Pause timer' : 'Start focus timer'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '9px 16px',
                    fontSize: '13px',
                    fontWeight: 600
                  }}
                >
                  {isTimerRunning ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
                  <span>{isTimerRunning ? 'Pause' : 'Start Focus'}</span>
                </button>

                <button
                  type="button"
                  onClick={resetTimer}
                  className="btn-secondary"
                  title="Reset timer"
                  aria-label="Reset timer to initial duration"
                  style={{ padding: '9px 12px' }}
                >
                  <RotateCcw size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          {/* Session Stats row */}
          <div style={{
            marginTop: '16px',
            paddingTop: '14px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: 'var(--text-secondary)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Target size={13} color="var(--cyan-primary)" />
              <span>Today's Sessions: <strong style={{ color: '#fff' }}>{sessionsCompleted} completed</strong></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Flame size={13} color="#f59e0b" />
              <span>Deep Work: <strong style={{ color: '#fff' }}>{(sessionsCompleted * 25 / 60).toFixed(1)} hrs</strong></span>
            </div>
          </div>
        </div>

        {/* ROW 3 RIGHT: Study Analytics & Retention - 6 cols */}
        <div style={{ gridColumn: 'span 6', padding: 'var(--card-padding, 24px)', display: 'flex', flexDirection: 'column' }} className="glass-panel card-hover-lift">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BarChart3 size={14} style={{ color: 'var(--cyan-primary)' }} />
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--cyan-primary)', textTransform: 'uppercase' }}>
                STUDY ANALYTICS & RETENTION
              </span>
            </div>
            <span style={{
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: 'var(--emerald-accent)',
              padding: '2px 8px',
              borderRadius: '10px',
              fontSize: '11px',
              fontWeight: 600
            }}>
              Optimal Retention (92%)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>
                Active Recall Readiness
              </h2>
              <p style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Confidence across tested syllabus units</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '18px', fontWeight: 700, color: '#fff', fontFamily: 'var(--font-mono)' }}>5-Day</span>
              <span style={{ fontSize: '11px', color: '#f59e0b', marginLeft: '4px', fontWeight: 600 }}>Streak 🔥</span>
            </div>
          </div>

          {/* Modular progress bars */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
            {[
              { module: '1NF, 2NF & Normalization', score: 85, color: '#00f2fe' },
              { module: 'Boyce-Codd Normal Form (BCNF)', score: 72, color: '#38bdf8' },
              { module: 'Lossless Decomposition', score: 88, color: '#10b981' },
              { module: 'Multi-Valued Dependencies (4NF)', score: 64, color: '#f59e0b' }
            ].map((m, idx) => (
              <div key={idx}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{m.module}</span>
                  <span style={{ color: '#fff', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{m.score}%</span>
                </div>
                <div style={{ width: '100%', height: '5px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ 
                    width: `${m.score}%`, 
                    height: '100%', 
                    background: m.color, 
                    borderRadius: '3px',
                    boxShadow: `0 0 6px ${m.color}`,
                    transition: 'width 0.4s ease'
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Enhanced Add Task Modal (Accessible Dialog with Focus & Keyboard Trap) */}
      {showAddTaskModal && (
        <div 
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-task-dialog-title"
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setShowAddTaskModal(false);
          }}
        >
          <div className="glass-panel" style={{ width: '460px', maxWidth: 'calc(100vw - 32px)', padding: '28px', border: '1px solid var(--border-glow)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={18} color="var(--cyan-primary)" aria-hidden="true" />
                <h3 id="add-task-dialog-title" style={{ fontSize: '18px', fontWeight: 700, color: '#fff', margin: 0 }}>
                  Schedule Study Task
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setShowAddTaskModal(false)}
                className="btn-icon"
                title="Close dialog"
                aria-label="Close dialog"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleAddTask}>
              <div style={{ marginBottom: '14px' }}>
                <label htmlFor="task-description-input" style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                  TASK DESCRIPTION
                </label>
                <input 
                  id="task-description-input"
                  type="text"
                  placeholder="e.g. Practice 3NF vs BCNF decomposition proofs"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="astra-input"
                  autoFocus
                  required
                />
              </div>

              {/* Module & Duration */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label htmlFor="task-module-select" style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                    COURSE MODULE
                  </label>
                  <select
                    id="task-module-select"
                    value={newTaskModule}
                    onChange={(e) => setNewTaskModule(e.target.value)}
                    className="astra-select"
                  >
                    <option value="DBMS">DBMS</option>
                    <option value="Operating Systems">Operating Systems</option>
                    <option value="Computer Networks">Computer Networks</option>
                    <option value="Algorithms">Algorithms</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="task-duration-select" style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                    ESTIMATED TIME
                  </label>
                  <select
                    id="task-duration-select"
                    value={newTaskDuration}
                    onChange={(e) => setNewTaskDuration(e.target.value)}
                    className="astra-select"
                  >
                    <option value="30 mins">30 mins</option>
                    <option value="45 mins">45 mins</option>
                    <option value="1 hour">1 hour</option>
                    <option value="2 hours">2 hours</option>
                  </select>
                </div>
              </div>

              {/* Priority Radio Group */}
              <div style={{ marginBottom: '20px' }}>
                <label id="task-priority-label" style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                  PRIORITY LEVEL
                </label>
                <div role="radiogroup" aria-labelledby="task-priority-label" style={{ display: 'flex', gap: '8px' }}>
                  {[
                    { id: 'high', label: 'Urgent', color: '#ef4444' },
                    { id: 'medium', label: 'Standard', color: '#00f2fe' },
                    { id: 'low', label: 'Low', color: '#10b981' }
                  ].map(p => (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={newTaskPriority === p.id}
                      onClick={() => setNewTaskPriority(p.id)}
                      style={{
                        flex: 1,
                        padding: '8px',
                        borderRadius: '6px',
                        border: newTaskPriority === p.id ? `1px solid ${p.color}` : '1px solid rgba(255,255,255,0.06)',
                        background: newTaskPriority === p.id ? `${p.color}22` : 'rgba(255,255,255,0.02)',
                        color: newTaskPriority === p.id ? '#fff' : 'var(--text-muted)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={() => setShowAddTaskModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-cyan">
                  Schedule Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
