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
parts.push('\nOntology candidate registry: proposed source-label associations, CC BY-SA 4.0.\nMouse adult gross anatomy ontology terms and labels: Mouse Genome Informatics, The Jackson Laboratory, CC BY 4.0.\nSource license: https://www.informatics.jax.org/mgihome/other/copyright.shtml\nTerm records: https://www.ebi.ac.uk/ols4/ontologies/ma\nThe registry preserves Digimouse attribution and does not establish exact or expert-reviewed anatomical mappings.\n');
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
