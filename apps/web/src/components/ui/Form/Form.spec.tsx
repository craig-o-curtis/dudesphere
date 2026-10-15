import { render, screen } from "@testing-library/react";
import { createRef, use } from "react";
import { describe, expect, it } from "vitest";

import { Form, FormErrorsContext } from "./Form";

// Stands in for a field part: an input that is invalid when the form has errors for it.
function TestInput({ name }: { name: string }) {
  const errors = use(FormErrorsContext);
  const invalid = Boolean(errors?.[name]?.length);
  return <input aria-label={name} name={name} aria-invalid={invalid ? true : undefined} />;
}

function Inputs() {
  return (
    <>
      <TestInput name="email" />
      <TestInput name="password" />
    </>
  );
}

describe("Form", () => {
  it("renders a native form", () => {
    const { container } = render(
      <Form aria-label="Sign in">
        <Inputs />
      </Form>,
    );
    expect(screen.getByRole("form", { name: "Sign in" })).toBe(container.querySelector("form"));
  });

  it("never sets noValidate", () => {
    render(
      <Form aria-label="Sign in">
        <Inputs />
      </Form>,
    );
    expect(screen.getByRole("form")).not.toHaveAttribute("novalidate");
  });

  it("keeps its own class and adds the one passed in", () => {
    render(
      <Form aria-label="Sign in" className="extra">
        <Inputs />
      </Form>,
    );
    const form = screen.getByRole("form");
    expect(form).toHaveClass("extra");
    expect(form.classList.length).toBeGreaterThan(1);
  });

  it("passes native props and ref to the form", () => {
    const ref = createRef<HTMLFormElement>();
    render(
      <Form ref={ref} aria-label="Sign in" id="the-form" method="post" data-testid="f">
        <Inputs />
      </Form>,
    );
    const form = screen.getByRole("form");
    expect(form).toHaveAttribute("id", "the-form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("data-testid", "f");
    expect(ref.current).toBe(form);
  });

  it("supports a callback ref", () => {
    let seen: HTMLFormElement | null = null;
    render(
      <Form
        aria-label="Sign in"
        ref={(node) => {
          seen = node;
        }}
      >
        <Inputs />
      </Form>,
    );
    expect(seen).toBe(screen.getByRole("form"));
  });

  it("shares its errors through context, and nothing without errors", () => {
    const errors = { email: ["Bad."] };
    const { rerender } = render(
      <Form aria-label="Sign in" errors={errors}>
        <Inputs />
      </Form>,
    );
    expect(screen.getByLabelText("email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("password")).not.toHaveAttribute("aria-invalid");
    rerender(
      <Form aria-label="Sign in">
        <Inputs />
      </Form>,
    );
    expect(screen.getByLabelText("email")).not.toHaveAttribute("aria-invalid");
  });

  it("does not move focus on the first render", () => {
    render(
      <Form aria-label="Sign in" errors={{ email: ["Bad."] }}>
        <Inputs />
      </Form>,
    );
    expect(document.body).toHaveFocus();
  });

  it("moves focus to the first invalid field in page order when new errors arrive", () => {
    const { rerender } = render(
      <Form aria-label="Sign in" errors={{}}>
        <Inputs />
      </Form>,
    );
    rerender(
      <Form aria-label="Sign in" errors={{ password: ["Short."], email: ["Bad."] }}>
        <Inputs />
      </Form>,
    );
    expect(screen.getByLabelText("email")).toHaveFocus();
  });

  it("moves focus again when a second set of errors arrives", () => {
    const { rerender } = render(
      <Form aria-label="Sign in" errors={{ email: ["Bad."] }}>
        <Inputs />
      </Form>,
    );
    screen.getByLabelText("password").focus();
    rerender(
      <Form aria-label="Sign in" errors={{ email: ["Still bad."] }}>
        <Inputs />
      </Form>,
    );
    expect(screen.getByLabelText("email")).toHaveFocus();
  });

  it("leaves focus alone when the new errors hold no field errors", () => {
    const { rerender } = render(
      <Form aria-label="Sign in" errors={{}}>
        <Inputs />
      </Form>,
    );
    screen.getByLabelText("password").focus();
    rerender(
      <Form aria-label="Sign in" errors={{ email: [] }}>
        <Inputs />
      </Form>,
    );
    expect(screen.getByLabelText("password")).toHaveFocus();
  });

  it("leaves focus alone when it rerenders with the same errors", () => {
    const errors = { email: ["Bad."] };
    const { rerender } = render(
      <Form aria-label="Sign in" errors={errors}>
        <Inputs />
      </Form>,
    );
    screen.getByLabelText("password").focus();
    rerender(
      <Form aria-label="Sign in" errors={errors} className="x">
        <Inputs />
      </Form>,
    );
    expect(screen.getByLabelText("password")).toHaveFocus();
  });
});
