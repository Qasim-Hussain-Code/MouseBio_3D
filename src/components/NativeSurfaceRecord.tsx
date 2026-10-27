import type { Atlas } from '../domain/types';
import { buildNativeSurfaceSummary } from '../domain/native-surface-summary';

const count = (value: number) => value.toLocaleString('en-US');

/** Source declarations and numerical condition, without a physical measurement claim. */
export function NativeSurfaceRecord({ atlas, structureId }: { atlas: Atlas; structureId: string }) {
  if (atlas.id !== 'ema147-native-v1') return null;
  const summary = buildNativeSurfaceSummary(atlas, structureId);
  return <section className="inspector-section native-surface-record" aria-labelledby="native-surface-heading">
    <h3 id="native-surface-heading">Native surface record</h3>
    {!summary ? <p>The selected source geometry record is unavailable or inconsistent.</p> : <>
      <p>Physical mesh units are unknown. Numerical mesh checks do not establish anatomical accuracy.</p>
      <dl>
        <dt>Source file</dt><dd><code>{summary.sourceFile}</code></dd>
        <dt>Surface index</dt><dd>{summary.sourceRegionIndex} (zero-based serialization)</dd>
        <dt>Filename identifier</dt><dd>{summary.sourceEMAPAId ?? 'Unannotated in source filename'}</dd>
        <dt>Anatomy index</dt><dd>{summary.sourceVolumeLabelIndex === null
          ? 'No exact anatomy-index match' : `Label ${summary.sourceVolumeLabelIndex} in source index`}</dd>
        <dt>Indexed vertices</dt><dd>{count(summary.vertices)}</dd>
        <dt>Triangles</dt><dd>{count(summary.triangles)}</dd>
      </dl>
      <p>{summary.topology.closed ? 'Closed under executed numerical checks.' : 'Recorded source topology defects are retained.'}</p>
      <details><summary>Recorded topology counts</summary><dl>
        <dt>Boundary edges</dt><dd>{count(summary.topology.boundaryEdges)}</dd>
        <dt>Nonmanifold edges</dt><dd>{count(summary.topology.nonmanifoldEdges)}</dd>
        <dt>Winding conflicts</dt><dd>{count(summary.topology.inconsistentWindingEdges)}</dd>
        <dt>Noncyclic vertex links</dt><dd>{count(summary.topology.noncyclicVertexLinks)}</dd>
        <dt>Degenerate triangles</dt><dd>{count(summary.topology.degenerateTriangles)}</dd>
        <dt>Duplicate triangles</dt><dd>{count(summary.topology.duplicateTriangles)}</dd>
        <dt>Mesh components</dt><dd>{count(summary.topology.components)}</dd>
      </dl><p>Counts describe source geometry. Display normals are generated; no surface repair is applied. Mesh components do not establish biological connectivity.</p></details>
    </>}
  </section>;
}
