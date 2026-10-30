# Bondarenko apical cellular model

The adapted model mathematics in `src/models/bondarenko-apical.ts` are licensed
under [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/).
This source-specific license applies separately from the application's original MIT integration code.

Bondarenko VE, Szigeti GP, Bett GCL, Kim SJ, Rasmusson RL. Computer model of
action potential of mouse ventricular myocytes. *American Journal of Physiology,
Heart and Circulatory Physiology*. 2004;287:H1378-H1403.
[doi:10.1152/ajpheart.00185.2003](https://doi.org/10.1152/ajpheart.00185.2003).

The adaptation uses the [Physiome apical CellML exposure](https://models.physiomeproject.org/exposure/b0b1820b1376263e16c6086ca64d513e/bondarenko_szigeti_bett_kim_rasmusson_2004_apical.cellml/view),
workspace revision `94d9d4f47495d86fec040f5439c7e3a4ffccb611`, accessed 30 October 2026.
The exposure's [license statement](https://models.physiomeproject.org/exposure/b0b1820b1376263e16c6086ca64d513e/bondarenko_szigeti_bett_kim_rasmusson_2004_apical.cellml/license_citation)
specifies CC BY 3.0. CellML metadata credit Catherine Lloyd, Penny J Noble and
James R Lawson. The original XML retains its COR editor notice, Copyright
2002-2007 Dr Alan Garny; editor software is not part of this adaptation.

Lloyd CM, Lawson JR, Hunter PJ, Nielsen PF. The CellML Model Repository.
*Bioinformatics*. 2008;24(18):2122-2123.
[doi:10.1093/bioinformatics/btn390](https://doi.org/10.1093/bioinformatics/btn390).

Qasim Hussain adapted the generated C assignments into TypeScript using fixed
Float64Array buffers and JavaScript Math functions. Original assignment order,
arithmetic grouping, numeric initial conditions, parameters, source stimulus
boundaries and unregularized rate expressions are retained. Buffer guards and
source metadata exports were added. Contact metadata and editor headers were
omitted from the public derivative. The scripts that prepare and check this
adaptation are original MIT integration code.

This is a parameterized single mouse apical ventricular-myocyte model at the
source temperature of 298 K. Its predicted voltage and calcium concentrations
are not experimental observations, anatomical cellular detail, contraction,
whole-heart conduction, vessel flow or a complete organism simulation. It has no
accepted registration to the anatomical references. The repository curator's
reported Figure 16 reproduction is source-reported; this adaptation alone does
not establish independent physiological validation. The application supplies a
separate bounded numerical integrator and an explicitly labeled optional
balanced-transition substitution in the IC_Na2 derivative. Its mathematical
modification and derived reference traces retain CC BY 3.0. See
`docs/cardiac-cell-model.md` for the source defect and integration limits.
Stimulus discontinuities, stiffness, convergence and possible nonfinite values
at source rate-expression singularities require explicit solver checks.

The manifest retains exact source hashes, units, protocol and the adaptation
identity. Original XML and generated C remain in ignored local raw storage and
are not distributed with the source or web package.
