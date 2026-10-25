/**
 * ASTRA Memory Store Verification & Metric Service (Frontend)
 * 
 * Provides calibrated, honest verification status and lifecycle determination for personal memories.
 * Replaces misleading, uncalibrated percentages with explicit status indicators:
 *   - Verified: Explicitly validated or confirmed by the student.
 *   - Unverified: Automatically captured from voice, chat, or study activity without formal manual verification.
 *   - Needs Confirmation: Contains missing calendar year or ambiguous details requiring clarification.
 *   - Outdated: Contains expired or passed temporal details (e.g. past exam date).
 *   - Archived: Preserved in historical long-term store, but hidden from active planner schedule.
 * 
 * Also preserves original provenance (source, extraction date) and tracks revisions.
 */

export const STATUS_METADATA = {
  VERIFIED: {
    status: 'VERIFIED',
    label: 'Verified',
    badgeClass: 'badge-emerald',
    iconType: 'ShieldCheck',
    tooltip: 'Verified: Explicitly confirmed or directly entered by the student. Stored as an authoritative personal fact.',
    helperDescription: 'Student has confirmed this statement. ASTRA does not display uncalibrated percentages.'
  },
  UNVERIFIED: {
    status: 'UNVERIFIED',
    label: 'Unverified',
    badgeClass: 'badge-purple',
    iconType: 'ShieldAlert',
    tooltip: 'Unverified: Automatically captured from study activity (voice/chat/quiz). Pending student review; not classified as false.',
    helperDescription: 'Inferred automatically without manual validation. No percentage is displayed.'
  },
  NEEDS_REVIEW: {
    status: 'NEEDS_REVIEW',
    label: 'Needs Review',
    badgeClass: 'badge-orange',
    iconType: 'AlertTriangle',
    tooltip: 'Needs Review: This statement contains outdated or incomplete details (such as a past exam date) that require student attention before planning.',
    helperDescription: 'Details are past or require confirmation. Review upcoming date to ensure schedule accuracy.'
  }
};

export const LIFECYCLE_METADATA = {
  VERIFIED: {
    state: 'VERIFIED',
    label: 'Verified',
    badgeClass: 'badge-emerald',
    iconType: 'ShieldCheck',
    tooltip: 'Verified: Formally validated by the student as an authoritative personal fact.',
    description: 'Active in study schedules and planner context.'
  },
  UNVERIFIED: {
    state: 'UNVERIFIED',
    label: 'Unverified',
    badgeClass: 'badge-purple',
    iconType: 'Clock',
    tooltip: 'Unverified: Inferred from study interactions; not confirmed, but not classified as false.',
    description: 'Active in contextual suggestions, pending student verification.'
  },
  NEEDS_CONFIRMATION: {
    state: 'NEEDS_CONFIRMATION',
    label: 'Needs Confirmation',
    badgeClass: 'badge-purple',
    iconType: 'AlertTriangle',
    tooltip: 'Needs Confirmation: Missing calendar year or ambiguous dates requiring clarification.',
    description: 'Requires student confirmation before alerts can be scheduled.'
  },
  OUTDATED: {
    state: 'OUTDATED',
    label: 'Outdated',
    badgeClass: 'badge-orange',
    iconType: 'AlertTriangle',
    tooltip: 'Outdated: The date in this memory has passed and requires an update.',
    description: 'Stored historical fact with expired temporal relevance.'
  },
  ARCHIVED: {
    state: 'ARCHIVED',
    label: 'Archived',
    badgeClass: 'badge-purple',
    iconType: 'Archive',
    tooltip: 'Archived: Preserved in historical long-term store, but excluded from active study schedules.',
    description: 'Historical record preserved for provenance; hidden from active revision view.'
  }
};

/**
 * Normalizes a raw status string to canonical uppercase ('VERIFIED', 'UNVERIFIED', 'NEEDS_REVIEW').
 */
export function normalizeStatusString(val) {
  if (!val || typeof val !== 'string') return null;
  const cleaned = val.trim().toUpperCase().replace(/[\s-]/g, '_');
  if (['VERIFIED', 'UNVERIFIED', 'NEEDS_REVIEW'].includes(cleaned)) {
    return cleaned;
  }
  return null;
}

/**
 * Normalizes a lifecycle string to canonical uppercase ('VERIFIED', 'UNVERIFIED', 'NEEDS_CONFIRMATION', 'OUTDATED', 'ARCHIVED').
 */
