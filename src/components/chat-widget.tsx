import { useEffect, useState } from "react";
import { assistantChatFn, assistantPublicConfigFn } from "@/lib/nestora/assistant.fns";
import { Button, TextArea } from "@/components/ui";

function sessionId() {
  const key = "nestora-chat";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.localStorage.setItem(key, next);
  return next;
}

export function ChatWidget() {
  const [config, setConfig] = useState<{ enabled: boolean; name: string; greeting: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<{ from: "guest" | "nia"; text: string }[]>([]);

  useEffect(() => {
    assistantPublicConfigFn().then(setConfig).catch(() => setConfig({ enabled: false, name: "", greeting: "" }));
  }, []);
  if (!config?.enabled) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40">
      {open ? (
        <div className="mb-3 flex h-96 w-[min(100vw-2rem,22rem)] flex-col rounded-card bg-white shadow-lift">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <p className="font-medium">{config.name}</p>
            <button type="button" className="text-sm text-muted" onClick={() => setOpen(false)}>Close</button>
          </div>
          <ul className="flex-1 space-y-2 overflow-auto p-3 text-sm">
            <li className="text-muted">{config.greeting}</li>
            {lines.map((line, index) => (
              <li key={index} className={line.from === "guest" ? "text-right" : ""}>{line.text}</li>
            ))}
          </ul>
          <form className="border-t border-line p-2" onSubmit={(event) => {
            event.preventDefault();
            const next = text.trim();
            if (!next || busy) return;
            setLines((current) => [...current, { from: "guest", text: next }]);
            setText("");
            setBusy(true);
            assistantChatFn({ data: { sessionId: sessionId(), text: next } })
              .then((result) => setLines((current) => [...current, { from: "nia", text: result.reply || "Thanks, I have that." }]))
              .catch(() => setLines((current) => [...current, { from: "nia", text: "I couldn't send that. Try again in a moment." }]))
              .finally(() => setBusy(false));
          }}>
            <TextArea value={text} onChange={(event) => setText(event.target.value)} placeholder="Ask about a stay" rows={2} />
            <Button className="mt-2" type="submit" loading={busy} loadingLabel="Sending...">Send</Button>
          </form>
        </div>
      ) : null}
      <button type="button" className="ml-auto grid size-14 place-items-center rounded-full bg-primary text-sm font-medium text-surface shadow-lift" onClick={() => setOpen((value) => !value)}>
        Chat
      </button>
    </div>
  );
}
