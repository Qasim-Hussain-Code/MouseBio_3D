import { DISSECTION_NOTICE, DISSECTION_PLACES, DISSECTION_TIERS, type DissectionPlaceId, type DissectionSettings, type DissectionTierId, type HereItem } from '../domain/dissection';
import { EVIDENCE_NAMES } from '../domain/evidence';

export interface AllLayersProps {
  settings: DissectionSettings | null;
  place: DissectionPlaceId | null;
  report: { place: string; items: readonly HereItem[] } | null;
  selected: string | null;
  namesShown: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChange: (next: DissectionSettings) => void;
  onPlace: (place: DissectionPlaceId) => void;
  onNames: (shown: boolean) => void;
  onSelect: (id: string) => void;
}

const groupsOf = (items: readonly HereItem[]) => {
  const groups = new Map<DissectionTierId, HereItem[]>();
  for (const item of items) groups.set(item.tier, [...(groups.get(item.tier) ?? []), item]);
  return DISSECTION_TIERS.filter((tier) => groups.has(tier.id)).map((tier) => ({ tier, items: groups.get(tier.id)! }));
};

/** The closed button, and when opened the panel beside the mouse: where to open, how far, and what lies there. */
export function AllLayers({ settings, place, report, selected, namesShown, onOpen, onClose, onChange, onPlace, onNames, onSelect }: AllLayersProps) {
  if (!settings) return <button type="button" className="all-layers-start" onClick={onOpen}><strong>Open a named place</strong><small>Zooming opens the mouse where you point. This shows a place by name, with a slider, at a fixed size.</small></button>;
  return <section className="all-layers" aria-label="All layers together">
    <header><strong>All layers together</strong><button type="button" onClick={onClose}>Close</button></header>
    <label className="all-layers-range">Open<input type="range" min={0} max={100} value={Math.round(settings.opening * 100)} aria-label="How far the layers are open" onChange={(event) => onChange({ ...settings, opening: Number(event.target.value) / 100 })} /></label>
    <div className="all-layers-places" role="group" aria-label="Place to open">
      {DISSECTION_PLACES.map((item) => <button type="button" key={item.id} aria-pressed={place === item.id} className={place === item.id ? 'active' : ''} onClick={() => onPlace(item.id)}>{item.name}</button>)}
    </div>
    <div className="all-layers-options">
      <label><input type="checkbox" checked={settings.folded} onChange={(event) => onChange({ ...settings, folded: event.target.checked })} /> Fold the skin back</label>
      <label><input type="checkbox" checked={settings.cutOrgans} onChange={(event) => onChange({ ...settings, cutOrgans: event.target.checked })} /> Cut into organs</label>
      <label><input type="checkbox" checked={namesShown} onChange={(event) => onNames(event.target.checked)} /> Names on the mouse</label>
    </div>
    <p className="all-layers-hint">Click the outside of the mouse to open it there. Point at anything inside to see its name, and click it to read about it.</p>
    {report && <section className="all-layers-here" aria-label="What lies at this place">
      <h4>{report.place}: {report.items.length} structures, outside to inside</h4>
      {groupsOf(report.items).map(({ tier, items }) => <div key={tier.id} className="all-layers-tier">
        <h5>{tier.name}</h5>
        <ul>{items.map((item) => <li key={item.id}><button type="button" className={`${item.id === selected ? 'active' : ''}${item.seen === false ? ' covered' : ''}`} title={item.seen === false ? 'Behind other layers in this view' : undefined} onClick={() => onSelect(item.id)}>
          <span>{item.name}</span>{item.evidence && <small data-evidence={item.evidence}>{EVIDENCE_NAMES[item.evidence]}</small>}
        </button></li>)}</ul>
      </div>)}
    </section>}
    <p className="all-layers-notice">{DISSECTION_NOTICE}</p>
  </section>;
}
