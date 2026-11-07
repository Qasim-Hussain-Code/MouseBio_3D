import { useEffect, type ReactNode } from 'react';
import { describeAction, LAB_NOTICE, LAB_TOOLS, labRecord, type LabPose, type LabToolId } from '../domain/dissection-lab';
import { evaluateExercise, LAB_EXERCISES, type LabExercise } from '../domain/lab-exercises';
import type { LabReport, LabView } from '../viewer/lab-session';
import { InstrumentIcon } from './InstrumentIcon';

/** Where to look from. The belly can be seen only with the animal on its back, and the back only with it on its feet, so these turn it over. */
const VIEWS: readonly { readonly id: LabView; readonly name: string; readonly pose?: LabPose }[] = [
  { id: 'belly', name: 'Belly', pose: 'on-back' }, { id: 'close', name: 'Close' }, { id: 'back', name: 'Back', pose: 'standing' }, { id: 'left', name: 'Left' }, { id: 'right', name: 'Right' }, { id: 'head', name: 'Head' },
];

export interface LabPanelProps {
  /** The card of a tutorial or the list of procedures. They stand in the panel, so that nothing lies over the view. */
  readonly card?: ReactNode;
  /** The list of procedures is showing, and the rest of the panel waits for a choice. */
  readonly choosing?: boolean;
  readonly onHide?: () => void;
  readonly report: LabReport | null;
  readonly selected: { readonly id: string; readonly name: string } | null;
  readonly modelId: string;
  readonly exercise: LabExercise | null;
  readonly nameOf: (id: string) => string;
  readonly canLookCloser: (id: string) => boolean;
  readonly onExercise: (id: string) => void;
  readonly onTool: (tool: LabToolId) => void;
  readonly onPose: (pose: LabPose) => void;
  readonly onView: (view: LabView) => void;
  readonly onTake: (id: string) => void;
  readonly onLookCloser: (id: string) => void;
  readonly onUndo: () => void;
  readonly onRestart: () => void;
  readonly onDetails: () => void;
  readonly onDownload: (text: string) => void;
  readonly namesOn: boolean;
  readonly onNames: (on: boolean) => void;
  /** The heart beats and the animal breathes, under anaesthesia, or it does not. */
  readonly alive: boolean;
  readonly onAlive: (alive: boolean) => void;
  readonly sound: boolean;
  readonly onSound: (on: boolean) => void;
  /** A stroke keeps to a marked line, for a hand that is not steady. */
  readonly steady: boolean;
  readonly onSteady: (on: boolean) => void;
}

