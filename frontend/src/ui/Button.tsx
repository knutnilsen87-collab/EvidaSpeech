import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
  /** Arbeid pågår: knappen dempes og teksten byttes (UI/UX kap. 4). */
  busy?: boolean;
  busyLabel?: string;
  children: ReactNode;
}

export function Button({ variant = "secondary", busy = false, busyLabel, disabled, children, className, type, ...rest }: ButtonProps) {
  const classes = ["ev-button", `ev-button--${variant}`, busy ? "ev-button--busy" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <button {...rest} type={type ?? "button"} className={classes} disabled={disabled || busy} aria-busy={busy || undefined}>
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}
