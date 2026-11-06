import { formatLength, scaleBarLength } from '../domain/scale-journey';
import type { Structure } from '../domain/types';
import { UNFOLD_NOTICE } from '../domain/zoom-unfold';

export interface UnfoldGuideRow {
  readonly id: string;
  readonly name: string;
  readonly evidence?: Structure['evidence'];
  /** Depth under the spot along the way in, in nominal millimetres. */
  readonly depthMm: number;
  /** A vessel or nerve passing close to the way in. These are left whole, and are not steps of the zoom. */
  readonly passing: boolean;
  readonly systems: readonly string[];
}

export interface UnfoldGuideState {
  readonly place: string;
  readonly rows: readonly UnfoldGuideRow[];
  /** The layer being passed now. */
  readonly current: string | null;
  /** Height of the view, in nominal metres. */
  readonly viewMetres: number;
  readonly progress: number;
  readonly playing: 'in' | 'out' | null;
}

const kindOf = (row: UnfoldGuideRow) => row.systems.includes('arterial-venous') ? (/vein|vena|azygos/.test(row.id) ? 'vein' : 'artery') : row.systems.includes('nervous') ? 'nerve' : 'lymph';

/** Every layer of the way in, and of the vessels and nerves only those passed at the layer shown now, so that the list stays short. */
export function rowsToShow(rows: readonly UnfoldGuideRow[], current: string | null): readonly UnfoldGuideRow[] {
  const layers = rows.filter((row) => !row.passing);
  const at = layers.findIndex((row) => row.id === current);
  const from = at >= 0 ? layers[at].depthMm : -Infinity, to = at >= 0 && at + 1 < layers.length ? layers[at + 1].depthMm : Infinity;
  return rows.filter((row) => !row.passing || (at >= 0 && row.depthMm >= from && row.depthMm < to));
}

/** The way in at this spot, outside first, with the layer being passed marked. */
export function UnfoldGuide({ state, selected, namesOn, onNames, onRow, onInto, onPlay }: {
  readonly state: UnfoldGuideState;
  readonly selected: string | null;
  readonly namesOn: boolean;
  readonly onNames: (shown: boolean) => void;
  readonly onRow: (id: string, passing: boolean) => void;
  readonly onInto: () => void;
  readonly onPlay: (direction: 'in' | 'out' | null) => void;
}) {
  const bar = scaleBarLength(state.viewMetres);
  const current = state.rows.find((row) => row.id === state.current);
  const rows = rowsToShow(state.rows, state.current);
  return <aside className="unfold-guide" aria-label="Layers at this spot" title={UNFOLD_NOTICE}>
    <strong>{state.place}</strong>
    <ol>
      {rows.map((row) => <li key={row.id} className={`${row.passing ? `passing passing--${kindOf(row)}` : 'layer'}${row.id === state.current ? ' current' : ''}${row.id === selected ? ' chosen' : ''}`}>
        <button type="button" onClick={() => onRow(row.id, row.passing)} aria-current={row.id === state.current ? 'step' : undefined}>
          <span>{row.name}</span>
          {row.evidence === 'simulated' && <small>sim</small>}
        </button>
      </li>)}
    </ol>
    <div className="unfold-tools">
      <button type="button" className="unfold-into" disabled={!current} onClick={onInto} aria-label={current ? `Into the tissue of ${current.name}` : 'Into the tissue'}>Into tissue</button>
      <button type="button" onClick={() => onPlay(state.playing ? null : 'in')} aria-pressed={!!state.playing}>{state.playing ? 'Stop' : 'Play'}</button>
      <label><input type="checkbox" checked={namesOn} onChange={(event) => onNames(event.target.checked)} /> Names</label>
    </div>
    <div className="unfold-scale"><i aria-hidden="true" style={{ width: `${Math.round(bar / state.viewMetres * 340)}px` }} /><span>{formatLength(bar)}</span></div>
  </aside>;
}

export function UnfoldHint({ onPlay }: { readonly onPlay: () => void }) {
  return <div className="unfold-hint"><span>Scroll to unfold</span><button type="button" onClick={onPlay}>Play</button></div>;
}
