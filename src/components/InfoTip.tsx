import React, { useState } from "react";
import { Info } from "lucide-react";

export default function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="text-gray-400 hover:text-blue-600 transition-colors p-0.5 rounded-full"
        title="Como essa métrica funciona"
      >
        <Info size={15} />
      </button>
      {open && (
        <div className="absolute z-30 right-0 top-6 w-64 bg-gray-900 text-white text-xs rounded-xl p-3 shadow-xl leading-relaxed animate-in fade-in zoom-in-95 duration-150">
          {text}
        </div>
      )}
    </span>
  );
}
