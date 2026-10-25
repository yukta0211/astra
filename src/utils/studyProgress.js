/**
 * ASTRA Study Progress Engine
 * 
 * Defines and computes the single source of truth for Study Plan Progress.
 * Metric: "Planned Revision Sessions"
 * Definition: The proportion of scheduled study sessions in the active revision plan (examPlan)
 * that have been marked as completed.
 * 
 * Core guarantees:
 * 1. Calculated strictly from verified plan records.
 * 2. Strictly bounded between 0% and 100%.
 * 3. Safe against divide-by-zero, empty plans, null/undefined, and malformed session objects.
 * 4. Decoupled from quiz scores and Pomodoro focus counters.
 * 5. Provides synchronized labels, next-session topic detection, and accessibility metadata.
 */

export function calculatePlannedSessionsProgress(examPlan, subject = "DBMS") {
  // Edge Case 1: Null, undefined, non-array, or empty plan
  if (!examPlan || !Array.isArray(examPlan) || examPlan.length === 0) {
    return {
      percentage: 0,
      completedSessions: 0,
      totalSessions: 0,
      metricName: "Planned Revision Sessions",
      metricLabel: "Planned Revision Sessions",
      statusText: "Awaiting Study Schedule",
      detailText: `Confirm your ${subject} exam date in the planner to activate revision sessions.`,
      nextTopic: null,
      isValid: false
    };
  }

  // Extract all valid study sessions across all days (excluding final exam events)
  const studySessions = [];
  for (const day of examPlan) {
    if (day && Array.isArray(day.sessions)) {
      for (const sess of day.sessions) {
        if (!sess || typeof sess !== 'object') continue;
        const topicLower = (sess.topic || '').toLowerCase();
        const statusLower = (sess.status || '').toLowerCase();
        
        // Exclude the final exam test day event itself from the study denominator
        const isExamEvent = statusLower === 'exam' || topicLower.includes('final exam');
        if (!isExamEvent) {
          studySessions.push(sess);
        }
      }
    }
  }

  const totalSessions = studySessions.length;

  // Edge Case 2: Divide-by-zero (Plan exists but has 0 study sessions)
  if (totalSessions === 0) {
    return {
      percentage: 0,
      completedSessions: 0,
      totalSessions: 0,
      metricName: "Planned Revision Sessions",
      metricLabel: "Planned Revision Sessions",
      statusText: "No Revision Sessions Scheduled",
      detailText: `No study sessions currently scheduled for ${subject}.`,
      nextTopic: null,
      isValid: false
    };
  }

  // Count completed sessions
  const completedSessions = studySessions.filter(s => {
    const st = (s.status || '').toLowerCase();
    return st === 'done' || st === 'completed' || Boolean(s.completed);
  }).length;

  // Safe percentage calculation bounded [0, 100]
  const rawRatio = completedSessions / totalSessions;
  const percentage = Math.min(100, Math.max(0, Math.round(rawRatio * 100)));

  // Identify next pending session topic
  const nextSession = studySessions.find(s => {
    const st = (s.status || '').toLowerCase();
    return st !== 'done' && st !== 'completed' && !s.completed;
  });
  const nextTopic = nextSession ? nextSession.topic : null;

  // Synchronized status and detail messages
  let statusText = "";
  let detailText = "";

  if (completedSessions === 0) {
    statusText = "Ready to start revision.";
    detailText = nextTopic ? `First priority: ${nextTopic}` : "Awaiting first completed session.";
  } else if (completedSessions === totalSessions) {
    statusText = "Optimal exam readiness achieved!";
    detailText = `All ${totalSessions} planned revision sessions completed for ${subject}.`;
  } else {
    statusText = percentage >= 70 ? "Optimal exam readiness achieved." : "You're building revision momentum.";
    detailText = nextTopic ? `Next session: ${nextTopic}` : `${completedSessions} of ${totalSessions} sessions completed.`;
  }

  return {
    percentage,
    completedSessions,
    totalSessions,
    metricName: "Planned Revision Sessions",
    metricLabel: "Planned Revision Sessions",
    statusText,
    detailText,
    nextTopic,
    isValid: true
  };
}
