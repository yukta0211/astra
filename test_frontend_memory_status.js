import assert from 'node:assert';
import { resolveMemoryStatus, normalizeStatusString, isLegacyPercentage, STATUS_METADATA } from './src/utils/memoryStatus.js';

console.log("Running frontend memory status unit tests...");

// 1. Missing metric values
{
  const res1 = resolveMemoryStatus({});
  assert.strictEqual(res1.status, 'UNVERIFIED');
  assert.strictEqual(res1.label, 'Unverified');
  assert.strictEqual(res1.isCalibratedPercentage, false);
  assert.ok(res1.tooltip.includes('Unverified:'));

  const res2 = resolveMemoryStatus({ verification_status: null, confidence: null });
  assert.strictEqual(res2.status, 'UNVERIFIED');

  const res3 = resolveMemoryStatus({ verification_status: '', confidence: '' });
  assert.strictEqual(res3.status, 'UNVERIFIED');
  console.log("✓ Missing values test passed");
}

// 2. Invalid metric values
{
  const res1 = resolveMemoryStatus({ verification_status: 'random_junk', confidence: 'not_a_metric' });
  assert.strictEqual(res1.status, 'UNVERIFIED');
  assert.strictEqual(res1.isCalibratedPercentage, false);

  const res2 = resolveMemoryStatus({ confidence: '-5%' });
  assert.strictEqual(res2.status, 'UNVERIFIED');

  const res3 = resolveMemoryStatus({ verification_status: 999 });
  assert.strictEqual(res3.status, 'UNVERIFIED');
  console.log("✓ Invalid values test passed");
}

// 3. Legacy metric values
{
  // Legacy '98%' uncalibrated mock value
  const res1 = resolveMemoryStatus({ confidence: '98%', source: 'Voice Input / Calendar' });
  assert.strictEqual(res1.status, 'UNVERIFIED');
  assert.strictEqual(res1.legacyConfidence, '98%');
  assert.strictEqual(res1.isCalibratedPercentage, false);

  // Legacy '95%' uncalibrated mock value
  const res2 = resolveMemoryStatus({ confidence: '95%', source: 'Quiz Mode Performance' });
  assert.strictEqual(res2.status, 'UNVERIFIED');
  assert.strictEqual(res2.legacyConfidence, '95%');

  // Legacy '100%' user confirmed value
  const res3 = resolveMemoryStatus({ confidence: '100%', source: 'Student Confirmation' });
  assert.strictEqual(res3.status, 'VERIFIED');
  assert.strictEqual(res3.label, 'Verified');
  console.log("✓ Legacy values test passed");
}

// 4. Valid metric values
{
  const res1 = resolveMemoryStatus({ verification_status: 'VERIFIED' });
  assert.strictEqual(res1.status, 'VERIFIED');
  assert.strictEqual(res1.badgeClass, 'badge-emerald');

  const res2 = resolveMemoryStatus({ verification_status: 'UNVERIFIED' });
  assert.strictEqual(res2.status, 'UNVERIFIED');
  assert.strictEqual(res2.badgeClass, 'badge-purple');

  const res3 = resolveMemoryStatus({ verification_status: 'NEEDS_REVIEW' });
  assert.strictEqual(res3.status, 'NEEDS_REVIEW');
  assert.strictEqual(res3.badgeClass, 'badge-orange');

  // Lowercase & mixed-case
  const res4 = resolveMemoryStatus({ verification_status: 'verified' });
  assert.strictEqual(res4.status, 'VERIFIED');

  const res5 = resolveMemoryStatus({ verification_status: 'needs_review' });
  assert.strictEqual(res5.status, 'NEEDS_REVIEW');
  console.log("✓ Valid values test passed");
}

// 5. Extraction fidelity vs temporal currency / truth distinction
{
  // A statement accurately transcribed from voice in 2025, but date has passed
  const pastExamMemory = {
    category: 'Exams',
    title: 'DBMS Final Exam Date',
    content: 'DBMS exam is scheduled for Friday, March 21, 2025.',
    confidence: '98%',
    source: 'Voice Input / Calendar',
    date_audit: {
      status: 'PAST_OUTDATED',
      status_label: 'Past Exam Date',
      parsed_date: '2025-03-21',
      is_valid: true
    }
  };

  const res = resolveMemoryStatus(pastExamMemory);
  assert.strictEqual(res.status, 'NEEDS_REVIEW');
  assert.strictEqual(res.label, 'Needs Review');
  assert.strictEqual(res.isOutdated, true);
  assert.strictEqual(res.isCalibratedPercentage, false);
  assert.ok(res.tooltip.includes('Needs Review:'));

  // Missing year requires review
  const missingYearMemory = {
    category: 'Exams',
    title: 'Midterm',
    content: 'Exam on March 21',
    date_audit: {
      status: 'NEEDS_CONFIRMATION',
      missing_year: true
    }
  };
  const resMissing = resolveMemoryStatus(missingYearMemory);
  assert.strictEqual(resMissing.status, 'NEEDS_REVIEW');
  assert.strictEqual(resMissing.isMissingYear, true);

  console.log("✓ Extraction vs currency distinction test passed");
}

console.log("All frontend memory status unit tests passed successfully!");
