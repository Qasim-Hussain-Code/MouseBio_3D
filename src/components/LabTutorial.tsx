import { useEffect, useMemo, useRef, useState } from 'react';
import { LAB_TOOLS, sessionSummary, type LabFacts } from '../domain/dissection-lab';
import { evaluateExercise, LAB_EXERCISES, LAB_GROUPS, nextStepOf, type LabExercise } from '../domain/lab-exercises';

export interface LabTutorialProps {
  readonly exercise: LabExercise;
  readonly facts: LabFacts | null;
  readonly demonstrating: boolean;
  /** The step that the hands are showing now. */
  readonly shown?: string | null;
  /** The step in hand has changed: the instrument, the view and the marks on the animal follow it. */
  readonly onStep: (index: number) => void;
  readonly onShow: (index: number) => void;
  readonly onWatchAll: () => void;
  readonly onStop: () => void;
  readonly onClose: () => void;
  /** Press a button that a step offers. */
  readonly onAct: (does: 'perfuse' | 'drape') => void;
}

/** The procedures that can be followed, for the moment the bench is first opened. */
export function LabChooser({ onChoose, onFree }: { readonly onChoose: (id: string) => void; readonly onFree: () => void }) {
  return <section className="lab-tutorial lab-chooser" aria-label="Choose a procedure">
    <header>
      <h2>Choose a procedure</h2>
      <button type="button" className="lab-tutorial-small" aria-label="Close" title="Close" onClick={onFree}>×</button>
    </header>
    {LAB_GROUPS.map((group) => <div key={group} className="lab-chooser-group">
      <h3>{group}</h3>
      <ul>{LAB_EXERCISES.filter((item) => item.group === group).map((item) => <li key={item.id}><button type="button" onClick={() => onChoose(item.id)}><span>{item.name}</span><small>{item.steps.length} steps</small></button></li>)}</ul>
    </div>)}
    <div className="lab-row lab-tutorial-actions"><button type="button" onClick={onFree}>Practise freely</button></div>
  </section>;
}

/** A local voice only, so that nothing of what is read leaves the device. */
function speak(text: string) {
  const speech = window.speechSynthesis;
  if (!speech) return;
  speech.cancel();
  const voice = speech.getVoices().find((item) => item.localService && item.lang.startsWith('en')) ?? null;
  if (!voice) return;
  const line = new SpeechSynthesisUtterance(text);
  line.voice = voice;
  line.rate = 1;
  speech.speak(line);
}

