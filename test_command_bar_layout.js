import assert from 'node:assert';
import fs from 'node:fs';

console.log('Testing ASTRA Mission Control command bar layout and responsive rules...');

// 1. Verify CSS rules in index.css
const cssContent = fs.readFileSync('./src/index.css', 'utf-8');

// Ensure min-width: 0 is applied to command bar input and input wrapper
assert.ok(cssContent.includes('.command-bar-input-wrapper'), 'Missing .command-bar-input-wrapper class');
assert.ok(cssContent.includes('.command-bar-input'), 'Missing .command-bar-input class');
assert.ok(cssContent.includes('.astra-command-bar'), 'Missing .astra-command-bar class');

// Check flex & min-width rules
const inputWrapperMatch = cssContent.match(/\.command-bar-input-wrapper\s*\{([^}]+)\}/);
assert.ok(inputWrapperMatch, 'Could not find .command-bar-input-wrapper block');
assert.ok(inputWrapperMatch[1].includes('min-width: 0'), 'input-wrapper must have min-width: 0');
assert.ok(inputWrapperMatch[1].includes('flex: 1 1 0%') || inputWrapperMatch[1].includes('flex: 1'), 'input-wrapper must be flex: 1');

const inputMatch = cssContent.match(/\.command-bar-input\s*\{([^}]+)\}/);
assert.ok(inputMatch, 'Could not find .command-bar-input block');
assert.ok(inputMatch[1].includes('min-width: 0'), 'command-bar-input must have min-width: 0');
assert.ok(inputMatch[1].includes('width: 100%'), 'command-bar-input must have width: 100%');

// Check controls reserved width (flex-shrink: 0)
const actionsMatch = cssContent.match(/\.command-bar-actions\s*\{([^}]+)\}/);
assert.ok(actionsMatch, 'Could not find .command-bar-actions block');
assert.ok(actionsMatch[1].includes('flex-shrink: 0'), '.command-bar-actions must have flex-shrink: 0 on desktop');

// Check media queries for tablet/mobile hiding Enter shortcut
assert.ok(cssContent.includes('@media (max-width: 820px)'), 'Missing @media (max-width: 820px) breakpoint');
assert.ok(cssContent.includes('.command-bar-enter-hint'), 'Missing .command-bar-enter-hint class');

// Check mobile stacked layout rule
assert.ok(cssContent.includes('@media (max-width: 640px)'), 'Missing @media (max-width: 640px) breakpoint');
const mobileBarMatch = cssContent.match(/@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.astra-command-bar\s*\{([^}]+)\}/);
assert.ok(mobileBarMatch, 'Missing mobile rules for .astra-command-bar');
assert.ok(mobileBarMatch[1].includes('flex-direction: column'), 'Mobile command bar must wrap/stack with flex-direction: column');

console.log('✓ All CSS responsive rules verified successfully');

// 2. Verify JSX implementation in MissionControl.jsx
const jsxContent = fs.readFileSync('./src/components/MissionControl.jsx', 'utf-8');

// Check input attributes and accessibility
assert.ok(jsxContent.includes('className="command-bar-input"'), 'Missing command-bar-input class in JSX');
assert.ok(jsxContent.includes('command-bar-enter-hint'), 'Missing command-bar-enter-hint in JSX');
assert.ok(jsxContent.includes('command-bar-btn-voice'), 'Missing command-bar-btn-voice in JSX');
assert.ok(jsxContent.includes('command-bar-btn-execute'), 'Missing command-bar-btn-execute in JSX');
assert.ok(jsxContent.includes('aria-label='), 'Missing accessibility aria-labels');
assert.ok(jsxContent.includes('command-bar-clear-btn'), 'Missing clear button for long commands');

// Check keyboard submission
assert.ok(jsxContent.includes("e.key === 'Enter'"), 'Missing Enter key handler');
assert.ok(jsxContent.includes('onSubmitMessage()'), 'Missing onSubmitMessage call');

// Check disabled and loading states
assert.ok(jsxContent.includes("aiStatus === 'Thinking...'"), 'Missing AI Thinking state check');
assert.ok(jsxContent.includes('disabled='), 'Missing disabled attribute on button/input');

console.log('✓ MissionControl.jsx implementation verified successfully');
console.log('All command bar layout and responsive tests passed!');
