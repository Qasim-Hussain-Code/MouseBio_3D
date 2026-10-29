import type { Atlas } from '../domain/types';
import { isSourceTraceAtlas } from '../domain/source-trace';

/** Declared source information and numerical diagnostics are not calibration. */
export function SourceTraceRecord({ atlas }: { atlas: Atlas }) {
  if (!isSourceTraceAtlas(atlas)) return null;
  const statistics = atlas.statistics;
  const count = (key: string) => Number(statistics[key]).toLocaleString('en-US');
  return <section className="inspector-section" aria-labelledby="source-trace-heading"><h3 id="source-trace-heading">Neuronal source trace</h3>
    <p>NeuroMorpho.Org NMO_130632 is a source-declared adult mouse V1 layer 4 reconstruction. The numeric sample records and explicit parent links are retained from its standardized SWC.</p>
    <dl><dt>Samples stored</dt><dd>{count('samples')}</dd><dt>Parent links</dt><dd>{count('parentLinks')}</dd>
      <dt>Root components</dt><dd>{count('components')}</dd><dt>Isolated samples</dt><dd>{count('isolatedSamples')}</dd>
      <dt>Zero-length source links</dt><dd>{count('zeroLengthEdges')}</dd>
      <dt>Links collapsed during initial Float32 serialization</dt><dd>{count('float32CollapsedEdges')}</dd>
      <dt>Max coordinate difference during initial Float32 serialization</dt><dd>{Number(statistics.maxFloat32PositionError).toExponential(3)} (unknown source units)</dd></dl>
    <p>These diagnostics cover initial Float32 serialization only. Display recentering can add rounding. Neither diagnostic establishes physical accuracy or total rendering error.</p>
    <p>Individual sex, exact age and strain remain unresolved. The source reports 15% shrinkage without correction. The transform from the original reconstruction to the standardized file has not been verified.</p>
    <p>Physical units, anatomical orientation and registration remain unverified. Radius fields do not set line thickness. Source type codes do not create separate validated compartments. Numerical components are not cell or specimen counts.</p>
    <p>This independent line reference supplies no cell surface, synapse, functional connectivity, physiological animation or anatomical overlay. No missing branches are generated.</p>
    <p>Comment headers containing contact and machine information are omitted from the distributed numeric derivative. Original and derivative checksums, processing and CC BY 4.0 attribution are retained in the provenance manifest.</p>
  </section>;
}
