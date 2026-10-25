import assert from 'node:assert';
import fs from 'node:fs';

console.log('Running comprehensive verification on ASTRA Mission Control command bar...');

// 1. Inspect index.css rules
const css = fs.readFileSync('./src/index.css', 'utf-8');

// Ensure min-width: 0 on both input wrapper and input
const inputWrapperMatch = css.match(/\.command-bar-input-wrapper\s*\{([^}]+)\}/);
assert.ok(inputWrapperMatch, 'Missing .command-bar-input-wrapper block');
assert.ok(inputWrapperMatch[1].includes('min-width: 0'), 'input-wrapper must have min-width: 0');
assert.ok(inputWrapperMatch[1].includes('flex: 1 1 0%') || inputWrapperMatch[1].includes('flex: 1'), 'input-wrapper must be flex: 1');

const inputMatch = css.match(/\.command-bar-input\s*\{([^}]+)\}/);
assert.ok(inputMatch, 'Missing .command-bar-input block');
assert.ok(inputMatch[1].includes('min-width: 0'), 'command-bar-input must have min-width: 0');
assert.ok(inputMatch[1].includes('width: 100%'), 'command-bar-input must have width: 100%');
assert.ok(inputMatch[1].includes('text-overflow: ellipsis'), 'command-bar-input must have text-overflow: ellipsis');
assert.ok(inputMatch[1].includes('font-size: 14px'), 'command-bar-input font size on desktop must be 14px');

// Check controls reserved width (flex-shrink: 0)
const actionsMatch = css.match(/\.command-bar-actions\s*\{([^}]+)\}/);
assert.ok(actionsMatch, 'Missing .command-bar-actions block');
assert.ok(actionsMatch[1].includes('flex-shrink: 0'), '.command-bar-actions must have flex-shrink: 0 on desktop');

const voiceBtnMatch = css.match(/\.command-bar-btn-voice\s*\{([^}]+)\}/);
assert.ok(voiceBtnMatch[1].includes('flex-shrink: 0'), '.command-bar-btn-voice must have flex-shrink: 0');

const executeBtnMatch = css.match(/\.command-bar-btn-execute\s*\{([^}]+)\}/);
assert.ok(executeBtnMatch[1].includes('flex-shrink: 0'), '.command-bar-btn-execute must have flex-shrink: 0');

// Check tablet breakpoint hides Enter hint
assert.ok(css.includes('@media (max-width: 820px)'), 'Missing @media (max-width: 820px) breakpoint');
const tabletMatch = css.match(/@media\s*\(max-width:\s*820px\)\s*\{[\s\S]*?\.command-bar-enter-hint\s*\{([^}]+)\}/);
assert.ok(tabletMatch, 'Missing tablet rule hiding Enter hint');
assert.ok(tabletMatch[1].includes('display: none !important'), 'Enter hint must be hidden at <= 820px');

// Check mobile breakpoint stacks command bar and sets readable 16px touch font
assert.ok(css.includes('@media (max-width: 640px)'), 'Missing @media (max-width: 640px) breakpoint');
const mobileBarMatch = css.match(/@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.astra-command-bar\s*\{([^}]+)\}/);
assert.ok(mobileBarMatch, 'Missing mobile rules for .astra-command-bar');
assert.ok(mobileBarMatch[1].includes('flex-direction: column'), 'Mobile command bar must stack with flex-direction: column');

const mobileInputMatch = css.match(/@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.command-bar-input\s*\{([^}]+)\}/);
assert.ok(mobileInputMatch, 'Missing mobile rules for .command-bar-input');
assert.ok(mobileInputMatch[1].includes('font-size: 16px'), 'Mobile input must use 16px to prevent iOS auto-zoom');

// 2. Inspect MissionControl.jsx implementation
const jsx = fs.readFileSync('./src/components/MissionControl.jsx', 'utf-8');

// Distinct controls
assert.ok(jsx.includes('command-bar-btn-voice'), 'Missing Voice button');
assert.ok(jsx.includes('command-bar-btn-execute'), 'Missing Execute button');
assert.ok(jsx.includes('command-bar-clear-btn'), 'Missing Clear button');
assert.ok(jsx.includes('command-bar-enter-hint'), 'Missing Enter hint');

// Accessibility
assert.ok(jsx.includes('aria-label="Command ASTRA prompt input"'), 'Input missing descriptive aria-label');
assert.ok(jsx.includes('aria-label="Execute command"'), 'Execute button missing aria-label');
assert.ok(jsx.includes('aria-label="Clear input text"'), 'Clear button missing aria-label');

// Keyboard submission
assert.ok(jsx.includes("e.key === 'Enter'"), 'Missing Enter key handler');
assert.ok(jsx.includes('onSubmitMessage()'), 'Missing onSubmitMessage trigger');

// States
assert.ok(jsx.includes("aiStatus === 'Thinking...'"), 'Missing thinking state');
assert.ok(jsx.includes('disabled={aiStatus === \'Thinking...\'}'), 'Input must disable while thinking');
assert.ok(jsx.includes('disabled={!inputText.trim() || aiStatus === \'Thinking...\'}'), 'Execute button must disable on empty or thinking');

console.log('✓ All 12 comprehensive command bar responsive and accessibility tests passed!');
