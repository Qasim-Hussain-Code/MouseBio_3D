import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const packages = ['react', 'react-dom', 'scheduler', 'three'];
const parts = ['MouseBio_3D distribution license notices\n',
  'Original application code is copyright 2026 Qasim Hussain.\n',
  await readFile(new URL('LICENSE', root), 'utf8')];

for (const name of packages) {
  const directory = new URL(`node_modules/${name}/`, root);
  const metadata = JSON.parse(await readFile(new URL('package.json', directory), 'utf8'));
  const license = await readFile(new URL('LICENSE', directory), 'utf8');
  parts.push(`\n${'='.repeat(72)}\n${metadata.name} ${metadata.version}\nhttps://www.npmjs.com/package/${metadata.name}\n\n${license.trim()}\n`);
}
parts.push('\nDigimouse geometry and adapted atlas metadata are separately licensed CC BY-SA 4.0.\nDigimouse, Belma Dogdas, David Stout, Arion F. Chatziioannou and Richard M. Leahy, USC/UCLA, 2007.\nSource: https://neuroimage.usc.edu/neuro/Digimouse\nLicense: https://creativecommons.org/licenses/by-sa/4.0/\nGeometry adaptation: Qasim Hussain, MouseBio_3D. See atlas/LICENSE.md and atlas-volume/LICENSE.md for tetrahedral boundary and registered-volume surface modifications.\n');
parts.push('\nHindlimb source surfaces and source labels are licensed CC BY 4.0.\nCharles JP, Cappellari O, Spence AJ, Hutchinson JR and Wells DJ, 2016, S1 Figure.\nSource: https://doi.org/10.1371/journal.pone.0147669.s002\nLicense: https://creativecommons.org/licenses/by/4.0/\nGeometry adaptation: Qasim Hussain, MouseBio_3D. See atlas-hindlimb/LICENSE.md for the source and conversion details.\n');
parts.push('\nEMA147 source surfaces and source labels are licensed CC BY 4.0.\nRuffins S, Jacobs R, Armit C, Burton N, Hill B and Baldock R, 2017, University of Edinburgh.\nSource: https://doi.org/10.7488/ds/2167\nLicense: https://creativecommons.org/licenses/by/4.0/\nNative-coordinate adaptation: Qasim Hussain, MouseBio_3D. Units remain unknown. See atlas-ema147/LICENSE.md for source and processing details.\n');
parts.push('\nOntology candidate registry: proposed source-label associations, CC BY-SA 4.0.\nMouse adult gross anatomy ontology terms and labels: Mouse Genome Informatics, The Jackson Laboratory, CC BY 4.0.\nSource license: https://www.informatics.jax.org/mgihome/other/copyright.shtml\nTerm records: https://www.ebi.ac.uk/ols4/ontologies/ma\nThe registry preserves Digimouse attribution and does not establish exact or expert-reviewed anatomical mappings.\n');
parts.push("\nNeuroMorpho.Org NMO_130632 numeric SWC derivative is licensed CC BY 4.0.\nScala F, Kobak D, Shan S, et al. Layer 4 of mouse neocortex differs in cell types and circuit organization between sensory areas. Nature Communications. 2019;10:4174. doi:10.1038/s41467-019-12058-z.\nNeuroMorpho.Org (RRID:SCR_002145). Source: https://neuromorpho.org/api/neuron/id/130632\nTecuatl C, Ljungquist B, Ascoli GA. Accelerating the continuous community sharing of digital neuromorphology data. FASEB Bioadv. 2024;6(7):207-221. doi:10.1096/fba.2024-00048.\nLicense: https://creativecommons.org/licenses/by/4.0/\nNumeric-only adaptation: Qasim Hussain, MouseBio_3D. Original contact and machine headers are omitted; source coordinates, sample IDs and parent links are retained. See atlas-neuron/LICENSE.md for attribution and processing.\n");
parts.push("\nMouseMapper predicted regional nerve polyline derivative: Apache License 2.0.\nSource: erturklab/mouseMapper, commit 7fe04a9ccf37664d76fe548ae226147c0023ceb7, graph_module/example_data/4x_graph/patch_volume_4X_0_pred.\nKaltenecker D, Horvath I, Al-Maskari R, et al. A deep-learning framework reveals whole-body perturbations at cell level. Nature. 2026;655:1016-1026. doi:10.1038/s41586-026-10535-2.\nLicense: https://www.apache.org/licenses/LICENSE-2.0\nNumeric-only adaptation: Qasim Hussain, MouseBio_3D. Original point and path order retained; inconsistent radius fields omitted. See atlas-nerve/LICENSE.md for the complete source license and modifications.\n");
parts.push("\nMVN1 regional cortical vascular polyline derivative: CC BY 4.0.\nSchmid F, Conti G, Jenny P and Weber B, 2021. Dataset doi:10.5281/zenodo.5115640, version 1. Related study: doi:10.7554/eLife.60208.\nOriginal reconstruction: Blinder P, Tsai PS, Kaufhold JP, Knutsen PM, Suhl H and Kleinfeld D. The cortical angiome: an interconnected vascular network with noncolumnar patterns of blood flow. Nature Neuroscience. 2013;16:889-897. doi:10.1038/nn.3426.\nSimulation preprocessing: Schmid F, Tsai PS, Kleinfeld D, Jenny P and Weber B. Depth-dependent flow and pressure characteristics in cortical microvascular networks. PLoS Computational Biology. 2017;13:e1005392. doi:10.1371/journal.pcbi.1005392.\nLicense: https://creativecommons.org/licenses/by/4.0/\nNumeric-only adaptation: Qasim Hussain, MouseBio_3D. Source sampled paths and topology identities retained separately. Flow, pressure, hematocrit, effective diameters and model vessel categories omitted. See atlas-vascular/LICENSE.md for attribution and modifications.\n");
parts.push("\nBondarenko 2004 apical mouse ventricular-cell model adaptation: CC BY 3.0.\nBondarenko VE, Szigeti GP, Bett GCL, Kim SJ and Rasmusson RL. Computer model of action potential of mouse ventricular myocytes. Am J Physiol Heart Circ Physiol. 2004;287:H1378-H1403. doi:10.1152/ajpheart.00185.2003.\nCellML credits: Catherine Lloyd, Penny J Noble and James R Lawson. Repository: Lloyd CM, Lawson JR, Hunter PJ and Nielsen PF. The CellML Model Repository. Bioinformatics. 2008;24:2122-2123. doi:10.1093/bioinformatics/btn390.\nSource revision: 94d9d4f47495d86fec040f5439c7e3a4ffccb611.\nLicense: https://creativecommons.org/licenses/by/3.0/\nAdaptation: Qasim Hussain, MouseBio_3D. Original contact and editor metadata omitted. An optional mathematical transition substitution is disclosed separately from the archived source equations. No independent physiological validation is claimed. See models/bondarenko-apical/LICENSE.md. Original numerical integration and interface code: MIT.\n");
const expected = parts.join('\n');
const destination = new URL('public/THIRD_PARTY_NOTICES.txt', root);
if (process.argv.includes('--check')) {
  let actual;
  try { actual = await readFile(destination, 'utf8'); } catch {}
  if (actual !== expected) {
    console.error('Distribution notices are missing or stale. Run npm run notices.');
    process.exitCode = 1;
  } else console.log('Distribution notices match the installed runtime dependency versions.');
} else {
  await writeFile(destination, expected);
  console.log(`Wrote ${fileURLToPath(destination)}`);
}
