import type { OntologyCandidate } from '../domain/ontology';

export function OntologyContext({ candidate, onDownload }: {
  candidate: OntologyCandidate;
  onDownload: () => void;
}) {
  return <section className="inspector-section ontology-context">
    <h3>Anatomical ontology</h3>
    <a className="ontology-term" href={candidate.termUrl} target="_blank" rel="noreferrer"><strong>{candidate.termId}</strong><span>{candidate.termLabel} ↗</span></a>
    <span className="status-tag">Proposed · computational inference</span>
    <p>A related term proposed from the source label. Matching labels does not establish matching anatomical boundaries. No expert review is claimed.</p>
    <details><summary>Evidence and limitations</summary><p>Mouse adult gross anatomy ontology, version {candidate.ontologyVersion}. Term retrieved {candidate.retrievedOn}.</p><ul>{[...candidate.assumptions, ...candidate.limitations].map((item) => <li key={item}>{item}</li>)}</ul><a href={candidate.verificationUrl} target="_blank" rel="noreferrer">Verified term record ↗</a><button className="text-button" onClick={onDownload}>Download candidate registry</button></details>
  </section>;
}
