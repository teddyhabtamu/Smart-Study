import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
// KaTeX stylesheet + fonts load ONLY with this chunk (on math content only).
// Previously every MarkdownRenderer visitor paid 430KB; the base renderer is
// now GFM-only and math upgrades progressively via Suspense.
import 'katex/dist/katex.min.css';
import { blockComponents, inlineComponents } from './MarkdownRenderer';

interface MarkdownMathProps {
  content: string;
}

/** Block variant with KaTeX math. Same component map as the base renderer. */
export const MarkdownMathBlock: React.FC<MarkdownMathProps> = ({ content }) => {
  return (
    <div className="markdown-body w-full">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={blockComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

/** Inline variant with KaTeX math. Same component map as the base renderer. */
export const MarkdownMathInline: React.FC<MarkdownMathProps> = ({ content }) => {
  return (
    <span className="markdown-inline">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={inlineComponents}
      >
        {content}
      </ReactMarkdown>
    </span>
  );
};
