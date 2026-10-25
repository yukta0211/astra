import assert from 'node:assert';
import { 
  resolveMemoryStatus, 
  LIFECYCLE_METADATA, 
  STATUS_METADATA, 
  normalizeLifecycleString 
} from './src/utils/memoryStatus.js';

console.log('Testing frontend memory lifecycle and provenance workflow...');

// Test 1: Lifecycle state normalization
assert.strictEqual(normalizeLifecycleString('verified'), 'VERIFIED');
assert.strictEqual(normalizeLifecycleString('NEEDS_CONFIRMATION'), 'NEEDS_CONFIRMATION');
assert.strictEqual(normalizeLifecycleString('archived'), 'ARCHIVED');
assert.strictEqual(normalizeLifecycleString('outdated'), 'OUTDATED');
assert.strictEqual(normalizeLifecycleString('invalid_state'), null);
console.log('✓ Lifecycle normalization passed');

// Test 2: Unverified memory is NOT marked as false
const unverifiedMem = {
  id: 'mem_uv_1',
  category: 'Preferences',
  title: 'Preferred Study Method',
  content: 'Prefers Pomodoro technique in 45-minute cycles',
  source: 'Chat inference',
  date: '2026-10-20'
};
const uvStatus = resolveMemoryStatus(unverifiedMem);
assert.strictEqual(uvStatus.lifecycleState, 'UNVERIFIED');
assert.strictEqual(uvStatus.status, 'UNVERIFIED');
assert.strictEqual(uvStatus.label, 'Unverified');
assert.ok(uvStatus.tooltip.includes('not classified as false') || uvStatus.tooltip.includes('Pending student review'));
console.log('✓ Unverified memory is not classified as false');

// Test 3: Provenance preservation
const editedMem = {
  id: 'mem_edit_1',
  category: 'Exams',
  title: 'Updated Exam Date',
  content: 'Exam on Dec 10, 2026',
  source: 'Memory Store Update',
  date: '2026-10-22',
  original_source: 'Initial Syllabus PDF',
  original_date: '2026-09-01',
  original_content: 'Exam in Nov 2025',
  last_verified_at: '2026-10-22 14:00',
  last_updated_at: '2026-10-22 14:00',
  edit_history: [
    {
      timestamp: '2026-10-22 14:00',
      previous_content: 'Exam in Nov 2025',
      reason: 'Date correction'
    }
  ],
  lifecycle_state: 'VERIFIED'
};
const editedStatus = resolveMemoryStatus(editedMem);
assert.strictEqual(editedStatus.originalSource, 'Initial Syllabus PDF');
assert.strictEqual(editedStatus.originalDate, '2026-09-01');
assert.strictEqual(editedStatus.originalContent, 'Exam in Nov 2025');
assert.strictEqual(editedStatus.lastVerifiedAt, '2026-10-22 14:00');
assert.strictEqual(editedStatus.lastUpdatedAt, '2026-10-22 14:00');
assert.strictEqual(editedStatus.editHistory.length, 1);
assert.strictEqual(editedStatus.lifecycleState, 'VERIFIED');
console.log('✓ Provenance and edit history preservation passed');

// Test 4: Archived state handling
const archivedMem = {
  id: 'mem_arch_1',
  category: 'Goals',
  title: 'Old Goal for Q1',
  content: 'Finish semester 1 projects',
  lifecycle_state: 'ARCHIVED',
  source: 'Student Input',
  date: '2026-01-15'
};
const archStatus = resolveMemoryStatus(archivedMem);
assert.strictEqual(archStatus.lifecycleState, 'ARCHIVED');
assert.strictEqual(archStatus.lifecycleLabel, 'Archived');
console.log('✓ Archived state handling passed');

// Test 5: Active vs Archived filtering
const sampleMemories = [
  { id: '1', title: 'Active 1', lifecycle_state: 'VERIFIED' },
  { id: '2', title: 'Active 2', lifecycle_state: 'UNVERIFIED' },
  { id: '3', title: 'Archived 1', lifecycle_state: 'ARCHIVED' }
];
const activeList = sampleMemories.filter(m => resolveMemoryStatus(m).lifecycleState !== 'ARCHIVED');
assert.strictEqual(activeList.length, 2);
assert.deepStrictEqual(activeList.map(m => m.id), ['1', '2']);
console.log('✓ Active vs Archived filtering test passed');

console.log('All frontend lifecycle and provenance tests passed successfully!');
