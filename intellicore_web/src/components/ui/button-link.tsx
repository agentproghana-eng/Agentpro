import Link from "next/link";

import { cn } from "@/lib/cn";

type Props = {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "light";
  className?: string;
};

export function ButtonLink({
  href,
  children,
  variant = "primary",
  className,
}: Props) {
  return (
    <Link
      href={href}
      className={cn("ic-button", `ic-button-${variant}`, className)}
    >
      {children}
    </Link>
  );
}
