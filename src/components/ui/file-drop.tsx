"use client";

import { FileUp, Paperclip, X } from "lucide-react";
import { useRef, useState } from "react";
import { surfaceHeaders } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/persian";

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
}

type Purpose = "ARTWORK" | "DESIGN" | "ATTACHMENT" | "PRODUCT_IMAGE" | "PAYMENT_RECEIPT";

/** Uploads with progress (XHR) to /api/v1/uploads. The server validates type by magic bytes. */
function upload(file: File, purpose: Purpose, onProgress: (p: number) => void): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("purpose", purpose);
    form.append("file", file);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(json.data);
        else reject(new Error(json?.error?.message ?? "بارگذاری ناموفق بود."));
      } catch {
        reject(new Error("بارگذاری ناموفق بود."));
      }
    };
    xhr.onerror = () => reject(new Error("ارتباط قطع شد."));
    xhr.open("POST", "/api/v1/uploads");
    for (const [k, v] of Object.entries(surfaceHeaders())) xhr.setRequestHeader(k, v);
    xhr.send(form);
  });
}

export function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${formatNumber(Math.max(1, Math.round(n / 1024)))} کیلوبایت`;
  return `${formatNumber(Math.round((n / 1024 / 1024) * 10) / 10, { decimals: true })} مگابایت`;
}

export function FileDrop({
  purpose,
  files,
  onChange,
  multiple = true,
  accept = ".pdf,.tif,.tiff,.jpg,.jpeg,.png,.psd,.eps,.ai,.zip",
  hint = "PDF، TIFF، JPG، PNG، PSD یا EPS — حداکثر ۱۵۰ مگابایت",
  compact,
  onError,
}: {
  purpose: Purpose;
  files: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  multiple?: boolean;
  accept?: string;
  hint?: string;
  compact?: boolean;
  onError?: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  async function handle(list: FileList | null) {
    if (!list?.length) return;
    const picked = multiple ? Array.from(list) : [list[0]!];
    const done: UploadedFile[] = [];
    for (const f of picked) {
      try {
        setProgress(0);
        done.push(await upload(f, purpose, setProgress));
      } catch (e) {
        onError?.((e as Error).message);
      }
    }
    setProgress(null);
    if (done.length) onChange(multiple ? [...files, ...done] : done);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void handle(e.dataTransfer.files);
        }}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface-2/50 text-start transition-colors hover:border-ink hover:bg-surface-2",
          compact ? "px-3 py-2.5" : "px-4 py-4",
          drag && "border-accent bg-accent-soft",
        )}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-ink-2 shadow-soft">
          <FileUp className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-[13.5px] font-bold">{progress != null ? `در حال بارگذاری… ${formatNumber(Math.round(progress * 100))}٪` : "انتخاب یا رها کردن فایل"}</span>
          {!compact && <span className="block text-[12px] text-muted">{hint}</span>}
        </span>
      </button>
      {progress != null && (
        <div className="h-1 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full bg-ink transition-[width]" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      <input ref={input} type="file" hidden multiple={multiple} accept={accept} onChange={(e) => void handle(e.target.files).finally(() => (e.target.value = ""))} />
      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[13px]">
              <Paperclip className="size-3.5 text-muted" />
              <span className="min-w-0 flex-1 truncate" dir="auto">{f.name}</span>
              <span className="text-[11.5px] text-muted">{formatBytes(f.size)}</span>
              <button type="button" className="text-muted hover:text-danger" onClick={() => onChange(files.filter((x) => x.id !== f.id))} aria-label="حذف">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
