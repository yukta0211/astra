import assert from 'node:assert';
import { resolveMemoryStatus } from './src/utils/memoryStatus.js';

console.log("Testing Memory Store card layout data edge cases...");

// Test Case 1: Long Memory Title & Long Source Name
{
  const longMem = {
    id: 'mem-long-1',
    category: 'Exams',
    title: 'Advanced Distributed Database Management Systems - Comprehensive Relational Normalization & Multivalued Dependency Analysis (CS-402 Final Examination)',
    content: 'Deep dive into 1NF, 2NF, 3NF, BCNF decomposition algorithms, lossless-join verification, dependency preservation proofs, and multi-valued dependencies (4NF). Scheduled for December 15, 2026.',
    source: 'Voice Input / Google Calendar Integration (Auto-synced via Schedule Engine with Multi-Tenant Webhooks)',
    date: '2026-10-22',
    verification_status: 'VERIFIED'
  };

  const status = resolveMemoryStatus(longMem);
  assert.strictEqual(status.status, 'VERIFIED');
  assert.strictEqual(status.label, 'Verified');
  console.log("✓ Long title and source test passed");
}

// Test Case 2: Missing Metadata (null/empty date, source, title, content)
{
  const emptyMem = {
    id: 'mem-empty',
    category: null,
    title: '',
    content: null,
    source: null,
    date: undefined,
    verification_status: null,
    confidence: null
  };

  const status = resolveMemoryStatus(emptyMem);
  assert.strictEqual(status.status, 'UNVERIFIED');
  assert.strictEqual(status.label, 'Unverified');
  assert.strictEqual(status.isCalibratedPercentage, false);
  console.log("✓ Missing metadata test passed");
}

// Test Case 3: Outdated exam with long source
{
  const outdatedMem = {
    id: 'mem-outdated-long',
    category: 'Exams',
    title: 'Database Management Systems Midterm',
    content: 'Midterm exam was on Friday, March 21, 2025.',
    source: 'Automated Chrome Speech Recognition Ingestion Pipeline',
    date: '2025-03-16',
    date_audit: {
      status: 'PAST_OUTDATED',
      status_label: 'Past Exam Date',
      parsed_date: '2025-03-21',
      is_valid: true
    }
  };

  const status = resolveMemoryStatus(outdatedMem);
  assert.strictEqual(status.status, 'NEEDS_REVIEW');
  assert.strictEqual(status.label, 'Needs Review');
  assert.strictEqual(status.isOutdated, true);
  console.log("✓ Outdated exam with long source test passed");
}

// Test Case 4: Non-temporal fact with verified status
{
  const prefMem = {
    id: 'mem-pref',
    category: 'Preferences',
    title: 'Deep Focus Slot',
    content: 'Prefers quiet revision slots in the late evening from 20:00 to 22:00.',
    source: 'Direct Student Input',
    date: '2026-10-22',
    verification_status: 'VERIFIED'
  };

  const status = resolveMemoryStatus(prefMem);
  assert.strictEqual(status.status, 'VERIFIED');
  assert.strictEqual(status.label, 'Verified');
  assert.strictEqual(status.isOutdated, false);
  console.log("✓ Non-temporal verified fact test passed");
}

console.log("All Memory Store card layout edge case tests passed successfully!");
