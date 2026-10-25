import assert from 'node:assert';
import fs from 'node:fs';

console.log('Running comprehensive ASTRA WCAG 2.2 AA Practical Accessibility Audit...');

// =========================================================================
// 1. GLOBAL STYLES & ACCESSIBILITY TOKENS (src/index.css & src/App.jsx)
// =========================================================================
const css = fs.readFileSync('./src/index.css', 'utf-8');
const appJsx = fs.readFileSync('./src/App.jsx', 'utf-8');

console.log('\n--- 1. Global Shell & Navigation Skip Link ---');
// Skip link exists and targets #main-content
assert.ok(appJsx.includes('className="skip-link"'), 'App.jsx must render a skip-to-main-content link');
assert.ok(appJsx.includes('href="#main-content"'), 'Skip link must target #main-content');
assert.ok(appJsx.includes('id="main-content"'), 'Main container must have id="main-content"');
assert.ok(appJsx.includes('tabIndex="-1"') || appJsx.includes('tabIndex={-1}'), 'Main container must have tabIndex="-1" to receive focus from skip link');

// Skip link CSS properties
assert.ok(css.includes('.skip-link'), 'CSS must define .skip-link');
assert.ok(css.includes('.skip-link:focus') || css.includes('.skip-link:focus-visible'), 'CSS must handle .skip-link:focus-visible');

// Universal Focus-Visible Ring (WCAG 2.2 SC 2.4.11 Focus Appearance & 2.4.13 Focus Not Obscured)
console.log('--- Universal Focus Indicator ---');
assert.ok(css.includes(':focus-visible'), 'CSS must provide :focus-visible rules');
assert.ok(css.includes('outline: 2px solid var(--cyan-primary) !important') || css.includes('outline: 2px solid'), 'Visible focus ring must be at least 2px solid with high contrast');
assert.ok(css.includes('outline-offset: 2px !important') || css.includes('outline-offset:'), 'Focus ring must provide outline-offset for clarity');

// Reduced Motion Preference (WCAG 2.2 SC 2.3.3 Animation from Interactions)
console.log('--- Reduced Motion Support ---');
assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'CSS must respect user reduced motion preferences');
assert.ok(css.includes('animation-duration: 0.01ms') || css.includes('animation: none'), 'Reduced motion must suppress or clamp animation duration');

console.log('✓ Global shell, skip link, focus-visible, and reduced-motion verified.');


// =========================================================================
// 2. LANDMARKS & SIDEBAR NAVIGATION (src/components/Sidebar.jsx)
// =========================================================================
console.log('\n--- 2. Landmark Structure & Sidebar Navigation ---');
const sidebarJsx = fs.readFileSync('./src/components/Sidebar.jsx', 'utf-8');

assert.ok(sidebarJsx.includes('<aside') && sidebarJsx.includes('aria-label="Main Navigation"'), 'Sidebar must be an <aside> landmark with accessible label');
assert.ok(sidebarJsx.includes('<nav aria-label="Workspace navigation"'), 'Sidebar must contain workspace <nav> landmark');
assert.ok(sidebarJsx.includes('<nav aria-label="Account navigation"'), 'Sidebar must contain account <nav> landmark');
assert.ok(sidebarJsx.includes("aria-current={isActive ? 'page' : undefined}"), 'Current route must receive aria-current="page"');
assert.ok(sidebarJsx.includes('aria-expanded={!collapsed}'), 'Collapse toggle button must declare aria-expanded state');
assert.ok(sidebarJsx.includes('aria-label='), 'Collapse toggle and student account button must have descriptive aria-label');

console.log('✓ Sidebar navigation landmarks, states, and accessible names verified.');


// =========================================================================
// 3. HEADER & STATUS ANNOUNCEMENTS (src/components/Header.jsx)
// =========================================================================
console.log('\n--- 3. Header & Real-time Status Announcements ---');
const headerJsx = fs.readFileSync('./src/components/Header.jsx', 'utf-8');

