import assert from 'node:assert';
import fs from 'node:fs';

console.log('Testing Mission Control command presets layout and interaction...');

const jsx = fs.readFileSync('./src/components/MissionControl.jsx', 'utf-8');
const css = fs.readFileSync('./src/index.css', 'utf-8');

// 1. Container & Structural Classes
assert.ok(css.includes('.command-presets-container'), 'Missing .command-presets-container in CSS');
assert.ok(css.includes('.command-presets-group'), 'Missing .command-presets-group in CSS');
assert.ok(css.includes('.command-preset-chip'), 'Missing .command-preset-chip in CSS');

// Check flex wrapping
const groupMatch = css.match(/\.command-presets-group\s*\{([^}]+)\}/);
assert.ok(groupMatch, 'Missing .command-presets-group CSS rule');
assert.ok(groupMatch[1].includes('flex-wrap: wrap'), 'Presets group must have flex-wrap: wrap for natural row wrapping');

// 2. Chip Consistent Dimensions & Geometry
const chipMatch = css.match(/\.command-preset-chip\s*\{([^}]+)\}/);
assert.ok(chipMatch, 'Missing .command-preset-chip CSS rule');
assert.ok(chipMatch[1].includes('min-height: 28px'), 'Presets chip must have consistent min-height: 28px');
assert.ok(chipMatch[1].includes('padding: 4px 10px'), 'Presets chip must have consistent 4px 10px padding');
assert.ok(chipMatch[1].includes('font-size: 11.5px'), 'Presets chip must have consistent readable 11.5px font');
assert.ok(chipMatch[1].includes('border-radius: 6px'), 'Presets chip must have consistent 6px border radius');
assert.ok(chipMatch[1].includes('max-width: 100%'), 'Presets chip must have max-width: 100% to prevent overflow');

// 3. States: Hover, Focus, Active Press, Disabled
assert.ok(css.includes('.command-preset-chip:hover'), 'Missing hover state for preset chips');
assert.ok(css.includes('.command-preset-chip:focus-visible'), 'Missing focus-visible state for preset chips');
assert.ok(css.includes('.command-preset-chip:active'), 'Missing active state for preset chips');
assert.ok(css.includes('.command-preset-chip:disabled'), 'Missing disabled state for preset chips');

// 4. Semantic Themes
assert.ok(css.includes('.command-preset-chip.chip-cyan'), 'Missing cyan theme for preset chips');
assert.ok(css.includes('.command-preset-chip.chip-purple'), 'Missing purple theme for preset chips');
assert.ok(css.includes('.command-preset-chip.chip-emerald'), 'Missing emerald theme for preset chips');

// 5. Mobile Responsiveness
const mobilePresetMatch = css.match(/@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.command-preset-chip\s*\{([^}]+)\}/);
assert.ok(mobilePresetMatch, 'Missing mobile rules for .command-preset-chip');
assert.ok(mobilePresetMatch[1].includes('font-size: 11px'), 'Mobile preset chip should use compact 11px font');

// 6. Action Preservation in JSX
assert.ok(jsx.includes('handleQuickSyncCalendar'), 'Must preserve handleQuickSyncCalendar');
assert.ok(jsx.includes('handleQuickReschedule'), 'Must preserve handleQuickReschedule');
assert.ok(jsx.includes('handleQuickStartQuiz'), 'Must preserve handleQuickStartQuiz');
assert.ok(jsx.includes('What do I have today?'), 'Must preserve "What do I have today?" preset');
assert.ok(jsx.includes('Remember DBMS exam date'), 'Must preserve "Remember DBMS exam date" preset');
assert.ok(jsx.includes('Explain BCNF from notes'), 'Must preserve "Explain BCNF from notes" preset');
assert.ok(jsx.includes('Make 5-Day Revision Plan'), 'Must preserve "Make 5-Day Revision Plan" preset');

// 7. Accessibility & Disabled Attribute
assert.ok(jsx.includes('aria-label="Sync study schedule to calendar"'), 'Must have aria-label on Sync Calendar');
assert.ok(jsx.includes('aria-label="Auto-reschedule study sessions dynamically"'), 'Must have aria-label on Auto-Reschedule');
assert.ok(jsx.includes('aria-label="Start adaptive syllabus quiz mode"'), 'Must have aria-label on Adaptive Quiz');
assert.ok(jsx.includes('role="region" aria-label="Quick action presets"'), 'Must have accessible region on quick actions');
assert.ok(jsx.includes('disabled={aiStatus === \'Thinking...\'}'), 'Preset chips must be disabled while AI is thinking');

console.log('✓ All 7 command preset layout, interaction, and accessibility tests passed successfully!');
