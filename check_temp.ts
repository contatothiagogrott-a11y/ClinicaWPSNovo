import { readFileSync } from "fs";
import { loadWorkbook, readSheet, detectColumnMap, buildImportRows } from "./src/lib/waitlistImportParser";
(async () => {
  const alvos: Array<[string,string,number]> = [
    ["Geral_Psicologia_.xlsx","Lista Geral 2025.",1],
    ["Esta_gia_rios_-_Lista_de_Atendimento.xlsx","Lista Geral - Estagiarios",1],
  ];
  const naoNum = new Set<string>(); let comAgendamento = 0; let exemplo = "";
  for (const [arq,aba,h] of alvos) {
    const wb = await loadWorkbook(new File([new Uint8Array(readFileSync(`/mnt/user-data/uploads/${arq}`))], arq) as any);
    const d = readSheet(wb, aba, h);
    const rows = buildImportRows(d, detectColumnMap(d.headers));
    console.log(`\n${aba}: dependentes detectados = ${rows.filter(r=>r.data.dependencyType).length}`);
    rows.forEach(r => {
      const m = r.data.registrationCode;
      if (m && !/^\d+$/.test(String(m))) naoNum.add(String(m));
      const obs = String(r.data.contactObservations||"");
      if (obs.includes("agendamento anterior")) { comAgendamento++; if(!exemplo) exemplo = obs.split("\n").find(l=>l.includes("agendamento anterior"))||""; }
    });
  }
  console.log(`\nLinhas com observação de agendamento anterior: ${comAgendamento}`);
  console.log(`Exemplo: ${exemplo}`);
  console.log(`\nMatrículas não numéricas restantes (${naoNum.size} valores distintos):`);
  console.log("  " + [...naoNum].slice(0,18).map(v=>`"${v.slice(0,26)}"`).join(", "));
})();
