# MouseBio_3D

A three-dimensional laboratory mouse that runs in the browser. Peel it from the coat to the skeleton, zoom from the whole animal down to the quarks of a proton, and practise procedures at a dissection bench with guided tutorials. Every part says what it rests on.

MouseBio_3D is built on the CT and cryosection images of one real specimen, the [Digimouse](https://neuroimage.usc.edu/neuro/Digimouse_Download) atlas, and on openly licensed datasets and published descriptions. It needs no account, no server of its own and no special hardware, and your data never leave your device.

## Features

- **A living mouse with every layer.** 434 structures: coat, skin, fat, named muscles, more than a hundred named bones from the CT, organs, vessels, nerves, glands and membranes. The mouse breathes, its heart beats, it follows the pointer and walks about the room. The motion is illustrative and can be paused or switched off.
- **Zoom through the layers.** Scrolling opens the mouse at the spot under the pointer, layer by layer in the order they lie there, then goes on into the tissue, its cells, a measured molecule, an atom and a proton. **Play** takes the whole journey on its own, about thirteen orders of magnitude, and back.
- **Dissection bench.** Gloved hands work in real time with clippers, scalpel, scissors, forceps, bone cutters, probe, ligature, needle and suture, swab and syringe. Fifteen step-by-step tutorials follow published protocols, from a necropsy to opening and closing the abdomen, blood sampling and injections. The hands can demonstrate any step or a whole procedure.
- **Sources and evidence.** Each structure is marked as taken from the source atlas (36), traced from its images (152) or simulated from published descriptions (246), with linked citations. One page lists every structure, every work cited, every level of the zoom and the licences.
- **Eight scientific references.** Besides the living mouse: two Digimouse models, a micro-CT trunk, a hindlimb, an embryo atlas (EMA147), a neuron reconstruction, cortical microvessels and a nerve graph, each kept in its own coordinate frame.
- **Your data on the model.** Import measurements as CSV or JSON and see them mapped onto the anatomy, compare two conditions side by side, and open your own SWC neuron tracings.
- **Models of physiology.** A mouse ventricular cell model (Bondarenko et al. 2004), and flow and signal models along vessel and nerve paths, each labelled with its assumptions.

## Get started

Requires Node.js 22.12 or later and a browser with WebGL2.

```bash
npm ci
npm run dev
```

Open the address that `npm run dev` prints. To build the static site, run `npm run build`; the result in `dist/` can be served by any static host, or locally with `python3 scripts/serve_prototype.py`. For a static host, `npm run build:host` also stores the models gzip-compressed, about 58 % smaller in all; the app unpacks each one as it downloads and checks it against its registered checksum.

## Data formats

Observations are CSV files with the columns `structure_id,measurement,value,unit,replicate,condition,time_point`, or JSON following the [data model](docs/data-model.md), up to 5 MiB and 20,000 rows. Neuron tracings are SWC files up to 2 MiB and 100,000 samples. Saved views are JSON files bound to the reference they were made on. See the [guide](docs/guide.md) for every format and limit.

## Privacy

Everything runs in the browser. Imported files and observations stay in its memory and are not uploaded; there is no account, analytics or tracking.

## Scientific scope

The living mouse is a constructed model of one male specimen in a simulated standing posture. Simulated parts follow published descriptions, are marked as simulated wherever they appear and are not measurements. Below the tissue, the zoom shows representative levels, not data from the specimen. The tutorials are practice on a simulated animal and do not replace supervised training or an approved animal protocol. The [guide](docs/guide.md), the methods documents in [docs](docs) and the [acceptance records](docs/acceptance.md) give the details and the checks.

## Licences

The source code is MIT and the documentation CC BY 4.0. Models and metadata derived from Digimouse remain CC BY-SA 4.0, and the other datasets keep their own open licences (CC BY 4.0, CC BY 3.0, CC0 and Apache-2.0). [LICENSES.md](LICENSES.md) and the notices beside each dataset give the attribution.
