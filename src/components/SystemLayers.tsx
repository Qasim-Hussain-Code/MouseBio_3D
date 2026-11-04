import { useEffect, useId, useMemo, useRef } from 'react';
import type { Atlas, SystemId } from '../domain/types';
import { buildSystemLayers, type SystemLayer } from '../domain/system-layers';

export interface SystemLayersProps {
  atlas: Atlas;
  hidden: readonly string[];
  opacity: Readonly<Record<string, number>>;
  onToggleSystem: (systemId: SystemId) => void;
  onIsolateSystem: (systemId: SystemId) => void;
  onShowAll: () => void;
}

function LayerRow({ layer, onToggle, onIsolate }: { layer: SystemLayer; onToggle: () => void; onIsolate: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (input.current) input.current.indeterminate = layer.state === 'partial'; }, [layer.state]);
  return <li className="system-layer-row" data-visibility={layer.state}>
    <label><input ref={input} type="checkbox" aria-label={`${layer.name} visibility`}
      checked={layer.state === 'visible'} aria-checked={layer.state === 'partial' ? 'mixed' : layer.state === 'visible'} onChange={onToggle} />
      <span><strong>{layer.name}</strong><small>{layer.visibleCount}/{layer.memberCount} source regions visible</small></span></label>
    <button type="button" className="system-layer-isolate" aria-label={`Isolate ${layer.name.toLowerCase()} source regions`} onClick={onIsolate}>Isolate</button>
  </li>;
}

/** Source classifications are overlapping display selections, never an inferred anatomical hierarchy. */
export function SystemLayers({ atlas, hidden, opacity, onToggleSystem, onIsolateSystem, onShowAll }: SystemLayersProps) {
  const heading = useId();
  const result = useMemo(() => buildSystemLayers(atlas, hidden, opacity), [atlas, hidden, opacity]);
  return <section className="system-layers" aria-labelledby={heading}>
    <div className="system-layers-heading"><h3 id={heading}>System layers</h3><button type="button" disabled={!result.ok || !result.totalCount} onClick={onShowAll}>Show all</button></div>
    {!result.ok ? <p role="alert">System layers are unavailable for the current source or display settings.</p> : <>
      {result.represented.length > 0 ? <ul className="system-layer-list">{result.represented.map((layer) =>
        <LayerRow key={layer.id} layer={layer} onToggle={() => onToggleSystem(layer.id)} onIsolate={() => onIsolateSystem(layer.id)} />)}</ul>
        : <p className="system-layers-empty">{result.totalCount ? 'No system classifications are assigned to this source. Use its existing structure list or source selections.' : 'This source has no structure records.'}</p>}
      {result.unclassifiedCount > 0 && <p className="system-layers-unclassified">{result.unclassifiedCount} source {result.unclassifiedCount === 1 ? 'region has' : 'regions have'} no system classification ({result.unclassifiedVisibleCount} visible). No classification is inferred.</p>}
      <p className="system-layers-note">Counts follow source classifications, visibility and opacity. Categories can overlap or contain aggregate regions; clipping and occlusion are not counted.</p>
      {result.missing.length > 0 && <details className="system-layers-missing"><summary>Other systems ({result.missing.length})</summary>
        <p>These categories have no classified source regions in this reference. This does not establish their absence from the animal or supply missing geometry.</p>
        <ul>{result.missing.map((category) => <li key={category.id}><span>{category.name}</span><small>Not represented</small></li>)}</ul>
      </details>}
    </>}
  </section>;
}
