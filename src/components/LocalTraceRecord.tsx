import type { LocalTraceAsset } from '../domain/local-trace';

/** Numerical source records, with no membrane, physical radius or cell-type claim. */
export function LocalTraceRecord({ asset }: { asset: LocalTraceAsset }) {
  const statistics = asset.atlas.statistics;
  const count = (key: string) => Number(statistics[key]).toLocaleString('en-US');
  const initialCoordinateDifference = Number(statistics.maxFloat32PositionError);
  const coordinateDifference = initialCoordinateDifference === 0 ? '0' : initialCoordinateDifference.toExponential(3);
  return <section className="inspector-section" aria-labelledby="local-trace-heading"><h3 id="local-trace-heading">Local trace record</h3>
    <p>Positions and explicit parent links are shown as lines. Physical units and biological identity are unverified. Source radius fields do not set display thickness.</p>
    <dl><dt>Samples stored</dt><dd>{count('samples')}</dd><dt>Parent links</dt><dd>{count('parentLinks')}</dd>
      <dt>Root components</dt><dd>{count('components')}</dd><dt>Zero-length source links</dt><dd>{count('zeroLengthEdges')}</dd>
      <dt>Links collapsed during initial Float32 serialization</dt><dd>{count('float32CollapsedEdges')}</dd>
      <dt>Max coordinate difference during initial Float32 serialization</dt><dd>{coordinateDifference} (unknown source units)</dd>
      <dt>Isolated samples</dt><dd>{count('isolatedSamples')}</dd></dl>
    <p>These diagnostics cover initial Float32 serialization only. Display recentering can introduce further rounding and coincident display links. They do not measure physical accuracy or total rendering error.</p>
    <p>Components describe the source graph and do not establish cell or specimen counts. Isolated samples have no point glyph. Source links and numeric values are retained; no repair, cell surface, synapse, anatomical overlay or physiological model is generated.</p>
    <p>The file stays in browser memory and is cleared by reloading. Saved views contain its checksum and display settings, with no trace samples. Reopen the same file before restoring its view.</p>
  </section>;
}
