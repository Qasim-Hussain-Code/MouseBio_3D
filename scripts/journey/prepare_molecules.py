"""Reduce Protein Data Bank coordinate files to the compact files used by the zoom below the cells of each tissue.

Usage: python -I scripts/journey/prepare_molecules.py <directory of mmCIF files> public/scale-journey

The source files are from https://files.rcsb.org/download/ and are not kept in this repository. Where a molecule is whole only
as a biological assembly the assembly file of the same entry is used, so that the copies are placed by the operators stated in
the entry. Coordinates, chains and residue numbers are copied unchanged, rounded to 0.01 angstrom. Water, hydrogen and alternate
positions other than the first are left out, as are the groups named under "drop". Output is deterministic for the same sources.
"""
import hashlib
import json
import shlex
import sys
from pathlib import Path

CC0 = "CC0 1.0, as stated in the wwPDB usage policies"

MOLECULES = {
    "complex-i": {
        "entry": "6G2J", "file": "6G2J.cif", "sha256": "aa26f279026e2a63092cee4df378050413fe7a164d573545af94704b258ba5fe",
        "title": "Mouse mitochondrial complex I in the active state", "method": "Electron microscopy", "resolutionAngstrom": 3.3, "organisms": "Mus musculus, heart",
        "citation": "Agip AA, Blaza JN, Bridges HR, Viscomi C, Rawson S, Muench SP, Hirst J. Cryo-EM structures of complex I from mouse heart mitochondria in two biochemically defined states. Nat Struct Mol Biol 2018;25(7):548-556. doi:10.1038/s41594-018-0073-1",
        "note": "From the mitochondria of mouse heart. It is not from the Digimouse specimen.",
        "groups": [
            {"name": "Iron-sulfur clusters", "colour": "#f28a2c", "comps": ["SF4", "FES"], "label": "Iron-sulfur clusters"},
            {"name": "Flavin", "colour": "#e6c12e", "comps": ["FMN"], "label": "Flavin, where electrons enter"},
            {"name": "Lipids", "colour": "#e8dcb8", "comps": ["3PE", "PC1", "CDL"]},
            {"name": "Protein chains", "colour": "#7fa3c9", "palette": True, "label": "One of the protein chains"},
        ],
        "focus": {"farthest": ["SF4", "FE", "FMN"]},
    },
    "thin-filament": {
        "entry": "3J8A", "file": "3J8A.cif", "sha256": "bda3ab6e658e9980f061be6efdd8e7e4eaa33a0d62fe8af77faa13dfe4b122a4",
        "title": "Structure of the F-actin-tropomyosin complex", "method": "Electron microscopy", "resolutionAngstrom": 3.7, "organisms": "Actin of rabbit skeletal muscle, tropomyosin of mouse",
        "citation": "von der Ecken J, Muller M, Lehman W, Manstein DJ, Penczek PA, Raunser S. Structure of the F-actin-tropomyosin complex. Nature 2015;519(7541):114-7. doi:10.1038/nature14033",
        "note": "A filament assembled from purified proteins. The actin is of rabbit and the tropomyosin of mouse. Tropomyosin was resolved to 6.5 angstrom only.",
        "groups": [
            {"name": "Nucleotide", "colour": "#f28a2c", "comps": ["ADP", "MG"], "label": "ADP in an actin"},
            {"name": "Tropomyosin", "colour": "#74ab6d", "chains": ["F", "G"], "label": "Tropomyosin"},
            {"name": "Actin", "colour": "#c9a57f", "palette": True, "label": "Actin"},
        ],
        "focus": {"comp": "ADP", "chain": "C", "atom": "PB"},
    },
    "collagen": {
        "entry": "1CAG", "file": "1CAG.cif", "sha256": "14ee640d8bd3a61edee5c1bcdb7e749a60bf1d3872740e46fd8e5c31977cab70",
        "title": "Crystal and molecular structure of a collagen-like peptide at 1.9 angstrom resolution", "method": "X-ray diffraction", "resolutionAngstrom": 1.85, "organisms": "None: a synthetic peptide",
        "citation": "Bella J, Eaton M, Brodsky B, Berman HM. Crystal and molecular structure of a collagen-like peptide at 1.9 A resolution. Science 1994;266(5182):75-81. doi:10.1126/science.7695699",
        "note": "A synthetic peptide with the repeating pattern of collagen and one glycine replaced by alanine. It is a short stand-in and is not collagen from a mouse.",
        "drop": ["ACY"],
        "groups": [
            {"name": "Hydroxyproline", "colour": "#d9722e", "comps": ["HYP"], "label": "Hydroxyproline"},
            {"name": "The three chains", "colour": "#d8c79a", "palette": True, "label": "One of three chains"},
        ],
        "focus": {"comp": "ALA", "chain": "A", "atom": "CB"},
    },
    "ampa-receptor": {
        "entry": "7LEP", "file": "7LEP.cif", "sha256": "562b75c7c36f1b49dd8e79f281f86e246d150a064cb432389f28e2e189abc57a",
        "title": "The composite LBD-TMD structure combined from all hippocampal AMPAR subtypes at 3.25 angstrom resolution", "method": "Electron microscopy", "resolutionAngstrom": 3.25, "organisms": "Mus musculus, hippocampus",
        "citation": "Yu J, Rao P, Clark S, Mitra J, Ha T, Gouaux E. Hippocampal AMPA receptor assemblies and mechanism of allosteric inhibition. Nature 2021;594(7863):448-453. doi:10.1038/s41586-021-03540-0",
        "note": "Purified from mouse hippocampus and held with bound inhibitors. A composite of the subtypes found there, without the outer part of the receptor. It is not from the Digimouse specimen.",
        "groups": [
            {"name": "Bound inhibitors", "colour": "#f28a2c", "comps": ["ZK1", "XVD"], "label": "A bound inhibitor"},
            {"name": "Lipids", "colour": "#e8dcb8", "comps": ["POV", "C14", "D10", "OCT", "D12"]},
            {"name": "Auxiliary subunits", "colour": "#74ab6d", "chains": ["E", "F", "G", "H"], "label": "Auxiliary subunit"},
            {"name": "Receptor subunits", "colour": "#7fa3c9", "palette": True, "label": "Receptor subunit"},
        ],
        "focus": {"comp": "ZK1", "chain": "A", "atom": "C1", "any": True},
    },
    "potassium-channel": {
        "entry": "2A79", "file": "2A79-assembly1.cif", "sha256": "e49aa3644ceaa8800ebc07c412d1d72b7e6dfc46028992b4b3691b570397e79b", "assembly": True,
        "title": "Mammalian Shaker Kv1.2 potassium channel-beta subunit complex", "method": "X-ray diffraction", "resolutionAngstrom": 2.9, "organisms": "Rattus norvegicus",
        "citation": "Long SB, Campbell EB, MacKinnon R. Crystal structure of a mammalian voltage-dependent Shaker family K+ channel. Science 2005;309(5736):897-903. doi:10.1126/science.1116269",
        "note": "A channel of the rat, made in yeast, and the channel of the mouse is not known from this entry. The biological assembly has four copies of each chain. Parts of the voltage sensors were built only as chains of unknown sequence.",
        "groups": [
            {"name": "Potassium ions", "colour": "#a05ad9", "comps": ["K"], "label": "Potassium ions in the pore"},
            {"name": "NADP", "colour": "#f28a2c", "comps": ["NAP"]},
            {"name": "Beta subunits", "colour": "#c9a57f", "chains": ["B"], "label": "Beta subunit"},
            {"name": "Chains of unknown sequence", "colour": "#bbbbbb", "chains": ["C", "D"]},
            {"name": "Channel subunits", "colour": "#7fa3c9", "palette": True, "label": "Channel subunit"},
        ],
        "focus": {"comp": "K", "chain": "A", "any": True},
    },
    "antibody": {
        "entry": "1IGT", "file": "1IGT.cif", "sha256": "d7b1a560ed993c7be669a15530b64f37e2af8e978c321a5779d20ab75746b63f",
        "title": "Structure of immunoglobulin", "method": "X-ray diffraction", "resolutionAngstrom": 2.8, "organisms": "Mus musculus",
        "citation": "Harris LJ, Larson SB, Hasel KW, McPherson A. Refined structure of an intact IgG2a monoclonal antibody. Biochemistry 1997;36(7):1581-97. doi:10.1021/bi962514+",
        "note": "A monoclonal mouse IgG2a raised against canine lymphoma, from a cultured line. It is not from the Digimouse specimen.",
        "groups": [
            {"name": "Sugars", "colour": "#f28a2c", "comps": ["NAG", "BMA", "MAN", "GAL", "FUL", "FUC"], "label": "Sugars"},
            {"name": "Light chains", "colour": "#d8c79a", "chains": ["A", "C"], "label": "Light chain"},
            {"name": "Heavy chains", "colour": "#7fa3c9", "chains": ["B", "D"], "label": "Heavy chain"},
        ],
        "focus": {"comp": "NAG", "chain": "B", "atom": "C1", "any": True},
    },
    "fatty-acid-protein": {
        "entry": "1LID", "file": "1LID.cif", "sha256": "95d47089544bea60ef097a135d21e65cc1e832e27752957902b39e43691a1ee5",
        "title": "The adipocyte lipid-binding protein at 1.6 angstrom resolution: crystal structure with bound oleic acid", "method": "X-ray diffraction", "resolutionAngstrom": 1.6, "organisms": "Mus musculus, made in Escherichia coli",
        "citation": "Xu Z, Bernlohr DA, Banaszak LJ. The adipocyte lipid-binding protein at 1.6-A resolution. Crystal structures of the apoprotein and with bound saturated and unsaturated fatty acids. J Biol Chem 1993;268(11):7874-84. PMID 8463311",
        "note": "A recombinant protein with oleic acid bound inside it. It is not from the Digimouse specimen.",
        "groups": [
            {"name": "Oleic acid", "colour": "#f2b22c", "comps": ["OLA"], "label": "Oleic acid, a fatty acid"},
            {"name": "Protein", "colour": "#d09a9a", "label": "The protein round it"},
        ],
        "focus": {"comp": "OLA", "atom": "C9", "any": True},
    },
    "rhodopsin": {
        "entry": "1F88", "file": "1F88.cif", "sha256": "6bc49951984686f3ac98a0d98873b08dd545379ae305ddc973c86667f123a410",
        "title": "Crystal structure of bovine rhodopsin", "method": "X-ray diffraction", "resolutionAngstrom": 2.8, "organisms": "Bos taurus",
        "citation": "Palczewski K, Kumasaka T, Hori T, Behnke CA, Motoshima H, Fox BA, Le Trong I, Teller DC, Okada T, Stenkamp RE, Yamamoto M, Miyano M. Crystal structure of rhodopsin: A G protein-coupled receptor. Science 2000;289(5480):739-45. doi:10.1126/science.289.5480.739",
        "note": "Rhodopsin of the cow, purified from retinas, in the dark state. The two molecules are those of the crystal.",
        "drop": ["HG", "ZN"],
        "groups": [
            {"name": "Retinal", "colour": "#f28a2c", "comps": ["RET"], "label": "Retinal, which takes up light"},
            {"name": "Sugars", "colour": "#d8c79a", "comps": ["NAG", "MAN"]},
            {"name": "Rhodopsin", "colour": "#c07f9f", "palette": True, "label": "Rhodopsin"},
        ],
        "focus": {"comp": "RET", "chain": "A", "atom": "C15"},
    },
    "crystallin": {
        "entry": "1ZWM", "file": "1ZWM.cif", "sha256": "d5650aa02c201d8362c7e6140764a7d9875805f3e4c3314cc992845d8ef3b595",
        "title": "NMR structure of murine gamma-S crystallin", "method": "Solution NMR, first model", "resolutionAngstrom": None, "organisms": "Mus musculus",
        "citation": "Wu Z, Delaglio F, Wyatt K, Wistow G, Bax A. Solution structure of gammaS-crystallin by molecular fragment replacement NMR. Protein Sci 2005;14(12):3101-14. doi:10.1110/ps.051635205",
        "note": "A recombinant protein in solution. The first of the twenty models of the entry, which differ most in the flexible parts.",
        "groups": [{"name": "Gamma-S crystallin", "colour": "#9fb9c9", "label": "Gamma-S crystallin"}],
        "focus": {"centre": "C"},
    },
    "aquaporin": {
        "entry": "1J4N", "file": "1J4N-assembly1.cif", "sha256": "c3bf15a85051ebc27f3ff8e21c44437d308d46f43c0840622577d0cb034a32b6", "assembly": True,
        "title": "Crystal structure of the AQP1 water channel", "method": "X-ray diffraction", "resolutionAngstrom": 2.2, "organisms": "Bos taurus",
        "citation": "Sui H, Han BG, Lee JK, Walian P, Jap BK. Structural basis of water-specific transport through the AQP1 water channel. Nature 2001;414(6866):872-8. doi:10.1038/414872a",
        "note": "Aquaporin 1 of the cow. The biological assembly has four copies of the chain, and each has its own pore.",
        "drop": ["BNG"],
        "groups": [{"name": "Aquaporin 1", "colour": "#7fb3c9", "palette": True, "label": "One of four subunits"}],
        "focus": {"comp": "HIS", "residue": 182, "chain": "A", "atom": "NE2"},
    },
    "urinary-protein": {
        "entry": "1I04", "file": "1I04.cif", "sha256": "0db078fc2e8e7143b24e2176b9904bb7a30765f4c319b3ce77ab548fdc5f8650",
        "title": "Crystal structure of mouse major urinary protein-I from mouse liver", "method": "X-ray diffraction", "resolutionAngstrom": 2.0, "organisms": "Mus musculus, liver",
        "citation": "Timm DE, Baker LJ, Mueller H, Zidek L, Novotny MV. Structural basis of pheromone binding to mouse major urinary protein (MUP-I). Protein Sci 2001;10(5):997-1004. doi:10.1110/ps.52201",
        "note": "Purified from mouse liver. It is not from the Digimouse specimen.",
        "groups": [{"name": "Major urinary protein", "colour": "#d8c07f", "label": "Major urinary protein"}],
        "focus": {"centre": "C"},
    },
    "surfactant-protein": {
        "entry": "6VZ0", "file": "6VZ0.cif", "sha256": "1ff84d57a4b266121e359b74a5a0d545ed118a14f748ed204cfc5c785b5b697f",
        "title": "C-terminal domain of mouse surfactant protein B crystallized at high pH", "method": "X-ray diffraction", "resolutionAngstrom": 1.75, "organisms": "Mus musculus",
        "citation": "Sever N, Milicic G, Bodnar NO, Wu X, Rapoport TA. Mechanism of Lamellar Body Formation by Lung Surfactant Protein B. Mol Cell 2021;81(1):49-66.e8. doi:10.1016/j.molcel.2020.10.042",
        "note": "A recombinant domain of the precursor of surfactant protein B, and not the mature protein. The two molecules are those of the crystal.",
        "drop": ["ZN"],
        "groups": [{"name": "A domain of proSP-B", "colour": "#c9a0c9", "palette": True, "label": "A domain of the precursor"}],
        "focus": {"centre": "C"},
    },
    "tubulin": {
        "entry": "1JFF", "file": "1JFF.cif", "sha256": "25d7bd6ff06bdc0e303c9fc443b58e7c4c37b86a014b219845ab77acc9676f34",
        "title": "Refined structure of alpha-beta tubulin from zinc-induced sheets stabilized with taxol", "method": "Electron crystallography", "resolutionAngstrom": 3.5, "organisms": "Bos taurus",
        "citation": "Lowe J, Li H, Downing KH, Nogales E. Refined structure of alpha beta-tubulin at 3.5 A resolution. J Mol Biol 2001;313(5):1045-57. doi:10.1006/jmbi.2001.5077",
        "note": "Tubulin of the cow, from flat sheets and not a microtubule, held with the drug taxol.",
        "drop": ["ZN"],
        "groups": [
            {"name": "GTP and GDP", "colour": "#f28a2c", "comps": ["GTP", "GDP", "MG"], "label": "GTP"},
            {"name": "Taxol", "colour": "#c23a8c", "comps": ["TA1"], "label": "Taxol, a drug"},
            {"name": "Alpha tubulin", "colour": "#7fa3c9", "chains": ["A"], "label": "Alpha tubulin"},
            {"name": "Beta tubulin", "colour": "#74ab6d", "chains": ["B"], "label": "Beta tubulin"},
        ],
        "focus": {"comp": "GTP", "atom": "PG", "any": True},
    },
    "proton-pump": {
        "entry": "5YLU", "file": "5YLU.cif", "sha256": "f1ad93a8c0f84798404e17df548815b639c2667419ac528044f203f89f458486",
        "title": "Crystal structure of the gastric proton pump complexed with vonoprazan", "method": "X-ray diffraction", "resolutionAngstrom": 2.8, "organisms": "Sus scrofa",
        "citation": "Abe K, Irie K, Nakanishi H, Suzuki H, Fujiyoshi Y. Crystal structures of the gastric proton pump. Nature 2018;556(7700):214-218. doi:10.1038/s41586-018-0003-8",
        "note": "The pump of the pig, with the blocking drug vonoprazan.",
        "drop": ["CE1", "BEF"],
        "groups": [
            {"name": "Vonoprazan", "colour": "#f28a2c", "comps": ["HKT"], "label": "Vonoprazan, a drug"},
            {"name": "Lipids and sugars", "colour": "#e8dcb8", "comps": ["PCW", "NAG", "MG"]},
            {"name": "Alpha chain", "colour": "#d09a7a", "chains": ["A"], "label": "Alpha chain"},
            {"name": "Beta chain", "colour": "#7fa3c9", "chains": ["B"], "label": "Beta chain"},
        ],
        "focus": {"comp": "HKT", "chain": "A", "any": True},
    },
    "keratin": {
        "entry": "6EC0", "file": "6EC0-assembly1.cif", "sha256": "0ad9ae06185ef56c046146710be3cc76be73047b357af5d8508fa228d7826157", "assembly": True,
        "title": "Crystal structure of the wild-type heterocomplex between coil 1B domains of human intermediate filament proteins keratin 1 (KRT1) and keratin 10 (KRT10)", "method": "X-ray diffraction", "resolutionAngstrom": 2.98, "organisms": "Homo sapiens",
        "citation": "Eldirany SA, Ho M, Hinbest AJ, Lomakin IB, Bunick CG. Human keratin 1/10-1B tetramer structures reveal a knob-pocket mechanism in intermediate filament assembly. EMBO J 2019;38(11):e100741. doi:10.15252/embj.2018100741",
        "note": "A short part of keratins of humans, and not of the mouse, made in bacteria. The biological assembly of the entry has two copies of each chain, the tetramer that the authors report.",
        "drop": ["CD", "CO", "NI"],
        "groups": [
            {"name": "Keratin 1", "colour": "#c9a57f", "chains": ["A"], "label": "Keratin 1"},
            {"name": "Keratin 10", "colour": "#7fa3c9", "chains": ["B"], "label": "Keratin 10"},
        ],
        "focus": {"centre": "C"},
    },
    "nutrient-importer": {
        "entry": "5FQ8", "file": "5FQ8.cif", "sha256": "433421583b4c6502ba894e83a51d22c350b7bfe017d2e52c2073f9ebc584eb8d",
        "title": "Crystal structure of the SusCD complex BT2261-2264 from Bacteroides thetaiotaomicron", "method": "X-ray diffraction", "resolutionAngstrom": 2.75, "organisms": "Bacteroides thetaiotaomicron",
        "citation": "Glenwright AJ, Pothula KR, Bhamidimarri SP, Chorev DS, Basle A, Firbank SJ, Zheng H, Robinson CV, Winterhalter M, Kleinekathofer U, Bolam DN, van den Berg B. Structural basis for nutrient acquisition by dominant members of the human gut microbiota. Nature 2017;541(7637):407-411. doi:10.1038/nature20828",
        "note": "From a species of bacterium of the human gut, chosen as an example of Bacteroidetes. No claim is made that this species is in this mouse.",
        "drop": ["KR0", "C8E", "MG", "CA"],
        "groups": [
            {"name": "Bound peptide", "colour": "#f28a2c", "chains": ["P", "Q"], "label": "A bound peptide"},
            {"name": "SusD-like caps", "colour": "#74ab6d", "chains": ["A", "C"], "label": "SusD-like cap"},
            {"name": "SusC-like barrels", "colour": "#7fa3c9", "chains": ["B", "D"], "label": "SusC-like barrel"},
            {"name": "Other chains", "colour": "#c9a57f", "chains": ["E", "F", "G"]},
        ],
        "focus": {"chainOnly": "P"},
    },
}


