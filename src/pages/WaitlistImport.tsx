import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ChevronLeft, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2,
  ArrowRight, Table2, Loader2, Eye,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useStore } from "../contexts/StoreContext";
import {
  loadWorkbook, listSheets, readSheet, detectColumnMap, buildImportRows,
  FIELD_DEFS, IMPORT_FIELD_LABELS,
  type SheetSummary, type SheetData, type ImportRow,
} from "../lib/waitlistImportParser";
import { cn } from "../lib/utils";

type Etapa = "arquivo" | "aba" | "cabecalho" | "mapeamento" | "resultado";

/**
 * Importação de fila de espera.
 *
 * As listas vêm de gestões e formatos diferentes e não há como padronizá-las.
 * Por isso o processo é guiado em etapas, com o usuário confirmando o que o
 * sistema deduziu — em vez de uma importação "mágica" que erra em silêncio.
 *
 * Nenhuma linha com nome é descartada: o que estiver duvidoso entra MARCADO
 * para revisão e aparece filtrado na Fila de Espera.
 */
export default function WaitlistImport() {
  const { importClients } = useStore();
  const navigate = useNavigate();

  const [etapa, setEtapa] = useState<Etapa>("arquivo");
  const [fileName, setFileName] = useState("");
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheets, setSheets] = useState<SheetSummary[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [headerRow, setHeaderRow] = useState(1);
  const [sheetData, setSheetData] = useState<SheetData | null>(null);
  const [columnMap, setColumnMap] = useState<Record<string, number>>({});
  const [erro, setErro] = useState("");
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<{ created: number; flagged: number; errors: any[] } | null>(null);

  const linhas: ImportRow[] = useMemo(
    () => (sheetData ? buildImportRows(sheetData, columnMap) : []),
    [sheetData, columnMap]
  );
  const paraRevisar = linhas.filter((l) => l.reviewReasons.length > 0).length;
  const semNome = (sheetData?.rows.length ?? 0) - linhas.length;

  async function handleFile(file: File) {
    setErro("");
    try {
      const wb = await loadWorkbook(file);
      const abas = listSheets(wb);
      setWorkbook(wb);
      setSheets(abas);
      setFileName(file.name);
      setEtapa("aba");
    } catch {
      setErro("Não consegui ler este arquivo. Ele precisa ser .xlsx, .xls ou .csv.");
    }
  }

  function escolherAba(nome: string) {
    setSheetName(nome);
    aplicarCabecalho(nome, 1);
    setEtapa("cabecalho");
  }

  function aplicarCabecalho(nome: string, linha: number) {
    if (!workbook) return;
    const data = readSheet(workbook, nome, linha);
    setSheetData(data);
    setColumnMap(detectColumnMap(data.headers));
    setHeaderRow(linha);
  }

  async function confirmarImportacao() {
    setImportando(true);
    setErro("");
    try {
      const payload = linhas.map((l) => ({
        ...l.data,
        reviewReasons: l.reviewReasons,
        sourceRowNumber: l.sourceRowNumber,
      }));
      const res = await importClients(payload, `${fileName} › ${sheetName}`);
      setResultado(res as any);
      setEtapa("resultado");
    } catch (e: any) {
      setErro(e?.message || "Falha ao importar.");
    } finally {
      setImportando(false);
    }
  }

  const abaAtual = sheets.find((s) => s.name === sheetName);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      <Link to="/waitlist" className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-800">
        <ChevronLeft size={16} /> Voltar para a Fila de Espera
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Importar planilha para a fila de espera</h1>
        <p className="text-gray-500 mt-1">
          Cada lista tem um formato. O sistema tenta reconhecer as colunas e você confirma antes de gravar.
        </p>
      </div>

      <Passos etapa={etapa} />

      {erro && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 font-semibold">{erro}</p>
      )}

      {/* ---------------------------------------------------------------- */}
      {etapa === "arquivo" && (
        <label className="block border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50/40 rounded-3xl p-12 text-center cursor-pointer transition-colors">
          <Upload className="mx-auto text-gray-400 mb-3" size={40} />
          <span className="block font-bold text-gray-900">Escolher arquivo</span>
          <span className="block text-sm text-gray-500 mt-1">Excel (.xlsx, .xls) ou CSV</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>
      )}

      {/* ---------------------------------------------------------------- */}
      {etapa === "aba" && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            <strong>{fileName}</strong> tem {sheets.length} aba(s). Escolha qual contém a fila de espera.
          </p>
          {sheets.map((s) => (
            <button
              key={s.name}
              onClick={() => escolherAba(s.name)}
              className="w-full text-left bg-white border border-gray-200 hover:border-blue-400 rounded-2xl px-5 py-4 flex items-center justify-between gap-4 transition-colors"
            >
              <span className="flex items-center gap-3 min-w-0">
                <Table2 size={18} className="text-blue-600 shrink-0" />
                <span className="min-w-0">
                  <span className="block font-bold text-gray-900 truncate">{s.name}</span>
                  <span className="block text-xs text-gray-500">{s.rowCount} linhas · {s.colCount} colunas</span>
                </span>
              </span>
              <ArrowRight size={16} className="text-gray-400 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {etapa === "cabecalho" && abaAtual && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">
            Nem toda planilha começa com os títulos na primeira linha. Clique na linha que contém
            os <strong>nomes das colunas</strong>.
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            {abaAtual.preview.map((linha, i) => (
              <button
                key={i}
                onClick={() => aplicarCabecalho(sheetName, i + 1)}
                className={cn(
                  "w-full text-left px-4 py-3 border-b border-gray-100 last:border-0 flex gap-3 items-start text-xs transition-colors",
                  headerRow === i + 1 ? "bg-blue-50 ring-1 ring-inset ring-blue-400" : "hover:bg-gray-50"
                )}
              >
                <span className={cn("font-mono font-bold shrink-0 w-12", headerRow === i + 1 ? "text-blue-700" : "text-gray-400")}>
                  L{i + 1}
                </span>
                <span className="truncate text-gray-700">{linha.filter(Boolean).join("  ·  ") || "(linha vazia)"}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setEtapa("aba")} className="px-5 py-3 rounded-xl border border-gray-200 font-bold text-gray-700 hover:bg-gray-50">
              Voltar
            </button>
            <button onClick={() => setEtapa("mapeamento")} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl">
              Confirmar linha {headerRow} e continuar
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {etapa === "mapeamento" && sheetData && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Cartao valor={linhas.length} rotulo="pessoas encontradas" cor="blue" />
            <Cartao valor={paraRevisar} rotulo="para revisar depois" cor="amber" />
            <Cartao valor={Object.keys(columnMap).length} rotulo="colunas reconhecidas" cor="emerald" />
            <Cartao valor={semNome} rotulo="linhas sem nome (ignoradas)" cor="gray" />
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
              <Eye size={16} className="text-gray-500" />
              <h2 className="font-bold text-gray-900 text-sm">Conferir de onde vem cada informação</h2>
            </div>
            <div className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
              {FIELD_DEFS.map((f) => (
                <div key={f.key} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                  <span className="w-1/2 text-gray-700 truncate">{f.label}</span>
                  <ArrowRight size={13} className="text-gray-300 shrink-0" />
                  <select
                    value={columnMap[f.key] ?? -1}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setColumnMap((prev) => {
                        const next = { ...prev };
                        if (v < 0) delete next[f.key];
                        else next[f.key] = v;
                        return next;
                      });
                    }}
                    className={cn(
                      "flex-1 min-w-0 border rounded-lg px-2 py-1.5 text-xs outline-none",
                      columnMap[f.key] === undefined ? "border-gray-200 text-gray-400" : "border-blue-200 bg-blue-50 text-blue-900 font-semibold"
                    )}
                  >
                    <option value={-1}>— não importar —</option>
                    {sheetData.headers.map((h, i) => (
                      <option key={i} value={i}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Pré-visualização */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="font-bold text-gray-900 text-sm">Como as 3 primeiras pessoas vão ficar</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {linhas.slice(0, 3).map((l, i) => (
                <div key={i} className="px-5 py-4 space-y-1.5">
                  <p className="font-bold text-gray-900">{l.data.fullName}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                    {Object.entries(l.data)
                      .filter(([k, v]) => k !== "fullName" && v !== "" && v !== undefined)
                      .slice(0, 8)
                      .map(([k, v]) => (
                        <span key={k}>
                          <span className="text-gray-400">{IMPORT_FIELD_LABELS[k] ?? k}:</span>{" "}
                          {typeof v === "boolean" ? (v ? "Sim" : "Não") : String(v).slice(0, 40)}
                        </span>
                      ))}
                  </div>
                  {l.reviewReasons.length > 0 && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5 mt-1">
                      <AlertTriangle size={12} className="inline mr-1 -mt-0.5" />
                      {l.reviewReasons.join(" ")}
                    </p>
                  )}
                </div>
              ))}
              {linhas.length === 0 && (
                <p className="px-5 py-8 text-center text-gray-500 text-sm">
                  Nenhuma pessoa encontrada. Verifique se a linha do cabeçalho está certa.
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setEtapa("cabecalho")} className="px-5 py-3 rounded-xl border border-gray-200 font-bold text-gray-700 hover:bg-gray-50">
              Voltar
            </button>
            <button
              onClick={confirmarImportacao}
              disabled={importando || linhas.length === 0}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2"
            >
              {importando && <Loader2 size={16} className="animate-spin" />}
              Importar {linhas.length} pessoas para a fila
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {etapa === "resultado" && resultado && (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-8 text-center">
            <CheckCircle2 className="mx-auto text-emerald-600 mb-3" size={40} />
            <p className="text-2xl font-bold text-gray-900">{resultado.created} pessoas importadas</p>
            {resultado.flagged > 0 && (
              <p className="text-amber-700 font-semibold mt-2">
                {resultado.flagged} precisam de revisão antes de seguir para atendimento.
              </p>
            )}
          </div>
          {resultado.errors?.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm">
              <p className="font-bold text-red-800 mb-2">{resultado.errors.length} linha(s) não importada(s):</p>
              <ul className="space-y-1 text-red-700 max-h-40 overflow-y-auto">
                {resultado.errors.slice(0, 20).map((e: any, i: number) => (
                  <li key={i}>Linha {e.row}: {e.error}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => { setEtapa("arquivo"); setResultado(null); setWorkbook(null); }}
              className="px-5 py-3 rounded-xl border border-gray-200 font-bold text-gray-700 hover:bg-gray-50"
            >
              Importar outra planilha
            </button>
            <button
              onClick={() => navigate(resultado.flagged > 0 ? "/waitlist?revisar=1" : "/waitlist")}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl"
            >
              {resultado.flagged > 0 ? "Ver o que precisa de revisão" : "Ir para a fila de espera"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Passos({ etapa }: { etapa: Etapa }) {
  const passos: Array<[Etapa, string]> = [
    ["arquivo", "Arquivo"],
    ["aba", "Aba"],
    ["cabecalho", "Cabeçalho"],
    ["mapeamento", "Conferência"],
    ["resultado", "Pronto"],
  ];
  const atual = passos.findIndex((p) => p[0] === etapa);
  return (
    <div className="flex items-center gap-1.5 text-xs font-bold">
      {passos.map(([key, label], i) => (
        <React.Fragment key={key}>
          <span className={cn(
            "px-3 py-1.5 rounded-full whitespace-nowrap",
            i < atual ? "bg-emerald-100 text-emerald-700" :
            i === atual ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400"
          )}>
            {label}
          </span>
          {i < passos.length - 1 && <span className="text-gray-300">·</span>}
        </React.Fragment>
      ))}
    </div>
  );
}

function Cartao({ valor, rotulo, cor }: { valor: number; rotulo: string; cor: string }) {
  const cores: Record<string, string> = {
    blue: "bg-blue-50 border-blue-100 text-blue-700",
    amber: "bg-amber-50 border-amber-100 text-amber-700",
    emerald: "bg-emerald-50 border-emerald-100 text-emerald-700",
    gray: "bg-gray-50 border-gray-100 text-gray-500",
  };
  return (
    <div className={cn("border rounded-2xl px-4 py-3", cores[cor])}>
      <p className="text-2xl font-bold leading-none">{valor}</p>
      <p className="text-[11px] font-semibold mt-1.5 leading-tight">{rotulo}</p>
    </div>
  );
}
