import { cn } from '@/lib/utils';
import {
  Bold,
  Code2,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../ui/button';

type Command =
  | { type: 'formatBlock'; value: string }
  | {
      type:
        | 'bold'
        | 'italic'
        | 'underline'
        | 'strikeThrough'
        | 'insertUnorderedList'
        | 'insertOrderedList'
        | 'undo'
        | 'redo';
    };

interface ToolbarAction {
  label: string;
  icon: typeof Bold;
  command: Command;
}

const INLINE: ToolbarAction[] = [
  { label: 'Tebal', icon: Bold, command: { type: 'bold' } },
  { label: 'Miring', icon: Italic, command: { type: 'italic' } },
  { label: 'Coret', icon: Strikethrough, command: { type: 'strikeThrough' } },
];

const BLOCKS: ToolbarAction[] = [
  { label: 'Judul', icon: Heading2, command: { type: 'formatBlock', value: 'h2' } },
  { label: 'Subjudul', icon: Heading3, command: { type: 'formatBlock', value: 'h3' } },
  { label: 'Daftar butir', icon: List, command: { type: 'insertUnorderedList' } },
  { label: 'Daftar nomor', icon: ListOrdered, command: { type: 'insertOrderedList' } },
  { label: 'Kutipan', icon: Quote, command: { type: 'formatBlock', value: 'blockquote' } },
];

const HISTORY: ToolbarAction[] = [
  { label: 'Urungkan', icon: Undo2, command: { type: 'undo' } },
  { label: 'Ulangi', icon: Redo2, command: { type: 'redo' } },
];

/**
 * Rich text editor used by the editorial pages module.
 *
 * The Worker sanitizes saved HTML, so this is deliberately a small, dependency
 * free surface: paragraph/heading blocks, inline emphasis, lists, quotes and
 * links, plus a raw-HTML mode for power users.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = '18rem',
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
}) {
  const id = useId();
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef(value);
  const [mode, setMode] = useState<'visual' | 'html'>('visual');
  const [empty, setEmpty] = useState(!value?.trim());

  // Mount: seed the DOM once (SSR-safe; contentEditable must not render children).
  // The stored HTML is admin-authored and sanitized by the Worker before it is saved.
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = lastEmitted.current;
    setEmpty(!lastEmitted.current.trim());
  }, []);

  // External resets (e.g. navigating between records) bypass the DOM.
  useEffect(() => {
    if (!editorRef.current || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editorRef.current.innerHTML = value;
    setEmpty(!value.trim());
  }, [value]);

  function emit() {
    const html = editorRef.current?.innerHTML ?? '';
    lastEmitted.current = html;
    setEmpty(!(editorRef.current?.textContent ?? '').trim() && !html.includes('<img'));
    onChange(html);
  }

  function run(command: Command) {
    editorRef.current?.focus();
    if (command.type === 'formatBlock') {
      document.execCommand('formatBlock', false, `<${command.value}>`);
    } else {
      document.execCommand(command.type, false);
    }
    emit();
  }

  function addLink() {
    const url = window.prompt('Tautan (https://…)', 'https://');
    if (!url) return;
    editorRef.current?.focus();
    document.execCommand('createLink', false, url);
    emit();
  }

  return (
    <div className={cn('overflow-hidden rounded-(--radius-card) border border-line bg-surface', className)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-canvas/60 px-1.5 py-1">
        {INLINE.map((action) => (
          <Button
            key={action.label}
            type="button"
            variant="ghost"
            size="icon-sm"
            title={action.label}
            aria-label={action.label}
            onClick={() => run(action.command)}
          >
            <action.icon />
          </Button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        {BLOCKS.slice(0, 2).map((action) => (
          <Button
            key={action.label}
            type="button"
            variant="ghost"
            size="icon-sm"
            title={action.label}
            aria-label={action.label}
            onClick={() => run(action.command)}
          >
            <action.icon />
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title="Paragraf"
          aria-label="Paragraf"
          onClick={() => run({ type: 'formatBlock', value: 'p' })}
        >
          <span className="text-xs font-semibold">¶</span>
        </Button>
        <span className="mx-1 h-4 w-px bg-line" />
        {BLOCKS.slice(2).map((action) => (
          <Button
            key={action.label}
            type="button"
            variant="ghost"
            size="icon-sm"
            title={action.label}
            aria-label={action.label}
            onClick={() => run(action.command)}
          >
            <action.icon />
          </Button>
        ))}
        <Button type="button" variant="ghost" size="icon-sm" title="Tautan" aria-label="Tautan" onClick={addLink}>
          <Link2 />
        </Button>
        <span className="mx-1 h-4 w-px bg-line" />
        {HISTORY.map((action) => (
          <Button
            key={action.label}
            type="button"
            variant="ghost"
            size="icon-sm"
            title={action.label}
            aria-label={action.label}
            onClick={() => run(action.command)}
          >
            <action.icon />
          </Button>
        ))}
        <Button
          type="button"
          variant={mode === 'html' ? 'secondary' : 'ghost'}
          size="sm"
          title="Lihat HTML"
          className="ml-auto"
          onClick={() => setMode(mode === 'visual' ? 'html' : 'visual')}
        >
          <Code2 /> HTML
        </Button>
      </div>

      {mode === 'visual' ? (
        <div className="relative">
          {empty ? (
            <span className="pointer-events-none absolute left-3.5 top-3 text-sm text-muted/70">
              {placeholder ?? 'Tulis konten…'}
            </span>
          ) : null}
          <div
            id={id}
            ref={editorRef}
            contentEditable
            role="textbox"
            aria-multiline="true"
            aria-label="Konten"
            tabIndex={0}
            suppressContentEditableWarning
            onInput={emit}
            onBlur={emit}
            className="prose-editorial min-h-(--rte-min) px-3.5 py-3 text-sm focus:outline-none"
            style={{ ['--rte-min' as string]: minHeight }}
          />
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(event) => {
            lastEmitted.current = event.target.value;
            onChange(event.target.value);
          }}
          spellCheck={false}
          className="block w-full resize-y bg-canvas/30 px-3.5 py-3 font-mono text-xs leading-relaxed focus:outline-none"
          style={{ minHeight }}
        />
      )}
    </div>
  );
}

export default RichTextEditor;
