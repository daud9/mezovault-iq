import { Clock } from "lucide-react";
import { Card } from "./Card";
import { Badge } from "./Badge";

interface ComingSoonProps {
  stage: string;
  items: string[];
}

/** Explicitly states what is not yet available, so nothing looks more functional than it is. */
export function ComingSoon({ stage, items }: ComingSoonProps) {
  return (
    <Card className="border-dashed">
      <div className="flex items-center gap-2 text-sm font-medium text-mist-200">
        <Clock className="h-4 w-4 text-gold-400" aria-hidden="true" />
        Planned for {stage}
        <Badge>Not available yet</Badge>
      </div>
      <ul className="mt-4 grid gap-2 text-sm text-mist-400 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold-500" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}
