"use client";

import { Check, Download, Eye, Send, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileDrop, formatBytes, type UploadedFile } from "@/components/ui/file-drop";
import { Field, Select, Textarea } from "@/components/ui/input";
import { DateText } from "@/components/ui/misc";
import { Status } from "@/components/ui/status";
import { api } from "@/lib/api-client";
import { ARTWORK_STAGE, ARTWORK_STATUS, FILE_STATUS } from "@/lib/labels";
import { toFaDigits } from "@/lib/persian";
import { useApiAction } from "../actions";

export interface ArtworkVersionView {
  id: string;
  itemId: string;
  versionNo: number;
  stage: string;
  status: string;
  note: string | null;
  reviewNote: string | null;
  customerComment: string | null;
  createdAt: string;
  uploader: string | null;
  file: { id: string; originalName: string; mimeType: string; sizeBytes: number };
}

export function ArtworkPanel({ items, versions, perms }: { items: { id: string; title: string; fileStatus: string; needsDesign: boolean }[]; versions: ArtworkVersionView[]; perms: string[] }) {
  const can = (p: string) => perms.includes(p);
  const { run, pending, toast } = useApiAction();
  const [files, setFiles] = useState<Record<string, UploadedFile[]>>({});
  const [stage, setStage] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});

  return (
    <div className="space-y-5">
      {items.map((it) => {
        const vs = versions.filter((v) => v.itemId === it.id);
        return (
          <div key={it.id}>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13.5px] font-bold">{it.title}{it.needsDesign && <Badge tone="violet" className="ms-2">طراحی توسط ما</Badge>}</p>
              <Status map={FILE_STATUS} value={it.fileStatus} />
            </div>
            {vs.length === 0 && <p className="rounded-lg bg-surface-2/60 px-3 py-2.5 text-[12.5px] text-muted">هنوز فایلی بارگذاری نشده است.</p>}
            <ul className="space-y-2">
              {vs.map((v) => (
                <li key={v.id} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                    <span className="font-bold">نسخه {toFaDigits(v.versionNo)}</span>
                    <Badge>{ARTWORK_STAGE[v.stage]}</Badge>
                    <Status map={ARTWORK_STATUS} value={v.status} />
                    <span className="min-w-0 flex-1 truncate text-muted" dir="auto">{v.file.originalName} · {formatBytes(v.file.sizeBytes)} · {v.uploader ?? "—"} · <DateText value={v.createdAt} relative /></span>
                    {(v.file.mimeType.startsWith("image/") || v.file.mimeType === "application/pdf") && <a href={`/api/v1/files/${v.file.id}?inline=1`} target="_blank" rel="noreferrer" className="grid size-7 place-items-center rounded-md hover:bg-surface-2" aria-label="نمایش"><Eye className="size-4" /></a>}
                    <a href={`/api/v1/files/${v.file.id}`} className="grid size-7 place-items-center rounded-md hover:bg-surface-2" aria-label="دانلود"><Download className="size-4" /></a>
                  </div>
                  {(v.note || v.reviewNote || v.customerComment) && (
                    <p className="mt-1.5 text-[12px] text-muted">{[v.note, v.reviewNote && `بازبینی: ${v.reviewNote}`, v.customerComment && `مشتری: ${v.customerComment}`].filter(Boolean).join(" · ")}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {can("file.review") && ["UPLOADED", "CUSTOMER_APPROVED"].includes(v.status) && (
                      <>
                        <Button size="xs" variant="accent" loading={pending} onClick={() => run(() => api(`artwork/${v.id}/review`, { body: { decision: "APPROVE" } }), "فایل برای چاپ تأیید شد.")}><Check /> تأیید برای چاپ</Button>
                        <Button size="xs" variant="secondary" disabled={pending || !(note[v.id] ?? "").trim()} onClick={() => run(() => api(`artwork/${v.id}/review`, { body: { decision: "REJECT", note: note[v.id] } }), "نیاز به اصلاح اعلام شد.")}><X /> نیاز به اصلاح</Button>
                      </>
                    )}
                    {can("file.upload") && v.status === "UPLOADED" && v.stage !== "CUSTOMER_ORIGINAL" && (
                      <Button size="xs" variant="secondary" loading={pending} onClick={() => run(() => api(`artwork/${v.id}/send-proof`, { body: { note: note[v.id] || undefined } }), "نمونه برای تأیید مشتری ارسال شد.")}><Send /> ارسال برای تأیید مشتری</Button>
                    )}
                  </div>
                  {can("file.review") && v.status === "UPLOADED" && (
                    <Textarea className="mt-2 min-h-[44px] text-[12.5px]" placeholder="یادداشت بازبینی (برای رد الزامی است)" value={note[v.id] ?? ""} onChange={(e) => setNote({ ...note, [v.id]: e.target.value })} />
                  )}
                </li>
              ))}
            </ul>
            {can("file.upload") && (
              <div className="mt-3 space-y-2 rounded-xl bg-surface-2/50 p-3">
                <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
                  <Field label="نوع نسخه"><Select value={stage[it.id] ?? "PREPRESS"} onChange={(e) => setStage({ ...stage, [it.id]: e.target.value })}><option value="DESIGNER">طرح طراح</option><option value="PREPRESS">فایل پیش از چاپ</option><option value="PRINT_READY">آماده چاپ</option></Select></Field>
                  <FileDrop purpose="ARTWORK" compact files={files[it.id] ?? []} onChange={(f) => setFiles({ ...files, [it.id]: f })} onError={toast.error} />
                </div>
                {(files[it.id]?.length ?? 0) > 0 && (
                  <Button size="sm" loading={pending} onClick={() => run(async () => { for (const f of files[it.id]!) await api(`order-items/${it.id}/artwork`, { body: { fileId: f.id, stage: stage[it.id] ?? "PREPRESS" } }); setFiles({ ...files, [it.id]: [] }); }, "نسخه جدید ثبت شد.")}>ثبت نسخه جدید</Button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
