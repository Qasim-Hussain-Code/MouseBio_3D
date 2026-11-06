import { useId } from 'react';
import type { Structure } from '../domain/types';

export interface SelectionToolsProps {
  selected: Structure | null;
  hidden: boolean;
  opacity: number;
  isolated: boolean;
  onFocus: () => void;
  onToggleHidden: () => void;
  /** Toggle isolation or restore the surrounding source records. */
  onIsolate: () => void;
  /** Go on to the cells of this tissue, where a zoom has been made for it. */
  onZoomIn?: () => void;
  onOpacityChange: (opacity: number) => void;
  onOpenDetails: () => void;
}

/** Presentation controls for an existing source record, including line references. */
export function SelectionTools({ selected, hidden, opacity, isolated, onFocus, onToggleHidden,
  onIsolate, onZoomIn, onOpacityChange, onOpenDetails }: SelectionToolsProps) {
  const nameId = useId(), opacityId = useId();
  if (!selected) return <section className="selection-tools selection-tools--empty" aria-label="Selection tools">
    <p>Select a structure or source record.</p>
  </section>;
  const percentage = Math.round(opacity * 100);
  return <section className="selection-tools" aria-label="Selection tools" aria-describedby={nameId}>
    <div className="selection-tools__identity">
      <strong id={nameId} className="selection-tools__name" title={selected.name}>{selected.name}</strong>
      <div className="selection-tools__source"><span>Source ID</span><code>{selected.id}</code>
        {hidden && <span className="selection-tools__state">Hidden</span>}
        {isolated && <span className="selection-tools__state">Isolated</span>}
      </div>
    </div>
    <div className="selection-tools__actions">
      <button type="button" onClick={onFocus} aria-label="Focus selected structure or source record">Focus</button>
      <button type="button" onClick={onToggleHidden} aria-label={`${hidden ? 'Show' : 'Hide'} selected structure or source record`}>{hidden ? 'Show' : 'Hide'}</button>
      <button type="button" onClick={onIsolate} aria-label={isolated ? 'Restore other structures or source records' : 'Isolate selected structure or source record'}>{isolated ? 'Restore' : 'Isolate'}</button>
      {onZoomIn && <button type="button" onClick={onZoomIn} aria-label="Zoom into the tissue of the selected structure">Zoom in</button>}
      <button type="button" className="selection-tools__details" onClick={onOpenDetails} aria-label="Open details for selected structure or source record">Details</button>
    </div>
    <div className="selection-tools__opacity">
      <label htmlFor={opacityId}>Opacity</label>
      <input id={opacityId} type="range" min="0" max="1" step="0.01" value={opacity}
        aria-label="Display opacity of selected structure or source record" aria-valuetext={`${percentage}% display opacity`}
        onChange={(event) => {
          const value = Number(event.currentTarget.value);
          if (Number.isFinite(value) && value >= 0 && value <= 1) onOpacityChange(value);
        }} />
      <output htmlFor={opacityId}>{percentage}%</output>
    </div>
  </section>;
}
