# Experiment: Settings Restructure — Claude-Direct

## Method
claude-direct (implemented before factory run to avoid cross-contamination)

## Feature
Restructure Settings nav from a single tab to a dropdown with separate pages per section.
Move Preambles + Level Presets from Domains dropdown to Settings > Research Setup.
Simplify Domains dropdown to Overview + Domain Analysis only.

## Pre-Implementation Findings
4 findings caught before writing any code:

1. **(STRUCTURAL)** `/settings` needs a redirect to `/settings/account` — existing bookmarks would 404 otherwise
2. **(STRUCTURAL)** NavTabs needs a new ref + state + isSettingsActive calculation when converting Settings from a utility link to a dropdown — easy to miss since it's a different pattern from the other menus
3. **(TEST)** NavTabs tests likely assert Coverage link exists under Domains — will need updating
4. **(SCOPE)** Panel components (AccountPanel, SystemHealth, etc.) don't need changes — new pages are thin wrappers only

## Implementation
- 5 new page components: SettingsAccount, SettingsSystemHealth, SettingsModels, SettingsInfrastructure, SettingsApiKeys
- App.tsx: 5 new routes + `/settings` → redirect
- NavTabs: settingsMenuRef, isSettingsMenuOpen, isSettingsActive added; Settings moved from utilityTabs to renderMenu; domainMenuItems stripped to 2 items
- MobileNav: Domains children simplified; Settings converted from simple link to group with Research Setup sub-group

## Validation
- 1466/1466 tests pass
- Build clean
- No lint errors (warnings pre-existing, unrelated)

## Human Interruptions
0