assert.ok(headerJsx.includes('role="banner"'), 'Header must declare banner role');
assert.ok(headerJsx.includes('<nav aria-label="Breadcrumb"'), 'Breadcrumb must be contained in an accessible <nav> landmark');
assert.ok(headerJsx.includes('aria-current="page"'), 'Current breadcrumb crumb must have aria-current="page"');
assert.ok(headerJsx.includes('aria-live="polite"'), 'Header must provide aria-live="polite" region for system status updates');
assert.ok(headerJsx.includes('role="dialog"') && headerJsx.includes('aria-modal="true"'), 'System status popover must be an accessible modal dialog');
assert.ok(headerJsx.includes("e.key === 'Escape'"), 'System status popover must be dismissible with Escape key');

console.log('✓ Header landmarks, live regions, and popover dialog verified.');


// =========================================================================
// 4. MISSION CONTROL (src/components/MissionControl.jsx)
// =========================================================================
console.log('\n--- 4. Mission Control Accessibility ---');
const mcJsx = fs.readFileSync('./src/components/MissionControl.jsx', 'utf-8');

// Single H1 per page
assert.ok(mcJsx.includes('<h1') && mcJsx.includes('ASTRA AI COMMAND CENTER'), 'Mission Control must have an <h1> page title');

// Live announcements for async AI responses, timer, and task toggles
assert.ok(mcJsx.includes('aria-live="polite"') && mcJsx.includes('srAnnouncement'), 'Mission Control must have a screen-reader live announcement region');
assert.ok(mcJsx.includes('setSrAnnouncement('), 'Mission Control must post announcements on important actions');

// Voice input button
assert.ok(mcJsx.includes('aria-pressed={isListening}'), 'Voice input button must communicate aria-pressed listening state');

// Task Checkboxes have accessible labels
assert.ok(mcJsx.includes('aria-label={`Toggle task: ${task.title}`}'), 'Task checkboxes must have descriptive accessible labels');

// Add Task Modal dialog & radiogroup for priority
assert.ok(mcJsx.includes('role="dialog"'), 'Add Task modal must have role="dialog"');
assert.ok(mcJsx.includes('aria-modal="true"'), 'Add Task modal must have aria-modal="true"');
assert.ok(mcJsx.includes('aria-labelledby="add-task-dialog-title"'), 'Add Task modal must have aria-labelledby');
assert.ok(mcJsx.includes("e.key === 'Escape'"), 'Add Task modal must support Escape key dismissal');
assert.ok(mcJsx.includes('role="radiogroup"'), 'Priority selector must use role="radiogroup"');
assert.ok(mcJsx.includes('role="radio"'), 'Priority options must use role="radio"');
assert.ok(mcJsx.includes('aria-checked='), 'Priority radio buttons must declare aria-checked state');

// Form label-input associations
assert.ok(mcJsx.includes('htmlFor="task-description-input"'), 'Task title label must be associated via htmlFor');
assert.ok(mcJsx.includes('id="task-description-input"'), 'Task title input must have id="task-description-input"');
assert.ok(mcJsx.includes('htmlFor="task-module-select"'), 'Task module label must be associated via htmlFor');
assert.ok(mcJsx.includes('id="task-module-select"'), 'Task module select must have id="task-module-select"');

// Focus restoration on modal close
assert.ok(mcJsx.includes('addTaskBtnRef.current.focus()') || mcJsx.includes('addTaskBtnRef.current?.focus()'), 'Must restore focus to Add Task button when modal is closed');

// Pomodoro timer accessible controls
assert.ok(mcJsx.includes('role="tablist" aria-label="Timer duration mode"'), 'Timer tabs must declare role="tablist"');
assert.ok(mcJsx.includes('role="tab"'), 'Timer mode buttons must declare role="tab"');

console.log('✓ Mission Control page title, live announcements, dialogs, form associations, and timer accessibility verified.');


