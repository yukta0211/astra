import assert from 'node:assert';
import fs from 'node:fs';

console.log('Testing Mission Control dashboard hierarchy and layout consistency...');

// 1. Read MissionControl.jsx
const jsx = fs.readFileSync('./src/components/MissionControl.jsx', 'utf-8');

// Check container and hero padding
assert.ok(jsx.includes("maxWidth: '1280px'"), 'Main container must have 1280px maxWidth');
assert.ok(jsx.includes("recentUserCommands"), 'Must extract genuine recent user commands');

// Check chat window height reduction (eliminating 250px gap)
assert.ok(!jsx.includes("minHeight: '250px'"), 'Must remove the oversized 250px min-height in conversation window');
assert.ok(jsx.includes("minHeight: '70px'") || jsx.includes("minHeight: '80px'"), 'Conversation window must have compact content-driven minHeight');

// Check grid proportions: 7 cols + 5 cols pairs
assert.ok(jsx.includes("gridColumn: 'span 7'"), "Must have 7-column cards (Today's Rhythm, Task Queue)");
assert.ok(jsx.includes("gridColumn: 'span 5'"), "Must have 5-column cards (Focus Health, Action Feed)");
assert.ok(jsx.includes("gridColumn: 'span 6'"), "Must have 6-column cards (Pomodoro Timer, Study Analytics)");

// Check consistent card header eyebrows
assert.ok(jsx.includes("TODAY'S RHYTHM"), "Must have Today's Rhythm card");
assert.ok(jsx.includes("FOCUS HEALTH & READINESS"), "Must have Focus Health card");
assert.ok(jsx.includes("TASK QUEUE & PRIORITIES"), "Must have Task Queue card");
assert.ok(jsx.includes("AUDIT TRAIL & SYSTEM LOGS"), "Must have System Logs / Action Feed card");
assert.ok(jsx.includes("DEEP WORK FOCUS SESSION"), "Must have Deep Work timer card");
assert.ok(jsx.includes("STUDY ANALYTICS & RETENTION"), "Must have Analytics card");

// 2. Read index.css
const css = fs.readFileSync('./src/index.css', 'utf-8');
assert.ok(css.includes('.mission-grid-main'), 'Must contain .mission-grid-main');
assert.ok(css.includes('grid-column: span 1 / -1 !important'), 'Must expand grid cards on smaller screens');

console.log('✓ All Mission Control dashboard hierarchy and consistency checks passed successfully!');