export function normalizeLifecycleString(val) {
  if (!val || typeof val !== 'string') return null;
  const cleaned = val.trim().toUpperCase().replace(/[\s-]/g, '_');
  if (Object.keys(LIFECYCLE_METADATA).includes(cleaned)) {
    return cleaned;
  }
  return null;
}

/**
 * Checks whether a value is a legacy uncalibrated percentage string like '98%', '95%'.
 */
export function isLegacyPercentage(val) {
  if (typeof val !== 'string') return false;
  return /^\s*\d+(\.\d+)?%\s*$/.test(val);
}

/**
 * Resolves the explicit verification status, lifecycle state, and helper metadata for a memory card.
 */
export function resolveMemoryStatus(memory = {}) {
  const rawStatus = memory.verification_status;
  const legacyConfidence = memory.confidence;
  const rawLifecycle = memory.lifecycle_state;
  const dateAudit = memory.date_audit;
  const source = memory.source || '';
  const content = memory.content || '';

  // 1. Check temporal currency
  let isOutdated = false;
  let isMissingYear = false;

  if (dateAudit) {
    if (dateAudit.status === 'PAST_OUTDATED') {
      isOutdated = true;
    } else if (dateAudit.status === 'NEEDS_CONFIRMATION' || dateAudit.missing_year) {
      isMissingYear = true;
    }
  } else if (content.includes('2025') && memory.category === 'Exams') {
    isOutdated = true;
  }

  // 2. Resolve verification status
  let resolvedStatus = 'UNVERIFIED';

  if (isOutdated || isMissingYear) {
    resolvedStatus = 'NEEDS_REVIEW';
  } else {
    const normalizedRaw = normalizeStatusString(rawStatus);
    if (normalizedRaw) {
      resolvedStatus = normalizedRaw;
    } else if (['Student Confirmation', 'Memory Store Update', 'Manual Verification', 'Direct Student Input'].includes(source)) {
      resolvedStatus = 'VERIFIED';
    } else if (legacyConfidence) {
      const normalizedLegacy = normalizeStatusString(legacyConfidence);
      if (normalizedLegacy) {
        resolvedStatus = normalizedLegacy;
      } else if (isLegacyPercentage(legacyConfidence)) {
        const num = parseFloat(legacyConfidence);
        resolvedStatus = (!isNaN(num) && num >= 100) ? 'VERIFIED' : 'UNVERIFIED';
      } else {
        resolvedStatus = 'UNVERIFIED';
      }
    } else {
      resolvedStatus = 'UNVERIFIED';
    }
  }

  const metaStatus = STATUS_METADATA[resolvedStatus] || STATUS_METADATA.UNVERIFIED;

  // 3. Resolve lifecycle state
  let resolvedLifecycle = 'UNVERIFIED';
  const normalizedLife = normalizeLifecycleString(rawLifecycle);

  if (normalizedLife === 'ARCHIVED') {
    resolvedLifecycle = 'ARCHIVED';
  } else if (isOutdated) {
    resolvedLifecycle = 'OUTDATED';
  } else if (isMissingYear) {
    resolvedLifecycle = 'NEEDS_CONFIRMATION';
  } else if (normalizedLife) {
    resolvedLifecycle = normalizedLife;
  } else if (resolvedStatus === 'VERIFIED') {
    resolvedLifecycle = 'VERIFIED';
  } else {
    resolvedLifecycle = 'UNVERIFIED';
  }

  const metaLife = LIFECYCLE_METADATA[resolvedLifecycle] || LIFECYCLE_METADATA.UNVERIFIED;

  return {
    status: resolvedStatus,
    label: metaStatus.label,
    metricName: 'Verification Status',
    badgeClass: metaStatus.badgeClass,
    iconType: metaStatus.iconType,
    tooltip: metaStatus.tooltip,
    helperDescription: metaStatus.helperDescription,
    isCalibratedPercentage: false,
    legacyConfidence: memory.legacy_confidence || (isLegacyPercentage(legacyConfidence) ? legacyConfidence : null),
    isOutdated,
    isMissingYear,
    // Lifecycle metadata
    lifecycleState: resolvedLifecycle,
    lifecycleLabel: metaLife.label,
    lifecycleBadgeClass: metaLife.badgeClass,
    lifecycleTooltip: metaLife.tooltip,
    // Provenance
    originalSource: memory.original_source || memory.source || 'Direct Entry',
    originalDate: memory.original_date || memory.date || '',
    originalContent: memory.original_content || memory.content || '',
    lastUpdatedAt: memory.last_updated_at || memory.date || '',
    lastVerifiedAt: memory.last_verified_at || null,
    editHistory: Array.isArray(memory.edit_history) ? memory.edit_history : []
  };
}
