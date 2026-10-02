---
name: code-reviewer-nestjs
description: Review a diff in this NestJS repo against its own rules, the nestjs-best-practices rules, the zero-Date policy (@northguild/gmt and gmt-oxlint), and the spec it was built from. Use whenever the user asks to review a branch, a PR, work in progress, "my changes" or "everything since X" in this project, or wants a check before opening or merging a PR, even if they only say "review this" or "look over what I did". Not for writing new code; use nestjs-best-practices for that.
---

# NestJS code review

Review the diff between `HEAD` and a fixed point on two axes, and report them separately:

- **Standards**: does the code follow this repo's rules?
- **Spec**: does the code do what was asked?

Keep the axes apart all the way to the report. Code can follow every rule and still build the wrong thing, or do exactly what was asked while breaking the rules. A merged list lets the passing axis hide the failing one.

## 1. Pin the diff

1. Use the fixed point the user gave: a commit, branch, tag, `main` or `HEAD~3`. If they gave none, ask. Don't guess.
2. Check it resolves: `git rev-parse <fixed-point>`.
3. Diff from the merge-base with three dots: `git diff <fixed-point>...HEAD`. List the commits with `git log <fixed-point>..HEAD --oneline`.
4. That diff leaves out uncommitted work. If the user wants it reviewed, add `git diff HEAD` and say in the report that you did.
5. If the diff is empty, stop and say so.

## 2. Run the tooling first

```bash
pnpm lint; pnpm typecheck; pnpm format:check; pnpm test
```

Report each failure as a hard Standards finding that cites the tool. After that, don't flag by hand what the tooling already enforces. Dates are the exception, because lint is switched off in some files (section 4).

## 3. Find the spec

Look in this order: the PR body (`gh pr view --json title,body`), issues named in commit messages (`gh issue view <n>`), a path the user passed. If none turns up, ask. If there is no spec, skip the Spec axis and write "no spec available". Don't infer requirements from the code.

## 4. Standards: zero dates (always check)

App code holds no JavaScript `Date`. Timestamps are ISO 8601 UTC strings, created and handled with `@northguild/gmt`, for example `getUtcNow()`. `Date` drags the host timezone and DST rules into values that should be exact instants. That is the bug class this policy removes.

`pnpm lint` enforces it through `@northguild/gmt-oxlint`. Lint flags `Date` references and types, `new Date()`, `Date.now()`, `Date.parse`, `Date.UTC`, `getTimezoneOffset` and date-library imports. Check by hand where lint can't see:

- **`*.entity.ts`, `*.schema.ts`, `src/shared/**`.** `.oxlintrc.json` switches the gmt rules off here, because these files are the database boundary.
  - Entity timestamps use the decorators in `src/shared/decorators/` (`CreateUtcColumn`, `UpdateUtcColumn`, `SoftDeleteUtcColumn`, `UtcColumn`) and are typed `string` or `string | null`. TypeORM's own `@CreateDateColumn`, `@UpdateDateColumn` and `@DeleteDateColumn`, and a bare `@Column({ type: "timestamp" })`, return `Date` objects. Report any of these as a hard finding.
  - Mongoose date paths need getters that return ISO strings, as `src/abiding/abiding.schema.ts` does.
  - In `src/shared/**`, `Date` may appear only to convert a database value into an ISO string.
- **New `oxlint-disable` comments for a gmt rule.** Report as a hard finding, unless the comment sits at that boundary and gives a reason.
- **Best-practices examples.** Several nestjs-best-practices rules use `Date` in their examples (`api-use-interceptors`, `api-use-dto-serialization` and `db-use-transactions`, among others). Follow the pattern a rule teaches, not its date code.

Only if you have a date finding, load the guide for the fix: `node_modules/@northguild/gmt-oxlint/skills/migration-refactor/SKILL.md`. The API guides are `gmt-basics`, `gmt-arithmetic` and `gmt-timezone`, under `node_modules/@northguild/gmt/skills/`.

## 5. Standards: this repo's checks

If the diff touches services, entities, migrations, DTOs, module imports, controllers or tests, read [references/project-checks.md](references/project-checks.md). It covers the bug classes this codebase has actually had:

- soft delete
- transactions across services
- data joined between Postgres and Mongo
- DTOs drifting from entities
- response mappers dropping data
- module cycles
- unguarded routes
- where tests belong

`AGENTS.md` is also a standards source.

## 6. Standards: nestjs-best-practices

Don't load the whole rule set. Read only the rules that match what the diff touches. Each rule is `.agents/skills/nestjs-best-practices/rules/<rule>.md`.

