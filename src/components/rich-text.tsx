import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, Color, FontSize } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import { getBearerToken } from "@/lib/auth/client";

export function RichTextEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const [htmlMode, setHtmlMode] = useState(false);
  const [html, setHtml] = useState(value);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
      TextStyle,
      Color,
      FontSize,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image,
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    content: value || "<p></p>",
    editorProps: { attributes: { class: "cms-body min-h-64 px-3 py-3 focus:outline-none" } },
    onUpdate: ({ editor: current }) => {
      const next = current.getHTML();
      setHtml(next);
      onChange(next);
    },
  }, [mounted]);

  async function uploadImage(file: File) {
    const body = new FormData();
    body.set("purpose", "cms");
    body.set("file", file);
    const token = getBearerToken();
    const response = await fetch("/api/media/upload", {
      method: "POST",
      body,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const payload = await response.json() as { url?: string; error?: string };
    if (!response.ok || !payload.url) throw new Error(payload.error ?? "Upload failed.");
    editor?.chain().focus().setImage({ src: payload.url }).run();
  }

  if (!mounted) return <div className="h-64 rounded-[10px] border border-line bg-white" />;

  return (
    <div className="overflow-hidden rounded-[10px] border border-line bg-white">
      <div className="flex flex-wrap gap-1 border-b border-line p-2">
        <Tool onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>H1</Tool>
        <Tool onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</Tool>
        <Tool onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>H3</Tool>
        <Tool onClick={() => editor?.chain().focus().setParagraph().run()}>P</Tool>
        <Tool onClick={() => editor?.chain().focus().toggleBold().run()}>B</Tool>
        <Tool onClick={() => editor?.chain().focus().toggleItalic().run()}>I</Tool>
        <Tool onClick={() => editor?.chain().focus().toggleUnderline().run()}>U</Tool>
        <Tool onClick={() => editor?.chain().focus().toggleStrike().run()}>S</Tool>
        <label className="grid size-8 place-items-center text-xs" title="Text color">
          A
          <input type="color" className="sr-only" onChange={(event) => editor?.chain().focus().setColor(event.target.value).run()} />
        </label>
        <label className="grid size-8 place-items-center text-xs" title="Highlight">
          H
          <input type="color" className="sr-only" defaultValue="#f6e7b2" onChange={(event) => editor?.chain().focus().toggleHighlight({ color: event.target.value }).run()} />
        </label>
        <select className="h-8 rounded-[8px] border border-line px-1 text-xs" defaultValue="" onChange={(event) => { if (event.target.value) editor?.chain().focus().setFontSize(event.target.value).run(); }}>
          <option value="">Size</option>
          {["14px", "16px", "18px", "24px", "32px"].map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
        <Tool onClick={() => editor?.chain().focus().setTextAlign("left").run()}>Left</Tool>
        <Tool onClick={() => editor?.chain().focus().setTextAlign("center").run()}>Center</Tool>
        <Tool onClick={() => editor?.chain().focus().setTextAlign("right").run()}>Right</Tool>
        <Tool onClick={() => editor?.chain().focus().toggleBulletList().run()}>List</Tool>
        <Tool onClick={() => editor?.chain().focus().toggleOrderedList().run()}>1.</Tool>
        <Tool onClick={() => {
          const href = window.prompt("Link address");
          if (href) editor?.chain().focus().extendMarkRange("link").setLink({ href }).run();
        }}>Link</Tool>
        <Tool onClick={() => editor?.chain().focus().toggleBlockquote().run()}>Quote</Tool>
        <Tool onClick={() => editor?.chain().focus().setHorizontalRule().run()}>Rule</Tool>
        <Tool onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>Table</Tool>
        <label className="inline-flex h-8 cursor-pointer items-center rounded-[8px] px-2 text-xs">
          Image
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void uploadImage(file).catch((error: unknown) => window.alert(error instanceof Error ? error.message : "Upload failed."));
          }} />
        </label>
        <Tool onClick={() => editor?.chain().focus().undo().run()}>Undo</Tool>
        <Tool onClick={() => editor?.chain().focus().redo().run()}>Redo</Tool>
        <Tool onClick={() => {
          if (!htmlMode && editor) setHtml(editor.getHTML());
          if (htmlMode && editor) editor.commands.setContent(html, { emitUpdate: false });
          setHtmlMode((mode) => !mode);
        }}>{htmlMode ? "Editor" : "HTML"}</Tool>
      </div>
      {htmlMode ? (
        <textarea className="min-h-64 w-full px-3 py-3 font-mono text-xs" value={html} onChange={(event) => { setHtml(event.target.value); onChange(event.target.value); }} />
      ) : (
        <EditorContent editor={editor} />
      )}
    </div>
  );
}

function Tool({ children, onClick }: { children: string; onClick: () => void }) {
  return <button type="button" className="h-8 rounded-[8px] px-2 text-xs hover:bg-bg" onClick={onClick}>{children}</button>;
}
