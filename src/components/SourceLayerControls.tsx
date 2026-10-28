import { useState } from 'react';
import type { AnatomyGroup } from '../domain/anatomy-groups';
import type { SourceLayerContext } from '../domain/source-layers';

/** The checklist stages a display action over existing source regions. */
export function SourceLayerControls({ groups, onApply }: {
  groups: readonly AnatomyGroup[];
  onApply: (ids: readonly string[], context: SourceLayerContext) => { ok: boolean; error?: string };
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [context, setContext] = useState<SourceLayerContext>('hidden');
  const [error, setError] = useState('');
  const choices = groups.filter((group) => group.id !== 'whole-mouse');
  if (!choices.length) return null;
  const apply = () => {
    const result = onApply(chosen, context);
    setError(result.ok ? '' : result.error ?? 'The source layer selection could not be applied.');
    if (result.ok) setChosen([]);
  };
  return <details className="source-layer-controls">
    <summary>Compose source layers</summary>
    <p>Choose groups, then apply their combined regions. Overlapping members appear once. These display selections add no anatomy or registration.</p>
    <fieldset><legend>Source groups to combine</legend><div className="source-layer-options">{choices.map((group) => <label key={group.id}>
      <input type="checkbox" checked={chosen.includes(group.id)} onChange={(event) => {
        const checked = event.currentTarget.checked;
        setChosen((current) => checked ? [...current, group.id] : current.filter((id) => id !== group.id)); setError('');
      }} /><span>{group.title}<small>{group.structureIds.length} source regions</small></span>
    </label>)}</div></fieldset>
    <div className="source-layer-actions"><label>Other source regions<select aria-label="Other source regions" value={context} onChange={(event) => setContext(event.target.value as SourceLayerContext)}>
      <option value="hidden">Hide other regions</option><option value="faded">Fade other regions (up to 15%)</option>
    </select></label><button className="secondary-button" disabled={!chosen.length} onClick={apply}>Apply source layers</button></div>
    <p className="source-layer-hint">Selected regions become opaque. Lower source-default context opacity is retained. Show all restores source defaults; saved views retain the resulting display settings.</p>
    {error && <p role="alert" className="view-import-error">{error}</p>}
  </details>;
}
