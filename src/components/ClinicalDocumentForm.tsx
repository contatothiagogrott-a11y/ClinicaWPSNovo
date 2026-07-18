import React, { useState } from "react";
import { X, Save } from "lucide-react";
import { cn } from "../lib/utils";
import { SectionSchema, FieldSchema } from "../lib/clinicalFormSchemas";

function FieldInput({ field, value, onChange }: { field: FieldSchema; value: any; onChange: (v: any) => void }) {
  const baseInput = "w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-lg px-3 py-2 outline-none text-sm transition-colors";

  if (field.type === "textarea") {
    return <textarea value={value || ""} onChange={e => onChange(e.target.value)} rows={3} className={baseInput} />;
  }
  if (field.type === "date") {
    return <input type="datetime-local" value={value || ""} onChange={e => onChange(e.target.value)} className={baseInput} />;
  }
  if (field.type === "number") {
    return <input type="number" value={value ?? ""} onChange={e => onChange(e.target.value)} className={baseInput} />;
  }
  if (field.type === "select") {
    return (
      <select value={value || ""} onChange={e => onChange(e.target.value)} className={baseInput}>
        <option value="">Selecione...</option>
        {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (field.type === "yesno") {
    return (
      <div className="flex gap-2">
        {[{ v: true, l: "Sim" }, { v: false, l: "Não" }].map(opt => (
          <button key={String(opt.v)} type="button" onClick={() => onChange(opt.v)}
            className={cn("px-4 py-1.5 rounded-lg text-xs font-bold border transition-colors", value === opt.v ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50")}>
            {opt.l}
          </button>
        ))}
      </div>
    );
  }
  if (field.type === "yesno_na") {
    return (
      <div className="flex gap-2">
        {[{ v: "SIM", l: "Sim" }, { v: "NAO", l: "Não" }, { v: "NA", l: "N/A" }].map(opt => (
          <button key={opt.v} type="button" onClick={() => onChange(opt.v)}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors", value === opt.v ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50")}>
            {opt.l}
          </button>
        ))}
      </div>
    );
  }
  if (field.type === "check") {
    return (
      <button type="button" onClick={() => onChange(!value)}
        className={cn("px-4 py-1.5 rounded-lg text-xs font-bold border transition-colors", value ? "bg-amber-500 border-amber-500 text-white" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50")}>
        {value ? "Presente" : "Ausente"}
      </button>
    );
  }
  return <input type="text" value={value || ""} onChange={e => onChange(e.target.value)} className={baseInput} />;
}

export default function ClinicalDocumentForm({
  open, onClose, title, subtitle, sections, initialData, onSave,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  sections: SectionSchema[];
  initialData?: Record<string, any>;
  onSave: (data: Record<string, any>) => Promise<void>;
}) {
  const [data, setData] = useState<Record<string, any>>(initialData || {});
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const setField = (key: string, value: any) => setData(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(data);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
        <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 transition-colors shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-8 overflow-y-auto flex-1">
          {sections.map(section => (
            <div key={section.title}>
              <h3 className="font-bold text-blue-900 text-sm uppercase tracking-wide border-b border-blue-100 pb-2 mb-4">{section.title}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {section.fields.map(field => (
                  <div key={field.key} className={cn(field.type === "textarea" && "sm:col-span-2")}>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">{field.label}</label>
                    <FieldInput field={field} value={data[field.key]} onChange={v => setField(field.key, v)} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 border-t border-gray-100 shrink-0">
          <button onClick={handleSave} disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2">
            <Save size={18} /> {saving ? "Salvando..." : "Salvar Documento"}
          </button>
        </div>
      </div>
    </div>
  );
}
