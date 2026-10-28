import type { Atlas } from './types';
import type { AnatomyGroup, AnatomyGroupsResult } from './anatomy-groups';

/** Source filenames retain Ruffins et al., 2017, CC BY 4.0 attribution; see LICENSES.md. */
const SOURCE_FILES: readonly string[] = Object.freeze([
  "Surfaces/EMAPA16098_head_mesenchyme.stl",
  "Surfaces/EMAPA16105_heart.stl",
  "Surfaces/EMAPA16247_gut.stl",
  "Surfaces/EMAPA16668_dorsal_root_ganglion.stl",
  "Surfaces/EMAPA16678_optic_stalk.stl",
  "Surfaces/EMAPA16706_pharynx.stl",
  "Surfaces/EMAPA16728_lung.stl",
  "Surfaces/EMAPA16797_trigeminal_V_ganglion.stl",
  "Surfaces/EMAPA16833_esophagus.stl",
  "Surfaces/EMAPA16846_liver.stl",
  "Surfaces/EMAPA16849_main_bronchus.stl",
  "Surfaces/EMAPA16896_diencephalon.stl",
  "Surfaces/EMAPA16974_midbrain.stl",
  "Surfaces/EMAPA16979_midbrain_ventricular_layer.stl",
  "Surfaces/EMAPA17021_stomach.stl",
  "Surfaces/EMAPA17161_cornea.stl",
  "Surfaces/EMAPA17167_perioptic_mesenchyme.stl",
  "Surfaces/EMAPA17172_pigmented_retinal_epithelium.stl",
  "Surfaces/EMAPA17185_tongue.stl",
  "Surfaces/EMAPA17296_posterior_semicircular_canal.stl",
  "Surfaces/EMAPA17302_hyaloid_cavity.stl",
  "Surfaces/EMAPA17307_basilar_artery.stl",
  "Surfaces/EMAPA17373_metanephros.stl",
  "Surfaces/EMAPA17503_pancreas.stl",
  "Surfaces/EMAPA17525_skin.stl",
  "Surfaces/EMAPA17533_epithalamus_mantle_layer.stl",
  "Surfaces/EMAPA17535_epithalamus_ventricular_layer.stl",
  "Surfaces/EMAPA17544_cerebral_cortex.stl",
  "Surfaces/EMAPA17550_medulla_oblongata.stl",
  "Surfaces/EMAPA17563_pons.stl",
  "Surfaces/EMAPA17576_trigeminal_V_nerve.stl",
  "Surfaces/EMAPA17577_spinal_cord.stl",
  "Surfaces/EMAPA17608_nasal_septum.stl",
  "Surfaces/EMAPA17635_Meckel_s_cartilage.stl",
  "Surfaces/EMAPA17639_maxilla.stl",
  "Surfaces/EMAPA17670_nasopharynx.stl",
  "Surfaces/EMAPA17674_cervical_vertebra.stl",
  "Surfaces/EMAPA17682_temporal_bone.stl",
  "Surfaces/EMAPA17701_diaphragm.stl",
  "Surfaces/EMAPA17787_cerebellum.stl",
  "Surfaces/EMAPA17795_cerebral_aqueduct.stl",
  "Surfaces/EMAPA17824_ossicle.stl",
  "Surfaces/EMAPA17838_lens.stl",
  "Surfaces/EMAPA17852_nasal_capsule.stl",
  "Surfaces/EMAPA17888_stomach_fundus_epithelium.stl",
  "Surfaces/EMAPA17962_ovary.stl",
  "Surfaces/EMAPA18010_rib.stl",
  "Surfaces/EMAPA18017_frontal_bone_primordium.stl",
  "Surfaces/EMAPA18028_pelvic_girdle_skeleton.stl",
  "Surfaces/EMAPA18143_calcaneum_cartilage_condensation.stl",
  "Surfaces/EMAPA18290_mandible.stl",
  "Surfaces/EMAPA18321_bladder.stl",
  "Surfaces/EMAPA18328_Mullerian_tubercle.stl",
  "Surfaces/EMAPA18344_sternum.stl",
  "Surfaces/EMAPA18415_vena_cava.stl",
  "Surfaces/EMAPA18426_adrenal_gland.stl",
  "Surfaces/EMAPA18535_spleen_primordium.stl",
  "Surfaces/EMAPA18544_pineal_primordium.stl",
  "Surfaces/EMAPA18590_neural_retina.stl",
  "Surfaces/EMAPA18601_aorta.stl",
  "Surfaces/EMAPA18705_basioccipital_bone.stl",
  "Surfaces/EMAPA18708_exoccipital_bone.stl",
  "Surfaces/EMAPA18721_clavicle.stl",
  "Surfaces/EMAPA18722_scapula.stl",
  "Surfaces/EMAPA19103_radius.stl",
  "Surfaces/EMAPA19104_ulna.stl",
  "Surfaces/EMAPA19106_humerus.stl",
  "Surfaces/EMAPA19141_fibula.stl",
  "Surfaces/EMAPA19142_tibia.stl",
  "Surfaces/EMAPA19143_femur.stl",
  "Surfaces/EMAPA19209_brown_fat.stl",
  "Surfaces/EMAPA19431_C1_vertebra.stl",
  "Surfaces/EMAPA19432_C2_vertebra.stl",
  "Surfaces/EMAPA25135_masseter.stl",
  "Surfaces/EMAPA28601_urothelium_of_bladder.stl",
  "Surfaces/EMAPA35998_pituitary_gland.stl",
  "Surfaces/reference.stl"
]);
function group(id: string, title: string, ids: readonly string[], description: string, limitations: readonly string[]): AnatomyGroup {
  return Object.freeze({ id, title, structureIds: Object.freeze([...ids]), description, limitations: Object.freeze([...limitations]) });
}
export function buildEma147Groups(atlas: Atlas): AnatomyGroupsResult {
  const fail = () => Object.freeze({ ok: false, groups: Object.freeze([]), errors: Object.freeze(['EMA147 display groups require the exact reviewed source inventory and uncalibrated frame.']) });
  if (atlas.assetFormat !== 'ply-native-v1' || atlas.coordinateFrame.id !== 'emouseatlas-ema147-stl-native-v1'
      || atlas.coordinateFrame.sourceUnits !== 'unknown' || atlas.coordinateFrame.sourceToAssetScale !== 1
      || atlas.source.archiveSha256 !== 'efd5df6df9b69cf21a62d1f4245ecc5419ee4e5c4c72635f444ce3fba5b7971c'
      || atlas.source.license !== 'CC-BY-4.0' || atlas.structures.length !== SOURCE_FILES.length) return fail();
  const ids = new Set<string>();
  for (const [index, filename] of SOURCE_FILES.entries()) {
    const region = atlas.structures[index] as typeof atlas.structures[number] & Record<string, unknown>;
    const match = /^Surfaces\/EMAPA([0-9]+)_/.exec(filename);
    const id = match ? `ema147:EMAPA:${match[1]}` : 'ema147:reference';
    if (region.id !== id || ids.has(id) || region.sourceFile !== filename || region.sourceRegionIndex !== index
        || region.sourceLabel !== filename.slice('Surfaces/'.length, -4)) return fail();
    ids.add(id);
  }
  const all = atlas.structures.map(region => region.id);
  // Exact deposited filename stems, not inferred system or ontology mappings.
  const fromSourceLabels = (labels: readonly string[]) => atlas.structures
    .filter(region => labels.includes(String(region.sourceLabel))).map(region => region.id);
  const common = ['Physical source units and anatomical orientation remain unknown.',
    'Source topology defects and conflicting age claims remain unresolved; these selections add no geometry or registration.',
    'Display selections may overlap; they are not partitions or formal anatomical system classifications.',
    'Selections do not establish complete organs or systems, laterality or biological connectivity.'];
  const groups = [
    group('whole-mouse', 'All native source surfaces', all, 'All 77 deposited surfaces, including the unannotated reference surface.', common),
    group('named-surfaces', 'EMAPA-labelled source surfaces', all.filter(id => id !== 'ema147:reference'), 'The 76 source filenames carrying EMAPA identifiers.',
      [...common, 'Only 68 identifiers match the separate anatomy index; file order and similar names do not establish correspondence.']),
    group('internal-surfaces', 'Named surfaces without skin', all.filter(id => id !== 'ema147:EMAPA:17525' && id !== 'ema147:reference'),
      'The 75 named source surfaces after excluding only the file labelled skin and the unannotated reference file.',
      [...common, 'This filename-based exclusion does not establish that every selected surface is anatomically internal or that the skin is a closed envelope.']),
    group('neural-surfaces', 'Selected neural-labelled surfaces', fromSourceLabels([
      'EMAPA16668_dorsal_root_ganglion', 'EMAPA16678_optic_stalk', 'EMAPA16797_trigeminal_V_ganglion',
      'EMAPA16896_diencephalon', 'EMAPA16974_midbrain', 'EMAPA16979_midbrain_ventricular_layer',
      'EMAPA17533_epithalamus_mantle_layer', 'EMAPA17535_epithalamus_ventricular_layer', 'EMAPA17544_cerebral_cortex',
      'EMAPA17550_medulla_oblongata', 'EMAPA17563_pons', 'EMAPA17576_trigeminal_V_nerve', 'EMAPA17577_spinal_cord',
      'EMAPA17787_cerebellum', 'EMAPA18590_neural_retina',
    ]), 'Selected source filenames naming brain regions and layers, spinal cord, ganglia, optic stalk, trigeminal nerve and neural retina.',
      [...common, 'The selection is incomplete neural coverage and supplies no reviewed innervation graph, functional connections or developmental lineage.']),
    group('bone-cartilage', 'Explicit bone and cartilage labels', fromSourceLabels([
      'EMAPA17635_Meckel_s_cartilage', 'EMAPA17682_temporal_bone', 'EMAPA18017_frontal_bone_primordium',
      'EMAPA18143_calcaneum_cartilage_condensation', 'EMAPA18705_basioccipital_bone', 'EMAPA18708_exoccipital_bone',
    ]), 'The six deposited filenames explicitly containing bone or cartilage, retaining the source primordium and condensation wording.',
      [...common, 'Other named skeletal regions are omitted from this narrow filename selection. These labels do not establish mineralization, ossification state or a complete skeleton.']),
    group('tissue-layers', 'Explicit tissue and layer labels', fromSourceLabels([
      'EMAPA16098_head_mesenchyme', 'EMAPA16979_midbrain_ventricular_layer', 'EMAPA17167_perioptic_mesenchyme',
      'EMAPA17172_pigmented_retinal_epithelium', 'EMAPA17533_epithalamus_mantle_layer',
      'EMAPA17535_epithalamus_ventricular_layer', 'EMAPA17888_stomach_fundus_epithelium', 'EMAPA28601_urothelium_of_bladder',
    ]), 'The eight source filenames explicitly naming mesenchyme, a layer, epithelium or urothelium.',
      [...common, 'This is not an exhaustive tissue inventory, microscopic histological reconstruction or cellular anatomy. Layer-labelled surfaces also occur in the neural selection.']),
    group('vessels', 'Selected vessel-labelled surfaces', [17307, 18415, 18601].map(id => `ema147:EMAPA:${id}`),
      'The source files labelled basilar artery, vena cava and aorta.', [...common, 'This selection does not establish a complete vascular network, connectivity or blood flow.']),
    group('trigeminal', 'Trigeminal-labelled surfaces', [16797, 17576].map(id => `ema147:EMAPA:${id}`),
      'The source files labelled trigeminal V ganglion and trigeminal V nerve.', [...common, 'This is incomplete neural coverage and not an independently reviewed innervation graph.']),
    group('reference', 'Unannotated reference surface', ['ema147:reference'], 'The deposited reference.stl file only.',
      [...common, 'No anatomical identity or correspondence with a mouse label in another file is asserted.']),
  ];
  return Object.freeze({ ok: true, groups: Object.freeze(groups), errors: Object.freeze([]) });
}
