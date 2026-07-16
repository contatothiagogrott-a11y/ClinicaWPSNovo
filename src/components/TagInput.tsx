import React, { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "../lib/utils";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  availableTags: string[];
  onCreateTag?: (tagName: string) => void;
  placeholder?: string;
}

export function TagInput({ value, onChange, availableTags, onCreateTag, placeholder = "Adicionar tag..." }: TagInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filteredTags = availableTags.filter(t => !value.includes(t) && t.toLowerCase().includes(inputValue.toLowerCase()));
  const exactMatch = availableTags.find(t => t.toLowerCase() === inputValue.toLowerCase());

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const addTag = (tag: string) => {
    if (!value.includes(tag)) {
      onChange([...value, tag]);
    }
    setInputValue("");
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      if (exactMatch) {
        addTag(exactMatch);
      } else if (onCreateTag) {
        onCreateTag(inputValue.trim());
        addTag(inputValue.trim());
      }
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const removeTag = (tag: string) => {
    onChange(value.filter(t => t !== tag));
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className={cn("min-h-[46px] w-full bg-gray-50 border border-gray-200 focus-within:border-blue-500 focus-within:bg-white rounded-xl px-3 outline-none transition-all flex flex-wrap items-center gap-1.5 py-1.5")}>
        {value.map(tag => (
          <span key={tag} className="flex items-center gap-1 bg-white border border-gray-200 text-gray-700 text-xs px-2.5 py-1 rounded-md font-bold uppercase tracking-wider shadow-sm">
            {tag}
            <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-500 transition-colors">
              <X size={14} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={e => {
            setInputValue(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 bg-transparent min-w-[120px] outline-none text-sm font-medium text-gray-900 placeholder:font-normal"
        />
      </div>

      {isOpen && (inputValue.trim() || filteredTags.length > 0) && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto p-1">
          {filteredTags.map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => addTag(tag)}
              className="w-full text-left px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-blue-600 rounded-lg transition-colors"
            >
              {tag}
            </button>
          ))}
          {inputValue.trim() && !exactMatch && onCreateTag && (
            <button
              type="button"
              onClick={() => {
                onCreateTag(inputValue.trim());
                addTag(inputValue.trim());
              }}
              className="w-full text-left px-3 py-2 text-sm font-bold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-2"
            >
              <span className="text-blue-400">+</span> Criar nova tag: "{inputValue.trim()}"
            </button>
          )}
          {filteredTags.length === 0 && (!inputValue.trim() || exactMatch) && (
            <div className="px-3 py-2 text-sm text-gray-500 font-medium text-center">Nenhuma tag sugerida</div>
          )}
        </div>
      )}
    </div>
  );
}
