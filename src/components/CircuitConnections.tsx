import { useId } from 'react';
import type { Structure } from '../domain/types';
import { circuitConnectionsForStructure, type CircuitConnection, type CircuitEndpoint, type LivingCircuitsResult } from '../domain/living-circuits';

const ROLE_LABELS: Record<string, string> = { brain: 'Brain' };

function endpointName(endpoint: CircuitEndpoint, structures: readonly Structure[]): string {
  if (endpoint.structureIds.length === 1) return structures.find((structure) => structure.id === endpoint.structureIds[0])?.name ?? endpoint.structureIds[0];
  return `${ROLE_LABELS[endpoint.role] ?? endpoint.role} (${endpoint.structureIds.length} source labels)`;
}

/** Plain-language direction of one route relative to the inspected region. */
export function describeConnection(connection: CircuitConnection, structures: readonly Structure[]): string {
  const partner = endpointName(connection.partner, structures), { kind, blood } = connection.edge;
  const outgoing = connection.direction === 'outgoing';
  if (kind === 'neural-efferent') return outgoing ? `Sends efferent nerve signals to ${partner}` : `Receives efferent nerve signals from ${partner}`;
  if (kind === 'neural-afferent') return outgoing ? `Sends afferent nerve signals to ${partner}` : `Receives afferent nerve signals from ${partner}`;
  if (kind === 'hepatic-portal') return outgoing ? `Drains to ${partner} through the hepatic portal vein` : `Receives hepatic portal blood from ${partner}`;
  return outgoing ? `Sends ${blood} blood to ${partner}` : `Receives ${blood} blood from ${partner}`;
}

export interface CircuitConnectionsProps {
  result: LivingCircuitsResult;
  structureId: string;
  structures: readonly Structure[];
}

/** Lists schematic routes of one region. Routes are educational simplifications, not observations. */
export function CircuitConnections({ result, structureId, structures }: CircuitConnectionsProps) {
  const heading = useId();
  if (!result.ok) return null;
  const connections = circuitConnectionsForStructure(result, structureId);
  return <section className="inspector-section circuit-connections" aria-labelledby={heading}>
    <h3 id={heading}>Schematic routes</h3>
    {connections.length === 0 ? <p>No schematic route is bound to this source region.</p> : <>
      <p>{connections.length} schematic {connections.length === 1 ? 'connector' : 'connectors'} from the cited route table. Connectors are display curves, not vessel or nerve geometry.</p>
      <ul>{connections.map((connection) => <li key={`${connection.edge.id}:${connection.direction}`} data-kind={connection.edge.kind}>
        <strong>{describeConnection(connection, structures)}</strong>
        <p>{connection.edge.basis}</p>
        {connection.edge.bindingInferences.map((inference) => <p key={inference} className="circuit-inference">Binding inference: {inference}</p>)}
        <span className="status-tag">Educational simplification</span>
        <span className="circuit-references">{connection.edge.relationship.evidence.references.map((reference) =>
          <a key={reference.id} href={reference.url} target="_blank" rel="noreferrer">{reference.title}</a>)}</span>
      </li>)}</ul>
    </>}
  </section>;
}
