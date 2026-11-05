import type { LayerStop, LayerStopId } from '../domain/living-layers';

/** Peels the living mouse from the coat inwards, one click at a time. */
export function LayerStack({ stops, active, onChoose }: { stops: readonly LayerStop[]; active: LayerStopId | null; onChoose: (stop: LayerStop) => void }) {
  return <section className="layer-stack" aria-label="Layer stack"><h3>From the outside in</h3><ol>{stops.map((stop) => <li key={stop.id}>
    <button type="button" className={active === stop.id ? 'active' : ''} aria-pressed={active === stop.id} onClick={() => onChoose(stop)}>
      <strong>{stop.name}</strong><small>{stop.description}</small>
    </button>
  </li>)}</ol></section>;
}
