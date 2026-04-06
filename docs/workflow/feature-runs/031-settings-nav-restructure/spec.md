# Spec: Settings Nav Restructure

## Problem
Settings is currently a single page with 5 tabs (Account, System Health, Models, Infrastructure, API Keys) accessible via a plain nav link. This is hard to discover and doesn't scale. Preambles and Level Presets live under the Domains dropdown as "Domain Setup" children, but they are global resources (not domain-scoped) — wrong home.

## Goal
- Convert Settings from a single tabbed page to a dropdown nav with separate pages per section
- Move Preambles and Level Presets from Domains → Settings as a "Research Setup" sub-menu
- Simplify the Domains dropdown to its core analysis items only

## Scope

### Files to modify
- `cloud/apps/web/src/App.tsx` — add new routes, redirect old /settings
- `cloud/apps/web/src/components/layout/NavTabs.tsx` — restructure menus
- `cloud/apps/web/src/components/layout/MobileNav.tsx` — restructure menus

### Files to create
- `cloud/apps/web/src/pages/SettingsAccount.tsx`
- `cloud/apps/web/src/pages/SettingsSystemHealth.tsx`
- `cloud/apps/web/src/pages/SettingsModels.tsx`
- `cloud/apps/web/src/pages/SettingsInfrastructure.tsx`
- `cloud/apps/web/src/pages/SettingsApiKeys.tsx`

### Files NOT to modify
`cloud/apps/web/src/pages/Settings.tsx` (legacy, can be left in place), panel components (AccountPanel, SystemHealth, ModelsPanel, InfraPanel, ApiKeysPanel), Preambles.tsx, LevelPresets.tsx, CLAUDE.md, AGENTS.md, MEMORY.md.

## Implementation

### 1. New settings pages
Each is a thin wrapper around its existing panel component:

```tsx
// SettingsAccount.tsx
import { AccountPanel } from '../components/settings/AccountPanel';
export function SettingsAccount() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Account</h1>
      <AccountPanel />
    </div>
  );
}
```

Same pattern for SettingsSystemHealth (SystemHealth), SettingsModels (ModelsPanel), SettingsInfrastructure (InfraPanel), SettingsApiKeys (ApiKeysPanel).

### 2. App.tsx routes
- Remove the `import { Settings }` import
- Add 5 imports for the new page components
- Replace the single `/settings` route with:
  - `<Route path="/settings" element={<Navigate to="/settings/account" replace />} />`
  - 5 new routes for `/settings/account`, `/settings/system-health`, `/settings/models`, `/settings/infrastructure`, `/settings/api-keys`

### 3. NavTabs.tsx
- Remove Settings from `utilityTabs` array (currently alongside Compare)
- Add `settingsMenuItems` array:
  ```ts
  const settingsMenuItems: MenuItem[] = [
    { name: 'Research Setup', children: [
      { name: 'Preambles', path: '/preambles' },
      { name: 'Level Presets', path: '/level-presets' },
    ]},
    { name: 'Account', path: '/settings/account' },
    { name: 'System Health', path: '/settings/system-health' },
    { name: 'Models', path: '/settings/models' },
    { name: 'Infrastructure', path: '/settings/infrastructure' },
    { name: 'API Keys', path: '/settings/api-keys' },
  ];
  ```
- Add `settingsMenuRef`, `isSettingsMenuOpen` state, `isSettingsActive` derived value
- Add Settings to `useEffect` that closes menus on navigation
- Add `useClickOutside` for settingsMenuRef
- Call `renderMenu(settingsMenuRef, 'Settings', '/settings/account', Settings, settingsMenuItems, isSettingsActive, isSettingsMenuOpen, setIsSettingsMenuOpen)` at end of nav
- Simplify `domainMenuItems` to: Overview + Domain Analysis only (remove Coverage and Domain Setup group)

### 4. MobileNav.tsx
- Simplify Domains children to `[{ name: 'Domain Analysis', path: '/domains/analysis', icon: BarChart2 }]`
- Convert Settings from `{ name: 'Settings', path: '/settings', icon: Settings }` to a group:
  ```ts
  {
    name: 'Settings',
    path: '/settings/account',
    icon: Settings,
    children: [
      { name: 'Research Setup', icon: FileText, children: [
        { name: 'Preambles', path: '/preambles', icon: FileText },
        { name: 'Level Presets', path: '/level-presets', icon: FileText },
      ]},
      { name: 'Account', path: '/settings/account', icon: Settings },
      { name: 'System Health', path: '/settings/system-health', icon: Settings },
      { name: 'Models', path: '/settings/models', icon: Settings },
      { name: 'Infrastructure', path: '/settings/infrastructure', icon: Settings },
      { name: 'API Keys', path: '/settings/api-keys', icon: Settings },
    ],
  }
  ```

## Verification
```bash
cd cloud/
npm run lint --workspace @valuerank/web
npm run test --workspace @valuerank/web
npm run build --workspace @valuerank/web
```
All must pass. No `@ts-ignore`. No new lint errors.
