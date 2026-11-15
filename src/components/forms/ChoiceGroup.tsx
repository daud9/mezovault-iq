import { useId, useRef } from "react";

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

interface ChoiceGroupProps<T extends string> {
  label: string;
  value: T;
  options: ChoiceOption<T>[];
  onChange: (value: T) => void;
  hint?: string;
  disabled?: boolean;
}

/** Single-choice segmented control. Keyboard and screen-reader friendly via radio semantics. */
export function ChoiceGroup<T extends string>({ label, value, options, onChange, hint, disabled = false }: ChoiceGroupProps<T>) {
  const labelId = useId();
  const hintId = useId();
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-mist-100" id={labelId}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} aria-describedby={hint ? hintId : undefined} className="flex flex-wrap gap-2">
        {options.map((o, index) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              ref={(element) => { buttonRefs.current[index] = element; }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(o.value)}
              onKeyDown={(event) => {
                let nextIndex: number | null = null;
                if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % options.length;
                if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + options.length) % options.length;
                if (event.key === "Home") nextIndex = 0;
                if (event.key === "End") nextIndex = options.length - 1;
                if (nextIndex !== null) {
                  event.preventDefault();
                  onChange(options[nextIndex].value);
                  buttonRefs.current[nextIndex]?.focus();
                }
              }}
              className={[
                "min-h-11 cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
                active
                  ? "border-gold-500/60 bg-gold-500/15 text-gold-300"
                  : "border-line bg-ink-800 text-mist-400 hover:text-mist-100",
              ].join(" ")}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {hint && <p id={hintId} className="text-xs leading-relaxed text-mist-500">{hint}</p>}
    </div>
  );
}
