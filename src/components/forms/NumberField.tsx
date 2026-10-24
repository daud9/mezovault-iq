interface NumberFieldProps {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  hint?: string;
}

/** Numeric input. An empty or invalid entry becomes NaN, which the engine validation reports. */
export function NumberField({ id, label, value, onChange, min, max, step, suffix, hint }: NumberFieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-mist-100">
        {label}
      </label>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-ink-800 px-3 transition focus-within:border-gold-500/60">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step ?? "any"}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(e.target.valueAsNumber)}
          className="w-full min-w-0 bg-transparent py-2.5 text-sm text-mist-100 outline-none placeholder:text-mist-500"
        />
        {suffix && <span className="shrink-0 text-xs text-mist-500">{suffix}</span>}
      </div>
      {hint && <p className="text-xs leading-relaxed text-mist-500">{hint}</p>}
    </div>
  );
}
