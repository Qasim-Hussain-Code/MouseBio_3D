# Privacy and publication

MouseBio_3D keeps imported research observations in the user's browser memory. The import and comparison workflows do not upload observations, call an analysis service, add analytics or write research datasets to browser storage. Each reference retains its own observations while switching references. Replacing or clearing data affects the active reference; reloading clears all reference datasets. Dataset and view downloads occur only through the corresponding user action.

The repository and its releases must remain private until Qasim Hussain personally decides to make them public. Preparing artifacts or passing content checks does not authorize a visibility change. Local AGENTS.md instructions are ignored and excluded from release archives.

The application serves its code and anatomical assets from the local server. Opening a scientific reference link is a separate visit to that source; imported measurements are not attached to the link. Development commands can download software dependencies and explicitly selected public scientific resources. That activity is distinct from transmitting research observations.

## Private material and source control

Keep confidential datasets in the ignored `research-data/` directory or outside the source checkout. Local runtimes, dependency caches, raw download archives, build output, test reports and environment files are excluded by the project's ignore rules. Ignore rules do not remove a file already tracked by Git. A screenshot can reveal subject identifiers, measurements, filenames or declared provenance even when the application itself does not transmit data. Do not include private screenshots or research exports in publication artifacts.

Resource accounting can report an absolute checkout path and details of the local machine. Keep raw accounting reports local. Public documentation can record the project budget, portable methods and relevant asset or processing requirements without publishing a user-home path, local timezone or precise free-disk and host-memory snapshot.

Qasim Hussain remains the project's sole owner and maintainer. Required third-party authors, copyright notices, licenses and scientific attribution must remain intact. Publication hygiene must not remove required attribution or introduce automated systems as authors or co-authors.

## Publication identity and history

Git commits can expose author and committer email addresses. Check the identity used for the publication checkout before committing. A verified public GitHub no-reply address conceals a private mailbox; it can still identify the associated public account and does not make a project anonymous.

Existing local development history is retained. When it contains private identity metadata or machine-specific paths, create a separate sanitized source snapshot for publication instead of distributing that history. Do not copy the original `.git` directory into the publication checkout. Create the publication history with the verified public identity, preserve source licenses and attribution, and review the snapshot before committing or publishing it. This procedure does not rewrite or delete the original repository or research data.

The source snapshot must contain the complete intended application, scientific metadata, notices and reproducible setup instructions. It must exclude private datasets, credentials, local configuration, caches, raw private reports and other unreviewed machine artifacts. A publication package is not permission to redistribute every candidate scientific resource: only individually approved, appropriately licensed material belongs in the distributed source or web build.

## Read-only publication checker

Run the checker against the exact checkout or index snapshot being reviewed:

```bash
# Tracked working-tree content only; no historical metadata by default.
python3 scripts/check_publication.py --tracked

# The entire staged index and current Git identity/configuration.
python3 scripts/check_publication.py --staged --include-git-metadata

# In the sanitized publication checkout, inspect the history being distributed.
python3 scripts/check_publication.py --tracked --include-history
```

`--root` can select another Git checkout without printing its absolute path. `--staged` checks all files in the index snapshot, including unchanged indexed files. It does not inspect unstaged edits as if they were staged. `--include-history` also includes Git metadata; the shorter `--history` spelling is supported as an alias.

The checker reports relative file paths, finding types, counts and severity. Matched email addresses, credential-like strings and URL authentication values are not printed. It identifies user-home paths, common credential patterns, private-key headers, credential assignments, URL user information, accidentally tracked private-input paths and explicitly requested Git identity/history findings. Reserved-domain security fixtures are classified as informational examples. Required third-party contact details are reported for review rather than removed.

Exit status zero means that no error or warning was found in the selected scope. Status one means that findings or incomplete-review warnings remain. Status two means that inspection could not complete. Informational reserved-domain fixtures do not make an otherwise clean scan fail. The checker is read-only: it does not rewrite history, delete files, change Git configuration, publish a repository or transmit file contents.

The scanner bounds ordinary files at 8 MiB and historical inspection at 1,000 distinct blobs. Registered anatomical GLBs have a separate 80 MiB per-asset and 100 MiB combined bound, with at most 1 MiB of JSON metadata per GLB. Their exact bytes, hashes, source IDs, frame and license declarations must match the manifest and regional index from the same working-tree, staged or historical snapshot. Unregistered GLBs are rejected. An exceeded bound or another opaque binary produces a review warning. Binary geometry payloads require the separate provenance and numerical geometry checks. This pattern-based check is not a complete secret detector, a malware scanner or a substitute for reviewing the publication allowlist. It cannot guarantee that arbitrary binary data, encoded content or a previously unknown credential format is private-information free. Untracked files remain outside its scope until staged.

The publication-check tests use synthetic paths, addresses, tokens, Git repositories and binary fixtures. They verify value-free findings, explicit scope, binary-review warnings and unchanged history. Run them independently with:

```bash
python3 scripts/test_publication.py
python3 scripts/test_registered_anatomy.py
```

Any retained warning needs a concrete review decision before publication. Do not make a warning disappear by removing legally required attribution. Keep the reviewed source and web artifacts identifiable by their checksums and document exactly what was distributed.

## Release artifacts

The release helper prepares local artifacts from a clean, reviewed checkout and an existing production build:

```bash
python3 scripts/test_release.py
python3 scripts/prepare_release.py --output .publication/reviewed-release
```

The new output directory contains a plain `source/` snapshot, source and web ZIP archives, `release.json` and `SHA256SUMS`. The source ZIP uses a versioned project directory; the web ZIP places `index.html` at its root. The manifest records public artifact names, sizes, checksums, scientific asset binding and the bounded check scope. It does not include local paths, private Git identities or the development commit identifier.

The helper requires clean tracked source, no unreviewed nonignored files, a passing content scan, allowed regular files, matching anatomical manifest and GLB information, and storage and disk bounds. It does not copy Git history, follow symlinks, download dependencies, create commits or publish anything. Fixed archive timestamps and preserved Git executable permissions avoid distributing private filesystem timestamps while keeping setup scripts usable. Source attribution and license records remain in the snapshot.

Review the resulting source and web artifacts and preserve their checksums before publication. A clean package scan establishes the declared bounded checks, not a guarantee that arbitrary content contains no private information. The sanitized publication checkout requires its own identity and history review before its new commits are pushed.
