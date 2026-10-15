import type { ComponentPropsWithRef } from "react";

import { TextInput } from "../TextInput/TextInput";

type EmailInputProps = Omit<ComponentPropsWithRef<typeof TextInput>, "type">;

/** A `TextInput` with `type="email"`. The caller passes `pattern` and the rest. Server-safe. */
export function EmailInput({ className, ...rest }: EmailInputProps) {
  return <TextInput type="email" className={className} {...rest} />;
}