def atom_rows(text: str) -> list[dict[str, str]]:
    """The _atom_site loop of an mmCIF file as dictionaries. Values in this loop never span lines."""
    lines = text.splitlines()
    for index, line in enumerate(lines):
        if line.startswith("_atom_site.") and lines[index - 1].strip() == "loop_":
            break
    else:
        raise ValueError("No _atom_site loop")
    columns = []
    row = index
    while lines[row].startswith("_atom_site."):
        columns.append(lines[row].split(".", 1)[1].strip())
        row += 1
    out = []
    while row < len(lines) and not lines[row].startswith("#"):
        values = shlex.split(lines[row], posix=True)
        if len(values) == len(columns):
            out.append(dict(zip(columns, values)))
        row += 1
    return out


def base_chain(row: dict[str, str]) -> str:
    return row["auth_asym_id"].split("-")[0]


def group_of(row: dict[str, str], groups: list[dict]) -> int:
    for index, group in enumerate(groups):
        if "comps" in group and row["auth_comp_id"] in group["comps"]:
            return index
        if "chains" in group and base_chain(row) in group["chains"]:
            return index
        if "comps" not in group and "chains" not in group:
            return index
    raise ValueError(f"No group for {row['auth_comp_id']} of chain {row['auth_asym_id']}")


