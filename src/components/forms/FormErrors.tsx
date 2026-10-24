import { AlertCircle } from "lucide-react";

export function FormErrors({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <div role="alert" className="rounded-xl border border-risk-high/30 bg-risk-high/10 p-4 text-sm text-mist-200">
      <div className="flex gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-risk-high" aria-hidden="true" />
        <ul className="space-y-1">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
