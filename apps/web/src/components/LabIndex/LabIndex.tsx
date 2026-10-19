import { Fragment } from "react";

import { Heading } from "@/components/ui/Heading/Heading";
import { InlineLink } from "@/components/ui/InlineLink/InlineLink";
import { Stack } from "@/components/ui/Stack/Stack";
import { Text } from "@/components/ui/Text/Text";
import { labRoutes, labStrategies } from "@/content/lab";
import { requireAdmin } from "@/lib/session";

import styles from "./LabIndex.module.css";

// `lab.ts` wraps code in backticks. Show those parts as <code>, without the backticks.
function Inline({ text }: { text: string }) {
  return text
    .split("`")
    .map((part, index) =>
      index % 2 === 1 ? <code key={index}>{part}</code> : <Fragment key={index}>{part}</Fragment>,
    );
}

/**
 * The rows of `/lab`. `requireAdmin` runs first, so no row text is built for a visitor who is not
 * an admin: no session redirects to `/login?next=%2Flab`, and a member gets `forbidden.tsx`.
 * The call is not wrapped in try/catch, because both outcomes are thrown control flow.
 */
export async function LabIndex() {
  await requireAdmin("/lab");
  return (
    <Stack gap={6}>
      {labStrategies.map((strategy) => {
        const rows = labRoutes.filter((row) => row.strategy === strategy.name);
        const headingId = `lab-${labStrategies.indexOf(strategy)}`;
        return (
          <Stack key={strategy.name} as="section" gap={3} aria-labelledby={headingId}>
            <Heading level={2} id={headingId}>
              <Inline text={strategy.name} />
            </Heading>
            <Text tone="muted">
              <Inline text={strategy.meaning} />
            </Text>
            <ul className={styles.list}>
              {rows.map((row) => (
                <li key={`${row.route}|${row.story}`} className={styles.row}>
                  <Stack gap={1}>
                    <Text>
                      {row.href ? (
                        <InlineLink href={row.href}>
                          <code>{row.route}</code>
                        </InlineLink>
                      ) : (
                        <code>{row.route}</code>
                      )}
                    </Text>
                    <Text size="sm">
                      APIs: <Inline text={row.apis} />
                    </Text>
                    <Text size="sm">
                      Why: <Inline text={row.why} />
                    </Text>
                    <Text size="sm" tone="muted">
                      {row.story} · {row.status === "built" ? "Built" : "Planned"}
                    </Text>
                  </Stack>
                </li>
              ))}
            </ul>
          </Stack>
        );
      })}
    </Stack>
  );
}

/**
 * The fallback while the role check runs. The rows stream in with JavaScript, so with it off this
 * is all a visitor sees, and the `<noscript>` line says what is missing. Its copy is neutral,
 * because a member who is not an admin sees it too.
 */
export function LabIndexSkeleton() {
  return (
    <>
      <Text tone="muted">Loading the lab.</Text>
      <noscript>
        <Text>This page needs JavaScript.</Text>
      </noscript>
    </>
  );
}
