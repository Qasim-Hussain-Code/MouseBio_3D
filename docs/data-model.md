# Shared scientific data representation

The four exploration modes use the same atlas, structure identifiers, coordinate frame and mesh nodes. A structure record associates a source label with one or more anatomical systems. This association does not create missing structures or supply finer anatomical resolution. The initial system vocabulary includes skeletal, muscular, nervous, cardiovascular, arterial and venous, respiratory, digestive, urinary, reproductive, endocrine, lymphatic, immune, integumentary and sensory systems.

The current geometry importer assigns a stable `digimouse:<source label>` identifier to each segmented source region. A source region can be an aggregate, such as the skeleton, rather than an individual anatomical structure. An aggregate must retain that classification when displayed or associated with measurements. Ontology mappings are optional, reference bearing records. An absent mapping means that no verified mapping has been established. It must not be filled with a guessed identifier.

Coordinate records preserve source units, axes and orientation status. An unresolved anatomical orientation can be reported explicitly. A display transform is distinct from an anatomical registration. An anatomy state records selection, structure visibility and opacity without changing the underlying geometry. Organism, system, organ, tissue and cellular scales are representable, but only scales backed by actual assets may be listed as available. Camera magnification is not an increase in biological resolution.

Biological relationships distinguish observed evidence, computational inference and educational simplification. Every relationship record includes its evidence classification and references. An inference additionally identifies its method and assumptions; an educational simplification states what has been simplified. The type definitions provide the interface for these relationships. They do not establish an evidence base or imply that an unpopulated relationship has been observed.

## Experimental measurements

Measurements remain on the user's device. The domain module performs no network requests and does not write to browser storage. The application must maintain this restriction when using the module. It must not describe an import as uploaded to a remote service.

The CSV importer requires these exact columns:

```csv
structure_id,measurement,value,unit,replicate,condition,time_point
```

Each row maps a finite decimal value to one available anatomical identifier. A measurement has a text name, an explicitly declared unit, a biological subject identifier, an experimental condition and a labelled time point. Decimal scientific notation is accepted. Empty values, hexadecimal numbers, nonfinite numbers, nonzero CSV decimals that underflow to zero and executable formulas are rejected. Computation uses JavaScript binary floating-point numbers, so exact decimal formatting and arbitrary precision are not preserved. A numeric time point requires a unit, such as `24 h`; categorical labels such as `baseline` are accepted. Time labels are compared exactly. The importer does not convert time units, align developmental stages or infer temporal equivalence.

The parser handles UTF-8 byte order marks, CRLF or LF records, quoted CSV fields and escaped quotation marks. It rejects malformed quoting, duplicate headers, unexpected columns, inconsistent record widths, control characters in scientific labels, unknown structures, unsupported units, missing fields and duplicate biological subject records within a structure, measurement, condition and time point. The default limits are 5 MiB, 20,000 measurements and 4096 characters per field. A second size check requires the normalized, readable JSON export to fit 5 MiB, reserving space for the largest supported provenance metadata envelope. A compact CSV can therefore be rejected even when its original file is below 5 MiB. This conservative policy ensures that every accepted dataset can be exported and reimported under the same default limit, including after a valid source filename or provenance fields are added. An import is atomic: any error yields no accepted measurements.

`SUPPORTED_UNITS` is an explicit syntax vocabulary. It is not a dimensional analysis engine. The caller can declare additional unit strings through `allowedUnits`, but must document their meaning. A measurement name must use one unit throughout a dataset. The importer performs no implicit conversion, including between otherwise equivalent strings such as `ug` and `µg`. A declared unit does not establish that it is scientifically appropriate for the measurement. That association still requires subject expertise.

The `replicate` field denotes a biological subject, not an instrument reading or a technical replicate. The parser verifies identifier presence and duplicate records. It cannot establish that identifiers correspond to distinct animals. Technical replicates must be resolved by a documented analysis before import. Repeated subjects can occur at different time points or conditions. Comparisons report subject identifiers shared between conditions because those groups are not independent. No inferential test is calculated.

