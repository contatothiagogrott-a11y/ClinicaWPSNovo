import { readFileSync } from "fs";
import { loadWorkbook, listSheets, readSheet, detectColumnMap, buildImportRows, IMPORT_FIELD_LABELS } from "./src/lib/waitlistImportParser";

const ALVOS: Array<[string, string, number]> = [
  ["Geral_Psicologia_.xlsx", "Lista Geral 2026", 1],
  ["Geral_Psicologia_.xlsx", "Lista Geral 2025.", 1],
  ["Lista_Geral_-_Organizac_a_o_-_Psicologia.xlsx", "Espera Geral", 2],
  ["Esta_gia_rios_-_Lista_de_Atendimento.xlsx", "Lista Geral - Estagiarios", 1],
];

const mask = (s: any) => {
  const v = String(s ?? "");
  if (/^\(?\d{2}\)?[\s-]?\d{4,5}-?\d{4}$/.test(v)) return "(48) 9XXXX-XXXX";
  if (/^[A-ZÀ-Ÿ]{2,}(\s+[A-ZÀ-Ÿ.]{1,}){1,}$/.test(v)) return "<NOME EM CAPS OK>";
  return v.length > 34 ? v.slice(0, 34) + "…" : v;
};

(async () => {
  let totalLinhas = 0, totalRevisao = 0;
  const motivos: Record<string, number> = {};

  for (const [arq, aba, headerRow] of ALVOS) {
    const buf = readFileSync(`/mnt/user-data/uploads/${arq}`);
    const file = new File([new Uint8Array(buf)], arq);
    const wb = await loadWorkbook(file as any);
    const data = readSheet(wb, aba, headerRow);
    const map = detectColumnMap(data.headers);
    const rows = buildImportRows(data, map);

    const naoMapeadas = data.headers.filter((h, i) => h && !Object.values(map).includes(i));
    const comRevisao = rows.filter(r => r.reviewReasons.length > 0).length;
    totalLinhas += rows.length; totalRevisao += comRevisao;
    rows.forEach(r => r.reviewReasons.forEach(m => {
      const chave = m.split(":")[0].split("(")[0].trim();
      motivos[chave] = (motivos[chave] || 0) + 1;
    }));

    console.log("\n" + "=".repeat(72));
    console.log(`${aba}  —  ${rows.length} pessoas | ${Object.keys(map).length}/${data.headers.filter(Boolean).length} colunas reconhecidas | ${comRevisao} p/ revisar`);
    if (naoMapeadas.length) console.log(`  não mapeadas: ${naoMapeadas.map(h => `"${h.slice(0,28)}"`).join(", ")}`);
    const ex = rows[0];
    if (ex) {
      console.log("  EXEMPLO (1ª linha):");
      for (const [k, v] of Object.entries(ex.data)) {
        if (v === "" || v === undefined) continue;
        console.log(`     ${(IMPORT_FIELD_LABELS[k] ?? k).padEnd(38)} = ${mask(v)}`);
      }
      if (ex.reviewReasons.length) console.log(`     ⚠ ${ex.reviewReasons.join(" | ")}`);
    }
  }

  console.log("\n" + "#".repeat(72));
  console.log(`TOTAL: ${totalLinhas} pessoas | ${totalRevisao} marcadas para revisão`);
  console.log("\nMOTIVOS DE REVISÃO:");
  Object.entries(motivos).sort((a,b) => b[1]-a[1]).forEach(([m, n]) => console.log(`  ${String(n).padStart(4)}x  ${m}`));
})();
