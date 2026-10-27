# Anatomical references and private observations

An anatomical reference identifies a particular asset and its source frame. Separate reconstructions are not interchangeable merely because they describe the same mouse or use similar organ names. A source label number can also designate different anatomy in different source files. Reference selection must therefore preserve explicit identifiers, processing history, coverage and licensing without inventing a crosswalk.

## Catalog declarations

`buildReferenceCatalog` validates a bounded array of known reference declarations. Each entry contains an atlas ID, display title, application-local manifest URL, coordinate-frame ID, asset SHA-256 (GLB or registered native PLY), coverage, processing resolution and license records. Coverage reports the number of available segmented regions and the represented system categories, with a description of limits. A represented category does not imply complete coverage of that system.

Source and processing voxel spacings are separate three-component values in millimetres. An unknown or inapplicable spacing is explicitly `null`. The extraction method and limitations are required. These declarations do not establish anatomical accuracy or independent physical calibration. Processing or resampling at a smaller spacing does not by itself supply new biological detail. Camera magnification does not change either recorded spacing.

The validator rejects duplicate atlas IDs or manifest URLs, unsupported fields, unsafe routing, invalid region counts, unknown or repeated system categories, nonfinite spacings, incomplete processing statements and malformed license references. License checks establish the presence and structure of declarations, not legal review or permission to redistribute an arbitrary resource. Existing source-specific notices and the machine-readable provenance registry remain applicable. Failed catalogs yield no partial entries. Accepted declarations are frozen copies.

`validateReferenceAtlas` checks a loaded manifest against the selected entry's atlas ID, coordinate frame, asset checksum, region count, represented systems and declared source license. It does not fit or infer a spatial registration. A checksum comparison here compares manifest declarations; actual asset-byte verification remains a separate loading or distribution check. The catalog module does not fetch files or alter anatomical metadata.

The infrastructure is generic and does not register an unfinished conversion as an available reference. A registered-volume reconstruction must retain its own source namespace and frame unless spatial correspondence has been explicitly demonstrated. Source-supported additional regions can be offered after their geometry, metadata, resource use and tests are complete. They must not be combined with another frame through guessed translations or label equality.

## Experimental data isolation

`createExperimentalBank` creates an opaque in-memory handle. Observations and their declared metadata are held privately by the module, keyed by the exact atlas ID and bound to its asset checksum, frame and region inventory. The handle's ordinary JSON serialization contains no observations or metadata. No network requests, file writes, automatic export or browser persistence are performed.

`storeAtlasExperimentalData` validates the individual rows against the current reference using the experimental-data rules and preserves the declared metadata. It creates a new bank without changing the previous handle. It rejects unknown structure IDs, unsupported row fields, invalid metadata or a conflicting binding. An invalid store returns the original bank and never silently replaces another reference's data. An explicitly empty dataset can record a user-requested clear for that reference while retaining all other cached datasets.

`readAtlasExperimentalData` returns fresh copies of only the selected reference's rows and metadata. An uncached reference starts with no measurements. An existing entry with an incompatible asset, frame or inventory is retained and reported as incompatible; it is not silently remapped or discarded. Even identical local structure IDs in two references do not authorize transferring observations between them. Technical or anatomical equivalence requires a separate evidence-bearing mapping procedure.

`switchAtlasExperimentalData` combines saving the current reference's observations with retrieving the target reference's own cache. It returns a new bank and the target data only when both operations succeed. If either operation fails, it returns the original bank without a partial switch. The caller must retain the current reference and visible dataset on failure. A successful return does not itself replace the rendered scene; model loading and interface state remain the application's responsibility.

The bank and catalog each support up to 32 references. When capacity is reached, adding a reference fails without evicting existing observations. The bank is local transient state, not durable storage: users must explicitly export experimental datasets they wish to retain across reloads. `cachedAtlasIds` exposes identifiers only, not measurements or provenance notes.

## Views and interpretation

Saved views retain their existing exact atlas, asset checksum and coordinate-frame binding. Loading a view for another reference must not trigger automatic conversion of anatomical IDs or transfer of observations. A matching reference must be selected and validated first. View exports and catalog declarations do not contain experimental values; experimental exports remain a separate explicit user action.

Physiological processes must bind to the selected reference's actual structure IDs. Reusing a numerical label from another namespace is not sufficient. These helpers do not add new physiological models or change the illustrative classification of current motion. They also do not establish anatomical orientation, population representativeness or expert-reviewed mappings.

## Acceptance criteria

The tests exercise catalog shape, source binding, coverage and resolution declarations, local URLs, licensing metadata, immutable copies, overlapping IDs across references, observation and metadata round trips, empty datasets, invalid-source rejection, atomic failed switches, capacity without eviction, private-handle serialization and exclusion of measurements from catalogs and views. All measurements in these tests are explicitly synthetic software fixtures. Interface selection, asynchronous model loading and actual rendering require separate application checks.

The focused WSL run passed all 13 catalog and private-bank tests with no failures or skips. The TypeScript integration check passed. These results verify the pure infrastructure and synthetic switching cases, not a completed new anatomical asset or a rendered reference-selection interface.
