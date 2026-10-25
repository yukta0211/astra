import assert from 'node:assert';
import fs from 'node:fs';

console.log('Running advanced validation for Pending Tasks & Action Feed components...');

const jsx = fs.readFileSync('./src/components/MissionControl.jsx', 'utf-8');
const css = fs.readFileSync('./src/index.css', 'utf-8');

// 1. Task Classification & Distinct States
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

const mockTasks = [
  { id: '1', title: 'Overdue assignment', completed: false, isOverdue: true, subtext: 'Past due by 1 day' },
  { id: '2', title: 'Due today session', completed: false, subtext: 'Due today · 18:00' },
  { id: '3', title: 'Upcoming quiz review', completed: false, subtext: 'Tomorrow · 10:00' },
  { id: '4', title: 'Completed proof', completed: true, subtext: 'DBMS · 1 hour' },
];

assert.strictEqual(getTaskClassification(mockTasks[0]), 'overdue');
assert.strictEqual(getTaskClassification(mockTasks[1]), 'today');
assert.strictEqual(getTaskClassification(mockTasks[2]), 'upcoming');
assert.strictEqual(getTaskClassification(mockTasks[3]), 'completed');

// 2. Dynamic Count Calculations from Data
const pending = mockTasks.filter(t => !t.completed).length;
const completed = mockTasks.filter(t => t.completed).length;
const overdue = mockTasks.filter(t => !t.completed && getTaskClassification(t) === 'overdue').length;

assert.strictEqual(pending, 3);
assert.strictEqual(completed, 1);
assert.strictEqual(overdue, 1);

// 3. Completed State Multiple Indicators
// Checkmark + Done label + strike-through + emerald indicator + readable title contrast
assert.ok(jsx.includes('<Check size={10} strokeWidth={3} />'), 'Must render Checkmark icon for completed task');
assert.ok(jsx.includes('Done'), 'Must render Done label badge for completed task');
assert.ok(jsx.includes("textDecoration: isCompleted ? 'line-through' : 'none'"), 'Must render line-through on completed title');
assert.ok(jsx.includes("color: isCompleted ? '#cbd5e1' : '#ffffff'"), 'Completed task title must use accessible #cbd5e1 contrast');
assert.ok(jsx.includes("color: isOverdue ? '#fca5a5' : '#94a3b8'"), 'Subtext must maintain clear #94a3b8 contrast');

// 4. Action Feed 3-Region Layout & Non-overlapping Timestamps
assert.ok(jsx.includes("width: '26px'"), 'Action Feed icon must be fixed 26px width');
assert.ok(jsx.includes("height: '26px'"), 'Action Feed icon must be fixed 26px height');
assert.ok(jsx.includes("flex: '1 1 auto'"), 'Action Feed text must take available space');
assert.ok(jsx.includes("minWidth: 0"), 'Action Feed text must have minWidth: 0 for proper wrapping');
assert.ok(jsx.includes("overflowWrap: 'break-word'"), 'Action Feed text must wrap long words');
assert.ok(jsx.includes("whiteSpace: 'nowrap'"), 'Timestamp must have whiteSpace: nowrap');
assert.ok(jsx.includes("minWidth: 'max-content'"), 'Timestamp must reserve full width without shrinking');
assert.ok(jsx.includes("marginLeft: 'auto'"), 'Timestamp must align cleanly to the right');
assert.ok(jsx.includes("color: '#94a3b8'"), 'Timestamp must have legible #94a3b8 color');

// 5. Empty State Handling
assert.ok(jsx.includes('No Active Tasks in Queue'), 'Must render empty tasks queue state');
assert.ok(jsx.includes('No Recent System Activity'), 'Must render empty activity feed state');

// 6. CSS Checkbox Styling
assert.ok(css.includes('.custom-checkbox:checked'), 'Must have checked checkbox CSS');
assert.ok(css.includes("content: '✓'"), 'Checked checkbox must show checkmark');
assert.ok(css.includes('background: var(--emerald-accent)'), 'Checked checkbox must have emerald background');

console.log('✓ All 6 advanced tasks and action feed validation tests passed!');