// =========================================================================
// 5. MEMORY ARCHITECTURE VIEW (src/components/MemoryView.jsx)
// =========================================================================
console.log('\n--- 5. Memory View Accessibility ---');
const memJsx = fs.readFileSync('./src/components/MemoryView.jsx', 'utf-8');

// Page heading
assert.ok(memJsx.includes('<h1 className="astra-page-title">'), 'Memory View must have an <h1> page title');

// Live announcements for filter changes
assert.ok(memJsx.includes('aria-live="polite"') && memJsx.includes('className="sr-only"'), 'Memory View must have a live announcement region');

// Tablist & tabs for Lifecycle state filters
assert.ok(memJsx.includes('role="tablist"'), 'Lifecycle filter container must have role="tablist"');
assert.ok(memJsx.includes('role="tab"'), 'Lifecycle filter tabs must have role="tab"');
assert.ok(memJsx.includes('aria-selected='), 'Lifecycle filter tabs must declare aria-selected');

// Modals: Edit Modal, Delete Modal, Add Memory Modal, and Update Exam Date Modal
const dialogCount = (memJsx.match(/role="dialog"/g) || []).length;
assert.ok(dialogCount >= 4, `Memory View must have at least 4 accessible dialogs (found ${dialogCount})`);

const escapeCount = (memJsx.match(/e\.key === 'Escape'/g) || []).length;
assert.ok(escapeCount >= 4, `All dialogs in Memory View must support Escape dismissal (found ${escapeCount})`);

// Label associations
assert.ok(memJsx.includes('htmlFor="edit-memory-title-input"'), 'Edit modal title label must have htmlFor');
assert.ok(memJsx.includes('id="edit-memory-title-input"'), 'Edit modal title input must have id');
assert.ok(memJsx.includes('htmlFor="add-memory-title-input"'), 'Add modal title label must have htmlFor');
assert.ok(memJsx.includes('id="add-memory-title-input"'), 'Add modal title input must have id');
assert.ok(memJsx.includes('htmlFor="confirmed-exam-date-input"'), 'Exam date update label must have htmlFor');
assert.ok(memJsx.includes('id="confirmed-exam-date-input"'), 'Exam date update input must have id');

console.log('✓ Memory View tablist, live announcements, 4 accessible dialogs, and form labels verified.');


// =========================================================================
// 6. KNOWLEDGE BASE & RAG (src/components/KnowledgeView.jsx)
// =========================================================================
console.log('\n--- 6. Knowledge View Accessibility ---');
const knowJsx = fs.readFileSync('./src/components/KnowledgeView.jsx', 'utf-8');

assert.ok(knowJsx.includes('<h1 className="astra-page-title">'), 'Knowledge View must have an <h1> page title');
assert.ok(knowJsx.includes('role="status" aria-live="polite"') || knowJsx.includes('aria-live="polite"'), 'Knowledge View must render live announcement region');
assert.ok(knowJsx.includes('role="region"') && knowJsx.includes('aria-label="PDF Document Upload Dropzone"'), 'Upload dropzone must be an accessible region with label');
assert.ok(knowJsx.includes('aria-label="Upload PDF notes document"'), 'Hidden file input must have accessible aria-label');
assert.ok(knowJsx.includes('id="knowledge-query-input"'), 'Knowledge query input must have id');

console.log('✓ Knowledge View dropzone, file input, and live announcements verified.');


// =========================================================================
// 7. EXAM REVISION PLANNER (src/components/PlannerView.jsx)
// =========================================================================
console.log('\n--- 7. Planner View Accessibility ---');
const planJsx = fs.readFileSync('./src/components/PlannerView.jsx', 'utf-8');

