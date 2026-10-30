import { useEffect, useRef, useState } from 'react';
import { CARDIAC_CELL_LIMITATIONS, exportCardiacCellCsv, type CardiacCellResult, type CardiacCellVariant } from '../domain/cardiac-cell';

function save(name:string,body:string,type:string) {
  const url=URL.createObjectURL(new Blob([body],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),0);
}
function Trace({result,field,label,unit}: {result:CardiacCellResult;field:'voltageMv'|'calciumUm'|'subspaceCalciumUm';label:string;unit:string}) {
  const values=result.samples.map(s=>s[field]),low=Math.min(...values),high=Math.max(...values),span=high-low||1;
  const path=result.samples.map((s,i)=>`${i?'L':'M'}${(45+s.timeMs/result.protocol.durationMs*680).toFixed(2)},${(130-(s[field]-low)/span*108).toFixed(2)}`).join(' ');
  return <figure className="cell-trace"><figcaption>{label} <span>{unit}</span></figcaption><svg viewBox="0 0 760 164" role="img" aria-label={`${label} against model time in milliseconds, range ${low.toPrecision(4)} to ${high.toPrecision(4)} ${unit}`}><path d="M45 16V130H725" fill="none" stroke="#afbbb4"/><path d={path} fill="none" stroke="currentColor" strokeWidth="1.7"/><text x="2" y="24">{high.toPrecision(3)}</text><text x="2" y="131">{low.toPrecision(3)}</text><text x="45" y="151">0</text><text x="645" y="151">{result.protocol.durationMs} ms</text></svg></figure>;
}
export function CardiacCellPanel({active}: {active:boolean}) {
  const [variant,setVariant]=useState<CardiacCellVariant>('balanced-transition');const [duration,setDuration]=useState(250);const [period,setPeriod]=useState(71.43);
  const [busy,setBusy]=useState(false);const [fraction,setFraction]=useState(0);const [error,setError]=useState('');const [result,setResult]=useState<CardiacCellResult|null>(null);
  const worker=useRef<Worker|null>(null),sequence=useRef(0);
  const stop=()=>{sequence.current++;worker.current?.terminate();worker.current=null;setBusy(false);};
  useEffect(()=>{if(!active)stop();},[active]);
  useEffect(()=>()=>{sequence.current++;worker.current?.terminate();},[]);
  const run=()=>{
    stop();const current=sequence.current;setError('');setFraction(0);setBusy(true);
    try {
      const next=new Worker(new URL('../workers/cardiac-cell.worker.ts',import.meta.url),{type:'module'});worker.current=next;
      next.onmessage=(event:MessageEvent)=>{
        if(current!==sequence.current)return;
        const message=event.data;
        if(message.type==='progress'){setFraction(message.progress.fraction);return;}
        if(message.type==='result'){setResult(message.result);setFraction(1);}else setError('The numerical model could not complete. Existing results were retained.');
        next.terminate();worker.current=null;setBusy(false);
      };
      next.onerror=()=>{if(current!==sequence.current)return;next.terminate();worker.current=null;setBusy(false);setError('The local simulation worker could not complete. Existing results were retained.');};
      next.postMessage({type:'run',options:{variant,durationMs:duration,pacingPeriodMs:period}});
    } catch {setBusy(false);setError('A local Web Worker is required to run this model.');}
  };
  if(!active)return null;
  return <section className="cardiac-cell-panel" aria-labelledby="cardiac-cell-title"><div className="cell-panel-heading"><div><span className="eyebrow">INDEPENDENT CELL MODEL</span><h3 id="cardiac-cell-title">Mouse ventricular electrophysiology</h3></div><span className="cell-model-tag">Parameterized · 41 states</span></div>
    <p>Bondarenko et al. (2004), apical ventricular myocyte. Compute membrane voltage and intracellular calcium from published equations at 298 K. This model is separate from the displayed anatomy.</p>
    <p className="cell-model-warning">The archived sodium-channel transition can produce negative channel occupancy. The balanced-transition variant makes one disclosed mathematical substitution to restore transition conservation. This correction is computationally inferred and has no independent physiological validation.</p>
    <div className="cell-model-controls"><label>Equation variant<select aria-label="Cardiac equation variant" value={variant} disabled={busy} onChange={e=>setVariant(e.target.value as CardiacCellVariant)}><option value="balanced-transition">Balanced transition (mathematical correction)</option><option value="archived-source">Archived source (known channel-state defect)</option></select></label><label>Duration<select aria-label="Cardiac duration" value={duration} disabled={busy} onChange={e=>setDuration(+e.target.value)}>{[100,250,500].map(v=><option key={v} value={v}>{v} ms</option>)}</select></label><label>Pacing period<select aria-label="Cardiac pacing period" value={period} disabled={busy} onChange={e=>setPeriod(+e.target.value)}><option value={71.43}>71.43 ms (source)</option><option value={100}>100 ms (modified)</option><option value={200}>200 ms (modified)</option></select></label></div>
    <p className="cell-protocol">Stimulus starts at 20 ms; each pulse is 0.5 ms at −80 pA/pF. {period===71.43?'Source pacing protocol selected.':'Modified pacing protocol selected.'} Initial conditions are used directly, without pre-pacing.</p>
    <div className="cell-model-actions"><button className="primary-button" disabled={busy} onClick={run}>Run cell simulation</button>{busy&&<button className="secondary-button" onClick={stop}>Cancel simulation</button>}{busy&&<label className="cell-progress">Computing locally <progress aria-label="Cell simulation progress" max={1} value={fraction}/></label>}</div>
    {error&&<p role="alert">{error}</p>}
    {result&&<div className="cell-result" aria-label="Cardiac simulation result"><h4>Computed result: {result.source.variant==='balanced-transition'?'balanced-transition variant':'archived source'}</h4><p>{result.protocol.durationMs} ms · period {result.protocol.pacingPeriodMs} ms · {result.samples.length.toLocaleString()} samples · no state clipping</p>
      {result.diagnostics.channelBoundsWarning&&<p role="alert" className="cell-model-warning">Channel states left the admissible interval. These values are retained for inspection; this trace must not be treated as a physiologically valid prediction.</p>}
      <Trace result={result} field="voltageMv" label="Membrane voltage" unit="mV"/><Trace result={result} field="calciumUm" label="Cytosolic calcium" unit="µM"/><Trace result={result} field="subspaceCalciumUm" label="Subspace calcium" unit="µM"/>
      <div className="cell-model-actions"><button className="secondary-button" onClick={()=>save('mousebio-cardiac-model.json',JSON.stringify(result,null,2),'application/json')}>Export result and provenance</button><button className="secondary-button" onClick={()=>save('mousebio-cardiac-values.csv',exportCardiacCellCsv(result),'text/csv')}>Export numeric CSV</button></div><small>CSV retains values, equation variant, pacing, temperature, source identity and the transition change. Keep the JSON for complete methods and limitations.</small>
      <details><summary>Numerical method and diagnostics</summary><p>{result.solver.method}; relative tolerance {result.solver.relativeTolerance}; absolute tolerance {result.solver.absoluteTolerance}; output step {result.solver.outputStepMs} ms. {result.solver.acceptedSteps.toLocaleString()} accepted steps; {result.solver.rejectedSteps.toLocaleString()} rejected steps. Stimulus discontinuities are integrated as separate continuous phases.</p><p>Explicit and implicit dimensionless-state range: {result.diagnostics.minimumDimensionlessState.toPrecision(6)} to {result.diagnostics.maximumDimensionlessState.toPrecision(6)}.</p>{result.source.transitionChange&&<p>{result.source.transitionChange}</p>}</details>
    </div>}
    <details className="cell-model-limits"><summary>Model scope, source and limitations</summary><ul>{CARDIAC_CELL_LIMITATIONS.map(limit=><li key={limit}>{limit}</li>)}</ul><p><a href="https://doi.org/10.1152/ajpheart.00185.2003" target="_blank" rel="noreferrer">Bondarenko et al., 2004</a> · <a href="/models/bondarenko-apical/manifest.json" target="_blank" rel="noreferrer">Source manifest</a> · <a href="/models/bondarenko-apical/LICENSE.md" target="_blank" rel="noreferrer">Model adaptation: CC BY 3.0</a>. Original integration and interface code: MIT.</p><p>No contraction mechanics, blood flow, nerve propagation or cellular geometry is generated. Numerical solver agreement does not establish biological validation.</p></details>
  </section>;
}
