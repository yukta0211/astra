import assert from 'node:assert';
import fs from 'node:fs';

console.log('Testing ASTRA Spacing, Layout, Card Padding, and Grid System...');

// 1. Inspect Spacing Tokens in src/index.css
const css = fs.readFileSync('./src/index.css', 'utf-8');

// Base 4px/8px scale tokens
assert.ok(css.includes('--space-2xs: 4px'), 'Must define --space-2xs (4px)');
assert.ok(css.includes('--space-xs: 8px'), 'Must define --space-xs (8px)');
assert.ok(css.includes('--space-sm: 12px'), 'Must define --space-sm (12px)');
assert.ok(css.includes('--space-md: 16px'), 'Must define --space-md (16px)');
assert.ok(css.includes('--space-lg: 20px'), 'Must define --space-lg (20px)');
assert.ok(css.includes('--space-xl: 24px'), 'Must define --space-xl (24px)');
assert.ok(css.includes('--space-2xl: 28px'), 'Must define --space-2xl (28px)');
assert.ok(css.includes('--space-3xl: 32px'), 'Must define --space-3xl (32px)');
assert.ok(css.includes('--space-4xl: 40px'), 'Must define --space-4xl (40px)');

// Page gutter & layout tokens
assert.ok(css.includes('--page-gutter-x: 28px'), 'Must define --page-gutter-x (28px desktop)');
assert.ok(css.includes('--page-gutter-y: 32px'), 'Must define --page-gutter-y (32px desktop)');
assert.ok(css.includes('--section-gap: 28px'), 'Must define --section-gap (28px desktop)');

// Card padding hierarchy
assert.ok(css.includes('--card-padding: 24px'), 'Must define --card-padding (24px standard)');
assert.ok(css.includes('--card-padding-compact: 20px'), 'Must define --card-padding-compact (20px)');

// Border radii tokens
assert.ok(css.includes('--radius-card: 14px'), 'Must define --radius-card (14px)');
assert.ok(css.includes('--radius-inner: 10px'), 'Must define --radius-inner (10px)');
assert.ok(css.includes('--radius-control: 8px'), 'Must define --radius-control (8px)');
assert.ok(css.includes('--radius-chip: 6px'), 'Must define --radius-chip (6px)');

console.log('✓ All 4px/8px spacing, layout, card padding, and radius tokens verified in :root.');

// 2. Inspect Shared Layout Classes
assert.ok(css.includes('.astra-page-container'), 'Missing .astra-page-container class');
assert.ok(css.includes('.astra-page-header'), 'Missing .astra-page-header class');
assert.ok(css.includes('.card-padded'), 'Missing .card-padded class');
assert.ok(css.includes('.card-padded-compact'), 'Missing .card-padded-compact class');
assert.ok(css.includes('.memory-store-grid'), 'Missing .memory-store-grid class');
assert.ok(css.includes('.knowledge-grid-top'), 'Missing .knowledge-grid-top class');

// Check glass-panel standardization
assert.ok(css.includes('border-radius: var(--radius-card, 14px)'), '.glass-panel must use --radius-card token');

console.log('✓ Shared layout classes and glass panel standardization verified.');

// 3. Inspect Responsive Mobile Scaling
const mobile640Sections = css.split(/@media\s*\(max-width:\s*640px\)\s*\{/).slice(1);
const lastMobileBlock = mobile640Sections[mobile640Sections.length - 1];
assert.ok(lastMobileBlock.includes('--page-gutter-x: 14px'), 'Mobile must scale horizontal gutter to 14px');
assert.ok(lastMobileBlock.includes('--card-padding: 16px'), 'Mobile must scale card padding to 16px');
assert.ok(lastMobileBlock.includes('--card-padding-compact: 14px'), 'Mobile must scale compact card padding to 14px');
assert.ok(lastMobileBlock.includes('--grid-gap: 14px'), 'Mobile must scale grid gap to 14px');

console.log('✓ Mobile responsive spacing and layout tokens verified.');

// 4. Verify Cross-Page Component Adoption
// Page 1: Mission Control
const mcJsx = fs.readFileSync('./src/components/MissionControl.jsx', 'utf-8');
assert.ok(mcJsx.includes('astra-page-container'), 'MissionControl must adopt astra-page-container');
assert.ok(mcJsx.includes("var(--card-padding, 24px)"), 'MissionControl cards must adopt --card-padding token');
assert.ok(mcJsx.includes("var(--grid-gap, 20px)"), 'MissionControl grid must adopt --grid-gap token');

// Page 2: Memory Store
const memJsx = fs.readFileSync('./src/components/MemoryView.jsx', 'utf-8');
assert.ok(memJsx.includes('astra-page-container'), 'MemoryView must adopt astra-page-container');
assert.ok(memJsx.includes('memory-store-grid'), 'MemoryView must adopt memory-store-grid');
assert.ok(memJsx.includes('astra-page-header'), 'MemoryView must adopt astra-page-header');
assert.ok(memJsx.includes("var(--card-padding-compact, 20px)"), 'Memory cards must adopt --card-padding-compact');

// Page 3: Knowledge Base & RAG
const knowJsx = fs.readFileSync('./src/components/KnowledgeView.jsx', 'utf-8');
assert.ok(knowJsx.includes('astra-page-container'), 'KnowledgeView must adopt astra-page-container');
assert.ok(knowJsx.includes('astra-page-header'), 'KnowledgeView must adopt astra-page-header');
assert.ok(knowJsx.includes('knowledge-grid-top'), 'KnowledgeView must adopt knowledge-grid-top');
assert.ok(knowJsx.includes("var(--card-padding, 24px)"), 'KnowledgeView cards must adopt --card-padding token');

// Page 4: Exam Revision Planner
const planJsx = fs.readFileSync('./src/components/PlannerView.jsx', 'utf-8');
assert.ok(planJsx.includes('planner-view-container'), 'PlannerView must adopt planner-view-container');
assert.ok(planJsx.includes("var(--card-padding, 24px)"), 'PlannerView cards must adopt --card-padding token');
assert.ok(planJsx.includes("var(--card-padding-compact, 20px)"), 'PlannerView sessions must adopt --card-padding-compact token');

// Page 5: Adaptive Quiz Mode
const quizJsx = fs.readFileSync('./src/components/QuizModeView.jsx', 'utf-8');
assert.ok(quizJsx.includes('astra-page-container'), 'QuizModeView must adopt astra-page-container');
assert.ok(quizJsx.includes('astra-page-header'), 'QuizModeView must adopt astra-page-header');
assert.ok(quizJsx.includes("var(--card-padding, 24px)"), 'QuizModeView cards must adopt --card-padding token');

// Page 6: System Settings
const setJsx = fs.readFileSync('./src/components/SettingsView.jsx', 'utf-8');
assert.ok(setJsx.includes('astra-page-container'), 'SettingsView must adopt astra-page-container');
assert.ok(setJsx.includes('astra-page-header'), 'SettingsView must adopt astra-page-header');
assert.ok(setJsx.includes("var(--card-padding, 24px)"), 'SettingsView panels must adopt --card-padding token');

console.log('✓ All 6 ASTRA views successfully adopted centralized spacing & layout tokens.');
console.log('All spacing and layout tests passed successfully!');
