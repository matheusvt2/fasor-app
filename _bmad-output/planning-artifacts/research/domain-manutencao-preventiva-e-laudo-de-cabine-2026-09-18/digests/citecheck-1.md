# Citation check 1: research.md against the digests

Scope: every inline [n] in the Sumário, sections 1–5, Insights, Evidência contrária and Recomendações. Each marker was mapped to its appendix row and then to the digest record for that source. No web spot-checks were needed because the digests settled every case. The report was not edited.

**Markers checked:** 288 inline markers (52 distinct sources). There are 10 mismatches, all minor or overstated. None is a wrong number on a load-bearing threshold.

## Mismatches

1. **§1.1 status list (line 82):** "a renumeração e os 7 passos também estão verificados [3][4]"
   - **What the source says:** verif-r1-1 C2 is only "verified in part". The 7 steps and steps (e)/(g) were confirmed, but "the claim that this 'moved from 10.5.1' was not independently checked this run". The old 10.5.1 text comes only from [6] (d1-r2-1 F3). Neither [3] nor [4] ties the old sequence to 10.5.1.
   - **Severity:** overstated

2. **§1.2 (line 90):** "Blogs que dizem que 'a NBR 14039 exige manutenção anual' não têm apoio no texto [7][17]"
   - **What the source says:** [17] (Alta Tensão SE) is not one of those blogs. Per d345-r1-1 #19 it says "programação preventiva anual, mas o intervalo deve ser definido por avaliação técnica" and does not attribute annual maintenance to NBR 14039. The blogs that make the claim (manauengenharia, insp-therm, ifell, engehall; d1-r1-1 #20) have no appendix row.
   - **Severity:** wrong-attribution (minor)

3. **§1.5 table, row "Laudo com ART" (line 143):** "**Obrigatório** na verificação final (NBR 14039 7.1.5)" [7][2][31]
   - **What the source says:** NBR 14039 7.1.5 requires a laudo "por profissional devidamente habilitado e/ou credenciado" (d1-r1-1 #11). It says nothing about an ART. The ART obligation comes from [31] (every contracted service) and [41], not from 7.1.5.
   - **Severity:** overstated

4. **§1.1 table, row "Aterramento", vigente column (line 68):** 10.2.4 b quoted as "inspeções e medições do SPDA e aterramentos elétricos" [6]
   - **What the source says:** the verbatim text in d1-r2-1 F1 is "documentação das inspeções e medições do sistema de proteção contra descargas atmosféricas e aterramentos elétricos". The quotation marks wrap an abbreviated paraphrase. The meaning is unchanged.
   - **Severity:** minor

5. **§2.2 (line 184):** NETA contact-resistance criterion for "disjuntor de MT a vácuo e chaves de MT" [21][50]
   - **What the source says:** [21] (MTS-2019 §7.6.3 and §7.5.1.2) supports this. [50] is the NETA MTS-2001 section for **low-voltage air power breakers** (d2-r1-1 #8), not MV breakers or switches. The wording matches, but [50] does not cover the equipment named in the sentence.
   - **Severity:** wrong-attribution (minor)

6. **§4 table, row "Estado encontrado" (line 323):** "Ensaios 'as-found' antes da limpeza; contador de operações" [21]
   - **What the source says:** "Prior to cleaning the unit, perform as-found tests" is recorded only from the MTS-2001 hvservice PDF, i.e. [50] (d2-r1-1 #14). The MTS-2019 digest (d2-r2-1 F1/F2) records only the as-found/as-left counter reading. The "antes da limpeza" half is therefore not supported by [21] in the digests.
   - **Severity:** wrong-attribution (minor)

7. **§2.8 (line 255):** "Limite: não há valor em ohms nas normas ABNT consultadas [14][52]"
   - **What the source says:** [52] (Canal Solar, d2-r1-1 #13) says NBR 14039 "não define um valor a ser atendido, porém **recomenda um valor de 10 ohms**". [14] says NBR 5419:2005 carried a 10 Ω "recomendação" that the 2015 edition removed. So [52] points to an ABNT *recommended* 10 Ω. The absolute "não há valor" overstates it. "Não há valor obrigatório" would match the sources. verif-r1-1 C8 also notes the NBR 14039 part was not independently checked.
   - **Severity:** overstated

8. **§4 (line 342):** "propostas de R$ 10 mil a R$ 120 mil para **duas subestações de 500 kVA**" [47]
   - **What the source says:** d345-r2-1 F3 describes the TRT-12 sites as "2×500 kVA oil transformers in a conventional cubicle, and 1×500 kVA dry transformer in a metal-clad cubicle". That is two substations with three 500 kVA transformers, 1,500 kVA in total, not two 500 kVA substations. The price range (R$ 10,010–120,630) is correct.
   - **Severity:** wrong-number (minor)

9. **Evidência contrária (line 411):** "Um **edital de concessionária** lista instrumentos de 1, 2,5, 5 e 10 kV [30]"
   - **What the source says:** [30] is CESAN, "the Espírito Santo state water utility" (d2-r2-1 F17), and the document is its technical service prescriptions (Anexo VIII). In this report "concessionária" means electricity distributor everywhere else, so the label misleads. The instrument list itself is correct.
   - **Severity:** wrong-attribution (minor)

10. **"Verificado" labels with no verification record in the digests:**
    - §1.3 line 119: "Achado verificado (três distribuidoras)" [10][11][12]
    - §2.2 line 186: "As normas não fixam µΩ … [27]. *Verificado.*"
    - §2.3 line 191: TTR "[21][27]. *Verificado.*"
    - §2.6 line 231: CONPROVE "[29]. *Verificado.*"
    - **What the digests say:** verif-r1-1 covers only C1–C9, and none of these four claims is among them. Each rests on the researcher's own reading, and for [27] the confidence is medium (d2-r1-1 #9). The TTR claim does have two agreeing sources ([21] and [27]), so it is the weakest of the four concerns. The frontmatter count of 15 verified claims cannot be reconciled with the single verification digest provided (C1–C9, of which about 5 are fully verified). A second verification batch may exist that I was not given. If so, ignore this item.
    - **Severity:** overstated (status label)

## Borderline, not counted

- **§2.2 line 183:** "≤1,2 × Ru, o valor de referência do fabricante" [28]. IEC defines R_u as the resistance measured before the type-test temperature rise. Calling it the manufacturer's reference value is a loose but defensible gloss.
- **§2.3 line 195:** bushings "FP >50% ou capacitância >5% **acima** do valor de placa" [21]. NETA says "more than 50%/5% **from** nameplate", which covers deviation in either direction.
- **§2.7 table, row "Cor e aparência":** the method column pairs NBR 14483 with the in-service limit. The 2006 in-service table ([25], d2-r1-1 #5) lists only a visual appearance check; NBR 14483 colour appears only in the new-oil Table 1.

Everything else checked against the digests matches: the thresholds, the item numbers, the quotes and the direction of each claim. This includes all NR-10 items, the CPFL 10/25 Ω, 15-day, 30/50 MΩ and declared-periodicity values, the NETA tables 100.1, 100.5, 100.14, 100.19 and 100.6.1, the oil table values, the IEC 50 A figure, the Res. 1.137 articles, CC/CDC periods, NR-01 1.6.x, the CFT/Decreto texts and the tender details.
