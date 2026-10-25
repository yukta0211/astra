import assert from 'node:assert';
import fs from 'node:fs';

console.log('Testing ASTRA Reusable Visual Components, Button Hierarchy, Form Controls, and Interaction States...');

// 1. Read files
const css = fs.readFileSync('./src/index.css', 'utf-8');
const sidebarJsx = fs.readFileSync('./src/components/Sidebar.jsx', 'utf-8');
const headerJsx = fs.readFileSync('./src/components/Header.jsx', 'utf-8');
const settingsJsx = fs.readFileSync('./src/components/SettingsView.jsx', 'utf-8');
const plannerJsx = fs.readFileSync('./src/components/PlannerView.jsx', 'utf-8');
const memoryJsx = fs.readFileSync('./src/components/MemoryView.jsx', 'utf-8');
const mcJsx = fs.readFileSync('./src/components/MissionControl.jsx', 'utf-8');
const knowJsx = fs.readFileSync('./src/components/KnowledgeView.jsx', 'utf-8');

// --- Section 1: Visual Component Tokens in :root ---
console.log('\n--- Section 1: Component Tokens in :root ---');

// Button dimension and typography tokens
assert.ok(css.includes('--btn-height: 38px'), 'Must define standard --btn-height (38px)');
assert.ok(css.includes('--btn-height-sm: 30px'), 'Must define compact --btn-height-sm (30px)');
assert.ok(css.includes('--btn-height-lg: 42px'), 'Must define touch --btn-height-lg (42px)');
assert.ok(css.includes('--btn-padding-x: 16px'), 'Must define standard --btn-padding-x (16px)');
assert.ok(css.includes('--btn-font-size: 13px'), 'Must define --btn-font-size (13px)');
assert.ok(css.includes('--btn-font-size-sm: 11.5px'), 'Must define --btn-font-size-sm (11.5px)');

// Form control tokens
assert.ok(css.includes('--input-height: 38px'), 'Must define standard --input-height (38px)');
assert.ok(css.includes('--input-padding-x: 12px'), 'Must define standard --input-padding-x (12px)');
assert.ok(css.includes('--input-font-size: 13.5px'), 'Must define standard --input-font-size (13.5px)');

// Icon hierarchy tokens
assert.ok(css.includes('--icon-size-xs: 12px'), 'Must define --icon-size-xs (12px)');
assert.ok(css.includes('--icon-size-sm: 14px'), 'Must define --icon-size-sm (14px)');
assert.ok(css.includes('--icon-size-md: 16px'), 'Must define --icon-size-md (16px)');
assert.ok(css.includes('--icon-size-lg: 18px'), 'Must define --icon-size-lg (18px)');
assert.ok(css.includes('--icon-size-xl: 22px'), 'Must define --icon-size-xl (22px)');
assert.ok(css.includes('--icon-stroke-width: 1.85px'), 'Must define consistent --icon-stroke-width (1.85px)');

// Directional depth & soft shadows (Zero radioactive halos)
assert.ok(css.includes('--shadow-card:'), 'Must define --shadow-card with soft directional blur');
assert.ok(css.includes('--shadow-card-hover:'), 'Must define --shadow-card-hover');
assert.ok(css.includes('--shadow-card-interactive-hover:'), 'Must define --shadow-card-interactive-hover');
assert.ok(css.includes('--shadow-popover:'), 'Must define --shadow-popover');
assert.ok(css.includes('--shadow-modal:'), 'Must define --shadow-modal');
assert.ok(css.includes('--shadow-primary-glow:'), 'Must define reserved --shadow-primary-glow for high-priority actions');
assert.ok(css.includes('--shadow-focus-ring:'), 'Must define --shadow-focus-ring');

