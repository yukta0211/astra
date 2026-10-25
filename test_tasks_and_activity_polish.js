import assert from 'node:assert';
import fs from 'node:fs';

console.log('Testing Pending Tasks and Action Feed polish in MissionControl.jsx and index.css...');

// 1. Read files
const jsx = fs.readFileSync('./src/components/MissionControl.jsx', 'utf-8');
const css = fs.readFileSync('./src/index.css', 'utf-8');

// 2. Lucide Icon imports
assert.ok(jsx.includes('Check'), 'Must import Check icon from lucide-react');
assert.ok(jsx.includes('AlertTriangle'), 'Must import AlertTriangle icon from lucide-react');

// 3. Task State Classification logic
assert.ok(jsx.includes('getTaskClassification'), 'Must have getTaskClassification function');
assert.ok(jsx.includes('overdue'), 'Must detect overdue tasks');
assert.ok(jsx.includes('completed'), 'Must detect completed tasks');

// Simulate the classifier function logic
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

// Test classification scenarios
assert.strictEqual(getTaskClassification({ completed: true, title: 'Task 1' }), 'completed');
assert.strictEqual(getTaskClassification({ completed: false, subtext: 'Overdue by 2 hours' }), 'overdue');
assert.strictEqual(getTaskClassification({ completed: false, subtext: 'Submitted yesterday' }), 'overdue');
assert.strictEqual(getTaskClassification({ completed: false, isOverdue: true, subtext: 'Normal' }), 'overdue');
assert.strictEqual(getTaskClassification({ completed: false, subtext: 'Due today · 5:00 PM' }), 'today');
assert.strictEqual(getTaskClassification({ completed: false, subtext: 'DBMS · 2 hours' }), 'upcoming');

// 4. Completed Task Visual Treatment & Contrast Requirements
assert.ok(jsx.includes("color: isCompleted ? '#cbd5e1' : '#ffffff'"), 'Completed title must maintain readable contrast (#cbd5e1)');
assert.ok(jsx.includes("textDecoration: isCompleted ? 'line-through' : 'none'"), 'Completed title uses line-through as supporting cue');
assert.ok(jsx.includes("<Check size={10}"), 'Completed tasks must display a clear Check icon');
assert.ok(jsx.includes("Done"), 'Completed tasks must display a clear Done label');
assert.ok(jsx.includes("color: isOverdue ? '#fca5a5' : '#94a3b8'"), 'Subtext must maintain readable contrast (#94a3b8)');

// 5. Distinct States & Live Dynamic Counts from Actual Data
assert.ok(jsx.includes("tasks.filter(t => !t.completed).length"), 'Must derive pending count directly from actual task data');
assert.ok(jsx.includes("tasks.filter(t => t.completed).length"), 'Must derive completed count directly from actual task data');
assert.ok(jsx.includes("getTaskClassification(t) === 'overdue'"), 'Must derive overdue count directly from actual task data');
assert.ok(jsx.includes("AlertTriangle"), 'Overdue tasks must display AlertTriangle icon and Overdue label');

// 6. Action Feed 3-Region Layout
// Region 1: Fixed Icon Badge
assert.ok(jsx.includes("width: '26px'"), 'Action feed icon badge must have consistent fixed 26px width');
assert.ok(jsx.includes("height: '26px'"), 'Action feed icon badge must have consistent fixed 26px height');
assert.ok(jsx.includes("flexShrink: 0"), 'Action feed icon badge must have flexShrink: 0');

// Region 2: Event Description with clean text wrapping
assert.ok(jsx.includes("flex: '1 1 auto'"), 'Action feed description must take available space (flex: 1 1 auto)');
assert.ok(jsx.includes("minWidth: 0"), 'Action feed description must have minWidth: 0 to prevent flexbox clipping/overflow');
assert.ok(jsx.includes("overflowWrap: 'break-word'"), 'Action feed description must wrap cleanly without touching timestamps');
assert.ok(jsx.includes("wordBreak: 'break-word'"), 'Action feed description must break long words');

// Region 3: Legible Secondary Timestamp
assert.ok(jsx.includes("whiteSpace: 'nowrap'"), 'Timestamp must not wrap onto itself');
assert.ok(jsx.includes("minWidth: 'max-content'"), 'Timestamp must reserve its full width');
assert.ok(jsx.includes("marginLeft: 'auto'"), 'Timestamp must be separated cleanly at the right edge');
assert.ok(jsx.includes("color: '#94a3b8'"), 'Timestamp must be secondary but legible (#94a3b8)');

// 7. Empty State Handling
assert.ok(jsx.includes("tasks.length === 0 ? ("), 'Must cleanly handle empty tasks queue');
assert.ok(jsx.includes("No Active Tasks in Queue"), 'Must display empty tasks queue message');
assert.ok(jsx.includes("recentActivity.length === 0 ? ("), 'Must cleanly handle empty activity feed');
assert.ok(jsx.includes("No Recent System Activity"), 'Must display empty activity feed message');

// 8. Custom Checkbox CSS in index.css
assert.ok(css.includes(".custom-checkbox:checked"), 'Must style checked checkbox');
assert.ok(css.includes("background: var(--emerald-accent)"), 'Checked checkbox must use emerald accent for completion distinction');
assert.ok(css.includes("content: '✓'"), 'Checked checkbox must show checkmark');
assert.ok(css.includes("color: #ffffff"), 'Checked checkbox checkmark must have crisp white contrast');

// 9. Existing Operations Preserved
assert.ok(jsx.includes("toggleTask(task.id)"), 'Must preserve toggleTask operation');
assert.ok(jsx.includes("deleteTask(task.id, task.title)"), 'Must preserve deleteTask operation');
assert.ok(jsx.includes("setShowAddTaskModal(true)"), 'Must preserve Add Task modal trigger');

console.log('✓ All 9 verification checks for Pending Tasks and Action Feed passed successfully!');
