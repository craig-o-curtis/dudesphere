import { Heading } from "@/components/ui/Heading/Heading";
import { InlineLink } from "@/components/ui/InlineLink/InlineLink";
import { Stack } from "@/components/ui/Stack/Stack";
import { Text } from "@/components/ui/Text/Text";

// Rendered by `forbidden()` (see `requireAdmin` in `lib/session.ts`). It replaces the whole page
// segment that threw, including that page's own `<h1>`, so it carries its own `<h1>`.
export default function Forbidden() {
  return (
    <Stack gap={3}>
      <Heading level={1}>Off limits</Heading>
      <Text size="lg">There are rules, and this room is one of them.</Text>
      <Text>
        <InlineLink href="/feed">Back to the feed</InlineLink>
      </Text>
    </Stack>
  );
}
