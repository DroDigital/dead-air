/** Fit a non-negative amount on a physical display. A tilde marks rounded values. */
export function worldNumber(value: number, maxChars: number): string {
  if (!Number.isFinite(value)) return value === Infinity ? '∞' : '?';
  const n = Math.max(0, Math.round(value));
  const exact = String(n);
  if (!exact.includes('e') && exact.length <= maxChars) return exact;

  const units = [
    { size: 1e12, label: 'T' },
    { size: 1e9, label: 'B' },
    { size: 1e6, label: 'M' },
    { size: 1e3, label: 'K' },
  ];
  if (n < 1e15) {
    const unit = units.find((u) => n >= u.size);
    if (unit) {
      for (let decimals = 2; decimals >= 0; decimals--) {
        const amount = Number((n / unit.size).toFixed(decimals)).toString();
        const result = `~${amount}${unit.label}`;
        if (result.length <= maxChars) return result;
      }
    }
  }
  for (let decimals = 2; decimals >= 0; decimals--) {
    const result = `~${n.toExponential(decimals).replace(/\.0+(?=e)/, '').replace(/(\.\d*?)0+(?=e)/, '$1').toUpperCase().replace('E+', 'E')}`;
    if (result.length <= maxChars) return result;
  }
  return '∞';
}
