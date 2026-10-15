import { Text } from "@/components/ui/Text/Text";

// The one plain cookie line under the sign-in and sign-up forms. The session
// and refresh cookies are strictly necessary and the theme cookie is set at
// the member's request, so no banner is needed (see the AUTH-7 handoff).
export function CookieNote() {
  return (
    <Text tone="muted" size="sm">
      Signing in sets two cookies that keep you signed in. Picking a theme sets one more. No
      tracking, no ads. Take it easy.
    </Text>
  );
}
