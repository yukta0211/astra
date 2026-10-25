import React, { useState } from 'react';
import { 
  BrainCircuit, 
  Plus, 
  Trash2, 
  Mic, 
  Search, 
  ShieldCheck, 
  ShieldAlert,
  AlertTriangle, 
  CalendarCheck, 
  Calendar, 
  Check, 
  History,
  Info,
  Clock,
  Radio,
  Edit3,
  Archive,
  RotateCcw,
  X,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { audioEngine } from '../utils/audioEngine';
import { evaluateExamDate } from '../utils/dateTime';
import { resolveMemoryStatus, LIFECYCLE_METADATA } from '../utils/memoryStatus';

const API_BASE = "http://localhost:8000/api";

export default function MemoryView({ memories, setMemories, addMemory, fetchState }) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedLifecycle, setSelectedLifecycle] = useState('ACTIVE');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Add Memory Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Exams');
  const [newContent, setNewContent] = useState('');
  const [newLifecycleState, setNewLifecycleState] = useState('UNVERIFIED');
  const [isListening, setIsListening] = useState(false);
  const [isSavingNew, setIsSavingNew] = useState(false);

  // Edit Memory Modal State
  const [editModalMemory, setEditModalMemory] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState('Exams');
  const [editLifecycleState, setEditLifecycleState] = useState('VERIFIED');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editConflictNotice, setEditConflictNotice] = useState(null);

  // Delete Confirmation Modal State
  const [deleteConfirmMemory, setDeleteConfirmMemory] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Update Exam Date Modal State
  const [updateModalMemory, setUpdateModalMemory] = useState(null);
  const [updateDateValue, setUpdateDateValue] = useState('');
  const [isUpdatingDate, setIsUpdatingDate] = useState(false);

  const categories = ['All', 'Exams', 'Weak Subjects', 'Preferences', 'Goals'];

  // Min date today in Asia/Kolkata
  const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  // Filter memories by category, lifecycle state, and search query
  const filteredMemories = memories.filter(mem => {
    // 1. Category match
    const matchCat = selectedCategory === 'All' || mem.category === selectedCategory;

    // 2. Lifecycle match
    const resolved = resolveMemoryStatus(mem);
    const lifeState = resolved.lifecycleState;
    let matchLifecycle = true;

    if (selectedLifecycle === 'ACTIVE') {
      matchLifecycle = lifeState !== 'ARCHIVED';
    } else if (selectedLifecycle === 'ALL') {
      matchLifecycle = true;
    } else if (selectedLifecycle === 'VERIFIED') {
      matchLifecycle = lifeState === 'VERIFIED';
    } else if (selectedLifecycle === 'UNVERIFIED') {
      matchLifecycle = lifeState === 'UNVERIFIED';
    } else if (selectedLifecycle === 'NEEDS_CONFIRMATION') {
      matchLifecycle = lifeState === 'NEEDS_CONFIRMATION' || resolved.status === 'NEEDS_REVIEW';
    } else if (selectedLifecycle === 'OUTDATED') {
      matchLifecycle = lifeState === 'OUTDATED' || resolved.isOutdated;
    } else if (selectedLifecycle === 'ARCHIVED') {
      matchLifecycle = lifeState === 'ARCHIVED';
    }

    // 3. Search query match
    const q = searchQuery.toLowerCase().trim();
    const matchSearch = !q || 
      (mem.title || '').toLowerCase().includes(q) || 
      (mem.content || '').toLowerCase().includes(q) ||
      (mem.source || '').toLowerCase().includes(q) ||
      (mem.category || '').toLowerCase().includes(q);

    return matchCat && matchLifecycle && matchSearch;
  });

  // Calculate lifecycle counts for tabs
  const countActive = memories.filter(m => resolveMemoryStatus(m).lifecycleState !== 'ARCHIVED').length;
  const countArchived = memories.filter(m => resolveMemoryStatus(m).lifecycleState === 'ARCHIVED').length;
  const countVerified = memories.filter(m => resolveMemoryStatus(m).lifecycleState === 'VERIFIED').length;
  const countNeedsReview = memories.filter(m => {
    const s = resolveMemoryStatus(m);
    return s.lifecycleState === 'NEEDS_CONFIRMATION' || s.status === 'NEEDS_REVIEW';
  }).length;
  const countOutdated = memories.filter(m => resolveMemoryStatus(m).isOutdated || resolveMemoryStatus(m).lifecycleState === 'OUTDATED').length;

  // --- DELETE & RESTORE (UNDO) WORKFLOW ---
  const handleOpenDeleteConfirm = (mem) => {
    setDeleteConfirmMemory(mem);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmMemory) return;
    const target = deleteConfirmMemory;
    setIsDeleting(true);

    try {
      const res = await fetch(`${API_BASE}/memories/${target.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        // Reflect immediately in local state
        setMemories(prev => prev.filter(m => m.id !== target.id));
        setDeleteConfirmMemory(null);

        const snapshot = data.deleted_memory || target;

        // Sonner toast with instant Undo action
        toast.success(`Deleted "${snapshot.title || 'Memory'}"`, {
          description: "Removed from active student context.",
          action: {
            label: "Undo",
            onClick: () => handleRestoreMemory(snapshot)
          },
          duration: 7000
        });
      } else {
        toast.error(data.detail || "Failed to delete memory from SQLite DB.");
      }
    } catch (e) {
      console.error("Delete error:", e);
      toast.error("Network error: Could not reach backend server to delete memory.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRestoreMemory = async (snapshot) => {
    try {
      const res = await fetch(`${API_BASE}/memories/${snapshot.id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.memory) {
        setMemories(prev => [data.memory, ...prev.filter(m => m.id !== data.memory.id)]);
        toast.success(`Restored "${data.memory.title}" to persistent store.`);
      } else {
        toast.error(data.detail || "Could not restore memory.");
      }
    } catch (err) {
      console.error("Restore error:", err);
      toast.error("Failed to connect to backend engine to restore memory.");
    }
  };

  // --- OPEN & EDIT MEMORY WORKFLOW ---
  const handleOpenEditModal = (mem) => {
    const statusInfo = resolveMemoryStatus(mem);
    setEditModalMemory(mem);
    setEditTitle(mem.title || '');
    setEditContent(mem.content || '');
    setEditCategory(mem.category || 'Exams');
    setEditLifecycleState(statusInfo.lifecycleState || 'VERIFIED');
    setEditConflictNotice(null);
  };

  const handleSaveEditSubmit = async (e) => {
    e.preventDefault();
    if (!editTitle.trim() || !editContent.trim()) {
      toast.error("Title and content cannot be empty.");
      return;
    }

    setIsSavingEdit(true);
    setEditConflictNotice(null);

    try {
      const payload = {
        title: editTitle.trim(),
        content: editContent.trim(),
        category: editCategory,
        lifecycle_state: editLifecycleState,
        expected_last_updated_at: editModalMemory.last_updated_at || editModalMemory.date || undefined
      };

      const res = await fetch(`${API_BASE}/memories/${editModalMemory.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        // Concurrency conflict detected by backend
        setEditConflictNotice(data.detail || "Concurrency conflict: this memory was modified elsewhere. Review latest version before overwriting.");
        toast.error("Concurrency conflict: Memory has been modified in another session.");
        return;
      }

      if (res.ok && data.success && data.memory) {
        // Reflect edit immediately in UI
        setMemories(prev => prev.map(m => m.id === data.memory.id ? data.memory : m));
        setEditModalMemory(null);
        toast.success("Memory updated successfully.");
        if (fetchState) fetchState();
      } else {
        toast.error(data.detail || "Validation error updating memory.");
      }
    } catch (err) {
      console.error("Edit save error:", err);
      toast.error("Network error: Failed to connect to backend engine.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleReloadConflictRecord = async () => {
    if (!editModalMemory) return;
    try {
      const res = await fetch(`${API_BASE}/memories/${editModalMemory.id}`);
      if (res.ok) {
        const latest = await res.json();
        setEditModalMemory(latest);
        setEditTitle(latest.title || '');
        setEditContent(latest.content || '');
        setEditCategory(latest.category || 'Exams');
        const st = resolveMemoryStatus(latest);
        setEditLifecycleState(st.lifecycleState || 'VERIFIED');
        setEditConflictNotice(null);
        toast.info("Loaded latest version from database.");
      }
    } catch (err) {
      toast.error("Could not reload record from server.");
    }
  };

  // --- ADD MEMORY WORKFLOW ---
  const handleAddMemorySubmit = async (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) {
      toast.error("Please provide both a title and content.");
      return;
    }

    setIsSavingNew(true);
    try {
      const payload = {
        category: newCategory,
        title: newTitle.trim(),
        content: newContent.trim(),
        verification_status: newLifecycleState === 'VERIFIED' ? 'VERIFIED' : 'UNVERIFIED',
        lifecycle_state: newLifecycleState,
        source: newLifecycleState === 'VERIFIED' ? 'Direct Student Input' : 'User Input'
      };

      const res = await fetch(`${API_BASE}/memories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.memory) {
        setMemories(prev => [data.memory, ...prev.filter(m => m.id !== data.memory.id)]);
        setNewTitle('');
        setNewContent('');
        setNewLifecycleState('UNVERIFIED');
        setShowAddModal(false);
        toast.success("Memory saved to persistent store.");
      } else {
        toast.error(data.detail || "Failed to save memory.");
      }
    } catch (err) {
      console.error("Add memory error:", err);
      toast.error("Network error: Could not save memory.");
    } finally {
      setIsSavingNew(false);
    }
  };

  const handleVoiceAdd = () => {
    if (isListening) {
      audioEngine.stopListening();
      setIsListening(false);
    } else {
      setIsListening(true);
      audioEngine.startListening(
        (transcript, isFinal) => {
          setNewContent(transcript);
          if (isFinal) {
            setIsListening(false);
            if (!newTitle) setNewTitle('Voice Memory ' + new Date().toLocaleTimeString());
          }
        },
        () => setIsListening(false)
      );
    }
  };

  // --- EXAM DATE CONFIRMATION MODAL WORKFLOW ---
  const handleOpenUpdateModal = (mem) => {
    setUpdateModalMemory(mem);
    setUpdateDateValue('');
  };

  const handleConfirmDateUpdate = async (e) => {
    e.preventDefault();
    if (!updateDateValue) {
      toast.error("Please select a valid upcoming date.");
      return;
    }

    setIsUpdatingDate(true);
    try {
      const subject = (updateModalMemory.title || '').includes('DBMS') ? 'DBMS' : 'Exam';
      const res = await fetch(`${API_BASE}/planner/confirm_date`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          new_date: updateDateValue,
          source: 'Memory Store Update'
        })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        toast.success("Exam date verified & updated in memory and planner!");
        setUpdateModalMemory(null);
        if (fetchState) fetchState();
      } else {
        toast.error(data.detail || "Could not update exam date.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to connect to backend engine.");
    } finally {
      setIsUpdatingDate(false);
    }
  };

  return (
    <div className="astra-page-container" style={{ maxWidth: '1240px' }}>
      
      {/* Screen Reader Live Announcement Region */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {`Showing ${filteredMemories.length} of ${memories.length} memory records for category "${selectedCategory}" and filter "${selectedLifecycle}"${searchQuery ? ` matching "${searchQuery}"` : ''}`}
      </div>

      {/* Header */}
      <div className="astra-page-header">
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <div className="astra-eyebrow">
            <BrainCircuit size={16} aria-hidden="true" />
            <span>ASTRA LONG-TERM PERSONAL MEMORY STORE (SQLite DB)</span>
          </div>
          <h1 className="astra-page-title">
            Personal Student Memory Database
          </h1>
          <p className="astra-page-subtitle">
            Persistent student context, weak areas, exam dates, and preferences with temporal audit tracking and lifecycle governance.
          </p>
        </div>

        <button 
          onClick={() => setShowAddModal(true)} 
          className="btn-cyan"
          aria-label="Add new personal memory"
        >
          <Plus size={16} aria-hidden="true" />
          <span>Add Memory</span>
        </button>
      </div>

      {/* Metric Transparency Helper Banner */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '10px',
        padding: '12px 16px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        fontSize: '12px',
        color: 'var(--text-secondary)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info size={15} style={{ color: 'var(--cyan-primary)', flexShrink: 0 }} />
          <span>
            <strong>Lifecycle & Verification Governance:</strong> ASTRA distinguishes extraction confidence from factual currency and never classifies unverified memories as false.
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '11px', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Verified: Explicitly confirmed by student">
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--emerald-accent)' }} />
            <span>Verified</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Unverified: Automatically captured from study activity; not classified as false">
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#a855f7' }} />
            <span>Unverified</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Needs Review: Contains ambiguous or outdated temporal details">
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }} />
            <span>Needs Review</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Archived: Preserved in historical store, excluded from active schedule">
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#64748b' }} />
            <span>Archived</span>
          </span>
        </div>
      </div>

      {/* Lifecycle Filter Tabs (Accessible Tablist) */}
      <div 
        role="tablist"
        aria-label="Memory lifecycle filter tabs"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '16px',
          overflowX: 'auto',
          paddingBottom: '4px'
        }}
      >
        {[
          { id: 'ACTIVE', label: 'Active', count: countActive },
          { id: 'ALL', label: 'All Records', count: memories.length },
          { id: 'VERIFIED', label: 'Verified', count: countVerified },
          { id: 'NEEDS_CONFIRMATION', label: 'Needs Review', count: countNeedsReview },
          { id: 'OUTDATED', label: 'Outdated', count: countOutdated },
          { id: 'ARCHIVED', label: 'Archived', count: countArchived },
        ].map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={selectedLifecycle === tab.id}
            aria-label={`${tab.label} memories, ${tab.count} records`}
            onClick={() => setSelectedLifecycle(tab.id)}
            style={{
              padding: '5px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              border: selectedLifecycle === tab.id ? '1px solid var(--cyan-primary)' : '1px solid rgba(255, 255, 255, 0.08)',
              background: selectedLifecycle === tab.id ? 'rgba(0, 242, 254, 0.12)' : 'rgba(255, 255, 255, 0.02)',
              color: selectedLifecycle === tab.id ? 'var(--cyan-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease'
            }}
          >
            <span>{tab.label}</span>
            <span style={{
              fontSize: '10px',
              padding: '1px 6px',
              borderRadius: '10px',
              background: selectedLifecycle === tab.id ? 'rgba(0, 242, 254, 0.25)' : 'rgba(255, 255, 255, 0.06)',
              color: selectedLifecycle === tab.id ? '#fff' : 'var(--text-muted)'
            }}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Category Pills & Search Bar */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        gap: '16px', 
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        <div role="group" aria-label="Memory category filters" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {categories.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              aria-pressed={selectedCategory === cat}
              style={{
                padding: '5px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                border: selectedCategory === cat ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid var(--border-color)',
                background: selectedCategory === cat ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255,255,255,0.02)',
                color: selectedCategory === cat ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              className="interactive-chip"
            >
              {cat}
            </button>
          ))}
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'var(--bg-input)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '6px 12px',
          width: '280px'
        }}>
          <Search size={14} color="var(--text-muted)" aria-hidden="true" />
          <input 
            type="text" 
            placeholder="Search title, content, or source..."
            aria-label="Search memories by title, content, or source"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: '12px',
              outline: 'none',
              width: '100%'
            }}
          />
          {searchQuery && (
            <button 
              type="button"
              onClick={() => setSearchQuery('')}
              className="btn-icon"
              style={{ width: '22px', height: '22px', minWidth: '22px', minHeight: '22px' }}
              title="Clear search query"
              aria-label="Clear search query"
            >
              <X size={13} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Empty State */}
      {filteredMemories.length === 0 && (
        <div style={{
          padding: '48px 24px',
          textAlign: 'center',
          background: 'rgba(16, 21, 36, 0.5)',
          border: '1px dashed var(--border-color)',
          borderRadius: '12px',
          color: 'var(--text-muted)'
        }}>
          <BrainCircuit size={36} style={{ margin: '0 auto 12px', opacity: 0.4, color: 'var(--cyan-primary)' }} />
          <h3 style={{ fontSize: '16px', color: '#fff', marginBottom: '6px' }}>No memories found</h3>
          <p style={{ fontSize: '13px', maxWidth: '420px', margin: '0 auto 16px' }}>
            No records matched the selected category "{selectedCategory}" and lifecycle filter "{selectedLifecycle}".
          </p>
          <button 
            onClick={() => { setSelectedCategory('All'); setSelectedLifecycle('ACTIVE'); setSearchQuery(''); }}
            className="btn-secondary"
            style={{ fontSize: '12px', padding: '6px 14px' }}
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* Memory Grid */}
      <div className="memory-store-grid">
        {filteredMemories.map(mem => {
          const audit = mem.date_audit || evaluateExamDate(mem.content);
          const isExam = mem.category === 'Exams' || (mem.title || '').toLowerCase().includes('exam');
          
          // Honest verification & lifecycle resolution
          const statusInfo = resolveMemoryStatus({ ...mem, date_audit: audit });
          const isOutdated = statusInfo.isOutdated;
          const isArchived = statusInfo.lifecycleState === 'ARCHIVED';

          return (
            <div 
              key={mem.id} 
              className="glass-panel-interactive memory-store-card" 
              style={{ 
                padding: 'var(--card-padding-compact, 20px)', 
                display: 'flex', 
                flexDirection: 'column', 
                justifyContent: 'space-between',
                border: isArchived 
                  ? '1px dashed rgba(255, 255, 255, 0.15)' 
                  : isOutdated 
                    ? '1px solid rgba(245, 158, 11, 0.35)' 
                    : '1px solid var(--border-color)',
                borderRadius: 'var(--radius-card, 14px)',
                background: isArchived ? 'rgba(16, 21, 36, 0.5)' : 'rgba(16, 21, 36, 0.85)',
                boxShadow: isOutdated ? '0 4px 20px -4px rgba(245, 158, 11, 0.1)' : undefined,
                opacity: isArchived ? 0.78 : 1
              }}
            >
              {/* TOP SECTION: Visual Groups 1, 2, and 3 */}
              <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                
                {/* Visual Group 1: Category Badges & Lifecycle Status Pill */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'flex-start', 
                  justifyContent: 'space-between', 
                  gap: '10px',
                  marginBottom: '14px',
                  flexWrap: 'wrap'
                }}>
                  {/* Category & Temporal Currency Badges */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', minWidth: 0 }}>
                    <span className={
                      mem.category === 'Exams' ? 'badge-cyan' :
                      mem.category === 'Weak Subjects' ? 'badge-orange' : 'badge-purple'
                    } style={{ 
                      fontSize: '11px', 
                      padding: '3px 8px', 
                      borderRadius: '6px', 
                      fontWeight: 600,
                      whiteSpace: 'nowrap'
                    }}>
                      {mem.category || 'General'}
                    </span>

                    {/* Date Currency Badges */}
                    {isExam && isOutdated && (
                      <span className="badge-orange" style={{ 
                        fontSize: '10px', 
                        padding: '3px 8px', 
                        borderRadius: '6px', 
                        fontWeight: 700, 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '4px',
                        whiteSpace: 'nowrap'
                      }} title="The date in this statement has passed. Please confirm upcoming exam date.">
                        <AlertTriangle size={11} />
                        <span>Past Exam Date (Outdated)</span>
                      </span>
                    )}

                    {isExam && statusInfo.isMissingYear && (
                      <span className="badge-purple" style={{ 
                        fontSize: '10px', 
                        padding: '3px 8px', 
                        borderRadius: '6px', 
                        fontWeight: 700,
                        whiteSpace: 'nowrap'
                      }} title="Missing calendar year; requires student confirmation.">
                        Needs Confirmation
                      </span>
                    )}

                    {isExam && audit.status === 'VALID_FUTURE' && (
                      <span className="badge-emerald" style={{ 
                        fontSize: '10px', 
                        padding: '3px 8px', 
                        borderRadius: '6px', 
                        fontWeight: 700, 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '4px',
                        whiteSpace: 'nowrap'
                      }} title="Upcoming exam date confirmed in calendar schedule.">
                        <ShieldCheck size={11} />
                        <span>Confirmed Future</span>
                      </span>
                    )}
                  </div>

                  {/* Lifecycle State Pill with Tooltip */}
                  <div 
                    className={statusInfo.lifecycleBadgeClass || statusInfo.badgeClass}
                    title={statusInfo.lifecycleTooltip || statusInfo.tooltip}
                    aria-label={`Lifecycle State: ${statusInfo.lifecycleLabel}. ${statusInfo.lifecycleTooltip}`}
                    style={{ 
                      fontSize: '11px', 
                      padding: '3px 9px', 
                      borderRadius: '6px', 
                      fontWeight: 600, 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '5px',
                      cursor: 'help',
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                      flexShrink: 0
                    }}
                  >
                    {statusInfo.lifecycleState === 'VERIFIED' && <ShieldCheck size={12} />}
                    {statusInfo.lifecycleState === 'UNVERIFIED' && <Clock size={12} />}
                    {statusInfo.lifecycleState === 'NEEDS_CONFIRMATION' && <AlertTriangle size={12} />}
                    {statusInfo.lifecycleState === 'OUTDATED' && <AlertTriangle size={12} />}
                    {statusInfo.lifecycleState === 'ARCHIVED' && <Archive size={12} />}
                    <span>{statusInfo.lifecycleLabel}</span>
                  </div>
                </div>

                {/* Visual Group 2: Title */}
                <h3 className="astra-card-title" style={{ 
                  color: isArchived ? 'var(--text-secondary)' : '#fff', 
                  marginBottom: '8px',
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word'
                }}>
                  {mem.title || 'Untitled Memory'}
                </h3>

                {/* Visual Group 3: Description / Content */}
                <p className="astra-body" style={{ 
                  fontSize: 'var(--text-body, 15px)',
                  color: isArchived ? 'var(--text-muted)' : 'var(--text-secondary)', 
                  lineHeight: 'var(--leading-normal, 1.5)', 
                  marginBottom: '16px',
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-wrap'
                }}>
                  {mem.content || 'No content recorded.'}
                </p>

                {/* Warning note if outdated */}
                {isExam && isOutdated && (
                  <div style={{
                    background: 'rgba(245, 158, 11, 0.08)',
                    border: '1px solid rgba(245, 158, 11, 0.25)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    marginBottom: '16px',
                    fontSize: '12px',
                    color: '#fbbf24',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '180px', flex: 1 }}>
                      <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                      <span>Date has passed. Upcoming date required for planning.</span>
                    </div>

                    <button
                      onClick={() => handleOpenUpdateModal(mem)}
                      className="btn-cyan"
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 700,
                        borderRadius: '6px',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      Update Date
                    </button>
                  </div>
                )}
              </div>

              {/* BOTTOM SECTION: Visual Groups 4 (Metadata & Provenance) and 5 (Actions) */}
              <div style={{ 
                marginTop: 'auto',
                borderTop: '1px solid rgba(255, 255, 255, 0.07)', 
                paddingTop: '12px' 
              }}>
                {/* Visual Group 4: Structured Metadata & Provenance */}
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column',
                  gap: '5px',
                  marginBottom: '12px'
                }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'baseline', 
                    gap: '6px', 
                    fontSize: 'var(--text-meta, 12.5px)', 
                    color: 'var(--text-muted)',
                    minWidth: 0,
                    overflowWrap: 'anywhere'
                  }}>
                    <Calendar size={13} style={{ flexShrink: 0, color: 'var(--text-secondary)', alignSelf: 'center' }} />
                    <span style={{ fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>Captured:</span>
                    <span style={{ color: 'var(--text-muted)' }}>{statusInfo.originalDate || mem.date || 'Not recorded'}</span>
                  </div>

                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'baseline', 
                    gap: '6px', 
                    fontSize: 'var(--text-meta, 12.5px)', 
                    color: 'var(--text-muted)',
                    minWidth: 0,
                    overflowWrap: 'anywhere'
                  }}>
                    <Radio size={13} style={{ flexShrink: 0, color: 'var(--text-secondary)', alignSelf: 'center' }} />
                    <span style={{ fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>Source:</span>
                    <span style={{ color: 'var(--text-muted)' }}>{statusInfo.originalSource || mem.source || 'Direct Entry'}</span>
                  </div>

                  {/* Last Verified Timestamp if present */}
                  {mem.last_verified_at && (
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'baseline', 
                      gap: '6px', 
                      fontSize: 'var(--text-meta, 12.5px)', 
                      color: 'var(--emerald-accent)',
                      minWidth: 0,
                      overflowWrap: 'anywhere'
                    }}>
                      <ShieldCheck size={13} style={{ flexShrink: 0, alignSelf: 'center' }} />
                      <span style={{ fontWeight: 600, flexShrink: 0 }}>Verified:</span>
                      <span style={{ opacity: 0.9 }}>{mem.last_verified_at}</span>
                    </div>
                  )}

                  {/* Last Updated Timestamp if modified */}
                  {mem.last_updated_at && mem.last_updated_at !== mem.date && (
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'baseline', 
                      gap: '6px', 
                      fontSize: 'var(--text-meta, 12.5px)', 
                      color: 'var(--text-muted)',
                      minWidth: 0,
                      overflowWrap: 'anywhere'
                    }}>
                      <Clock size={12} style={{ flexShrink: 0, color: 'var(--text-secondary)', alignSelf: 'center' }} />
                      <span style={{ fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>Updated:</span>
                      <span>{mem.last_updated_at}</span>
                    </div>
                  )}

                  {/* Edit History Badge */}
                  {statusInfo.editHistory && statusInfo.editHistory.length > 0 && (
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '5px', 
                      fontSize: '10px', 
                      color: 'var(--cyan-text)',
                      marginTop: '2px'
                    }}>
                      <History size={11} />
                      <span>{statusInfo.editHistory.length} audit revision{statusInfo.editHistory.length > 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>

                {/* Visual Group 5: Available Actions Row */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  gap: '8px',
                  paddingTop: '8px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.04)'
                }}>
                  <span style={{ 
                    fontSize: '10px', 
                    color: 'var(--text-muted)', 
                    letterSpacing: '0.04em', 
                    textTransform: 'uppercase',
                    fontFamily: 'var(--font-mono)'
                  }}>
                    {mem.id}
                  </span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {/* Edit Button */}
                    <button
                      onClick={() => handleOpenEditModal(mem)}
                      className="btn-secondary btn-sm"
                      style={{ color: 'var(--cyan-primary)', borderColor: 'rgba(0, 242, 254, 0.25)' }}
                      title="Open and edit memory details, lifecycle, or category"
                      aria-label={`Edit memory: ${mem.title}`}
                    >
                      <Edit3 size={12} />
                      <span>Edit</span>
                    </button>

                    {/* Delete Button */}
                    <button 
                      onClick={() => handleOpenDeleteConfirm(mem)}
                      className="btn-destructive btn-sm"
                      title="Delete this memory from SQLite store with Undo option"
                      aria-label={`Delete memory: ${mem.title}`}
                    >
                      <Trash2 size={12} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* --- EDIT MEMORY MODAL --- */}
      {editModalMemory && (
        <div 
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-memory-dialog-title"
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 120,
            padding: '16px'
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditModalMemory(null);
          }}
        >
          <div className="glass-panel" style={{ width: '560px', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--cyan-primary)', fontSize: '11px', fontWeight: 700 }}>
                  <Edit3 size={15} aria-hidden="true" />
                  <span>EDIT PERSONAL MEMORY & LIFECYCLE</span>
                </div>
                <h3 id="edit-memory-dialog-title" style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginTop: '2px', margin: 0 }}>
                  Update Memory Record
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setEditModalMemory(null)}
                className="btn-icon"
                title="Close dialog"
                aria-label="Close dialog"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {/* Concurrency Conflict Alert Notice */}
            {editConflictNotice && (
              <div style={{
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px',
                fontSize: '12px',
                color: '#fbbf24',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                  <AlertTriangle size={16} aria-hidden="true" />
                  <span>{editConflictNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={handleReloadConflictRecord}
                  className="btn-secondary"
                  style={{ fontSize: '11px', padding: '4px 10px', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  <RefreshCw size={12} aria-hidden="true" />
                  <span>Reload Latest Database Record</span>
                </button>
              </div>
            )}

            <form onSubmit={handleSaveEditSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label htmlFor="edit-memory-category-select" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                    CATEGORY
                  </label>
                  <select 
                    id="edit-memory-category-select"
                    value={editCategory} 
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="astra-select"
                  >
                    <option value="Exams">Exams</option>
                    <option value="Weak Subjects">Weak Subjects</option>
                    <option value="Preferences">Preferences</option>
                    <option value="Goals">Goals</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="edit-memory-lifecycle-select" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                    LIFECYCLE STATE
                  </label>
                  <select 
                    id="edit-memory-lifecycle-select"
                    value={editLifecycleState} 
                    onChange={(e) => setEditLifecycleState(e.target.value)}
                    className="astra-select"
                  >
                    <option value="VERIFIED">Verified (Authoritative student fact)</option>
                    <option value="UNVERIFIED">Unverified (Inferred capture, unconfirmed)</option>
                    <option value="NEEDS_CONFIRMATION">Needs Confirmation (Ambiguous or missing year)</option>
                    <option value="OUTDATED">Outdated (Past temporal details)</option>
                    <option value="ARCHIVED">Archived (Historical archive; hidden from active)</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label htmlFor="edit-memory-title-input" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  MEMORY TITLE
                </label>
                <input 
                  id="edit-memory-title-input"
                  type="text" 
                  value={editTitle} 
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Memory Title"
                  required
                  className="astra-input"
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="edit-memory-content-textarea" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  CONTENT / FACTUAL STATEMENT
                </label>
                <textarea 
                  id="edit-memory-content-textarea"
                  rows={4}
                  value={editContent} 
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="Memory Content"
                  required
                  className="astra-textarea"
                  style={{ resize: 'vertical' }}
                />
              </div>

              {/* Provenance & Revision History Box */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.07)',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '20px',
                fontSize: '11px',
                color: 'var(--text-muted)'
              }}>
                <div style={{ fontWeight: 700, color: 'var(--cyan-primary)', marginBottom: '6px', letterSpacing: '0.04em' }}>
                  PROVENANCE & AUDIT TRACKING
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>Original Extraction Date: </span>
                    <span style={{ color: '#fff' }}>{editModalMemory.original_date || editModalMemory.date || 'Initial entry'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>Original Source: </span>
                    <span style={{ color: '#fff' }}>{editModalMemory.original_source || editModalMemory.source || 'Direct Entry'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>Last Verified: </span>
                    <span style={{ color: editModalMemory.last_verified_at ? 'var(--emerald-accent)' : '#94a3b8' }}>
                      {editModalMemory.last_verified_at || 'Not yet verified'}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>Last Updated: </span>
                    <span style={{ color: '#fff' }}>{editModalMemory.last_updated_at || editModalMemory.date || 'Never'}</span>
                  </div>
                </div>

                {/* Edit revisions log */}
                {Array.isArray(editModalMemory.edit_history) && editModalMemory.edit_history.length > 0 && (
                  <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '8px', marginTop: '6px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Previous Revisions ({editModalMemory.edit_history.length}):
                    </div>
                    <div style={{ maxHeight: '90px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {editModalMemory.edit_history.map((rev, idx) => (
                        <div key={idx} style={{ background: 'rgba(255,255,255,0.02)', padding: '4px 6px', borderRadius: '4px' }}>
                          <span style={{ color: 'var(--cyan-text)' }}>[{rev.timestamp || 'Previous'}]</span>{' '}
                          <span>{rev.reason || rev.change_source || 'Correction'}: </span>
                          <span style={{ color: '#cbd5e1' }}>"{rev.previous_content?.slice(0, 48) || rev.previous_title}..."</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={() => setEditModalMemory(null)}
                  disabled={isSavingEdit}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-cyan"
                  disabled={isSavingEdit}
                >
                  <Check size={14} aria-hidden="true" />
                  <span>{isSavingEdit ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- DELETE CONFIRMATION DIALOG MODAL --- */}
      {deleteConfirmMemory && (
        <div 
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-memory-dialog-title"
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 130,
            padding: '16px'
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setDeleteConfirmMemory(null);
          }}
        >
          <div className="glass-panel" style={{ width: '480px', maxWidth: 'calc(100vw - 32px)', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', color: '#f87171' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Trash2 size={18} aria-hidden="true" />
              </div>
              <h3 id="delete-memory-dialog-title" style={{ fontSize: '18px', fontWeight: 700, color: '#fff', margin: 0 }}>
                Confirm Memory Deletion
              </h3>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '16px' }}>
              Are you sure you want to delete this memory from ASTRA's persistent SQLite database?
            </p>

            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '16px'
            }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
                {deleteConfirmMemory.title}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                {deleteConfirmMemory.content}
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                <span>Category: <strong>{deleteConfirmMemory.category}</strong></span>
                <span>ID: <code>{deleteConfirmMemory.id}</code></span>
              </div>
            </div>

            <div style={{
              background: 'rgba(0, 242, 254, 0.05)',
              border: '1px solid rgba(0, 242, 254, 0.15)',
              borderRadius: '6px',
              padding: '8px 12px',
              marginBottom: '20px',
              fontSize: '11px',
              color: 'var(--cyan-text)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <RotateCcw size={13} style={{ flexShrink: 0 }} aria-hidden="true" />
              <span>An instant <strong>Undo</strong> action will be available right after deletion.</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={() => setDeleteConfirmMemory(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="btn-destructive"
              >
                <Trash2 size={14} aria-hidden="true" />
                <span>{isDeleting ? 'Deleting...' : 'Delete Memory'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- ADD MEMORY MODAL --- */}
      {showAddModal && (
        <div 
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-memory-dialog-title"
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setShowAddModal(false);
          }}
        >
          <div className="glass-panel" style={{ width: '480px', maxWidth: 'calc(100vw - 32px)', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 id="add-memory-dialog-title" style={{ fontSize: '18px', fontWeight: 700, color: '#fff', margin: 0 }}>
                Store Memory in SQLite DB
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button 
                  type="button"
                  onClick={handleVoiceAdd} 
                  style={{
                    background: isListening ? 'rgba(239, 68, 68, 0.2)' : 'rgba(0,242,254,0.1)',
                    color: isListening ? '#ef4444' : 'var(--cyan-primary)',
                    border: '1px solid rgba(0,242,254,0.3)',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  aria-pressed={isListening}
                  aria-label={isListening ? "Listening to voice... click to stop" : "Start voice input for memory"}
                >
                  <Mic size={13} aria-hidden="true" />
                  <span>{isListening ? 'Listening...' : 'Voice Input'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn-icon"
                  title="Close dialog"
                  aria-label="Close dialog"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            </div>

            <form onSubmit={handleAddMemorySubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label htmlFor="add-memory-category-select" style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                    CATEGORY
                  </label>
                  <select 
                    id="add-memory-category-select"
                    value={newCategory} 
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="astra-select"
                  >
                    <option value="Exams">Exams</option>
                    <option value="Weak Subjects">Weak Subjects</option>
                    <option value="Preferences">Preferences</option>
                    <option value="Goals">Goals</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="add-memory-lifecycle-select" style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                    INITIAL LIFECYCLE
                  </label>
                  <select 
                    id="add-memory-lifecycle-select"
                    value={newLifecycleState} 
                    onChange={(e) => setNewLifecycleState(e.target.value)}
                    className="astra-select"
                  >
                    <option value="UNVERIFIED">Unverified (Default capture)</option>
                    <option value="VERIFIED">Verified (Direct student fact)</option>
                    <option value="NEEDS_CONFIRMATION">Needs Confirmation</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label htmlFor="add-memory-title-input" style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                  MEMORY TITLE
                </label>
                <input 
                  id="add-memory-title-input"
                  type="text" 
                  placeholder="e.g. DBMS Exam Date" 
                  value={newTitle} 
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                  className="astra-input"
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label htmlFor="add-memory-content-textarea" style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                  CONTENT / DETAIL
                </label>
                <textarea 
                  id="add-memory-content-textarea"
                  rows={3}
                  placeholder="e.g. DBMS exam is scheduled for November 15, 2026..." 
                  value={newContent} 
                  onChange={(e) => setNewContent(e.target.value)}
                  required
                  className="astra-textarea"
                  style={{ resize: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowAddModal(false)} disabled={isSavingNew}>
                  Cancel
                </button>
                <button type="submit" className="btn-cyan" disabled={isSavingNew}>
                  <span>{isSavingNew ? 'Saving...' : 'Save Memory'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- UPDATE EXAM DATE MODAL --- */}
      {updateModalMemory && (
        <div 
          role="dialog"
          aria-modal="true"
          aria-labelledby="update-date-dialog-title"
          onKeyDown={(e) => { if (e.key === 'Escape') setUpdateModalMemory(null); }}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110
          }}
        >
          <div className="glass-panel" style={{ width: '460px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--cyan-primary)', fontSize: '11px', fontWeight: 700 }}>
              <CalendarCheck size={16} aria-hidden="true" />
              <span>CONFIRM UPCOMING EXAM DATE</span>
            </div>

            <h3 id="update-date-dialog-title" style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>
              Update {updateModalMemory.title}
            </h3>

            <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.5', marginBottom: '16px' }}>
              The currently stored exam date in this memory has passed. Enter your confirmed upcoming exam date to generate an active countdown schedule.
            </p>

            <form onSubmit={handleConfirmDateUpdate}>
              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="confirmed-exam-date-input" style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>CONFIRMED UPCOMING EXAM DATE</label>
                <input 
                  id="confirmed-exam-date-input"
                  type="date"
                  min={todayIso}
                  value={updateDateValue}
                  onChange={(e) => setUpdateDateValue(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-color)',
                    color: '#fff',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    fontSize: '13px',
                    outline: 'none',
                    fontFamily: 'var(--font-mono)'
                  }}
                  required
                />
              </div>

              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '8px',
                padding: '10px 12px',
                marginBottom: '20px',
                fontSize: '11px',
                color: 'var(--text-muted)'
              }}>
                <div>Current Stored Content: <span style={{ color: '#fff' }}>{updateModalMemory.content}</span></div>
                <div style={{ marginTop: '4px' }}>Original Source: {updateModalMemory.original_source || updateModalMemory.source} (Preserved for audit trail)</div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="btn-secondary" onClick={() => setUpdateModalMemory(null)}>
                  Cancel
                </button>
                <button type="submit" disabled={isUpdatingDate || !updateDateValue} className="btn-cyan">
                  <Check size={14} aria-hidden="true" />
                  <span>{isUpdatingDate ? 'Saving...' : 'Confirm Date'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
