/** What the loading bar shows for one asset download. The figures are byte counts and an estimate of time, not data. */
export type TransferSnapshot = {
  assetBytes: number;
  assetTotal: number;
  transferred: number;
  transferTotal: number | null;
};

export type TransferView = {
  /** Share of the registered bytes received, from 0 to 1. */
  fraction: number;
  percent: number;
  /** For example "12.1 of 32.8 MB": what has crossed the network when its size is known, otherwise the asset itself. */
  amount: string;
  /** For example "about 9 s left", once the rate is steady enough to say. */
  remaining: string | null;
};

const megabytes = (bytes: number) => (bytes / 1e6).toFixed(1);

export function describeTransfer(progress: TransferSnapshot, elapsedMs: number): TransferView {
  const total = progress.assetTotal > 0 ? progress.assetTotal : 0;
  const fraction = total ? Math.min(1, Math.max(0, progress.assetBytes / total)) : 0;
  const percent = fraction >= 1 ? 100 : Math.min(99, Math.floor(fraction * 100));
  const amount = progress.transferTotal
    ? `${megabytes(Math.min(progress.transferred, progress.transferTotal))} of ${megabytes(progress.transferTotal)} MB`
    : `${megabytes(progress.assetBytes)} of ${megabytes(total)} MB`;
  let remaining: string | null = null;
  // The average rate since the start is steadier than the latest chunk; it is shown only after a second and a half.
  if (fraction > 0.02 && fraction < 1 && elapsedMs >= 1500) {
    const seconds = (elapsedMs / 1000) * (1 - fraction) / fraction;
    remaining = seconds < 1.5 ? 'almost done' : seconds < 60 ? `about ${Math.round(seconds)} s left` : `about ${Math.round(seconds / 60)} min left`;
  }
  return { fraction, percent, amount, remaining };
}