Summaries retain structure, measurement, unit, condition and time point as separate grouping variables. They report the number of biological subject records, arithmetic mean, observed minimum and maximum, and sample standard deviation with denominator `n - 1`. Standard deviation is unavailable for one subject and is represented by `null`. Scaled Welford accumulation avoids a squared-sum overflow for large finite values. A result that exceeds finite numeric representation is rejected and requires explicit rescaling. These computations do not establish representativeness, normality or biological significance.

`compareConditions` requires a common structure, measurement, unit and exact time point, together with two distinct conditions. It returns the mean of condition B minus the mean of condition A in the declared unit. Missing groups, incompatible units, duplicated subject records and nonfinite numerical results are rejected. This descriptive contrast does not correct for batch effects, confounding, unequal sampling, repeated measures or missing data. It does not manufacture sex, treatment, developmental or disease differences.

JSON exports use schema version `mousebio.experimental.v1` and preserve individual normalized measurement rows, including their subject identifiers. They also allow a dataset title, source reference, license, notes and an explicit origin of `user-data` or `synthetic-example`. Each free-text metadata field is limited to 4096 characters. Synthetic examples must be identified in metadata and the interface. Provenance fields are supplied by the user; they are not independently verified. Export does not preserve the byte sequence of an original CSV, its column order or numeric formatting. JSON imports validate this schema and reject unexpected fields. Numeric tokens are checked outside quoted strings so that a nonzero underflowing decimal is rejected before its native parsed zero could be accepted.

CSV exports quote delimiters and quotation marks. Text cells that could trigger spreadsheet formulas receive an apostrophe prefix; numeric measurement cells remain numeric, including negative values. This protection changes those text cells. JSON is the preferred format when exact normalized labels and provenance must be retained. Exported data must be reviewed before being shared or committed.

## Physiological interfaces

`PHYSIOLOGY_PROCESSES` records a process identifier, anatomical system, scientific classification, implementation status, required anatomy and limitations. The two current processes bind their requirements to the Digimouse atlas ID and stable structure IDs: heart `digimouse:3`, lungs `digimouse:9` and `digimouse:10`. Display names are not identifiers. The initial cardiac and respiratory functions are explicitly illustrative surface deformations. The remaining systems have extension interfaces with no implemented physiological model. No parameterized or validated model is currently supplied by this module.

For elapsed display time `t`, the illustrative cardiac scale is:

```text
1 - 0.035 * (0.5 + 0.5 * sin(2 * pi * t))^4
```

The illustrative respiratory scale is:

```text
1 + 0.025 * sin(2 * pi * t / 3)
```

The display periods of one and three seconds and the amplitudes of 3.5 and 2.5 percent are arbitrary interface settings. They have no experimental calibration and are not estimates of normal mouse physiology. These functions model neither cardiac chambers nor pressure, flow, cardiac output, ventilation or gas exchange. They must not be presented as quantitative physiological simulations.

`evaluateIllustrativePhysiology` is a pure function of elapsed display time, display speed and process switches. The caller controls the clock, including pause and resume. Speed changes should alter the caller's accumulated clock continuously instead of reinterpreting all previously elapsed time. The function exposes independent cardiac and respiratory scales for process isolation. A later quantitative model must provide equations, assumptions, parameter sources, numerical methods, units, uncertainty and an appropriate validation record before receiving the corresponding classification.

## Acceptance criteria

The domain tests check the complete system vocabulary, strict CSV syntax, numerical values, anatomical mapping, units, time labels, biological subject duplication, import limits, atomic failure, descriptive statistics, compatible comparisons, provenance-preserving JSON round trips, spreadsheet formula protection and deterministic bounded illustrative deformations. These automated checks establish software behavior for the tested cases. They do not constitute independent anatomical or physiological review, and they do not verify the biological origin of imported observations.
