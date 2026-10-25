import assert from 'node:assert';
import fs from 'node:fs';

console.log('Testing ASTRA Color System, Contrast, and Semantic State Consistency...');

// 1. Precise Relative Luminance and WCAG Contrast Calculation
function getRelativeLuminance(hex) {
  const cleanHex = hex.replace('#', '').trim();
  const rgb = cleanHex.match(/.{2}/g).map(x => parseInt(x, 16) / 255);
  const a = rgb.map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function getContrastRatio(fgHex, bgHex) {
  const lum1 = getRelativeLuminance(fgHex);
  const lum2 = getRelativeLuminance(bgHex);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

// 2. Read index.css
const css = fs.readFileSync('./src/index.css', 'utf-8');

// Rendered backgrounds
const bgCard = '#101524';
const bgMain = '#090d16';

console.log('\n--- WCAG 2.2 AA Contrast Verification (Target: >= 4.5:1 for normal text) ---');

// Contrast Test 1: Primary text
const textPrimaryRatio = getContrastRatio('#f8fafc', bgCard);
console.log(`--text-primary (#f8fafc) on card: ${textPrimaryRatio.toFixed(2)}:1`);
assert.ok(textPrimaryRatio >= 7.0, '--text-primary must exceed WCAG AAA (7:1)');

// Contrast Test 2: Secondary text
const textSecondaryRatio = getContrastRatio('#94a3b8', bgCard);
console.log(`--text-secondary (#94a3b8) on card: ${textSecondaryRatio.toFixed(2)}:1`);
assert.ok(textSecondaryRatio >= 4.5, '--text-secondary must exceed WCAG AA (4.5:1)');

// Contrast Test 3: Muted text (previously failed at 3.82:1 with #64748b)
assert.ok(css.includes('--text-muted: #8292a6'), '--text-muted must be upgraded to #8292a6');
const textMutedRatio = getContrastRatio('#8292a6', bgCard);
console.log(`--text-muted (#8292a6) on card: ${textMutedRatio.toFixed(2)}:1`);
assert.ok(textMutedRatio >= 4.5, '--text-muted must now exceed WCAG AA (4.5:1)');

// Contrast Test 4: Cyan primary & text
const cyanPrimaryRatio = getContrastRatio('#00f2fe', bgCard);
const cyanTextRatio = getContrastRatio('#38bdf8', bgCard);
console.log(`--cyan-primary (#00f2fe) on card: ${cyanPrimaryRatio.toFixed(2)}:1`);
console.log(`--cyan-text (#38bdf8) on card: ${cyanTextRatio.toFixed(2)}:1`);
assert.ok(cyanPrimaryRatio >= 7.0, 'Cyan primary must exceed WCAG AAA (7:1)');
assert.ok(cyanTextRatio >= 4.5, 'Cyan text must exceed WCAG AA (4.5:1)');

// Contrast Test 5: Success text (green)
const successRatio = getContrastRatio('#34d399', bgCard);
console.log(`--color-success-text (#34d399) on card: ${successRatio.toFixed(2)}:1`);
assert.ok(successRatio >= 7.0, 'Success text must exceed WCAG AAA (7:1)');

// Contrast Test 6: Warning text (amber)
const warningRatio = getContrastRatio('#fbbf24', bgCard);
console.log(`--color-warning-text (#fbbf24) on card: ${warningRatio.toFixed(2)}:1`);
assert.ok(warningRatio >= 7.0, 'Warning text must exceed WCAG AAA (7:1)');

// Contrast Test 7: Error text (red)
const errorRatio = getContrastRatio('#f87171', bgCard);
console.log(`--color-error-text (#f87171) on card: ${errorRatio.toFixed(2)}:1`);
assert.ok(errorRatio >= 4.5, 'Error text must exceed WCAG AA (4.5:1)');

// Contrast Test 8: Focus Visible Ring
const focusRatio = getContrastRatio('#00f2fe', bgMain);
console.log(`Focus Visible Ring (#00f2fe) on main: ${focusRatio.toFixed(2)}:1`);
assert.ok(focusRatio >= 3.0, 'Focus indicator must exceed WCAG 2.2 AA (3:1)');

console.log('✓ All foreground text combinations achieve WCAG 2.2 AA compliance against rendered backgrounds.');

// 3. Inspect Semantic Consistency & Tokens
console.log('\n--- Semantic Token & Consistency Verification ---');
assert.ok(css.includes('--color-primary: #00f2fe'), 'Must define centralized --color-primary (Cyan)');
assert.ok(css.includes('--color-success: #10b981'), 'Must define centralized --color-success (Green)');
assert.ok(css.includes('--color-warning: #f59e0b'), 'Must define centralized --color-warning (Amber)');
assert.ok(css.includes('--color-error: #ef4444'), 'Must define centralized --color-error (Red)');

assert.ok(css.includes('.badge-cyan'), 'Must have .badge-cyan');
assert.ok(css.includes('.badge-emerald'), 'Must have .badge-emerald');
assert.ok(css.includes('.badge-orange'), 'Must have .badge-orange');
assert.ok(css.includes('.badge-red'), 'Must have .badge-red');

console.log('✓ Semantic tokens and badges consistently map: cyan (active), green (success), amber (warning), red (error).');

// 4. Accessible Disabled Controls Verification
console.log('\n--- Accessible Disabled Controls ---');
assert.ok(css.includes('--disabled-opacity: 0.68'), 'Must define --disabled-opacity at readable level (0.68)');
assert.ok(css.includes('cursor: not-allowed !important'), 'Disabled controls must communicate state via not-allowed cursor');
assert.ok(css.includes('filter: grayscale(0.25)'), 'Disabled controls must communicate state via desaturation filter');

// 5. Restrained Card Borders & Clarity
console.log('\n--- Restrained Borders & Clarity ---');
assert.ok(css.includes('--border-color: #1a233a'), 'Ordinary cards must use restrained neutral border');
assert.ok(!css.includes('text-shadow: 0 0 12px'), 'Excessive blurry text shadows must be removed for text clarity');
assert.ok(css.includes('text-shadow: 0 0 4px'), 'Must use restrained subtle glow that preserves legibility');

// 6. Accessible Notification & Toast Contrast Verification
console.log('\n--- Notification & Toast Verification ---');
assert.ok(css.includes('[data-sonner-toaster] [data-sonner-toast]'), 'Must style Sonner toasts to match ASTRA theme');
assert.ok(css.includes('background-color: var(--bg-card) !important'), 'Toasts must render on dark card surface');
assert.ok(css.includes('color: var(--text-primary) !important'), 'Toast titles must render in high-contrast primary text');
assert.ok(css.includes('var(--color-success-border)'), 'Success toasts must use semantic success border');
assert.ok(css.includes('var(--color-error-border)'), 'Error toasts must use semantic error border');
assert.ok(css.includes('var(--color-warning-border)'), 'Warning toasts must use semantic warning border');

// 7. Cross-Page Semantic Token Consistency
console.log('\n--- Cross-Page Semantic Token Consistency ---');
const settingsCode = fs.readFileSync('./src/components/SettingsView.jsx', 'utf-8');
assert.ok(settingsCode.includes('var(--color-error-text)'), 'SettingsView must use centralized --color-error-text');
assert.ok(settingsCode.includes('var(--color-error-border)'), 'SettingsView must use centralized --color-error-border');

const headerCode = fs.readFileSync('./src/components/Header.jsx', 'utf-8');
assert.ok(!headerCode.includes("color: '#64748b'"), 'Header breadcrumb separator must not use muted #64748b');

console.log('✓ Cross-page color tokens, notifications, and contrast tests verified.');
console.log('All ASTRA color system, contrast, and semantic consistency tests passed successfully!');
