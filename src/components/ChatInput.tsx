import React, { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon, Loader2, Send, X } from 'lucide-react';
import { aiTutorAPI } from '../services/api';
import { shouldSendOnKey, appendImageBlock, MAX_IMAGE_BYTES } from '../utils/chatInput';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called on Enter (no Shift) with non-empty text. Must clear the field. */
  onSend: () => void;
  placeholder?: string;
  /** External busy (generation running). ORed with internal OCR state. */
  disabled?: boolean;
  /** Reports OCR activity so parents can guard sends + placeholders. */
  onProcessingChange?: (processing: boolean) => void;
  /** Extra buttons rendered next to the attach button (e.g. mic). */
  actions?: React.ReactNode;
  textareaRef?: React.Ref<HTMLTextAreaElement>;
  imageInputId?: string;
  autoFocus?: boolean;
  notify: (message: string, kind: 'success' | 'error' | 'info') => void;
}
// ---------------------------------------------------------------------------
// ChatInput: the single chat composer for AI chats (tutor + video chat).
// Replaces two copy-pasted single-line inputs that couldn't do multiline at
// all: auto-growing textarea, Enter sends / Shift+Enter newlines (IME-safe),
// image attach + paste with size guard, client OCR with append (never
// clobber) semantics, and a preview with remove.
// ---------------------------------------------------------------------------
const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSend,
  placeholder = 'Ask a question…',
  disabled = false,
  onProcessingChange,
  actions,
  textareaRef,
  imageInputId = 'chat-image-upload',
  autoFocus = false,
  notify,
}) => {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const busy = disabled || isProcessingImage;

  const clearImagePreview = () => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
    }
  };

  useEffect(() => {
    onProcessingChange?.(isProcessingImage);
  }, [isProcessingImage, onProcessingChange]);

  // Auto-grow, capped so the composer never eats the chat.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  // Preview URLs are object URLs: revoke on replace/unmount, never leak.
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  // Parents clear the field on every send (chips, deep links, submit) —
  // an emptied field retires a stale preview with it.
  useEffect(() => {
    if (value === '' && imagePreview) clearImagePreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const setRef = (el: HTMLTextAreaElement | null) => {
    areaRef.current = el;
    if (typeof textareaRef === 'function') textareaRef(el);
    else if (textareaRef && typeof textareaRef === 'object') {
      (textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
    }
  };

  const handleFiles = async (files: FileList | File[] | null) => {
    const file = files && (files as File[])[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('Please upload an image file', 'error');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      notify('Image is too large — 8MB max. Try a smaller photo or screenshot.', 'error');
      return;
    }
    setIsProcessingImage(true);
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
    try {
      const { text } = await aiTutorAPI.extractTextFromImage(file);
      if (text && text.trim()) {
        onChange(appendImageBlock(value, text));
        notify('Text extracted from image. You can edit and send it.', 'success');
      } else {
        notify('No text could be extracted from the image. You can still add a question.', 'info');
      }
    } catch (error: any) {
      console.error('OCR error:', error);
      notify(error?.message || 'Failed to extract text from image', 'error');
      clearImagePreview();
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (blob) {
          await handleFiles([new File([blob], `pasted-image-${Date.now()}.png`, { type: blob.type })]);
        }
        return;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const native = e.nativeEvent as KeyboardEvent;
    if (!shouldSendOnKey(e.key, e.shiftKey, !!native.isComposing)) return;
    e.preventDefault();
    if (!busy && value.trim()) onSend();
  };

  const handleSendClick = () => {
    clearImagePreview();
    onSend();
  };

  return (
    <div className="relative flex gap-1.5 sm:gap-2 items-end">
      {imagePreview && (
        <div className="absolute bottom-full left-0 mb-2 p-2 bg-surface border border-zinc-200 rounded-lg shadow-lg z-10">
          <div className="relative">
            <img src={imagePreview} alt="Preview" className="max-w-[200px] max-h-[200px] rounded" />
            <button
              type="button"
              onClick={clearImagePreview}
              className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
              title="Remove image"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
      <div className="relative flex-1">
        <textarea
          ref={setRef}
          rows={1}
          className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-3 sm:pl-4 pr-[64px] sm:pr-[72px] py-3 sm:py-3.5 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500 transition-all font-medium text-sm placeholder-zinc-400 shadow-sm resize-none overflow-y-auto custom-scrollbar"
          placeholder={isProcessingImage ? 'Extracting text from image…' : placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={busy}
          autoFocus={autoFocus}
        />
        <div className="absolute right-1.5 sm:right-2 bottom-1.5 sm:bottom-2 flex gap-1 items-center">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
            id={imageInputId}
            disabled={busy}
          />
          <label
            htmlFor={imageInputId}
            className={`relative p-1 sm:p-1.5 rounded-lg transition-all cursor-pointer after:absolute after:-inset-2 after:content-[''] ${
              isProcessingImage
                ? 'bg-blue-50 text-blue-600 animate-pulse'
                : 'text-zinc-400 hover:text-ink hover:bg-zinc-100'
            } ${busy ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Upload image with text"
          >
            {isProcessingImage ? (
              <Loader2 size={14} className="sm:w-4 sm:h-4 animate-spin" />
            ) : (
              <ImageIcon size={14} className="sm:w-4 sm:h-4" />
            )}
          </label>
          {actions}
        </div>
      </div>
      <button
        type="button"
        onClick={handleSendClick}
        disabled={busy || !value.trim()}
        aria-label="Send message"
        className="p-3 sm:p-3.5 bg-zinc-900 text-onink rounded-xl hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center justify-center flex-shrink-0"
      >
        <Send size={16} className="sm:w-[18px] sm:h-[18px]" />
      </button>
    </div>
  );
};

export default ChatInput;
