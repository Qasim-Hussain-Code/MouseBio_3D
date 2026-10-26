# Proposed ontology associations

[ontology-candidates.json](../data/ontology-candidates.json) records 13 proposed associations between existing Digimouse regions and ten generic Mouse Adult Anatomy (MA) terms. These are label-based computational inferences. They are not expert-reviewed exact mappings, anatomical registration results or additional modeled structures. The imported atlas, its identifiers and its geometry remain the reference representation.

## Sources and retrieval

Term identifiers, labels, defining-ontology status and nonobsolete status were checked on 25 October 2026 through individual records in the official EMBL-EBI Ontology Lookup Service. The [MA metadata endpoint](https://www.ebi.ac.uk/ols4/api/ontologies/ma) reported release `2026-02-24` and version IRI `http://purl.obolibrary.org/obo/ma/releases/2026-02-24/ma.owl`. This is the ontology version reported by the service, not an inferred release date for the mouse geometry. Each candidate records the exact term endpoint used for verification and an MGI term link.

MGI states that its MA ontology is licensed [CC BY 4.0](https://www.informatics.jax.org/mgihome/other/copyright.shtml). The ontology is maintained by the GXD project at The Jackson Laboratory. Its original description is Hayamizu TF, Mangan M, Corradi JP, Kadin JA, Ringwald M. The Adult Mouse Anatomical Dictionary: a tool for annotating and integrating data. *Genome Biology*. 2005;6:R29. The [MGI citation instructions](https://informatics.jax.org/mgihome/other/citation.shtml) also identify Hayamizu TF, Baldock RA, Ringwald M. Mouse anatomy ontologies: enhancements and tools for exploring and integrating biomedical data. *Mammalian Genome*. 2015;26:422-430.

The source label file belongs to the [Digimouse tetrahedral archive](https://neuroimage.usc.edu/neuro/Digimouse_Download). Its archive hash and attribution are retained in the candidate table. The [Digimouse license](https://neuroimage.usc.edu/neuro/Digimouse_license) is CC BY-SA 4.0. The combined candidate table uses CC BY-SA 4.0 while retaining MA's source attribution and license. Original documentation is CC BY 4.0 by Qasim Hussain. This does not change any anatomical asset or application-code license.

## Method and candidate coverage

The procedure reads the source labels already represented in the atlas. An explicitly recorded lexical normalization produces a search label, which is compared with the exact MA term label returned by OLS. A second lookup by term IRI verifies that the identifier belongs to the defining MA ontology and is not obsolete. No complete ontology, relation graph or anatomical dataset was downloaded for this task.

Literal label correspondence is sufficient to propose relevance, but it does not establish that a segmentation includes every part of an organ or shares the ontology term's anatomical extent. Consequently every candidate has relation `related`, status `proposed` and evidence classification `computational-inference`. No candidate has relation `exact` or classification `observed`.

| Existing source regions | Source label | Proposed MA term | Recorded normalization |
| --- | --- | --- | --- |
| `digimouse:2` | brain | [MA:0000168, brain](https://www.informatics.jax.org/vocab/gxd/ma_ontology/MA%3A0000168) | Identity |
| `digimouse:3` | heart | [MA:0000072, heart](https://www.informatics.jax.org/vocab/gxd/ma_ontology/MA%3A0000072) | Identity |
| `digimouse:4` | bladder | [MA:0000380, urinary bladder](https://www.informatics.jax.org/vocab/gxd/ma_ontology/MA%3A0000380) | Interpretive expansion, requiring review |
| `digimouse:5` | stomach | [MA:0000353, stomach](https://www.informatics.jax.org/vocab/gxd/ma_ontology/MA%3A0000353) | Identity |
| `digimouse:6` | spleen | [MA:0000141, spleen](https://www.informatics.jax.org/vocab/gxd/ma_ontology/MA%3A0000141) | Identity |
| `digimouse:7`, `digimouse:8` | kidneys | [MA:0000368, kidney](https://www.informatics.jax.org/vocab/gxd/ma_ontology/MA%3A0000368) | Singularize label; retain separate regions |
| `digimouse:9`, `digimouse:10` | lungs | [MA:0000415, lung](https://www.informatics.jax.org/vocab/gxd/ma_ontology/MA%3A0000415) | Singularize label; retain separate regions |
| `digimouse:11` | pancreas | [MA:0000120, pancreas](https://www.informatics.jax.org/vocab/gxd/ma_ontology/MA%3A0000120) | Identity |
| `digimouse:12` | liver | [MA:0000358, liver](https://www.informatics.jax.org/vocab/gxd/ma_ontology/MA%3A0000358) | Identity |
| `digimouse:16`, `digimouse:17` | testis | [MA:0000411, testis](https://www.informatics.jax.org/vocab/gxd/ma_ontology/MA%3A0000411) | Identity; retain separate regions |

The bladder normalization is an explicit anatomical interpretation of the abbreviated source label. It is not literal string equality between the original label and the MA label. Plural normalization for kidney and lung does not establish which side or lobe each region represents. The same generic term can be associated with two separately identified source regions without merging their geometry or experimental measurements. Laterality remains `null`.

Regions `digimouse:1`, `digimouse:13`, `digimouse:14` and `digimouse:15` remain unmapped. Residual body tissue is heterogeneous; the aggregate skeleton was outside this bounded organ-label review; the source's two muscle labels lack specific muscle identities. A null mapping records absence of an established association, not absence of anatomy.

## Verification and scientific limits

The local consistency check requires that every candidate and unmapped region exists in the imported atlas, that its source label agrees with that manifest, and that no region is both mapped and unmapped. All 17 source regions must be accounted for. It also checks 13 candidate records, ten unique verified term IDs, `related` relations, proposed status, computational-inference evidence and unresolved laterality. These checks validate this table's consistency. They do not constitute anatomical expert review.

Definitions were not supplied in the selected OLS records and remain `null`. No tissue, cell, developmental, molecular, innervation, blood-supply, disease or physiological relationships were inferred. Ontology terms can describe anatomy at a finer level than the mesh; linking to such an ontology does not add those structures to the viewer. Future changes to candidates should record the new ontology version, source release and review evidence rather than silently promoting a lexical association to an exact mapping.

## Checked application adapter

The pure [ontology adapter](../src/domain/ontology.ts) exposes `parseOntologyCandidates(input, atlas)` and `getOntologyCandidate(candidates, structureId)`. Parsing returns `{ ok, candidates, errors }`. Any error returns an empty candidate array; no partial associations are accepted. A successful result contains frozen copies of the supported display fields, assumptions and limitations. It leaves the candidate source, atlas geometry and anatomical identifiers unchanged.

The adapter requires the declared atlas, exact source labels and complete unique source-region coverage. It checks MA identifier syntax, matching MGI term links and EBI verification links over HTTPS, source version and retrieval consistency, source licenses, nonobsolete and defining-ontology flags, and explicit computational assumptions and limitations. Unsupported certainty flags, exact mappings, reviewed status, observed evidence or assigned laterality are rejected. Candidate counts follow the supplied atlas inventory rather than a fixed value of 13.

These checks validate the committed evidence table's structure and its declared source binding. They do not contact an external service, independently reverify term existence, establish anatomical equivalence or substitute MA terms for experimental measurement identifiers. A future change to the verified source table still requires scientific review. The initial eight adapter acceptance tests passed in WSL, including the actual 13-association fixture, changed-source rejection, generic inventory counts, unsupported evidence, unsafe reference links, metadata consistency, atomic failures and immutable output. The application TypeScript check also passed.
