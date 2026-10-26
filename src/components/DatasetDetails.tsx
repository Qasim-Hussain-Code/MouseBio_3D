import type { DatasetMetadata } from '../domain/types';

/** User-declared provenance is retained with exports, without remote lookups. */
export function DatasetDetails({ metadata, onChange }: {
  metadata: DatasetMetadata;
  onChange: (metadata: DatasetMetadata) => void;
}) {
  const set = (field: keyof DatasetMetadata, value: string) => onChange({ ...metadata, [field]: value });
  return <details className="dataset-details">
    <summary>Dataset provenance and notes</summary>
    <p>Record the source and sampling context. These declarations are supplied by the user and are not independently verified.</p>
    <div className="metadata-fields">
      <label>Dataset title<input value={metadata.title ?? ''} maxLength={4096} onChange={(event) => set('title', event.target.value)} /></label>
      <label>Declared origin<select value={metadata.origin ?? 'user-data'} onChange={(event) => onChange({ ...metadata, origin: event.target.value as DatasetMetadata['origin'] })}><option value="user-data">User observations</option><option value="synthetic-example">Synthetic example</option></select></label>
      <label className="metadata-wide">Source reference<input value={metadata.sourceReference ?? ''} maxLength={4096} placeholder="Publication, accession or local study reference" onChange={(event) => set('sourceReference', event.target.value)} /></label>
      <label>Data license or permissions<input value={metadata.license ?? ''} maxLength={4096} onChange={(event) => set('license', event.target.value)} /></label>
      <label className="metadata-wide">Sampling notes<textarea value={metadata.notes ?? ''} maxLength={4096} rows={3} placeholder="Biological subjects, technical replicate processing, assay and limitations" onChange={(event) => set('notes', event.target.value)} /></label>
    </div>
  </details>;
}
