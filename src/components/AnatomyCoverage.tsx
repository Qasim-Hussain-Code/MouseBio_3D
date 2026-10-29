import { useId, useState } from 'react';
import { ANATOMY_COVERAGE_TOPICS, coverageRequests, coverageAvailability, type AnatomyCoverageRequest } from '../domain/anatomy-coverage';

type Props = { referenceId: string; busy: boolean; onOpen: (request: AnatomyCoverageRequest, context: 'hidden' | 'faded') => void };
/** Explicit routes to source anatomy, keeping developmental and regional scope visible. */
export function AnatomyCoverage({ referenceId, busy, onOpen }: Props) {
  const [topicId, setTopicId] = useState<(typeof ANATOMY_COVERAGE_TOPICS)[number]['id']>('vessels');
  const choicesId = useId();
  const [expanded, setExpanded] = useState(false);
  const [context, setContext] = useState<'hidden' | 'faded'>('faded');
  const topic = ANATOMY_COVERAGE_TOPICS.find((entry) => entry.id === topicId)!;
  const requests = coverageRequests(topicId), availability = coverageAvailability(topicId, referenceId);
  return <section className="anatomy-coverage" aria-labelledby="anatomy-coverage-heading"><div className="coverage-heading"><h3 id="anatomy-coverage-heading">Find anatomy</h3>
    <span>{availability === 'current-reference' ? 'Available in this reference' : availability === 'another-reference' ? 'Available in another reference' : 'Not currently available'}</span><button className="coverage-disclosure" aria-expanded={expanded} aria-controls={choicesId} onClick={() => setExpanded(!expanded)}>{expanded ? 'Hide source choices' : 'Show source choices'}</button></div>
    <div className="coverage-topics" role="group" aria-label="Anatomy topics">{ANATOMY_COVERAGE_TOPICS.map((entry) => <button key={entry.id} aria-pressed={entry.id === topicId} onClick={() => { setTopicId(entry.id); setExpanded(true); }}>{entry.title}</button>)}</div>
    <div id={choicesId} hidden={!expanded}><p>{topic.description}</p>
    <div className="coverage-limits">{topic.limitations.map((limit) => <p key={limit}>{limit}</p>)}</div>
    <label className="coverage-context">Other structures in the selected source<select aria-label="Surrounding source anatomy" value={context} onChange={(event) => setContext(event.target.value as 'hidden' | 'faded')}><option value="faded">Fade surrounding anatomy</option><option value="hidden">Hide surrounding anatomy</option></select></label>
    <div className="coverage-routes">{requests.map((request) => <div key={`${request.referenceId}-${request.groupId}`} className="coverage-route"><div><strong>{request.scopeLabel}</strong><small>{request.regionCount} source {request.regionCount === 1 ? 'record' : 'regions'}</small></div>
      <button className="secondary-button" disabled={busy} onClick={() => { onOpen(request, context); setExpanded(false); }}>{request.label}</button></div>)}</div>
    <p className="coverage-separate">Opening another reference switches its source frame. These references are not registered or overlaid onto one mouse.</p></div>
  </section>;
}
