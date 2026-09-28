import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatNumber } from "@/lib/persian";

export function Pagination({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-5 py-3 text-[12.5px] text-muted">
      <span>{formatNumber((page - 1) * pageSize + 1)} تا {formatNumber(Math.min(total, page * pageSize))} از {formatNumber(total)}</span>
      <div className="flex gap-1">
        {page > 1 && <Link href={href(page - 1)} className="grid size-8 place-items-center rounded-md border border-line hover:bg-surface-2" aria-label="قبلی"><ChevronRight className="size-4" /></Link>}
        <span className="grid h-8 place-items-center px-2 tabular">{formatNumber(page)} / {formatNumber(pages)}</span>
        {page < pages && <Link href={href(page + 1)} className="grid size-8 place-items-center rounded-md border border-line hover:bg-surface-2" aria-label="بعدی"><ChevronLeft className="size-4" /></Link>}
      </div>
    </div>
  );
}
