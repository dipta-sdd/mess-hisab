"use client";

import { Dropdown } from "@heroui/react";

export interface RowMenuAction {
  id: string;
  label: string;
  /** Accessible name when the visible label is not enough on its own (e.g. includes the row). */
  ariaLabel?: string;
  danger?: boolean;
  onAction: () => void;
}

/** The "⋯" menu at the end of a list row, built on the HeroUI Dropdown. */
export function RowMenu({ label, actions }: { label: string; actions: RowMenuAction[] }) {
  return (
    <Dropdown>
      <Dropdown.Trigger aria-label={label} className="flex size-11 items-center justify-center rounded-full text-xl leading-none hover:bg-default">
        <span aria-hidden="true">⋯</span>
      </Dropdown.Trigger>
      <Dropdown.Popover placement="bottom end" className="min-w-40">
        <Dropdown.Menu aria-label={label} onAction={(key) => actions.find((a) => a.id === key)?.onAction()}>
          {actions.map((a) => (
            <Dropdown.Item key={a.id} id={a.id} textValue={a.label} aria-label={a.ariaLabel} variant={a.danger ? "danger" : "default"} className="min-h-11">
              {a.label}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
