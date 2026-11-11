"use client";

import { useMemo, type AnchorHTMLAttributes, type MouseEvent } from "react";

/**
 * Client-side navigation for the static SPA. There is no server to render pages, so links change the
 * URL with the History API (Next syncs usePathname / useSearchParams with it) and never fetch a page.
 */
export function navigate(href: string, { replace = false }: { replace?: boolean } = {}) {
  if (replace) window.history.replaceState(null, "", href);
  else window.history.pushState(null, "", href);
  if (!href.includes("#")) window.scrollTo(0, 0);
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string; replace?: boolean; prefetch?: boolean };

export function Link({ href, replace, prefetch: _prefetch, onClick, target, ...rest }: LinkProps) {
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
    if (event.defaultPrevented || modified || (target && target !== "_self") || !href.startsWith("/")) return;
    event.preventDefault();
    navigate(href, { replace });
  };
  return <a href={href} target={target} onClick={handle} {...rest} />;
}

export function useRouter() {
  return useMemo(
    () => ({
      push: (href: string) => navigate(href),
      replace: (href: string) => navigate(href, { replace: true }),
      back: () => window.history.back(),
      forward: () => window.history.forward(),
    }),
    [],
  );
}
