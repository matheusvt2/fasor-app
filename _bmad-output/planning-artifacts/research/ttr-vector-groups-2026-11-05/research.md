# Transformer turns ratio by vector group (TTR) — 2026-11-05

Why: Bruno, WhatsApp of 2026-11-05. A star-star transformer filled by the intern came out wrong, because the transformador de força's ratio table computes VAL CALCULADO as U1 · √3 / U2 whatever the connection (Story 15.6, seed v9). Matheus asked for every vector group, looked up in the literature and the Brazilian standards (2026-11-05: "Considere todos", "Procure na literatura e ISOs brasileiras"). This note is the source for Epic 21's Stories 21.1 and 21.2.

## Sources

1. **Megger, AVTMTTR100-SPN Rev. D (January 2007), *Manual de instrucciones TTR100*, Tabla 5-2 "Relación de fase de devanados de transformadores ANSI", pp. 30 to 38.** URL: `https://portalvhds963slh4m3fqg2.blob.core.windows.net/megger-products/TTR100_UG_es_V03.pdf`. Terminal markings follow ANSI C57.12.70: H1 H2 H3 (high voltage), X1 X2 X3 (low voltage), H0 and X0 (neutrals), `*` for a neutral that is not brought out. VH and VX are the nameplate's **line-to-line** voltages. The groups are written in IEC 60076-1 notation. The manual's own text: match the nameplate's vector diagram to the table's winding diagram, then select the IEC vector group. Every row below was read from the page images, not from text extraction alone: the √ signs do not survive `pdftotext`.
2. **Marcelo Paulino, "Manutenção de transformadores — Capítulo V: Polaridade e relação em transformadores de potência", *O Setor Elétrico*, ed. 100 (2014).** URL: `https://www.osetoreletrico.com.br/wp-content/uploads/2014/06/ed-100_Fasciculo_Cap-V-Manutencao-de-transformadores.pdf`. Two points from it:
   - ABNT NBR 5380 lists the test methods. NBR 5356 requires the ratio in **every tap** and admits a deviation of **± 0,5 %** of the nominal voltage (or 10 % of the short-circuit impedance voltage, whichever is smaller).
   - "No caso da utilização de um teste com correntes monofásicas, o fechamento do transformador deve ser observado para realização das conexões de teste." The error is E% = (Rmed − Rnom) / Rnom · 100.
3. **CIGRÉ/SNPTEE GSE-16 (2005), "Transformadores de potência — revisão da NBR 5356 e NBR 5380".** NBR 5356-1 takes IEC 60076-1 as its base text, and NBR 5380 derives from ANSI C57. This is why the Brazilian terminal marking is ANSI's H/X while the group code is IEC's. A secondary source from the same search confirms that NBR 5356-1 writes the connection with Y, D, Z for high voltage and y, d, z for medium and low voltage, plus the clock number (Dyn11 example).
4. **UFRGS final project (A. M. C. S. Pires, 2021), Tabela 3 "Tolerância para ensaio de relação de transformação", sourced to NBR 5356.** It also writes groups as "grupo de ligação YNy0nd1".

The FO.SERV-03 criterion already in the seed (`seed/criteria.ts`, `relacao_transformacao` ± 0,5 % "por TAP") matches source 2. The full text of NBR 5356-1:2007 and NBR 5380 was not available (paid ABNT documents). **Open for Bruno:** confirm the measuring practice against his own TTR's manual, which may be a Megger or another make.

## The rule

The **measured turns ratio** of each single-phase measurement is the nameplate line-to-line ratio VH/VX times a factor k that the vector group fixes:

| k | Groups |
| --- | --- |
| √3 | Dyn1, Dyn5, Dyn7, Dyn11, Dy1, Dy5, Dy7, Dy11, Yzn1, Yzn5, Yzn7, Yzn11, YNzn1, YNzn7, YNzn11 |
| 1 | Dd0, Dd6, Dz0, Dz6, Yy0, Yy6, Yyn0, Yyn6, YNyn0, YNyn6, YNy0, YNy6 |
| 1/√3 | YNd1, YNd5, YNd7, YNd11, ZNy5, ZNy11, Dyn3, Dyn9 |
| √3/2 | Yd1, Yd5, Yd7, Yd11, Yz1, Yz5, Yz7, Yz11, Zy5, Zy11 |
| 2/√3 | Dy3, Dy9 |

The rule has these consequences:
- The group in the field today, Dyn1, keeps U1 · √3 / U2 with the pairs H1-H3 / X1-X0, H2-H1 / X2-X0 and H3-H2 / X3-X0. These are exactly the seed's three capture columns (`seed/v1.ts` `TRANSFORMADOR_RATIO`).
- The intern's star-star transformer (Yy0 or Yyn0) is k = 1, with pairs H1-H3 / X1-X3, H2-H1 / X2-X1 and H3-H2 / X3-X2. Today's sheet shows it about 1.73 times too high.
- Dyn3, Dyn9, Dy3 and Dy9 are transcribed as printed. Their k differs from the other delta-star groups, and the drawings place the delta corners differently. **Flag for Bruno.** None of the four is a Brazilian distribution standard, where NBR 5440 uses Dyn1.

