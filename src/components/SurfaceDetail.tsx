import type { RegionDetailAsset, RegionDetailLevel, RegionDetailStatus } from '../viewer/region-detail-registry';

type Props = {
  baseSpacing?: number;
  levels: readonly RegionDetailLevel[];
  levelId: string;
  asset?: RegionDetailAsset;
  enabled: boolean;
  comparative: boolean;
  viewerFailed: boolean;
  status: RegionDetailStatus;
  onLevelChange: (id: string) => void;
  onEnabledChange: (enabled: boolean) => void;
};

/** Describes source sampling without implying additional biological structures. */
export function SurfaceDetail({ baseSpacing, levels, levelId, asset, enabled, comparative,
  viewerFailed, status, onLevelChange, onEnabledChange }: Props) {
  const level = levels.find((item) => item.id === levelId);
  const matchingStatus = asset && status.assetSha256 === asset.glbSha256 && status.structureId === asset.structureId;
  return <section className="surface-detail">
    <h3>Surface detail</h3>
    <p>{baseSpacing === undefined ? 'Base processing spacing unavailable.' : `${baseSpacing} mm base processing grid.`} Source spacing and surface accuracy are different quantities.</p>
    {levels.length > 1 && <label>Processing level<select aria-label="Selected surface processing level" value={levelId}
      disabled={comparative} onChange={(event) => onLevelChange(event.target.value)}>
      {levels.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
    </select></label>}
    {asset ? <>
      <label><input type="checkbox" aria-label="Finer selected surface" checked={enabled && !comparative}
        disabled={comparative} onChange={(event) => onEnabledChange(event.target.checked)} /> Finer selected surface ({asset.processingVoxelSpacingMm[0]} mm)</label>
      <small>{(asset.glbBytes / 1_000_000).toFixed(2)} MB, loaded locally on demand. Other regions retain their base surface.</small>
      {level && <p>{level.description}</p>}
      {level && <ul>{level.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>}
      <p role="status">{comparative ? 'Compare uses the same base surfaces in both panels.' : viewerFailed ? 'The 3D viewer is unavailable.'
        : enabled ? matchingStatus && status.status === 'ready' ? 'Finer surface loaded.'
          : matchingStatus && status.status === 'failed' ? 'Finer surface unavailable. Base geometry retained.' : 'Preparing finer surface.'
          : 'Base surface active.'}</p>
    </> : <p>No finer surface is bundled for this region.</p>}
    <small>View files restore the base surface. Selecting another region resets this control. Finer sampling adds no tissue or cellular anatomy.</small>
  </section>;
}
