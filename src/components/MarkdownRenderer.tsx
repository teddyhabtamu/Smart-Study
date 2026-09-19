import React, { Suspense, lazy } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Base renderer is GFM-only (small chunk). KaTeX (~300KB of the old 430KB
// MarkdownRenderer chunk) lives in MarkdownMath and loads only when content
// actually contains math — detected below, upgraded progressively with the
// base render as the Suspense fallback so there is never a loader flash.

interface MarkdownRendererProps {
  content: string;
}

/** Generous math detection: false positives only cost a chunk download,
 *  never broken rendering (the math pipeline renders non-math identically). */
export const hasMath = (content: string): boolean =>
  /\$\$|\\\[|\\\(|\$[^$\n]+\$/.test(content);

const MarkdownMathBlock = lazy(() =>
  import('./MarkdownMath').then((m) => ({ default: m.MarkdownMathBlock })),
);
const MarkdownMathInline = lazy(() =>
  import('./MarkdownMath').then((m) => ({ default: m.MarkdownMathInline })),
);

// AI-generated markdown is untrusted input: only http(s) and site-relative
// links become real anchors (new tab, no opener). Anything else
// (javascript:, data:, ...) degrades to underlined text so it can't execute
// or navigate anywhere unexpected.
const renderSafeLink = (
  props: React.AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown },
  className: string
) => {
  const { node, href, children, ...rest } = props;
  void node;
  if (href && /^(https?:\/\/|\/)/i.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} {...rest}>
        {children}
      </a>
    );
  }
  return <span className="underline underline-offset-2">{children}</span>;
};

export const inlineComponents = {
  // Render paragraphs as plain spans to stay valid inside <p>/<button>
  p: ({node, ...props}: any) => <span {...props} />,
  strong: ({node, ...props}: any) => <strong className="font-semibold" {...props} />,
  em: ({node, ...props}: any) => <em className="italic" {...props} />,
  code: ({node, ...props}: any) => (
    <code className="bg-zinc-100 px-1 py-0.5 rounded text-[0.9em] font-mono border border-zinc-200" {...props} />
  ),
  a: (props: any) => renderSafeLink(props, 'underline underline-offset-2'),
};

export const blockComponents = {
  ul: ({node, ...props}: any) => <ul className="list-disc list-outside ml-4 mb-4 space-y-2 text-inksoft marker:text-zinc-400" {...props} />,
  ol: ({node, ...props}: any) => <ol className="list-decimal list-outside ml-4 mb-4 space-y-2 text-inksoft marker:text-zinc-400" {...props} />,
  li: ({node, ...props}: any) => <li className="pl-1 leading-relaxed" {...props} />,
  h1: ({node, ...props}: any) => <h1 className="text-xl font-bold mt-6 mb-3 text-ink border-b border-zinc-100 pb-2" {...props} />,
  h2: ({node, ...props}: any) => <h2 className="text-lg font-bold mt-5 mb-2 text-ink" {...props} />,
  h3: ({node, ...props}: any) => <h3 className="text-base font-bold mt-4 mb-2 text-ink" {...props} />,
  p: ({node, ...props}: any) => <p className="mb-4 last:mb-0 leading-relaxed text-inksoft" {...props} />,
  strong: ({node, ...props}: any) => <strong className="font-semibold text-ink" {...props} />,
  em: ({node, ...props}: any) => <em className="italic text-inksoft" {...props} />,
  blockquote: ({node, ...props}: any) => <blockquote className="border-l-4 border-zinc-300 pl-4 italic my-4 text-inksoft bg-zinc-50 py-2 rounded-r" {...props} />,
  code: ({node, ...props}: any) => {
    const isBlock = node?.position?.start.line !== node?.position?.end.line;
    return isBlock ? (
        <div className="bg-zinc-900 text-white p-4 rounded-lg my-4 overflow-x-auto text-xs font-mono">
         <code {...props} />
       </div>
    ) : (
       <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-xs font-mono text-inksoft border border-zinc-200" {...props} />
    );
  },
  a: (props: any) => renderSafeLink(props, 'text-ink hover:text-ink underline decoration-zinc-400 underline-offset-2'),
  hr: ({node, ...props}: any) => <hr className="my-6 border-zinc-200" {...props} />,
  table: ({node, ...props}: any) => <div className="overflow-x-auto my-4 border border-zinc-200 rounded-lg"><table className="w-full text-sm text-left" {...props} /></div>,
  thead: ({node, ...props}: any) => <thead className="bg-zinc-50 border-b border-zinc-200 font-semibold text-ink" {...props} />,
  tbody: ({node, ...props}: any) => <tbody className="divide-y divide-zinc-100" {...props} />,
  tr: ({node, ...props}: any) => <tr className="hover:bg-zinc-50/50 transition-colors" {...props} />,
  th: ({node, ...props}: any) => <th className="px-4 py-3" {...props} />,
  td: ({node, ...props}: any) => <td className="px-4 py-3 text-inksoft" {...props} />,
};

// Inline variant: tight, inherits surrounding typography — for quiz options,
// short questions, answer lines. Same GFM + KaTeX math support, but without
// block margins so it sits naturally inside buttons and small text.
export const MarkdownInline: React.FC<MarkdownRendererProps> = ({ content }) => {
  if (!hasMath(content)) {
    return (
      <span className="markdown-inline">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={inlineComponents}>
          {content}
        </ReactMarkdown>
      </span>
    );
  }
  return (
    <Suspense
      fallback={
        <span className="markdown-inline">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={inlineComponents}>
            {content}
          </ReactMarkdown>
        </span>
      }
    >
      <MarkdownMathInline content={content} />
    </Suspense>
  );
};

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  if (!hasMath(content)) {
    return (
      <div className="markdown-body w-full">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={blockComponents}>
          {content}
        </ReactMarkdown>
      </div>
    );
  }
  return (
    <Suspense
      fallback={
        <div className="markdown-body w-full">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={blockComponents}>
            {content}
          </ReactMarkdown>
        </div>
      }
    >
      <MarkdownMathBlock content={content} />
    </Suspense>
  );
};

export default MarkdownRenderer;