| Diff touches                                | Rules                                                                                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `*.module.ts`, imports between features     | `arch-avoid-circular-deps`, `arch-module-sharing`, `arch-feature-modules`                                                              |
| `*.controller.ts`                           | `security-use-guards`, `api-use-pipes`, `security-validate-all-input`, `api-use-dto-serialization`                                     |
| `*.service.ts`                              | `arch-single-responsibility`, `error-throw-http-exceptions`, `error-handle-async-errors`, `db-use-transactions`, `db-avoid-n-plus-one` |
| `dto/`                                      | `security-validate-all-input`, `api-use-dto-serialization`                                                                             |
| `*.entity.ts`, `*.schema.ts`, `migrations/` | `db-use-migrations`, `perf-optimize-database`                                                                                          |
| providers, constructors                     | `di-prefer-constructor-injection`, `di-scope-awareness`, `di-avoid-service-locator`                                                    |
| `main.ts`, filters, interceptors            | `error-use-exception-filters`, `api-use-interceptors`                                                                                  |
| `src/auth/`, guards                         | `security-auth-jwt`, `security-use-guards`                                                                                             |
| config, env                                 | `devops-use-config-module`                                                                                                             |
| logging                                     | `devops-use-logging`, `security-sanitize-output`                                                                                       |
| `*.spec.ts`, `test/`                        | `test-use-testing-module`, `test-mock-external-services`, `test-e2e-supertest`                                                         |

When the date rule or a project check disagrees with a best-practices rule, follow the project.

## 7. Standards: smell baseline

These apply even where no rule speaks. Each is a judgement call, never a hard violation. Label it "possible Feature Envy" and so on. A documented rule that endorses the pattern overrides the smell.

- **Mysterious Name**: a name that doesn't say what the thing does → rename it.
- **Duplicated Code**: the same logic shape in two hunks or files → extract it and call it from both.
- **Feature Envy**: a method that uses another object's data more than its own → move it to that data.
- **Data Clumps**: the same few fields always travel together → give them one type.
- **Primitive Obsession**: a string or number standing in for a domain concept → give the concept a type.
- **Repeated Switches**: the same `switch` or `if` chain on the same value in several places → one map or polymorphism.
- **Shotgun Surgery**: one change forces edits across many files → gather what changes together.
- **Divergent Change**: one file edited for several unrelated reasons → split it.
- **Speculative Generality**: hooks or parameters nothing asked for → delete them.
- **Message Chains**: long `a.b().c().d()` walks → hide the walk behind one method.
- **Middle Man**: a class that only passes calls on → call the real target. Thin Nest controllers are the endorsed exception.
- **Refused Bequest**: a subclass that ignores most of what it inherits → use composition.

## 8. Spec

Report:

- requirements that are missing or only partly built
- behavior nobody asked for
- requirements that look built but are built wrong

Quote the spec line behind each finding.

## 9. Run the passes

If you can spawn sub-agents, run Standards and Spec as two parallel sub-agents, so neither sees the other's reasoning.

- Give each the diff command and the commit list.
- Give the Standards agent this skill's path, so it can load sections 2 to 7 and their references.
- Give the Spec agent the spec.
- End both briefs with: "Do not invoke code-reviewer-nestjs or any other review skill, and do not spawn agents. Do the review directly." Without that line, a sub-agent can find this skill again and fan out.

Without sub-agents, run Standards first, then Spec, and keep their notes separate.

Review from a fresh session where you can. The session that wrote the code shares its blind spots.

## 10. Verify, then report

Treat every finding as a hypothesis. Before reporting it, open the cited file at the cited line and confirm the code does what the finding claims. Drop or correct any finding that doesn't hold up.

Write the report in plain English, following `.agents/skills/plain-english`. Each finding gives:

- the location, as `path:line`
- what is wrong and what it causes
- the rule it breaks: a rule id, a `project-checks` section, a gmt rule, a tool, or a smell name
- the fix

```markdown
## Standards

### Hard

- `src/orders/orders.service.ts:42`: `update(id, dto)` skips the soft-delete filter, so a deleted order can be edited. Rule: project-checks › Soft delete. Fix: add `deletedAt: IsNull()` to the criteria.

### Judgement calls

- `src/orders/orders.controller.ts:58`: possible Duplicated Code. The customer lookup is repeated in three handlers. Fix: one private helper.

## Spec

- "Cancelling returns the order" — `cancelOrder` returns nothing. Fix: return `getOrderById(id)`.

Standards: 1 hard, 1 judgement. Worst: the soft-delete update. Spec: 1. Worst: cancel's return value.
```

Don't merge or re-rank the two axes. Name the worst finding in each axis, not one overall.
