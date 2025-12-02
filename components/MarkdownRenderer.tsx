import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface MarkdownRendererProps {
  content: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <div className="markdown-body w-full">
      <ReactMarkdown 
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          ul: ({node, ...props}) => <ul className="list-disc list-outside ml-4 mb-4 space-y-2 text-zinc-700 marker:text-zinc-400" {...props} />,
          ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-4 mb-4 space-y-2 text-zinc-700 marker:text-zinc-400" {...props} />,
          li: ({node, ...props}) => <li className="pl-1 leading-relaxed" {...props} />,
          h1: ({node, ...props}) => <h1 className="text-xl font-bold mt-6 mb-3 text-zinc-900 border-b border-zinc-100 pb-2" {...props} />,
          h2: ({node, ...props}) => <h2 className="text-lg font-bold mt-5 mb-2 text-zinc-900" {...props} />,
          h3: ({node, ...props}) => <h3 className="text-base font-bold mt-4 mb-2 text-zinc-900" {...props} />,
          p: ({node, ...props}) => <p className="mb-4 last:mb-0 leading-relaxed text-zinc-700" {...props} />,
          strong: ({node, ...props}) => <strong className="font-semibold text-zinc-900" {...props} />,
          em: ({node, ...props}) => <em className="italic text-zinc-600" {...props} />,
          blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-indigo-200 pl-4 italic my-4 text-zinc-600 bg-indigo-50/30 py-2 rounded-r" {...props} />,
          code: ({node, ...props}) => {
            const isBlock = node?.position?.start.line !== node?.position?.end.line;
            return isBlock ? (
               <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg my-4 overflow-x-auto text-xs font-mono">
                 <code {...props} />
               </div>
            ) : (
               <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-xs font-mono text-indigo-600 border border-zinc-200" {...props} />
            );
          },
          a: ({node, ...props}) => <a className="text-indigo-600 hover:underline decoration-indigo-300 underline-offset-2" {...props} />,
          hr: ({node, ...props}) => <hr className="my-6 border-zinc-200" {...props} />,
          table: ({node, ...props}) => <div className="overflow-x-auto my-4 border border-zinc-200 rounded-lg"><table className="w-full text-sm text-left" {...props} /></div>,
          thead: ({node, ...props}) => <thead className="bg-zinc-50 border-b border-zinc-200 font-semibold text-zinc-900" {...props} />,
          tbody: ({node, ...props}) => <tbody className="divide-y divide-zinc-100" {...props} />,
          tr: ({node, ...props}) => <tr className="hover:bg-zinc-50/50 transition-colors" {...props} />,
          th: ({node, ...props}) => <th className="px-4 py-3" {...props} />,
          td: ({node, ...props}) => <td className="px-4 py-3 text-zinc-600" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;