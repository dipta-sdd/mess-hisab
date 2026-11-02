import { Card } from "@heroui/react";
import type { ReactNode } from "react";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card.Root className="w-full">
      <Card.Header className="flex flex-col gap-1">
        <Card.Title>
          <h1 className="text-xl font-semibold">{title}</h1>
        </Card.Title>
        {subtitle ? <Card.Description>{subtitle}</Card.Description> : null}
      </Card.Header>
      <Card.Content className="flex flex-col gap-4">{children}</Card.Content>
      {footer ? <Card.Footer className="flex flex-col items-start gap-2 text-sm">{footer}</Card.Footer> : null}
    </Card.Root>
  );
}

export const linkClass = "font-medium text-accent underline-offset-2 hover:underline";
