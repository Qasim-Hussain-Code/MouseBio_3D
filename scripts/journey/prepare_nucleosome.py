"""Reduce a Protein Data Bank coordinate file of the mouse nucleosome to the compact file used by the scale journey.

Usage: python scripts/journey/prepare_nucleosome.py <5B1M.cif> public/scale-journey/nucleosome-5b1m.json

The source file is from https://files.rcsb.org/download/5B1M.cif and is not kept in this repository. Coordinates, chain
identifiers, residue numbers and atom names are copied unchanged, rounded to 0.01 angstrom. Water and ions are left out.
The output is deterministic for the same source file.
"""
import hashlib
import json
import shlex
import sys
from pathlib import Path

SOURCE_ENTRY = "5B1M"
SOURCE_SHA256 = "3db428566799805e58a81de85bfa0a6849c953cc9ef3a506995a946cd90b7a1b"
CHAINS = {
    "A": "Histone H3.1", "E": "Histone H3.1", "B": "Histone H4", "F": "Histone H4",
    "C": "Histone H2A type 1", "G": "Histone H2A type 1", "D": "Histone H2B type 3-A", "H": "Histone H2B type 3-A",
    "I": "DNA", "J": "DNA",
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


def main(source: Path, target: Path) -> None:
    data = source.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != SOURCE_SHA256:
        raise ValueError(f"Unexpected source file {digest}")
    rows = [row for row in atom_rows(data.decode("utf-8")) if row["group_PDB"] == "ATOM" and row["pdbx_PDB_model_num"] == "1"]
    rows = [row for row in rows if row["auth_asym_id"] in CHAINS]
    elements = sorted({row["type_symbol"] for row in rows})
    chains = sorted({row["auth_asym_id"] for row in rows})
    names = sorted({row["auth_atom_id"] for row in rows})
    x, y, z = [round(float(row["Cartn_x"]), 2) for row in rows], [round(float(row["Cartn_y"]), 2) for row in rows], [round(float(row["Cartn_z"]), 2) for row in rows]
    centre = (sum(x) / len(x), sum(y) / len(y), sum(z) / len(z))
    # The level of atoms centres on a carbon atom of a base near the middle of the DNA, the point on the central axis of the particle.
    best, distance = None, float("inf")
    for index, row in enumerate(rows):
        if row["auth_asym_id"] == "I" and row["auth_atom_id"] == "C4":
            d = (x[index] - centre[0]) ** 2 + (y[index] - centre[1]) ** 2 + (z[index] - centre[2]) ** 2
            if d < distance:
                best, distance = index, d
    if best is None:
        raise ValueError("No carbon atom found in the DNA")
    output = {
        "id": "pdb-5b1m",
        "source": {
            "database": "Protein Data Bank", "entry": SOURCE_ENTRY, "url": f"https://www.rcsb.org/structure/{SOURCE_ENTRY}",
            "title": "The mouse nucleosome structure containing H3.1", "method": "X-ray diffraction", "resolutionAngstrom": 2.34,
            "citation": "Ueda J, Harada A, Urahama T, et al. Testis-specific histone variant H3t gene is essential for entry into spermatogenesis. Cell Rep 2017;18(3):593-600. doi:10.1016/j.celrep.2016.12.065",
            "organisms": {"histones": "Mus musculus", "dna": "Homo sapiens, as recorded in the entry"},
            "license": "CC0 1.0, as stated in the wwPDB usage policies", "sourceSha256": digest, "depositedAtoms": 12071,
            "note": "A crystal of histones made recombinantly, wrapped in DNA of 146 base pairs. It is not from the Digimouse specimen.",
        },
        "units": "angstrom",
        "chains": [{"id": chain, "name": CHAINS[chain]} for chain in chains],
        "elements": elements,
        "names": names,
        "focusAtom": best,
        "x": x, "y": y, "z": z,
        "element": [elements.index(row["type_symbol"]) for row in rows],
        "chain": [chains.index(row["auth_asym_id"]) for row in rows],
        "residue": [int(row["auth_seq_id"]) for row in rows],
        "name": [names.index(row["auth_atom_id"]) for row in rows],
    }
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(output, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(rows)} atoms, {len(elements)} elements {elements}, chains {chains}, focus {best}: chain {rows[best]['auth_asym_id']} residue {rows[best]['auth_seq_id']} atom {rows[best]['auth_atom_id']}, {target.stat().st_size} bytes")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
