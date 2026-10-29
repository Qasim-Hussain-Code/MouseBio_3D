import type { Atlas } from '../domain/types';
import { isSourcePolylineAtlas } from '../domain/source-polyline';

/** Geometry records retain source uncertainty and do not become a physiological network. */
export function SourcePolylineRecord({ atlas }: { atlas: Atlas }) {
  if (!isSourcePolylineAtlas(atlas)) return null;
  const stats = atlas.statistics, count = (key: string) => Number(stats[key]).toLocaleString('en-US');
  const omitted = Array.isArray(atlas.sourceAttributesOmitted) ? atlas.sourceAttributesOmitted as { association: string; declaredRecords: number; field: string; tuples: number }[] : [];
  return <section className="inspector-section" aria-labelledby="source-polyline-heading"><h3 id="source-polyline-heading">Source polyline graph</h3>
    <p>{atlas.structures[0].description}</p>
    <dl><dt>Source points</dt><dd>{count('points')}</dd><dt>Source polylines</dt><dd>{count('polylines')}</dd><dt>Consecutive segments</dt><dd>{count('segments')}</dd>
      <dt>Indexed geometry components</dt><dd>{count('components')}</dd><dt>Isolated points</dt><dd>{count('isolatedPoints')}</dd>
      <dt>Zero-length source segments</dt><dd>{count('zeroLengthSegments')}</dd><dt>Segments collapsed during initial Float32 serialization</dt><dd>{count('float32CollapsedSegments')}</dd>
      <dt>Initial Float32 coordinate difference</dt><dd>{Number(stats.maxFloat32PositionError).toExponential(3)} (source units)</dd>
      <dt>Declared coordinate units</dt><dd>{String(atlas.coordinateFrame.sourceUnits)}</dd>
      {typeof stats.sourceGraphVertices === 'number' && <><dt>Original topology vertices</dt><dd>{count('sourceGraphVertices')}</dd><dt>Original topology edges</dt><dd>{count('sourceGraphEdges')}</dd><dt>Original topology components</dt><dd>{count('sourceGraphComponents')}</dd><dt>Original topology cycle rank</dt><dd>{count('sourceGraphCycleRank')}</dd></>}
      </dl>
    {typeof stats.sourceGraphVertices === 'number' && <p>Edge-local points remain separate at shared endpoints. Original topology identifiers and connectivity are retained separately. Path order does not establish flow direction. Simulated flow, effective diameters and model vessel categories are omitted.</p>}
    {omitted.length > 0 && <details><summary>Omitted source attributes</summary>{omitted.map((record) => <p key={record.association}>{record.association} declares {record.declaredRecords} records; its {record.field} field has {record.tuples} tuples. No correspondence is invented and these values do not set thickness.</p>)}</details>}
    <p>Every original ordered path and consecutive link is retained. No smoothing, missing-branch completion, radius-derived surface, anatomical overlay or physiological motion is generated. Line width is a display setting.</p>
    <p>Components describe indexed geometry, not cells, nerves, synapses or functional connectivity. Initial Float32 diagnostics exclude later recentering and GPU rounding and do not measure physical accuracy.</p>
    <p>{atlas.limitations[0]}</p>
  </section>;
}
