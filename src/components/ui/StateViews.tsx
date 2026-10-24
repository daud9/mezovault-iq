import type { ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { Card } from "./Card";

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <Card className="flex items-center justify-center gap-3 py-12 text-mist-400" >
      <Loader2 className="h-5 w-5 animate-spin text-gold-400" aria-hidden="true" />
      <span role="status">{label}…</span>
    </Card>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-12 text-center">
      <Inbox className="h-8 w-8 text-mist-500" aria-hidden="true" />
      <h3 className="text-base font-semibold text-mist-100">{title}</h3>
      <p className="max-w-md text-sm text-mist-400">{description}</p>
      {action}
    </Card>
  );
}

export function ErrorState({ title = "Something went wrong", description, onRetry }: { title?: string; description: string; onRetry?: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-3 border-risk-high/30 py-12 text-center">
      <AlertTriangle className="h-8 w-8 text-risk-high" aria-hidden="true" />
      <h3 className="text-base font-semibold text-mist-100">{title}</h3>
      <p className="max-w-md text-sm text-mist-400">{description}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-sm font-medium text-gold-300 hover:underline">
          Try again
        </button>
      )}
    </Card>
  );
}
