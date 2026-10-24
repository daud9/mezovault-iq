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
}

/** Single-choice segmented control. Keyboard and screen-reader friendly via radio semantics. */
export function ChoiceGroup<T extends string>({ label, value, options, onChange, hint }: ChoiceGroupProps<T>) {
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-mist-100" id={`${label}-label`}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={`${label}-label`} className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className={[
                "rounded-lg border px-3 py-2 text-sm font-medium transition",
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
      {hint && <p className="text-xs leading-relaxed text-mist-500">{hint}</p>}
    </div>
  );
}
