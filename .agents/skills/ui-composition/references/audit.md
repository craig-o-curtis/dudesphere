# Audit checklist

Use this to review a diff, and to refresh `context/audits/frontend-audit.md`. Run the commands from the repo root. Each check names what it finds and what the fix is.

`qa-skeptic` runs this on every web diff, under its standards axis. A finding cites `ui-composition › audit › <check number>`.

## Written exceptions

Two exceptions are accepted, and a check that finds only these is clean.

- **SiteFooter's band.** `components/SiteFooter/SiteFooter.module.css` keeps `background: var(--color-surface)` and `border-block-start` in its own module (check 3). The band is a one-off page region, not a part another feature would reuse. The story that adds a second band should extract it. Everything else in that module is layout.
- **`1px` in `VisuallyHidden`.** The clip rule needs it (check 1). No other module should write it.

## 1. Raw values in modules

```sh
grep -rnE '[0-9.]+(px|rem|em|ch)\b|#[0-9a-fA-F]{3,8}\b|rgba?\(|font-weight: *[0-9]|line-height: *[0-9]|z-index: *[0-9]|[0-9]+m?s\b' \
  --include='*.module.css' apps/web/src
```

Every hit is a finding, except `0` and values inside `@media` queries. Fix: use an existing token, or add one (`tokens.md`).

## 2. Repeated declaration blocks

```sh
# Declarations that appear in more than one module
grep -rhoE '^\s+[a-z-]+: [^;]+;' --include='*.module.css' apps/web/src \
  | sed 's/^ *//' | sort | uniq -c | sort -rn | awk '$1 > 1' | head -40
```

```sh
# Two modules that are largely the same
diff <(sort apps/web/src/components/A/A.module.css) <(sort apps/web/src/components/B/B.module.css)
```

Look for three or more of the same declarations together in two places. Fix: extract into a shared part, or a variant of one.

## 3. Looks in a feature module

```sh
grep -nE '^\s+(color|background|border|border-radius|font|font-size|font-weight|box-shadow|letter-spacing):' \
  $(find apps/web/src/components apps/web/src/app -name '*.module.css' -not -path '*/components/ui/*')
```

A feature module may hold layout only. Fix: move the look into a part, or set a component token through a class.

## 4. Hand-built controls

```sh
grep -rnE '<(button|input|select|textarea|dialog|h[1-6])[ >]' --include='*.tsx' \
  apps/web/src/components apps/web/src/app | grep -v '/components/ui/' | grep -v '\.spec\.tsx'
```

Every hit outside `ui/` is a finding once the matching part is built. Fix: use `Button`, `TextField` (or another composed field), `Heading` or `Dialog`. A hidden input that carries a value, such as `NextPathField`'s `next`, is not a control the member sees. Note it and move on.

## 5. Hand-wired accessibility

```sh
grep -rnE 'aria-describedby=|aria-invalid=|role="alert"|<output' --include='*.tsx' \
  apps/web/src/components apps/web/src/app | grep -v '/components/ui/' | grep -v '\.spec\.tsx'
```

Fix: the composed fields (through `useField`) wire the description and the invalid state. `FormAlert` and `Notice` own the live regions. An `aria-describedby` that points a button at a hint outside any field, as in SessionCorner and ThemeToggle, is not field wiring. Check that its id comes from `useId`, then note it.

## 6. Base UI outside `ui/`

```sh
grep -rn '@base-ui/react' apps/web/src | grep -v '/components/ui/'
```

Any hit is a finding. Fix: wrap the part in `ui/`.

## 7. Parts that can't be adjusted

```sh
for f in apps/web/src/components/ui/*/*.tsx; do
  case "$f" in *.spec.tsx) continue;; esac
  grep -q 'className' "$f" || echo "no className: $f"
  grep -q '\.\.\.rest' "$f" || echo "no ...rest: $f"
done
```

Fix: rule 5 in `SKILL.md`.

## 8. Variants as booleans or classes

```sh
grep -rnE '\b(is|has|show)[A-Z][a-zA-Z]*\?: boolean' --include='*.tsx' apps/web/src/components/ui
grep -rnE '\.(primary|secondary|muted|small|large|isActive|isPending)\b' --include='*.module.css' apps/web/src/components/ui
```

Fix: a `variant` or `tone` prop rendered as a data attribute (rule 6).

## 9. Logic copied between files

```sh
grep -rnE '^(export )?const [A-Z_]{4,} = ' --include='*.ts*' apps/web/src | grep -v '\.spec\.' \
  | sort -t: -k3 | uniq -f2 -D
```

Also check for the same helper body in two components. Fix: move it into `src/lib/` with a spec.

## 10. Shared code without a spec

```sh
for d in apps/web/src/components/ui/*/; do
  ls "$d" | grep -q '\.spec\.tsx\?$' || echo "no spec: $d"
done
for f in apps/web/src/hooks/*.ts apps/web/src/lib/*.ts; do
  case "$f" in *.spec.ts) continue;; esac
  [ -e "${f%.ts}.spec.ts" ] || [ -e "${f%.ts}.spec.tsx" ] || echo "no spec: $f"
done
```

Fix: rule 12 in `SKILL.md`.

## Reporting

For each finding, give the file and line, quote the repeated or raw code briefly, name the check number, and name the fix (which part, variant or token). Rank findings by how much code the fix removes.
