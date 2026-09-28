"use client";

import { DateText } from "@/components/ui/misc";
import { Status } from "@/components/ui/status";
import { SHIPMENT_STATUS } from "@/lib/labels";
import { formatNumber } from "@/lib/persian";
import { CreateShipmentButton, ShipmentActions } from "../shipping-actions";

export interface ShipmentView { id: string; number: number; status: string; methodName: string; methodKind: string; assigneeId?: string | null; assigneeName: string | null; vehicleName: string | null; trackingCode: string | null; externalProvider: string | null; recipientName: string | null; deliveredAt: string | null; failureReason: string | null; proofFileId: string | null; lines: { title: string; quantity: number }[] }

export function DeliveryPanel({ orderId, shipments, shippable, methods, couriers, vehicles, perms, defaultMethodId }: {
  orderId: string;
  shipments: ShipmentView[];
  shippable: { itemId: string; title: string; remaining: number }[];
  methods: { id: string; name: string; kind: string }[];
  couriers: { id: string; name: string }[];
  vehicles: { id: string; name: string }[];
  perms: string[];
  defaultMethodId: string | null;
}) {
  return (
    <div>
      {perms.includes("delivery.manage") && (
        <div className="mb-3">
          <CreateShipmentButton orderId={orderId} shippable={shippable} methods={methods} couriers={couriers} vehicles={vehicles} defaultMethodId={defaultMethodId} />
        </div>
      )}
      {shipments.length === 0 ? <p className="text-[13px] text-muted">مرسوله‌ای ثبت نشده است.</p> : (
        <ul className="space-y-2">
          {shipments.map((s) => (
            <li key={s.id} className="rounded-xl border border-line px-3 py-2.5 text-[12.5px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{s.methodName}</span>
                <span className="text-muted">{s.lines.map((l) => `${l.title} × ${formatNumber(l.quantity)}`).join("، ")}</span>
                <span className="ms-auto"><Status map={SHIPMENT_STATUS} value={s.status} /></span>
              </div>
              <p className="mt-1 text-muted">
                {[s.assigneeName, s.vehicleName, s.trackingCode && `رهگیری ${s.trackingCode}`, s.recipientName && s.status === "DELIVERED" && `تحویل به ${s.recipientName}`].filter(Boolean).join(" · ")}
                {s.deliveredAt && <> · <DateText value={s.deliveredAt} withTime /></>}
                {s.proofFileId && <> · <a className="font-bold text-accent-ink" target="_blank" rel="noreferrer" href={`/api/v1/files/${s.proofFileId}?inline=1`}>مدرک تحویل</a></>}
              </p>
              {s.failureReason && <p className="text-danger">{s.failureReason}</p>}
              <div className="mt-2"><ShipmentActions s={s} perms={perms} couriers={couriers} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
