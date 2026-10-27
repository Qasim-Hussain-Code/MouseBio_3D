import type { ReferenceSummary } from '../domain/reference-summary';

/** Keep conflicting source age declarations separate from a resolved specimen age. */
export function DevelopmentalContext({ summary }: { summary: ReferenceSummary }) {
  if (summary.developmental.stage === 'Unknown' && summary.developmental.ageClaims.length === 0) return null;
  return <section className="inspector-section"><h3>Developmental source</h3>
    <p>Declared stage: <strong>{summary.developmental.stage}</strong></p>
    {summary.developmental.ageClaims.length > 0 && <>
      <p>Source age estimates are recorded separately. No single age has been resolved.</p>
      <ul>{summary.developmental.ageClaims.map((claim, index) => <li key={index}>{claim.age}: {claim.url
        ? <a href={claim.url} target="_blank" rel="noreferrer">{claim.source}</a> : claim.source}</li>)}</ul>
    </>}
  </section>;
}
