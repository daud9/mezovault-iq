/** Returns only a read result belonging to the current wallet/network/refresh context. */
export function selectReadView<T>(options: {
  stored: { key: string; view: T } | null;
  currentKey: string;
  enabled: boolean;
  loading: T;
  idle: T;
}): T {
  if (options.stored?.key === options.currentKey) return options.stored.view;
  return options.enabled ? options.loading : options.idle;
}
