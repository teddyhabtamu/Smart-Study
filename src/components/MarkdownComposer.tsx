import React, { useRef, useState } from 'react';
import { Bold, Code2, Sigma, List, Link2 } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import { wrapOrInsert, insertMath, toggleList, insertLink, EditResult } from '../utils/markdownEdit';

interface MarkdownComposerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  /** Minimum meaningful length: shows a live "N more" counter until met. */
  minLength?: number;
  /** Extra classes for the textarea (the preview box mirrors the shell). */
  className?: string;
  textareaClassName?: string;
}

// One shared writing surface for every community input (ask modal, post
// edit, reply, comment edit): formatting toolbar + live preview. The app
// renders Markdown + KaTeX math everywhere but never told authors — the
// toolbar makes $x^2$ discoverable and the preview removes the
// write-blind-submit surprise.
const MarkdownComposer: React.FC<MarkdownComposerProps> = ({
  value,
  onChange,
  placeholder,
  rows = 5,
  required = false,
  minLength,
  className = '',
  textareaClassName = '',
}) => {
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const trimmedLen = value.trim().length;
  const needMore = minLength !== undefined && trimmedLen < minLength;

  const apply = (result: EditResult) => {
    onChange(result.text);
    // Restore focus + selection after React commits the new value.
    requestAnimationFrame(() => {
      const el = areaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(result.cursorStart, result.cursorEnd);
    });
  };

  const selection = (): [number, number] => {
    const el = areaRef.current;
    if (!el) return [value.length, value.length];
    return [el.selectionStart ?? value.length, el.selectionEnd ?? value.length];
  };

  const btn =
    'p-1.5 rounded-md text-zinc-500 hover:text-ink hover:bg-zinc-200/70 transition-colors disabled:opacity-40';

  return (
    <div className={`border border-zinc-300 rounded-lg overflow-hidden shadow-sm focus-within:ring-2 focus-within:ring-zinc-900/5 focus-within:border-zinc-500 transition-shadow ${className}`}>
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-zinc-50 border-b border-zinc-200">
        <button type="button" title="Bold" aria-label="Bold" className={btn}
          onClick={() => { const [s, e] = selection(); apply(wrapOrInsert(value, s, e, '**')); }}>
          <Bold size={15} />
        </button>
        <button type="button" title="Inline code" aria-label="Inline code" className={btn}
          onClick={() => { const [s, e] = selection(); apply(wrapOrInsert(value, s, e, '`', 'code')); }}>
          <Code2 size={15} />
        </button>
        <button type="button" title="Math (inline $…$)" aria-label="Inline math" className={btn}
          onClick={() => { const [s, e] = selection(); apply(insertMath(value, s, e, false)); }}>
          <Sigma size={15} />
        </button>
        <button type="button" title="Math block ($$…$$)" aria-label="Math block" className={btn}
          onClick={() => { const [s, e] = selection(); apply(insertMath(value, s, e, true)); }}>
          <span className="text-[11px] font-bold leading-none px-0.5">$$</span>
        </button>
        <button type="button" title="Bullet list" aria-label="Bullet list" className={btn}
          onClick={() => { const [s, e] = selection(); apply(toggleList(value, s, e)); }}>
          <List size={15} />
        </button>
        <button type="button" title="Link" aria-label="Link" className={btn}
          onClick={() => { const [s, e] = selection(); apply(insertLink(value, s, e)); }}>
          <Link2 size={15} />
        </button>
        <div className="ml-auto flex rounded-md overflow-hidden border border-zinc-200 text-[11px] font-bold" role="tablist" aria-label="Edit or preview">
          <button type="button" role="tab" aria-selected={mode === 'write'}
            onClick={() => setMode('write')}
            className={`px-2.5 py-1 transition-colors ${mode === 'write' ? 'bg-zinc-900 text-onink' : 'text-zinc-500 hover:text-ink'}`}>
            Write
          </button>
          <button type="button" role="tab" aria-selected={mode === 'preview'}
            onClick={() => setMode('preview')}
            className={`px-2.5 py-1 transition-colors ${mode === 'preview' ? 'bg-zinc-900 text-onink' : 'text-zinc-500 hover:text-ink'}`}>
            Preview
          </button>
        </div>
      </div>
      {mode === 'write' ? (
        <textarea
          ref={areaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          required={required}
          placeholder={placeholder}
          className={`w-full px-3 py-2 bg-surface text-sm text-ink placeholder-zinc-400 focus:outline-none resize-y ${textareaClassName}`}
        />
      ) : (
        <div className="w-full px-3 py-2 bg-surface text-sm min-h-[7rem] max-h-80 overflow-y-auto">
          {value.trim() ? (
            <div className="prose prose-sm prose-zinc max-w-none text-ink">
              <MarkdownRenderer content={value} />
            </div>
          ) : (
            <p className="text-zinc-400">Nothing to preview yet.</p>
          )}
        </div>
      )}
      <p className="px-3 py-1.5 bg-zinc-50 border-t border-zinc-200 text-[11px] text-zinc-500 flex items-center justify-between gap-2">
        <span>
          Markdown + math supported — <code className="font-mono bg-zinc-200/60 px-1 rounded">$x^2$</code> for inline, <code className="font-mono bg-zinc-200/60 px-1 rounded">$$…$$</code> for display equations.
        </span>
        {minLength !== undefined && (
          <span className={`flex-shrink-0 font-bold ${needMore ? 'text-amber-600' : 'text-zinc-400'}`}>
            {needMore ? `${minLength - trimmedLen} more` : `${trimmedLen}`}
          </span>
        )}
      </p>
    </div>
  );
};

export default MarkdownComposer;