/** One procedure, step by step, beside the animal. It follows what is done: a step that has been done is ticked, and the card goes on to the next. */
export function LabTutorial({ exercise, facts, demonstrating, shown, onStep, onShow, onWatchAll, onStop, onClose, onAct }: LabTutorialProps) {
  const result = useMemo(() => evaluateExercise(exercise, facts ?? { actions: [], seen: new Set(), removed: new Set(), ligated: new Set() }), [exercise, facts]);
  const [index, setIndex] = useState(0);
  const [folded, setFolded] = useState(false);
  const [reading, setReading] = useState(false);
  const canRead = typeof window.speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
  const doneBefore = useRef(result.steps);
  // Back to the start when the exercise changes.
  useEffect(() => { setIndex(0); doneBefore.current = []; }, [exercise]);
  // When the step in hand has just been done, go on to the first that has not.
  useEffect(() => {
    if (result.steps[index] && !doneBefore.current[index]) {
      const next = nextStepOf(result);
      if (next !== index) setIndex(next);
    }
    doneBefore.current = result.steps;
  }, [result, index]);
  // While the hands work, the card keeps to the step they are showing.
  useEffect(() => {
    if (!demonstrating || !shown) return;
    const at = exercise.steps.findIndex((item) => item.text === shown);
    if (at >= 0) setIndex(at);
  }, [demonstrating, shown, exercise]);
  useEffect(() => { onStep(index); }, [index, exercise]);
  // In a low window the panel scrolls, and the step in hand is kept in sight.
  const stepBox = useRef<HTMLDivElement>(null);
  useEffect(() => { stepBox.current?.scrollIntoView?.({ block: 'nearest' }); }, [index]);
  const step = exercise.steps[index] ?? exercise.steps[0];
  const advice = facts && !demonstrating && !result.steps[index] ? step.advice?.(facts) ?? null : null;
  const instruments = useMemo(() => LAB_TOOLS.filter((tool) => tool.id !== 'hand' && exercise.steps.some((item) => item.tool === tool.id)).map((tool) => tool.name.toLowerCase()).join(', '), [exercise]);
  useEffect(() => {
    if (reading && !demonstrating) speak([step.text, step.how, step.why, step.care].filter(Boolean).join('. '));
    return () => { window.speechSynthesis?.cancel(); };
  }, [reading, step, demonstrating]);
  if (folded) return <button type="button" className="lab-tutorial-fold" onClick={() => setFolded(false)}>Step {index + 1} of {exercise.steps.length}: {step.text}</button>;
  return <section className="lab-tutorial" aria-label={`Tutorial: ${exercise.name}`}>
    <header>
      <h2>{exercise.name}</h2>
      <button type="button" className="lab-tutorial-small" aria-label="Fold the tutorial" title="Fold" onClick={() => setFolded(true)}>−</button>
      <button type="button" className="lab-tutorial-small" aria-label="Close the tutorial" title="Close" onClick={onClose}>×</button>
    </header>
    {index === 0 && <p className="lab-tutorial-about">{exercise.about}</p>}
    {index === 0 && instruments && <p className="lab-tutorial-needs"><strong>Instruments:</strong> {instruments}</p>}
    <ol className="lab-tutorial-steps">
      {exercise.steps.map((item, at) => <li key={item.text + at}><button type="button" className={`${at === index ? 'is-here' : ''} ${result.steps[at] ? 'is-done' : ''}`} aria-current={at === index ? 'step' : undefined} onClick={() => setIndex(at)}>{item.text}</button></li>)}
    </ol>
    <div className="lab-tutorial-step" aria-live="polite" ref={stepBox}>
      <h3>Step {index + 1} of {exercise.steps.length}: {step.text}</h3>
      <p>{step.how}</p>
      {step.why && <p className="lab-tutorial-why"><strong>Why.</strong> {step.why}</p>}
      {step.care && <p className="lab-tutorial-care"><strong>Take care.</strong> {step.care}</p>}
      {step.see && <p className="lab-tutorial-see"><strong>What you see.</strong> {step.see}</p>}
      {advice && <p className="lab-tutorial-advice" role="status">{advice}</p>}
      {step.act && !result.steps[index] && !demonstrating && <div className="lab-row"><button type="button" className="lab-watch" onClick={() => onAct(step.act!.does)}>{step.act.label}</button></div>}
    </div>
    {result.errors.map((error) => <p key={error} className="lab-error" role="status">{error}</p>)}
    {result.finished && facts && <p className="lab-finished" role="status">{result.errors.length ? 'Finished, with damage noted above.' : 'Finished cleanly.'} {sessionSummary(facts)}</p>}
    <div className="lab-row lab-tutorial-actions">
      {demonstrating
        ? <button type="button" className="lab-watch" onClick={onStop}>Stop and take over</button>
        : <><button type="button" className="lab-watch" onClick={() => onShow(index)}>Show me this step</button><button type="button" onClick={onWatchAll} title="From the beginning, the hands do all of it">Watch all of it</button></>}
    </div>
    <div className="lab-row lab-tutorial-actions">
      <button type="button" disabled={index === 0 || demonstrating} onClick={() => setIndex(index - 1)}>Back</button>
      <button type="button" disabled={index === exercise.steps.length - 1 || demonstrating} onClick={() => setIndex(index + 1)}>Next</button>
      {canRead && <button type="button" aria-pressed={reading} title="Read each step aloud, with a voice on this device" onClick={() => setReading(!reading)}>Read aloud</button>}
    </div>
    <p className="lab-source">After <a href={`https://doi.org/${exercise.source.doi}`} target="_blank" rel="noreferrer">{exercise.source.citation}</a>{(exercise.also ?? []).map((also) => <span key={also.doi}>, with <a href={`https://doi.org/${also.doi}`} target="_blank" rel="noreferrer">{also.citation}</a></span>)}</p>
  </section>;
}
