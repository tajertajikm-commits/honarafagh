/** Static demo `next/link`: rewrites links to dynamic routes onto their exported placeholder page. */
import { forwardRef, type ComponentProps } from "react";
import NextLink from "next/dist/client/app-dir/link";
import { toDemoPath } from "../routes";

type Props = ComponentProps<typeof NextLink>;

function rewrite(href: Props["href"]): Props["href"] {
  if (typeof href === "string") return toDemoPath(href);
  if (href && typeof href === "object" && typeof href.pathname === "string") {
    const q = new URLSearchParams(href.query as Record<string, string> | undefined);
    const s = q.toString();
    return toDemoPath(`${href.pathname}${s ? `?${s}` : ""}${href.hash ? `#${href.hash}` : ""}`);
  }
  return href;
}

const Link = forwardRef<HTMLAnchorElement, Props>(function DemoLink({ href, as, ...rest }, ref) {
  return <NextLink ref={ref} href={rewrite(href)} as={as ? rewrite(as) : undefined} {...rest} />;
});

export default Link;
export * from "next/dist/client/app-dir/link";
