import { useEffect, useRef } from 'react';
import { PROTOTYPE_STARTER_GROUPS } from '../domain/prototype-starters';

export function PrototypeStart({open,busy,error,onClose,onOpen,onPhysiology}: {
  open:boolean;busy:boolean;error:string;onClose:()=>void;onOpen:(id:string)=>void;onPhysiology:()=>void;
}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
  return <dialog ref={dialog} className="prototype-start" aria-labelledby="prototype-start-title" onCancel={onClose}>
    <div className="starter-heading"><div><span className="eyebrow">GUIDED EXPLORATION</span><h2 id="prototype-start-title">Start with the available science</h2></div><button className="secondary-button" onClick={onClose}>Close guide</button></div>
    <p>Choose an existing source view. Each reference opens in its own coordinate frame and retains its local observations.</p>
    <p className="starter-scope">Complete whole-body vessels, nerves and cellular detail at every location are unavailable. Zoom changes magnification; it does not add biological resolution.</p>
    {error&&<p role="alert">{error}</p>}
    {PROTOTYPE_STARTER_GROUPS.map(group=><section key={group.id}><h3>{group.title}</h3><p>{group.description}</p><div className="starter-grid">{group.starters.map(starter=><article key={starter.id}>
      <span className="starter-scope-label">{starter.scopeLabel}</span><h4>{starter.title}</h4><p>{starter.description}</p><small>{starter.costText}</small>
      <details><summary>Source scope and limitations</summary><ul>{starter.limitations.map(limit=><li key={limit}>{limit}</li>)}</ul></details>
      <button className="secondary-button" disabled={busy} onClick={()=>onOpen(starter.id)}>Open {starter.title.toLowerCase()}</button>
    </article>)}</div></section>)}
    <section className="starter-cell"><h3>Parameterized cardiac cell model</h3><p>Compute membrane voltage and calcium handling in an independent mouse ventricular-cell equation model. An explicitly documented mathematical variant is available alongside the archived equations. Neither is independently physiologically validated here.</p><button className="primary-button" disabled={busy} onClick={onPhysiology}>Open cardiac cell simulation</button></section>
    <p>To explore comparison controls without observations, choose Experiment or Compare and explicitly select Try synthetic comparison. Fictional values are labeled and never replace an existing dataset.</p>
  </dialog>;
}