/** The instruments and what has been done. The words are kept few: the view is what is being worked on, and a tutorial has its own card beside it. */
export function LabPanel({ card, choosing, onHide, report, selected, modelId, exercise, nameOf, canLookCloser, onExercise, onTool, onPose, onView, onTake, onLookCloser, onUndo, onRestart, onDetails, onDownload, namesOn, onNames, alive, onAlive, sound, onSound, steady, onSteady }: LabPanelProps) {
  const facts = report?.facts ?? null;
  const watching = !!report?.demonstrating;
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); onUndo(); return; }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const found = LAB_TOOLS.find((item) => item.key.toLowerCase() === event.key.toLowerCase());
      if (found) { event.preventDefault(); onTool(found.id); }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [onTool, onUndo]);
  const actions = facts?.actions ?? [];
  const taken = report?.taken ?? [];
  return <div className="lab-panel">
    <div className="lab-heading"><h1>Dissection practice</h1><span className="lab-sim">simulated</span>{onHide && <button type="button" className="lab-hide" aria-label="Hide the panel" title="Hide the panel, to see more of the animal" onClick={onHide}>‹</button>}</div>
    <label className="lab-exercise">Tutorial
      <select aria-label="Tutorial" value={exercise?.id ?? ''} disabled={watching} onChange={(event) => onExercise(event.target.value)}>
        <option value="">Free dissection</option>
        {LAB_EXERCISES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    {card}
    {!choosing && <>
    <div className={`lab-tools ${card ? 'is-compact' : ''}`} role="radiogroup" aria-label="Instruments">
      {LAB_TOOLS.map((item) => <button key={item.id} type="button" role="radio" disabled={watching} aria-checked={report?.tool === item.id} className={report?.tool === item.id ? 'is-chosen' : ''} title={`${item.hint} (${item.key})`} onClick={() => onTool(item.id)}><InstrumentIcon tool={item.id} /><span>{item.name}</span></button>)}
    </div>
    <p className="lab-hint">Left button: the instrument. Right button: turn the view. Wheel: closer.</p>
    <details className="lab-more" open={!card}>
    <summary>How it lies, views and settings</summary>
    <div className="lab-row" role="group" aria-label="How the animal lies">
      <button type="button" disabled={watching} aria-pressed={report?.pose === 'on-back'} onClick={() => { onPose('on-back'); onView('belly'); }}>On its back</button>
      <button type="button" disabled={watching} aria-pressed={report?.pose === 'standing'} onClick={() => { onPose('standing'); onView('left'); }}>On its feet</button>
    </div>
    <div className="lab-row lab-views" role="group" aria-label="Look from">
      {VIEWS.map((view) => <button key={view.id} type="button" disabled={watching} onClick={() => { if (view.pose && view.pose !== report?.pose) onPose(view.pose); onView(view.id); }}>{view.name}</button>)}
    </div>
    <div className="lab-row" role="group" aria-label="State of the animal">
      <button type="button" disabled={watching} aria-pressed={alive} title="The heart beats, it breathes, and cut vessels bleed" onClick={() => onAlive(true)}>Anaesthetised</button>
      <button type="button" disabled={watching} aria-pressed={!alive} title="Still, and nothing bleeds" onClick={() => onAlive(false)}>After death</button>
    </div>
    <div className="lab-row">
      <button type="button" aria-pressed={namesOn} onClick={() => onNames(!namesOn)}>Names</button>
      <button type="button" aria-pressed={steady} title="A stroke keeps to a marked line" onClick={() => onSteady(!steady)}>Steady hand</button>
      <button type="button" aria-pressed={sound} onClick={() => onSound(!sound)}>Sound</button>
    </div>
    </details>
    {selected && !watching && <div className="lab-selected"><strong>{selected.name}</strong><div className="lab-row"><button type="button" onClick={onDetails}>Details</button><button type="button" disabled={taken.includes(selected.id)} onClick={() => onTake(selected.id)}>Lift out</button></div></div>}
    {taken.length > 0 && <div className="lab-dish"><span>In the dish</span><ul>{taken.map((id) => <li key={id}><span>{nameOf(id)}</span>{canLookCloser(id) && <button type="button" onClick={() => onLookCloser(id)}>Under the microscope</button>}</li>)}</ul></div>}
    <div className="lab-row">
      <button type="button" disabled={!report?.canUndo || watching} onClick={onUndo} title="Ctrl+Z">Undo</button>
      <button type="button" disabled={!report?.canUndo || watching} onClick={onRestart}>Start again</button>
      <button type="button" disabled={!facts || !actions.length} onClick={() => { if (facts) onDownload(JSON.stringify(labRecord(facts, modelId, exercise ? { id: exercise.id, name: exercise.name, source: exercise.source, result: evaluateExercise(exercise, facts) } : null, new Date().toISOString()), null, 2)); }}>Record</button>
    </div>
    {actions.length > 0 && <ol className="lab-log" aria-label="What has been done" reversed>{[...actions].reverse().slice(0, 8).map((action, index) => <li key={actions.length - index}>{describeAction(action, nameOf)}</li>)}</ol>}
    </>}
    <p className="lab-notice">{LAB_NOTICE}</p>
  </div>;
}
