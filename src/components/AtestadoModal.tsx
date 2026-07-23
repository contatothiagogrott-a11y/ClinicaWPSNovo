import React, { useState } from "react";
import { X, Save, FileDown } from "lucide-react";
import { Client, ClinicalDocument } from "../types";
import { composeAtestadoBodyText, buildAtestadoDocDefinition } from "../lib/pdfAtestado";
import { openPdfInNewTab } from "../lib/pdfGenerator";
import { useStore } from "../contexts/StoreContext";

export default function AtestadoModal({
  open, onClose, client, existingDoc,
}: {
  open: boolean;
  onClose: () => void;
  client: Client;
  existingDoc?: ClinicalDocument;
}) {
  const { currentUser, users, addClinicalDocument, updateClinicalDocument } = useStore();

  const [aptoPara, setAptoPara] = useState(existingDoc?.data?.aptoPara || "");
  const [endereco, setEndereco] = useState(existingDoc?.data?.endereco || "");
  const [acompanhamentoDesde, setAcompanhamentoDesde] = useState(existingDoc?.data?.acompanhamentoDesde || client.dateIncluded?.split("T")[0] || "");
  const [motivo, setMotivo] = useState(existingDoc?.data?.motivo || "");
  const [emissionDate, setEmissionDate] = useState(existingDoc?.data?.emissionDate || new Date().toISOString().split("T")[0]);
  const [validadeDias, setValidadeDias] = useState(existingDoc?.data?.validadeDias || 60);
  const [bodyText, setBodyText] = useState(existingDoc?.data?.bodyText || "");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleGenerateText = () => {
    setBodyText(composeAtestadoBodyText(client, { aptoPara, endereco, acompanhamentoDesde, motivo }));
  };

  const buildData = () => ({ aptoPara, endereco, acompanhamentoDesde, motivo, emissionDate, validadeDias, bodyText });

  const handleSave = async (): Promise<ClinicalDocument> => {
    setSaving(true);
    try {
      if (existingDoc) {
        await updateClinicalDocument(existingDoc.id, buildData());
        return { ...existingDoc, data: buildData() };
      } else {
        return await addClinicalDocument(client.id, "ATESTADO", buildData());
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndExport = async () => {
    const saved = await handleSave();
    const author = users.find(u => u.id === saved.authorId) || currentUser || undefined;
    const docDef = buildAtestadoDocDefinition(client, saved, author);
    openPdfInNewTab(docDef);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
        <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Emissão de Atestado</h2>
            <p className="text-sm text-gray-500 mt-0.5">{client.fullName}</p>
          </div>
          <button onClick={onClose} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 transition-colors shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
            <p className="text-xs font-bold text-blue-900 mb-3 uppercase tracking-wide">1. Preencha os dados para gerar o texto-base</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Endereço (rua, nº, bairro, cidade)</label>
                <input type="text" value={endereco} onChange={e => setEndereco(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none text-sm" placeholder="Rua XXXX, nº XX, bairro XXXX, Florianópolis" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Está apto(a) para</label>
                <input type="text" value={aptoPara} onChange={e => setAptoPara(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none text-sm" placeholder="Ex: retorno às atividades laborais" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Em acompanhamento desde</label>
                <input type="date" value={acompanhamentoDesde} onChange={e => setAcompanhamentoDesde(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Para realização de / recomendação da equipe médica para</label>
                <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none text-sm" placeholder="Ex: cirurgia bariátrica" />
              </div>
            </div>
            <button type="button" onClick={handleGenerateText} className="mt-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors">
              Gerar Texto do Atestado
            </button>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">2. Revise e edite o texto livremente antes de emitir</p>
            <textarea
              value={bodyText}
              onChange={e => setBodyText(e.target.value)}
              rows={10}
              className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-3 outline-none text-sm leading-relaxed transition-colors"
              placeholder="Clique em 'Gerar Texto do Atestado' acima, ou escreva livremente aqui..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Data de emissão</label>
              <input type="date" value={emissionDate} onChange={e => setEmissionDate(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Validade (dias)</label>
              <input type="number" value={validadeDias} onChange={e => setValidadeDias(Number(e.target.value))} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 outline-none text-sm" />
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 shrink-0 flex gap-3">
          <button onClick={() => handleSave().then(onClose)} disabled={saving || !bodyText} className="flex-1 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-gray-700 font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
            <Save size={18} /> Salvar Rascunho
          </button>
          <button onClick={handleSaveAndExport} disabled={saving || !bodyText} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
            <FileDown size={18} /> Salvar e Exportar PDF
          </button>
        </div>
      </div>
    </div>
  );
}