## The table (Tabla 5-2, three-phase rows; manual row number in brackets)

"Short" names the high-voltage winding the TTR short-circuits for that phase. In these rows the high-voltage lead reads as the manual prints it, e.g. H1-(H3-H2): H1 against the shorted pair.

| Group | Phase A (H / X) | Phase B (H / X) | Phase C (H / X) | Short A / B / C | k |
| --- | --- | --- | --- | --- | --- |
| Dd0 [3] | H1-H3 / X1-X3 | H2-H1 / X2-X1 | H3-H2 / X3-X2 | — | 1 |
| Dd6 [4] | H1-H3 / X3-X1 | H2-H1 / X1-X2 | H3-H2 / X2-X3 | — | 1 |
| Dyn1 [5] | H1-H3 / X1-X0 | H2-H1 / X2-X0 | H3-H2 / X3-X0 | — | √3 |
| Dyn7 [6] | H1-H3 / X0-X1 | H2-H1 / X0-X2 | H3-H2 / X0-X3 | — | √3 |
| YNyn0 [7] | H1-H0 / X1-X0 | H2-H0 / X2-X0 | H3-H0 / X3-X0 | — | 1 |
| YNyn6 [8] | H1-H0 / X0-X1 | H2-H0 / X0-X2 | H3-H0 / X0-X3 | — | 1 |
| YNd1 [9] | H1-H0 / X1-X2 | H2-H0 / X2-X3 | H3-H0 / X3-X1 | — | 1/√3 |
| YNd7 [10] | H1-H0 / X2-X1 | H2-H0 / X3-X2 | H3-H0 / X1-X3 | — | 1/√3 |
| Dy1 [11] | H1-(H3-H2) / X1-X2 | H2-(H1-H3) / X2-X3 | H3-(H2-H1) / X3-X1 | H3-H2 / H1-H3 / H2-H1 | √3 |
| Dyn5 [12] | H1-H3 / X3-X0 | H2-H1 / X1-X0 | H3-H2 / X2-X0 | — | √3 |
| Dy5 [13] | H1-(H3-H2) / X3-X1 | H2-(H1-H3) / X1-X2 | H3-(H2-H1) / X2-X3 | H3-H2 / H1-H3 / H2-H1 | √3 |
| Dy7 [14] | H1-(H3-H2) / X2-X1 | H2-(H1-H3) / X3-X2 | H3-(H2-H1) / X1-X3 | H3-H2 / H1-H3 / H2-H1 | √3 |
| Dyn11 [15] | H1-H3 / X0-X3 | H2-H1 / X0-X1 | H3-H2 / X0-X2 | — | √3 |
| Dy11 [16] | H1-(H3-H2) / X1-X3 | H2-(H1-H3) / X2-X1 | H3-(H2-H1) / X3-X2 | H3-H2 / H1-H3 / H2-H1 | √3 |
| Dz0 [17] | H1-H3 / X1-X3 | H2-H1 / X2-X1 | H3-H2 / X3-X2 | — | 1 |
| Dz6 [18] | H1-H3 / X3-X1 | H2-H1 / X1-X2 | H3-H2 / X2-X3 | — | 1 |
| YNy0 [19] | H1-(H2-H0) / X1-X3 | H2-(H3-H0) / X2-X1 | H3-(H1-H0) / X3-X2 | H2-H0 / H3-H0 / H1-H0 | 1 |
| Yyn0 [20] | H1-H3 / X1-X3 | H2-H1 / X2-X1 | H3-H2 / X3-X2 | — | 1 |
| Yy0 [21] | H1-H3 / X1-X3 | H2-H1 / X2-X1 | H3-H2 / X3-X2 | — | 1 |
| YNy6 [22] | H1-(H2-H0) / X3-X1 | H2-(H3-H0) / X1-X2 | H3-(H1-H0) / X2-X3 | H2-H0 / H3-H0 / H1-H0 | 1 |
| Yyn6 [23] | H1-H3 / X3-X1 | H2-H1 / X1-X2 | H3-H2 / X2-X3 | — | 1 |
| Yy6 [24] | H1-H3 / X3-X1 | H2-H1 / X1-X2 | H3-H2 / X2-X3 | — | 1 |
| Yzn1 [25] | H1-H3 / X1-X0 | H2-H1 / X2-X0 | H3-H2 / X3-X0 | — | √3 |
| Yz1 [26] | H1-(H3+H2) / X1-X2 | H2-(H1+H3) / X2-X3 | H3-(H2+H1) / X3-X1 | H3-H2 / H1-H3 / H2-H1 | √3/2 |
| Yzn5 [27] | H1-H3 / X3-X0 | H2-H1 / X1-X0 | H3-H2 / X2-X0 | — | √3 |
| Yz5 [28] | H1-(H3+H2) / X3-X1 | H2-(H1+H3) / X1-X2 | H3-(H2+H1) / X2-X3 | H3-H2 / H1-H3 / H2-H1 | √3/2 |
| Yzn7 [29] | H1-H3 / X0-X1 | H2-H1 / X0-X2 | H3-H2 / X0-X3 | — | √3 |
| Yz7 [30] | H1-(H3+H2) / X2-X1 | H2-(H1+H3) / X3-X2 | H3-(H2+H1) / X1-X3 | H3-H2 / H1-H3 / H2-H1 | √3/2 |
| Yzn11 [31] | H1-H3 / X0-X3 | H2-H1 / X0-X1 | H3-H2 / X0-X2 | — | √3 |
| Yz11 [32] | H1-(H3+H2) / X1-X3 | H2-(H1+H3) / X2-X1 | H3-(H2+H1) / X3-X2 | H3-H2 / H1-H3 / H2-H1 | √3/2 |
| ZNy5 [33] | H1-H0 / X3-X1 | H2-H0 / X1-X2 | H3-H0 / X2-X3 | — | 1/√3 |
| Zy5 [34] | H1-(H3+H2) / X3-X1 | H2-(H1+H3) / X1-X2 | H3-(H2+H1) / X2-X3 | H3-H2 / H1-H3 / H2-H1 | √3/2 |
| ZNy11 [35] | H1-H0 / X1-X3 | H2-H0 / X2-X1 | H3-H0 / X3-X2 | — | 1/√3 |
| Zy11 [36] | H1-(H3+H2) / X1-X3 | H2-(H1+H3) / X2-X1 | H3-(H2+H1) / X3-X2 | H3-H2 / H1-H3 / H2-H1 | √3/2 |
| Yd1 [37] | H1-(H3+H2) / X1-X2 | H2-(H1+H3) / X2-X3 | H3-(H2+H1) / X3-X1 | H3-H2 / H1-H3 / H2-H1 | √3/2 |
| YNd5 [38] | H1-H0 / X3-X1 | H2-H0 / X1-X2 | H3-H0 / X2-X3 | — | 1/√3 |
| Yd5 [39] | H1-(H3+H2) / X3-X1 | H2-(H1+H3) / X1-X2 | H3-(H2+H1) / X2-X3 | H3-H2 / H1-H3 / H2-H1 | √3/2 |
| Yd7 [40] | H1-(H3+H2) / X2-X1 | H2-(H1+H3) / X3-X2 | H3-(H2+H1) / X1-X3 | H3-H2 / H1-H3 / H2-H1 | √3/2 |
| YNd11 [41] | H1-H0 / X1-X3 | H2-H0 / X2-X1 | H3-H0 / X3-X2 | — | 1/√3 |
| Yd11 [42] | H1-(H3+H2) / X1-X3 | H2-(H1+H3) / X2-X1 | H3-(H2+H1) / X3-X2 | H3-H2 / H1-H3 / H2-H1 | √3/2 |
| Dyn3 [44] | H3-H1 / X2-X0 | H1-H2 / X3-X0 | H2-H3 / X1-X0 | — | 1/√3 (flag) |
| Dy3 [45] | H1-(H3+H2) / X3-X2 | H2-(H1+H3) / X1-X3 | H3-(H2+H1) / X2-X1 | H3-H2 / H1-H3 / H2-H1 | 2/√3 (flag) |
| Dyn9 [46] | H1-H3 / X2-X0 | H2-H1 / X3-X0 | H3-H2 / X1-X0 | — | 1/√3 (flag) |
| Dy9 [47] | H1-(H3+H2) / X2-X3 | H2-(H1+H3) / X3-X1 | H3-(H2+H1) / X1-X2 | H3-H2 / H1-H3 / H2-H1 | 2/√3 (flag) |
| YNzn1 [48] | H1-H3 / X1-X0 | H2-H1 / X2-X0 | H3-H2 / X3-X0 | — | √3 |
| YNzn7 [49] | H1-H3 / X0-X1 | H2-H1 / X0-X2 | H3-H2 / X0-X3 | — | √3 |
| YNzn11 [50] | H1-H3 / X0-X3 | H2-H1 / X0-X1 | H3-H2 / X0-X2 | — | √3 |

That is 47 three-phase groups. Rows 1 and 2 (single-phase 1ph0, 1ph6) and 43 (voltage regulator) are out of scope: the transformador de força is three-phase.

## How the nameplate writes it

- The nameplate carries the vector diagram (the drawn phasor diagram) and usually the group code next to it.
- In this product's data the code goes into LIGAÇÃO SECUNDÁRIA. The Porto Seguro fixture types "DYN1" on every transformer (`packages/domain/fixtures/porto-seguro/data.ts`). The parser should therefore match case-insensitively and ignore spaces, slashes and hyphens ("DYN1", "Dyn 1", "D/yn1").
- With the group read in order (high-voltage letters D, Y, YN, Z, ZN; then low-voltage d, y, yn, z, zn; then the clock number 0 to 11), each of the 47 codes parses one way only.
