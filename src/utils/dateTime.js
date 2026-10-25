/**
 * Centralized Date & Time Engine for ASTRA Study OS
 * Configured for Asia/Kolkata timezone consistency with backend
 */

const MONTHS_MAP = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11
};

export function getSystemTimeContext(backendTimeContext = null) {
  if (backendTimeContext && backendTimeContext.display_date) {
    return backendTimeContext;
  }

  const now = new Date();
  const options = { timeZone: 'Asia/Kolkata' };

  const dayOfWeek = new Intl.DateTimeFormat('en-US', { ...options, weekday: 'long' }).format(now);
  const monthLong = new Intl.DateTimeFormat('en-US', { ...options, month: 'long' }).format(now);
  const monthShort = new Intl.DateTimeFormat('en-US', { ...options, month: 'short' }).format(now);
  const dayNum = new Intl.DateTimeFormat('en-US', { ...options, day: 'numeric' }).format(now);
  const year = new Intl.DateTimeFormat('en-US', { ...options, year: 'numeric' }).format(now);

  const display_date = `${dayOfWeek}, ${monthShort} ${dayNum} ${year}`.toUpperCase();
  const today_schedule_header = `${dayOfWeek}, ${monthLong} ${dayNum}`;
  
  const time_str = new Intl.DateTimeFormat('en-US', {
    ...options,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(now);

  const short_date = new Intl.DateTimeFormat('en-CA', options).format(now); // YYYY-MM-DD

  return {
    iso_datetime: now.toISOString(),
    day_of_week: dayOfWeek,
    date_str: `${monthLong} ${dayNum}, ${year}`,
    short_date,
    display_date,
    today_schedule_header,
    time_str,
    timezone: 'Asia/Kolkata'
  };
}

/**
 * Parses freeform and structured date strings safely without timezone drift.
 */
export function parseDateString(text) {
  if (!text || typeof text !== 'string') {
    return { isValid: false, date: null, dateIso: null, missingYear: false, rawMatch: null, error: 'Empty text' };
  }

  const clean = text.trim();

  // 1. ISO format: YYYY-MM-DD
  const isoMatch = clean.match(/\b(20\d\d)[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10) - 1;
    const d = parseInt(isoMatch[3], 10);
    const dateObj = new Date(Date.UTC(y, m, d));
    if (!isNaN(dateObj.getTime()) && dateObj.getUTCDate() === d && dateObj.getUTCMonth() === m) {
      const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      return { isValid: true, date: dateObj, dateIso: iso, missingYear: false, rawMatch: isoMatch[0] };
    }
  }

  // 2. Textual formats with year (e.g., 'Friday, March 21, 2025', 'March 21, 2025', '21st March 2025')
  const monthRegexStr = Object.keys(MONTHS_MAP).join('|');

  // Month Day, Year
  const mdyRegex = new RegExp(`\\b(${monthRegexStr})\\s+(0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?(?:,)?\\s+(20\\d\\d)\\b`, 'i');
  const mdyMatch = clean.match(mdyRegex);
  if (mdyMatch) {
    const monthIdx = MONTHS_MAP[mdyMatch[1].toLowerCase()];
    const day = parseInt(mdyMatch[2], 10);
    const year = parseInt(mdyMatch[3], 10);
    const dateObj = new Date(Date.UTC(year, monthIdx, day));
    if (!isNaN(dateObj.getTime()) && dateObj.getUTCDate() === day) {
      const iso = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return { isValid: true, date: dateObj, dateIso: iso, missingYear: false, rawMatch: mdyMatch[0] };
    }
  }

  // Day Month Year
  const dmyRegex = new RegExp(`\\b(0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?(?:\\s+of)?\\s+(${monthRegexStr})(?:,)?\\s+(20\\d\\d)\\b`, 'i');
  const dmyMatch = clean.match(dmyRegex);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const monthIdx = MONTHS_MAP[dmyMatch[2].toLowerCase()];
    const year = parseInt(dmyMatch[3], 10);
    const dateObj = new Date(Date.UTC(year, monthIdx, day));
    if (!isNaN(dateObj.getTime()) && dateObj.getUTCDate() === day) {
      const iso = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return { isValid: true, date: dateObj, dateIso: iso, missingYear: false, rawMatch: dmyMatch[0] };
    }
  }

  // 3. Missing year: e.g. "October 24", "Friday, Oct 24", "March 21"
  const noYearRegex = new RegExp(`\\b(${monthRegexStr})\\s+(0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?\\b`, 'i');
  const noYearMatch = clean.match(noYearRegex);
  if (noYearMatch) {
    return { isValid: false, date: null, dateIso: null, missingYear: true, rawMatch: noYearMatch[0], error: 'Missing year' };
  }

  return { isValid: false, date: null, dateIso: null, missingYear: false, rawMatch: null, error: 'No date found' };
}

/**
 * Evaluates whether a date string is Valid Future, Past/Outdated, or Needs Confirmation.
 */
export function evaluateExamDate(text, referenceDate = null) {
  const parsed = parseDateString(text);
  const now = referenceDate || new Date();
  
  // Use Asia/Kolkata date boundary
  const localTodayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
  const [curY, curM, curD] = localTodayIso.split('-').map(Number);
  const localTodayUtc = new Date(Date.UTC(curY, curM - 1, curD));

  if (parsed.missingYear) {
    return {
      status: 'NEEDS_CONFIRMATION',
      statusLabel: 'Needs Confirmation (Missing Year)',
      requiresConfirmation: true,
      rawMatch: parsed.rawMatch,
      dateIso: null,
      daysDiff: null,
      warning: `Date '${parsed.rawMatch}' is missing a year. Please confirm the full exam date.`
    };
  }

  if (!parsed.isValid) {
    return {
      status: 'NEEDS_CONFIRMATION',
      statusLabel: 'Needs Confirmation',
      requiresConfirmation: true,
      rawMatch: null,
      dateIso: null,
      daysDiff: null,
      warning: 'No valid upcoming exam date confirmed.'
    };
  }

  const diffMs = parsed.date.getTime() - localTodayUtc.getTime();
  const daysDiff = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (daysDiff < 0) {
    return {
      status: 'PAST_OUTDATED',
      statusLabel: 'Past Exam Date',
      requiresConfirmation: true,
      rawMatch: parsed.rawMatch,
      dateIso: parsed.dateIso,
      daysDiff,
      warning: `Stored exam date (${parsed.rawMatch}) has passed (${Math.abs(daysDiff)} days ago). An active countdown cannot be scheduled for a past date.`
    };
  }

  return {
    status: 'VALID_FUTURE',
    statusLabel: 'Confirmed Future Date',
    requiresConfirmation: false,
    rawMatch: parsed.rawMatch,
    dateIso: parsed.dateIso,
    daysDiff,
    warning: null
  };
}

/**
 * Returns exam revision plan.
 * If backend planner state is passed, adopts it.
 * Otherwise defaults to safe tentative schedule awaiting date confirmation.
 */
export function getDynamicExamPlan(backendPlannerData = null) {
  if (backendPlannerData && backendPlannerData.plan && Array.isArray(backendPlannerData.plan)) {
    return backendPlannerData.plan;
  }
  if (Array.isArray(backendPlannerData)) {
    return backendPlannerData;
  }

  const baseDate = new Date();
  function formatDateOffset(offsetDays) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + offsetDays);
    const dayName = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long' }).format(d);
    const monthShort = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', month: 'short' }).format(d);
    const dayNum = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', day: 'numeric' }).format(d);
    return `${dayName}, ${monthShort} ${dayNum}`;
  }

  // Default tentative plan marked as awaiting confirmation
  return [
    {
      day: 'Review 1',
      date: formatDateOffset(0),
      status: 'Tentative Review',
      isToday: true,
      sessions: [
        { time: '19:00 - 20:30', topic: 'Functional Dependencies & 1NF/2NF', status: 'Pending', focus: 'High' }
      ]
    },
    {
      day: 'Review 2',
      date: formatDateOffset(1),
      status: 'Tentative Review',
      isToday: false,
      sessions: [
        { time: '19:00 - 21:00', topic: '3NF vs BCNF Decomposition & Lossless Join', status: 'Pending', focus: 'Priority (Weak Subject)' }
      ]
    },
    {
      day: 'Review 3',
      date: formatDateOffset(2),
      status: 'Tentative Review',
      isToday: false,
      sessions: [
        { time: '18:30 - 20:30', topic: 'Transaction Management & Serializability', status: 'Pending', focus: 'Normal' },
        { time: '20:30 - 21:30', topic: 'Mock Practice & Weak Topic Flashcards', status: 'Pending', focus: 'High' }
      ]
    },
    {
      day: 'Exam Day',
      date: 'Stored: Friday, March 21, 2025 (Outdated / Needs Confirmation)',
      status: 'Needs Confirmation',
      isToday: false,
      sessions: [
        { time: '--:--', topic: '⚡ DBMS FINAL EXAM (Awaiting Date Confirmation)', status: 'Unconfirmed', focus: 'Pending' }
      ]
    }
  ];
}
