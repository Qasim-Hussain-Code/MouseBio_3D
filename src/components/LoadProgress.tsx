import type { TransferView } from '../domain/load-progress';

/** The bar shown while a model downloads, then held full while it is checked and built.
 * The figures are hidden from assistive technology because the bar states them, so the live region is not read out on every chunk. */
export function LoadProgress({ label, view }: { label: string; view: TransferView | null }) {
  const building = !view || view.fraction >= 1;
  const value = building ? {} : { 'aria-valuenow': view.percent, 'aria-valuetext': `${view.percent} percent, ${view.amount}` };
  return <div className={`load-progress${building ? ' building' : ''}`}>
    <div className="load-progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} {...value}>
      <span className="load-progress-fill" style={{ transform: `scaleX(${building ? 1 : view.fraction})` }} />
    </div>
    <p className="load-progress-label">{label}</p>
    {/* The line keeps its height while the model is built, so the bar does not move. */}
    <p className="load-progress-figures" aria-hidden="true">{!building && <>
      <span className="load-progress-percent">{view.percent} %</span><span>{view.amount}</span>{view.remaining && <span>{view.remaining}</span>}
    </>}</p>
  </div>;
}
