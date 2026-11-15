import { useEffect, useId, useRef } from "react";
import { AlertCircle } from "lucide-react";

export function FormErrors({ errors }: { errors: string[] }) {
  const summaryRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (errors.length > 0) summaryRef.current?.focus();
  }, [errors]);

  if (errors.length === 0) return null;
  return (
    <div ref={summaryRef} tabIndex={-1} role="alert" aria-labelledby={titleId} className="rounded-xl border border-risk-high/30 bg-risk-high/10 p-4 text-sm text-mist-200">
      <div className="flex gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-risk-high" aria-hidden="true" />
        <div>
          <h2 id={titleId} className="mb-1 font-semibold text-mist-100">Review these details</h2>
          <ul className="space-y-1">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