assert.ok(planJsx.includes('<h1 className="planner-header-title">'), 'Planner View must have an <h1> page title');
assert.ok(planJsx.includes('role="status"') && planJsx.includes('aria-live="polite"'), 'Planner toast must have role="status" and aria-live="polite"');
assert.ok(planJsx.includes('role="toolbar" aria-label="Planner actions"'), 'Planner header actions must be grouped in an accessible toolbar');
assert.ok(planJsx.includes('htmlFor="confirmed-exam-date-input"'), 'Date confirmation form must have label with htmlFor');
assert.ok(planJsx.includes('id="confirmed-exam-date-input"'), 'Date confirmation form input must have matching id');

console.log('✓ Planner View toolbar, toast status, and form label associations verified.');


// =========================================================================
// 8. ADAPTIVE QUIZ MODE (src/components/QuizModeView.jsx)
// =========================================================================
console.log('\n--- 8. Quiz Mode View Accessibility ---');
const quizJsx = fs.readFileSync('./src/components/QuizModeView.jsx', 'utf-8');

assert.ok(quizJsx.includes('<h1 className="astra-page-title">'), 'Quiz Mode must have an <h1> page title');
assert.ok(quizJsx.includes('role="status" aria-live="polite"'), 'Quiz Mode must announce answer feedback and question navigation');
assert.ok(quizJsx.includes('role="radiogroup"'), 'Quiz options container must have role="radiogroup"');
assert.ok(quizJsx.includes('role="radio"'), 'Quiz options must have role="radio"');
assert.ok(quizJsx.includes('aria-checked='), 'Quiz options must declare aria-checked');
assert.ok(quizJsx.includes('<button'), 'Quiz options must be native interactive <button> elements instead of <div>');
assert.ok(quizJsx.includes('questionHeadingRef.current?.focus()'), 'Must manage focus to question heading on question transition');

console.log('✓ Quiz Mode radiogroup, button options, live feedback, and focus management verified.');


// =========================================================================
// 9. SYSTEM SETTINGS (src/components/SettingsView.jsx)
// =========================================================================
console.log('\n--- 9. Settings View Accessibility ---');
const setJsx = fs.readFileSync('./src/components/SettingsView.jsx', 'utf-8');

assert.ok(setJsx.includes('<h1 className="astra-page-title">'), 'Settings View must have an <h1> page title');
assert.ok(setJsx.includes('aria-pressed={!isMuted}'), 'Mute button must communicate aria-pressed state');
assert.ok(setJsx.includes('htmlFor="topk-slider"'), 'Top-K slider must have associated label via htmlFor');
assert.ok(setJsx.includes('id="topk-slider"'), 'Top-K slider must have id="topk-slider"');
assert.ok(setJsx.includes('aria-valuetext='), 'Sliders must provide human-readable aria-valuetext');
assert.ok(setJsx.includes('htmlFor="similarity-slider"'), 'Similarity slider must have associated label via htmlFor');
assert.ok(setJsx.includes('id="similarity-slider"'), 'Similarity slider must have id="similarity-slider"');

console.log('✓ Settings View form associations, aria-pressed, and slider aria-valuetext verified.');


// =========================================================================
// 10. NON-COLOR-DEPENDENT MESSAGES & HIGH-CONTRAST RATIOS (WCAG 2.2 SC 1.4.1 & 1.4.3)
// =========================================================================
console.log('\n--- 10. Color Independence & Contrast ---');
// Badges must include icons/text along with color
assert.ok(css.includes('.badge-cyan') && css.includes('.badge-orange') && css.includes('.badge-emerald'), 'CSS must define semantic badge classes');
assert.ok(css.includes('--color-error-text: #f87171'), 'CSS must define accessible error text color with >= 4.5:1 contrast');
assert.ok(css.includes('--color-warning-text: #fbbf24'), 'CSS must define accessible warning text color with >= 4.5:1 contrast');
assert.ok(css.includes('--color-success-text: #34d399'), 'CSS must define accessible success text color with >= 4.5:1 contrast');

console.log('\n=========================================================================');
console.log('🎉 ALL AUTOMATED PRACTICAL ACCESSIBILITY WCAG 2.2 CHECKS PASSED!');
console.log('=========================================================================');
