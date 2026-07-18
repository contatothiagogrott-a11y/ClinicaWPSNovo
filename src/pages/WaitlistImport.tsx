import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../contexts/StoreContext";
import { ChevronLeft, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { parseWaitlistSpreadsheet, ParsedImportResult, IMPORT_FIELD_LABELS } from "../lib/waitlistImportParser";

export default function WaitlistImport() {
  const navigate = useNavigate();
  const { importClients } = useStore();
  const [parsed, setParsed] = useState<ParsedImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; errors: { row: number; error: string }[] } | null>(null);
  const [error, setError] = useState("");

  const handleFile = async (file: File) => {
    setError("");
    setResult(null);
    setIsParsing(true);
    setFileName(file.name);
    try {
      const parsedResult = await parseWaitlistSpreadsheet(file);
      if (parsedResult.rows.length === 0) {
        setError("Não foi possível encontrar linhas de dados nesta planilha.");
        setParsed(null);
      } else {
        setParsed(parsedResult);
      }
    } catch (err: any) {
      setError("Não foi possível ler este arquivo. Confirme que é um .xlsx, .xls ou .csv válido.");
      setParsed(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!parsed) return;
    setIsImporting(true);
    setError("");
    try {
      const res = await importClients(parsed.rows);
      setResult(res);
      if (res.errors.length === 0) setParsed(null);
    } catch (err: any) {
      setError(err?.message || "Não foi possível importar a planilha.");
    } finally {
      setIsImporting(false);
    }
  };

  const detectedFields = Object.keys(parsed?.columnMap || {});
  const missingFields = Object.keys(IMPORT_FIELD_LABELS).filter(k => !detectedFields.includes(k));

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <header className="flex items-center gap-4">
        <button onClick={() => navigate("/waitlist")} className="p-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shrink-0">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Importar Planilha da Fila de Espera</h1>
          <p className="text-gray-500">Envie a planilha exportada do formulário de inscrição (Google Forms/Excel).</p>
        </div>
      </header>

      {!parsed && !result && (
        <div className="bg-white rounded-3xl border border-dashed border-gray-300 p-12 text-center">
          <FileSpreadsheet className="mx-auto text-gray-300 mb-4" size={56} />
          <label className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-full font-semibold cursor-pointer transition-colors">
            <Upload size={18} />
            {isParsing ? "Lendo arquivo..." : "Escolher arquivo (.xlsx, .xls, .csv)"}
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={isParsing}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </label>
          <p className="text-xs text-gray-400 mt-4">Nenhum dado sai do seu navegador até você confirmar a importação na próxima etapa.</p>
          {error && <p className="text-sm text-red-600 font-semibold mt-4">{error}</p>}
        </div>
      )}

      {parsed && !result && (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
            <h3 className="font-bold text-blue-900 mb-2 flex items-center gap-2"><FileSpreadsheet size={18} /> {fileName}</h3>
            <p className="text-sm text-blue-800">{parsed.rawRowCount} linha(s) encontrada(s). Colunas reconhecidas automaticamente: {detectedFields.length} de {Object.keys(IMPORT_FIELD_LABELS).length}.</p>
            {missingFields.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-bold text-blue-900 mb-1">Colunas não identificadas nesta planilha (serão ignoradas):</p>
                <div className="flex flex-wrap gap-1.5">
                  {missingFields.map(f => <span key={f} className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{IMPORT_FIELD_LABELS[f]}</span>)}
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 font-bold text-gray-800">Pré-visualização (confira antes de confirmar)</div>
            <div className="overflow-x-auto max-h-[420px]">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold text-gray-500">#</th>
                    {detectedFields.map(f => <th key={f} className="px-3 py-2 text-left font-bold text-gray-500 whitespace-nowrap">{IMPORT_FIELD_LABELS[f]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 50).map((row, i) => (
                    <tr key={i} className="border-t border-gray-50">
                      <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                      {detectedFields.map(f => (
                        <td key={f} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[220px] overflow-hidden text-ellipsis">
                          {f === "dateIncluded" || f === "birthDate" || f === "contactDate"
                            ? (row[f] ? new Date(row[f]).toLocaleDateString("pt-BR") : "—")
                            : typeof row[f] === "boolean" ? (row[f] ? "Sim" : "Não") : (row[f] || "—")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.rows.length > 50 && <div className="p-3 text-center text-xs text-gray-400 border-t border-gray-100">Mostrando as primeiras 50 de {parsed.rows.length} linhas.</div>}
          </div>

          {error && <p className="text-sm text-red-600 font-semibold">{error}</p>}

          <div className="flex gap-3">
            <button onClick={() => setParsed(null)} className="flex-1 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 py-3 rounded-xl font-bold transition-colors">
              Cancelar
            </button>
            <button onClick={handleConfirmImport} disabled={isImporting} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2">
              {isImporting && <Loader2 size={18} className="animate-spin" />}
              Confirmar e Importar {parsed.rows.length} Paciente(s)
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 text-center">
          <CheckCircle2 className="mx-auto text-emerald-500 mb-4" size={48} />
          <h3 className="text-xl font-bold text-gray-900 mb-2">{result.created} paciente(s) importado(s) com sucesso</h3>
          {result.errors.length > 0 && (
            <div className="mt-4 text-left bg-red-50 border border-red-100 rounded-xl p-4">
              <p className="font-bold text-red-800 mb-2 flex items-center gap-2"><AlertTriangle size={16} /> {result.errors.length} linha(s) com erro:</p>
              <ul className="text-sm text-red-700 space-y-1">
                {result.errors.map((e, i) => <li key={i}>Linha {e.row}: {e.error}</li>)}
              </ul>
            </div>
          )}
          <button onClick={() => navigate("/waitlist")} className="mt-6 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-full font-bold transition-colors">
            Ver Fila de Espera
          </button>
        </div>
      )}
    </div>
  );
}