// Mobile comfort scaling
const mobileBlocks = css.split(/@media\s*\(max-width:\s*640px\)\s*\{/).slice(1);
const lastMobileBlock = mobileBlocks[mobileBlocks.length - 1];
assert.ok(lastMobileBlock.includes('--btn-height: 42px'), 'Mobile must scale button height to 42px for touch comfort');
assert.ok(lastMobileBlock.includes('--input-height: 42px'), 'Mobile must scale input height to 42px for touch comfort');

console.log('✓ All button, form control, icon, shadow, and mobile comfort tokens verified in :root.');

// --- Section 2: Reusable Button Variants & Interaction States ---
console.log('\n--- Section 2: Button Variants & Interaction States ---');

// Primary button
assert.ok(css.includes('.btn-cyan, .btn-primary'), 'Must define unified primary button variant (.btn-cyan, .btn-primary)');
assert.ok(css.includes('transform: scale(0.97) translateY(0)'), 'Primary button must provide Emil active press feedback');
assert.ok(css.includes('var(--shadow-primary-glow'), 'Primary button hover must use reserved cyan glow');
assert.ok(css.includes('cursor: not-allowed !important'), 'Button disabled must use not-allowed cursor');

// Secondary button
assert.ok(css.includes('.btn-secondary'), 'Must define secondary button variant');
assert.ok(css.includes('background: rgba(255, 255, 255, 0.05)'), 'Secondary button must use restrained translucent surface');
assert.ok(css.includes('border: 1px solid var(--border-color)'), 'Secondary button must use restrained neutral border');

// Destructive button
assert.ok(css.includes('.btn-destructive, .btn-danger'), 'Must define distinct destructive button variant');
assert.ok(css.includes('color: var(--color-error-text, #f87171)'), 'Destructive button must use legible error color text');
assert.ok(css.includes('border: 1px solid rgba(239, 68, 68, 0.28)'), 'Destructive button must use restrained red border');

// Compact button
assert.ok(css.includes('.btn-sm'), 'Must define .btn-sm compact button modifier');
assert.ok(css.includes('min-height: var(--btn-height-sm, 30px) !important'), 'Compact button must lock height to 30px');

// Icon button
assert.ok(css.includes('.btn-icon'), 'Must define .btn-icon accessible icon-only button class');
assert.ok(css.includes('width: 32px'), 'Icon button must have minimum 32px width touch target');
assert.ok(css.includes('height: 32px'), 'Icon button must have minimum 32px height touch target');

console.log('✓ Primary, secondary, destructive, compact, and icon button classes verified.');

// --- Section 3: Form Controls (Input, Textarea, Select) ---
console.log('\n--- Section 3: Form Control Components ---');

assert.ok(css.includes('.astra-input'), 'Must define .astra-input class');
assert.ok(css.includes('.astra-textarea'), 'Must define .astra-textarea class');
assert.ok(css.includes('.astra-select'), 'Must define .astra-select class');
assert.ok(css.includes('border-color: var(--cyan-primary) !important'), 'Input focus must show crisp cyan border');
assert.ok(css.includes('box-shadow: var(--shadow-focus-ring) !important'), 'Input focus must show focus ring');
assert.ok(css.includes('border-color: var(--color-error) !important'), 'Input invalid state must show red error border');

console.log('✓ Standardized form controls, focus rings, and invalid states verified.');

// --- Section 4: Sidebar Navigation States ---
console.log('\n--- Section 4: Sidebar Navigation & Active States ---');

assert.ok(css.includes('.sidebar-nav-item'), 'Must define .sidebar-nav-item');
assert.ok(css.includes('.sidebar-nav-item.is-active'), 'Must define .sidebar-nav-item.is-active');
assert.ok(css.includes('box-shadow: inset 3px 0 0 0 var(--cyan-primary)'), 'Active nav item must carry crisp left edge active accent');

assert.ok(sidebarJsx.includes('className={`sidebar-nav-item ${isActive ? \'is-active\' : \'\'}`}'), 'Sidebar must adopt .sidebar-nav-item and .is-active');
assert.ok(sidebarJsx.includes('aria-current={isActive ? \'page\' : undefined}'), 'Active nav item must provide accessible aria-current');
assert.ok(sidebarJsx.includes('className="btn-icon"'), 'Sidebar collapse toggle must adopt .btn-icon');
assert.ok(sidebarJsx.includes('aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}'), 'Sidebar collapse button must have accessible aria-label');
assert.ok(sidebarJsx.includes('Icon size={18}'), 'Sidebar nav icons must be standardized to 18px');

console.log('✓ Navigation states, active edge accent, and accessibility verified.');

// --- Section 5: Restrained Card Borders & Shadow Polish ---
console.log('\n--- Section 5: Restrained Card Depth & Shadow Polish ---');

assert.ok(css.includes('box-shadow: var(--shadow-card,'), 'Glass panel must adopt var(--shadow-card)');
assert.ok(css.includes('box-shadow: var(--shadow-card-interactive-hover,'), 'Interactive cards must adopt var(--shadow-card-interactive-hover)');
assert.ok(!css.includes('0 0 1px 1px rgba(0, 242, 254, 0.2)'), 'Eliminated artificial zero-offset glowing halo on cards');

console.log('✓ Card depth, restrained borders, and natural shadows verified.');

// --- Section 6: Cross-Component Adoption Verification ---
console.log('\n--- Section 6: Cross-Component Adoption ---');

// Header.jsx
assert.ok(headerJsx.includes('className="btn-icon"'), 'Header must adopt btn-icon for notifications and dialog actions');
assert.ok(headerJsx.includes('aria-label="Notifications"'), 'Notifications button must be accessible');

// SettingsView.jsx
assert.ok(settingsJsx.includes('className="btn-destructive"'), 'SettingsView must adopt btn-destructive for Reset Demo');

// PlannerView.jsx
assert.ok(plannerJsx.includes('className="astra-input"'), 'PlannerView must adopt astra-input for date confirmation');

// KnowledgeView.jsx
assert.ok(knowJsx.includes('className="btn-icon"'), 'KnowledgeView must adopt btn-icon for clear query input');

// MemoryView.jsx
assert.ok(memoryJsx.includes('className="btn-secondary btn-sm"'), 'MemoryView must adopt btn-secondary btn-sm for Edit action');
assert.ok(memoryJsx.includes('className="btn-destructive btn-sm"'), 'MemoryView must adopt btn-destructive btn-sm for Delete action');
assert.ok(memoryJsx.includes('className="btn-destructive"'), 'MemoryView must adopt btn-destructive for Delete modal confirmation');
assert.ok(memoryJsx.includes('className="btn-icon"'), 'MemoryView must adopt btn-icon for search clear action');

// MissionControl.jsx
assert.ok(mcJsx.includes('className="btn-secondary btn-sm"'), 'MissionControl must adopt btn-secondary btn-sm for Clear Chat');
assert.ok(mcJsx.includes('className="astra-input"'), 'MissionControl Add Task modal must adopt astra-input');
assert.ok(mcJsx.includes('className="astra-select"'), 'MissionControl Add Task modal must adopt astra-select');

console.log('✓ All cross-component adoptions successfully verified.');
console.log('\nAll ASTRA Reusable Visual Components tests passed successfully!');