def position(row: dict[str, str]) -> tuple[float, float, float]:
    return float(row["Cartn_x"]), float(row["Cartn_y"]), float(row["Cartn_z"])


def distance_squared(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
    return sum((one - other) ** 2 for one, other in zip(a, b))


def focus_of(rows: list[dict[str, str]], focus: dict) -> int:
    """The atom that the level of atoms is centred on, by a rule stated for each molecule."""
    if "farthest" in focus:
        comp, element, away_from = focus["farthest"]
        away = [position(row) for row in rows if row["auth_comp_id"] == away_from]
        middle = tuple(sum(point[axis] for point in away) / len(away) for axis in range(3))
        candidates = [index for index, row in enumerate(rows) if row["auth_comp_id"] == comp and row["type_symbol"].upper() == element]
        return max(candidates, key=lambda index: distance_squared(position(rows[index]), middle))
    if "centre" in focus:
        middle = tuple(sum(position(row)[axis] for row in rows) / len(rows) for axis in range(3))
        candidates = [index for index, row in enumerate(rows) if row["type_symbol"].upper() == focus["centre"]]
        return min(candidates, key=lambda index: distance_squared(position(rows[index]), middle))
    if "chainOnly" in focus:
        candidates = [index for index, row in enumerate(rows) if row["auth_asym_id"] == focus["chainOnly"] and row["type_symbol"].upper() == "C"]
        return candidates[len(candidates) // 2]
    for index, row in enumerate(rows):
        if row["auth_comp_id"] != focus["comp"]:
            continue
        if "chain" in focus and row["auth_asym_id"] != focus["chain"]:
            continue
        if "residue" in focus and int(row["auth_seq_id"]) != focus["residue"]:
            continue
        if "atom" in focus and row["auth_atom_id"] != focus["atom"] and not focus.get("any"):
            continue
        if focus.get("any") and "atom" in focus and row["auth_atom_id"] != focus["atom"]:
            continue
        return index
    if focus.get("any"):
        # The named atom is not in this group: its first atom of the kind asked for, or its first atom.
        for index, row in enumerate(rows):
            if row["auth_comp_id"] == focus["comp"] and ("chain" not in focus or row["auth_asym_id"] == focus["chain"]):
                return index
        for index, row in enumerate(rows):
            if row["auth_comp_id"] == focus["comp"]:
                return index
    raise ValueError(f"No focus atom for {focus}")


def prepare(key: str, spec: dict, source_dir: Path, target_dir: Path) -> str:
    data = (source_dir / spec["file"]).read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != spec["sha256"]:
        raise ValueError(f"Unexpected source file for {key}: {digest}")
    all_rows = atom_rows(data.decode("utf-8"))
    first_model = all_rows[0]["pdbx_PDB_model_num"]
    drop = set(spec.get("drop", [])) | {"HOH", "DOD"}
    rows = [row for row in all_rows if row["pdbx_PDB_model_num"] == first_model and row["auth_comp_id"] not in drop
            and row["type_symbol"].upper() not in ("H", "D") and row.get("label_alt_id", ".") in (".", "?", "A")]
    if spec.get("assembly"):
        # An ion on the axis of symmetry is the same ion in every copy of the chain, so it is kept once.
        seen: set[tuple[str, float, float, float]] = set()
        kept = []
        for row in rows:
            place = (row["type_symbol"].upper(), *[round(value, 1) for value in position(row)])
            if place not in seen:
                seen.add(place)
                kept.append(row)
        rows = kept
    elements = sorted({row["type_symbol"].upper() for row in rows})
    chains = sorted({row["auth_asym_id"] for row in rows})
    focus = focus_of(rows, spec["focus"])
    groups = [{name: value for name, value in group.items() if name in ("name", "colour", "palette", "label")} for group in spec["groups"]]
    output = {
        "id": f"pdb-{spec['entry'].lower()}",
        "molecule": key,
        "source": {
            "database": "Protein Data Bank", "entry": spec["entry"], "url": f"https://www.rcsb.org/structure/{spec['entry']}",
            "title": spec["title"], "method": spec["method"], "resolutionAngstrom": spec["resolutionAngstrom"], "citation": spec["citation"],
            "organisms": spec["organisms"], "license": CC0, "sourceFile": spec["file"], "sourceSha256": digest, "note": spec["note"],
        },
        "units": "angstrom",
        "chains": [{"id": chain} for chain in chains],
        "elements": elements,
        "groups": groups,
        "focusAtom": focus,
        "x": [round(float(row["Cartn_x"]), 2) for row in rows],
        "y": [round(float(row["Cartn_y"]), 2) for row in rows],
        "z": [round(float(row["Cartn_z"]), 2) for row in rows],
        "element": [elements.index(row["type_symbol"].upper()) for row in rows],
        "chain": [chains.index(row["auth_asym_id"]) for row in rows],
        "residue": [int(row["auth_seq_id"]) for row in rows],
        "group": [group_of(row, spec["groups"]) for row in rows],
    }
    target = target_dir / f"molecule-{key}.json"
    target.write_text(json.dumps(output, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")
    held = rows[focus]
    return f"{key} {spec['entry']}: {len(rows)} atoms, {len(chains)} chains, {elements}, focus {held['auth_comp_id']} {held['auth_asym_id']} {held['auth_seq_id']} {held['auth_atom_id']}, {target.stat().st_size} bytes, sha {digest}"


def main(source_dir: Path, target_dir: Path, only: list[str]) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)
    for key, spec in MOLECULES.items():
        if not only or key in only:
            print(prepare(key, spec, source_dir, target_dir))


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3:])
