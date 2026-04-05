# Writing a Good Codex Spec

The #1 failure mode is vague specs. Every Codex spec must include:

1. Exactly which files to modify (absolute paths)
2. The specific function/class to add or change
3. What NOT to touch
4. **Removed/renamed symbols** — list old name → new name explicitly
5. Verification: "run `npm run build`, fix all errors, no `@ts-ignore`"

## Protected Files — Always Add to "DO NOT TOUCH" List

Every spec must explicitly forbid Codex from touching these files:

```
DO NOT MODIFY: CLAUDE.md, AGENTS.md, cloud/CLAUDE.md, cloud/AGENTS.md,
cloud/agents.md, MEMORY.md, .gitignore, or any file not listed in the scope
above. If you think another file needs updating, note it in your output but
do not write it.
```

Codex reads these files for context and will "helpfully" edit them unprompted.

## Known Gotchas

**Prisma:** scalar fields cannot be inside `include: {}` — must use `select: {}`.

**GraphQL:** verify any field referenced in the spec actually exists on the server before Codex touches the client. New query files must be imported in `cloud/apps/api/src/graphql/queries/index.ts` — queries are registered as a side effect of import.

## Recovery Prompt

If Codex produces a working-but-ugly fix:
> "Knowing everything you know now, scrap this and implement the elegant solution."
