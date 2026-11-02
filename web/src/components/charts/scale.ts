/** Clean axis ticks covering [min, max]. `minStep` keeps steps on a unit grid (e.g. 100 paisa = ৳1). */
export function niceTicks(min: number, max: number, { count = 4, minStep = 1 }: { count?: number; minStep?: number } = {}): number[] {
  let lo = min;
  let hi = max;
  if (lo === hi) {
    if (lo === 0) hi = minStep;
    else {
      const pad = Math.max(minStep, Math.abs(lo) * 0.1);
      lo -= pad;
      hi += pad;
    }
  }
  const rough = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  let step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  step = Math.max(Math.ceil(step / minStep) * minStep, minStep);
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v));
  return ticks;
}

/** Show every `step`-th of `n` x labels so they do not collide. */
export function labelStep(n: number, maxLabels: number): number {
  return Math.max(1, Math.ceil(n / Math.max(1, maxLabels)));
}
