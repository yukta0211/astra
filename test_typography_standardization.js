import assert from 'node:assert';
import fs from 'node:fs';

console.log('Testing ASTRA Cross-Page Typography Standardization...');

// 1. Inspect typography tokens in src/index.css
const css = fs.readFileSync('./src/index.css', 'utf-8');

// Check token definitions in :root
assert.ok(css.includes('--text-page-title: 32px'), 'Must define --text-page-title (32-40px desktop reference)');
assert.ok(css.includes('--text-section-title: 24px'), 'Must define --text-section-title (22-28px desktop reference)');
assert.ok(css.includes('--text-card-title: 19px'), 'Must define --text-card-title (18-22px desktop reference)');
assert.ok(css.includes('--text-body: 15px'), 'Must define --text-body (15-17px desktop reference)');
assert.ok(css.includes('--text-meta: 12.5px'), 'Must define --text-meta (12-14px desktop reference)');

assert.ok(css.includes('--leading-tight:'), 'Must define --leading-tight');
assert.ok(css.includes('--leading-snug:'), 'Must define --leading-snug');
assert.ok(css.includes('--leading-normal:'), 'Must define --leading-normal');

assert.ok(css.includes('--font-weight-regular:'), 'Must define regular weight token');
assert.ok(css.includes('--font-weight-semibold:'), 'Must define semibold weight token');
assert.ok(css.includes('--font-weight-bold:'), 'Must define bold weight token');

assert.ok(css.includes('--tracking-tight:'), 'Must define tracking tokens');

console.log('✓ All CSS :root typography tokens defined and calibrated within reference brackets.');

// Check shared typography utility classes
assert.ok(css.includes('.astra-page-title'), 'Missing .astra-page-title class');
assert.ok(css.includes('.astra-page-subtitle'), 'Missing .astra-page-subtitle class');
assert.ok(css.includes('.astra-eyebrow'), 'Missing .astra-eyebrow class');
assert.ok(css.includes('.astra-section-title'), 'Missing .astra-section-title class');
assert.ok(css.includes('.astra-card-title'), 'Missing .astra-card-title class');
assert.ok(css.includes('.astra-body'), 'Missing .astra-body class');
assert.ok(css.includes('.astra-description'), 'Missing .astra-description class');
assert.ok(css.includes('.astra-label'), 'Missing .astra-label class');
assert.ok(css.includes('.astra-meta'), 'Missing .astra-meta class');

// Check collision defense & text wrapping on headings
const pageTitleRule = css.match(/\.astra-page-title[^{]*\{([^}]+)\}/);
assert.ok(pageTitleRule, 'Missing .astra-page-title rule');
assert.ok(pageTitleRule[1].includes('overflow-wrap: break-word'), 'Page title must have overflow-wrap: break-word');
assert.ok(pageTitleRule[1].includes('min-width: 0'), 'Page title must have min-width: 0');

const cardTitleRule = css.match(/\.astra-card-title[^{]*\{([^}]+)\}/);
assert.ok(cardTitleRule, 'Missing .astra-card-title rule');
assert.ok(cardTitleRule[1].includes('overflow-wrap: break-word'), 'Card title must have overflow-wrap: break-word');

// Check mobile fluid scaling inside @media (max-width: 640px)
const mobile640Sections = css.split(/@media\s*\(max-width:\s*640px\)\s*\{/).slice(1);
const lastMobileBlock = mobile640Sections[mobile640Sections.length - 1];
assert.ok(lastMobileBlock.includes('--text-page-title: 26px'), 'Mobile must scale page title to 26px');
assert.ok(lastMobileBlock.includes('--text-section-title: 21px'), 'Mobile must scale section title to 21px');
assert.ok(lastMobileBlock.includes('--text-card-title: 17.5px'), 'Mobile must scale card title to 17.5px');

console.log('✓ Shared typography utility classes and responsive fluid scaling verified.');

// 2. Verify Page 1: Mission Control (src/components/MissionControl.jsx)
const mcJsx = fs.readFileSync('./src/components/MissionControl.jsx', 'utf-8');
assert.ok(mcJsx.includes('astra-card-title'), 'Mission Control must adopt astra-card-title on card headings');
assert.ok(mcJsx.includes('var(--text-card-title'), 'Mission Control must use var(--text-card-title) token');
console.log('✓ Mission Control typography verified.');

// 3. Verify Page 2: Memory Store (src/components/MemoryView.jsx)
const memJsx = fs.readFileSync('./src/components/MemoryView.jsx', 'utf-8');
assert.ok(memJsx.includes('className="astra-page-title"'), 'MemoryView must use astra-page-title');
assert.ok(memJsx.includes('className="astra-page-subtitle"'), 'MemoryView must use astra-page-subtitle');
assert.ok(memJsx.includes('className="astra-card-title"'), 'MemoryView must use astra-card-title');
assert.ok(memJsx.includes('var(--text-meta'), 'MemoryView must use var(--text-meta) on metadata rows');
console.log('✓ Memory Store typography verified.');

// 4. Verify Page 3: Knowledge Base (src/components/KnowledgeView.jsx)
const kbJsx = fs.readFileSync('./src/components/KnowledgeView.jsx', 'utf-8');
assert.ok(kbJsx.includes('className="astra-page-title"'), 'KnowledgeView must use astra-page-title');
assert.ok(kbJsx.includes('className="astra-page-subtitle"'), 'KnowledgeView must use astra-page-subtitle');
assert.ok(kbJsx.includes('className="astra-card-title"'), 'KnowledgeView must use astra-card-title');
console.log('✓ Knowledge Base typography verified.');

// 5. Verify Page 4: Exam Revision Planner (src/components/PlannerView.jsx)
const plannerJsx = fs.readFileSync('./src/components/PlannerView.jsx', 'utf-8');
assert.ok(plannerJsx.includes('className="planner-header-title"'), 'PlannerView must use planner-header-title');
assert.ok(plannerJsx.includes('className="planner-header-subtitle"'), 'PlannerView must use planner-header-subtitle');
assert.ok(plannerJsx.includes('className="astra-card-title"'), 'PlannerView must use astra-card-title');
console.log('✓ Exam Revision Planner typography verified.');

// 6. Verify Page 5: Quiz Mode (src/components/QuizModeView.jsx)
const quizJsx = fs.readFileSync('./src/components/QuizModeView.jsx', 'utf-8');
assert.ok(quizJsx.includes('className="astra-page-title"'), 'QuizModeView must use astra-page-title');
assert.ok(quizJsx.includes('className="astra-page-subtitle"'), 'QuizModeView must use astra-page-subtitle');
assert.ok(quizJsx.includes('className="astra-section-title"'), 'QuizModeView must use astra-section-title on question');
console.log('✓ Quiz Mode typography verified.');

// 7. Verify Page 6: System Settings (src/components/SettingsView.jsx)
const settingsJsx = fs.readFileSync('./src/components/SettingsView.jsx', 'utf-8');
assert.ok(settingsJsx.includes('className="astra-page-title"'), 'SettingsView must use astra-page-title');
assert.ok(settingsJsx.includes('className="astra-card-title"'), 'SettingsView must use astra-card-title');
assert.ok(settingsJsx.includes('className="astra-label"'), 'SettingsView must use astra-label');
assert.ok(settingsJsx.includes('className="astra-meta"'), 'SettingsView must use astra-meta');
console.log('✓ System Settings typography verified.');

console.log('All ASTRA pages typography standardization tests passed successfully!');
