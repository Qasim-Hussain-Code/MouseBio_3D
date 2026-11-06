"""Reduce a Protein Data Bank coordinate file of mouse hemoglobin to the compact file used by the zoom.

Usage: python scripts/journey/prepare_hemoglobin.py <3HRW.cif> public/scale-journey/hemoglobin-3hrw.json

The source file is from https://files.rcsb.org/download/3HRW.cif and is not kept in this repository. Coordinates, chain
identifiers, residue numbers and atom names are copied unchanged, rounded to 0.01 angstrom. Water is left out and the four
heme groups are kept. The output is deterministic for the same source file.
"""
import hashlib
import json
import shlex
import sys
from pathlib import Path

SOURCE_ENTRY = "3HRW"
SOURCE_SHA256 = "d03fc89664dafead543d6bb63279b1958bf8674056e7dcb4d0b9c34fe4ae0188"
CHAINS = {"A": "Hemoglobin alpha", "C": "Hemoglobin alpha", "B": "Hemoglobin beta", "D": "Hemoglobin beta"}


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


def main(source: Path, target: Path) -> None:
    data = source.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != SOURCE_SHA256:
        raise ValueError(f"Unexpected source file {digest}")
    rows = [row for row in atom_rows(data.decode("utf-8")) if row["pdbx_PDB_model_num"] == "1" and row["auth_asym_id"] in CHAINS and row["auth_comp_id"] != "HOH"]
    elements = sorted({row["type_symbol"] for row in rows})
    chains = sorted({row["auth_asym_id"] for row in rows})
    names = sorted({row["auth_atom_id"] for row in rows})
    x, y, z = [round(float(row["Cartn_x"]), 2) for row in rows], [round(float(row["Cartn_y"]), 2) for row in rows], [round(float(row["Cartn_z"]), 2) for row in rows]
    # The level of atoms centres on the iron of the heme of the first alpha chain.
    irons = [index for index, row in enumerate(rows) if row["type_symbol"].upper() == "FE"]
    if len(irons) != 4:
        raise ValueError(f"Expected four iron atoms, found {len(irons)}")
    focus = next(index for index in irons if rows[index]["auth_asym_id"] == "A")
    heme = sorted({int(row["auth_seq_id"]) for row in rows if row["auth_comp_id"] == "HEM"})
    output = {
        "id": "pdb-3hrw",
        "source": {
            "database": "Protein Data Bank", "entry": SOURCE_ENTRY, "url": f"https://www.rcsb.org/structure/{SOURCE_ENTRY}",
            "title": "Crystal structure of hemoglobin from mouse (Mus musculus) at 2.8", "method": "X-ray diffraction", "resolutionAngstrom": 2.8,
            "citation": "Sundaresan SS, Ramesh P, Shobana N, Vinuchakkaravarthy T, Yasien S, Ponnuswamy MNG. Crystal structure of hemoglobin from mouse (Mus musculus) compared with those from other small animals and humans. Acta Crystallogr F Struct Biol Commun 2021;77(Pt 4):113-120. doi:10.1107/S2053230X2100306X",
            "organisms": {"hemoglobin": "Mus musculus"},
            "license": "CC0 1.0, as stated in the wwPDB usage policies", "sourceSha256": digest, "depositedAtoms": 4548,
            "note": "Purified from mouse blood and crystallized as methemoglobin, with no ligand on the four hemes. It is not from the Digimouse specimen.",
        },
        "units": "angstrom",
        "chains": [{"id": chain, "name": CHAINS[chain]} for chain in chains],
        "elements": elements,
        "names": names,
        "focusAtom": focus,
        "hemeResidues": heme,
        "x": x, "y": y, "z": z,
        "element": [elements.index(row["type_symbol"]) for row in rows],
        "chain": [chains.index(row["auth_asym_id"]) for row in rows],
        "residue": [int(row["auth_seq_id"]) for row in rows],
        "name": [names.index(row["auth_atom_id"]) for row in rows],
        "heme": [1 if row["auth_comp_id"] == "HEM" else 0 for row in rows],
    }
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(output, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(rows)} atoms, {len(elements)} elements {elements}, chains {chains}, focus {focus}, heme residues {heme}")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
