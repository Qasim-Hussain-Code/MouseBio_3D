import { LIFE_DISPLAY_CHOICES, LIFE_NOTICE, LIFE_RATE_CHOICES, LIFE_SOURCES, lifeRatesText, rateLabel, type LifeSettings } from '../domain/living-simulation';

type Toggle = 'heart' | 'breathing' | 'blood' | 'nerves' | 'gut' | 'movement';
const TOGGLES: readonly { readonly key: Toggle; readonly name: string }[] = [
  { key: 'heart', name: 'Heart' },
  { key: 'breathing', name: 'Breathing' },
  { key: 'blood', name: 'Blood' },
  { key: 'nerves', name: 'Nerves' },
  { key: 'gut', name: 'Gut' },
  { key: 'movement', name: 'Head and tail' },
];

/** The one word that stays beside the moving mouse, with its pause. */
export function LifeBadge({ life, onChange }: { readonly life: LifeSettings; readonly onChange: (next: LifeSettings) => void }) {
  if (!life.on) return null;
  return <div className="life-badge" role="group" aria-label="Illustrative motion" title={`${LIFE_NOTICE} ${lifeRatesText(life)}.`}>
    <span>Illustrative motion</span>
    <button type="button" aria-pressed={life.walking} onClick={() => onChange({ ...life, walking: !life.walking, movement: true, playing: true })}>{life.walking ? 'Stand' : 'Walk'}</button>
    <button type="button" onClick={() => onChange({ ...life, playing: !life.playing })}>{life.playing ? 'Pause' : 'Play'}</button>
  </div>;
}

/** What moves and how fast. Where the rates come from is one step further. */
export function LifePanel({ life, onChange }: { readonly life: LifeSettings; readonly onChange: (next: LifeSettings) => void }) {
  return <div className="living-panel life-panel">
    <div className="life-panel-head">
      <label><input type="checkbox" checked={life.on} onChange={(event) => onChange({ ...life, on: event.target.checked, playing: true })} /> Motion</label>
      <label>Speed
        <select value={life.rate} aria-label="Share of real rate shown" onChange={(event) => onChange({ ...life, rate: Number(event.target.value) })}>
          {LIFE_RATE_CHOICES.map((rate) => <option key={rate} value={rate}>{rateLabel(rate)}</option>)}
        </select>
      </label>
      {TOGGLES.map(({ key, name }) => <label key={key}><input type="checkbox" checked={life[key]} disabled={!life.on} onChange={(event) => onChange({ ...life, [key]: event.target.checked })} /> {name}</label>)}
    </div>
    <details className="life-sources">
      <summary>About this motion</summary>
      <p>{LIFE_NOTICE}</p>
      <p>{lifeRatesText(life)}</p>
      <ul>{Object.values(LIFE_SOURCES).map((source) => <li key={source.doi}>{source.statement} {source.citation}, <a href={`https://doi.org/${source.doi}`} target="_blank" rel="noreferrer">doi:{source.doi}</a></li>)}</ul>
      <h5>Chosen for viewing, from no source</h5>
      <ul>{LIFE_DISPLAY_CHOICES.map((choice) => <li key={choice}>{choice}</li>)}</ul>
    </details>
  </div>;
}
