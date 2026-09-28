"use client";

import { ReasonAction } from "../actions";

export function ResolveIssueButton({ id }: { id: string }) {
  return (
    <ReasonAction path={`production/issues/${id}/resolve`} title="رفع مشکل" label="شرح رفع مشکل" success="مشکل رفع شد و مرحله آزاد شد." confirmLabel="ثبت رفع مشکل" size="xs" bodyKey="resolution">
      رفع مشکل
    </ReasonAction>
  );
}
