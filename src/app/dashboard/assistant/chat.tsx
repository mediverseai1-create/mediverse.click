"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui";

type Msg = { role: "user" | "assistant"; content: string; supporting?: Record<string, unknown> };

const SUGGESTED = [
  "Which products are likely to run out soon?",
  "Which products are approaching expiration?",
  "What should we reorder this week?",
  "Which products have unusually high consumption?",
  "What is our current inventory value?",
  "Which inventory categories have the highest expenditure?",
  "How has our inventory consumption changed?",
  "Which suppliers have the best delivery performance?",
];

function Facts({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([k]) => k !== "forecast_note");
  return (
    <details className="mt-3 rounded border border-slate-200 bg-soft p-3 text-xs">
      <summary className="cursor-pointer font-medium text-slate-700">Supporting figures used for this answer</summary>
      <div className="mt-2 space-y-3">
        {entries.map(([k, v]) => (
          <div key={k}>
            <p className="font-semibold capitalize">{k.replace(/_/g, " ")}{k.includes("forecast") ? " (estimates)" : ""}</p>
            {Array.isArray(v) ? (
              v.length === 0 ? <p className="text-slate-500">None</p> : (
                <div className="overflow-x-auto"><table className="mt-1 w-full text-left"><thead><tr>{typeof v[0] === "object" && v[0] ? Object.keys(v[0] as object).map((h) => <th key={h} className="pr-3 font-medium text-slate-500">{h.replace(/_/g, " ")}</th>) : <th />}</tr></thead>
                  <tbody>{v.map((row, i) => <tr key={i} className="border-t border-slate-200">{typeof row === "object" && row ? Object.values(row as object).map((c, j) => <td key={j} className="py-1 pr-3">{String(c ?? "—")}</td>) : <td>{String(row)}</td>}</tr>)}</tbody></table></div>)
            ) : typeof v === "object" && v ? (
              <dl className="mt-1 grid grid-cols-2 gap-x-4 sm:grid-cols-3">{Object.entries(v as object).map(([a, b]) => <div key={a}><dt className="text-slate-500">{a.replace(/_/g, " ")}</dt><dd>{String(b)}</dd></div>)}</dl>
            ) : <p>{String(v)}</p>}
          </div>
        ))}
      </div>
    </details>
  );
}

export function Chat({ initialRemaining, limit }: { initialRemaining: number; limit: number }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; upgrade?: boolean }>();
  const [remaining, setRemaining] = useState(initialRemaining);
  const [conv, setConv] = useState<string>();
  const end = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setError(undefined); setBusy(true); setInput("");
    setMsgs((m) => [...m, { role: "user", content: q }]);
    try {
      const res = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: q, conversationId: conv }) });
      const json = await res.json();
      if (!res.ok) { setError({ text: json.error ?? "Something went wrong.", upgrade: json.upgrade }); setMsgs((m) => m.slice(0, -1)); setInput(q); if (json.limit) setRemaining(0); }
      else { setConv(json.conversationId); setRemaining(json.remaining); setMsgs((m) => [...m, { role: "assistant", content: json.answer, supporting: json.supporting }]); }
    } catch {
      setError({ text: "Network problem. Please try again." }); setMsgs((m) => m.slice(0, -1)); setInput(q);
    } finally { setBusy(false); setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth" }), 50); }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600" aria-live="polite">AI requests left this month: <strong>{remaining}</strong> of {limit}</p>
      {msgs.length === 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {SUGGESTED.map((s) => <button key={s} onClick={() => send(s)} disabled={busy || remaining === 0} className="rounded border border-slate-200 bg-white p-3 text-left text-sm hover:border-teal disabled:opacity-50">{s}</button>)}
        </div>
      )}
      <div className="space-y-4">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "ml-auto max-w-[85%] rounded-lg bg-navy px-4 py-3 text-sm text-white" : "max-w-[95%] rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm"}>
            <p className="whitespace-pre-wrap">{m.content}</p>
            {m.supporting && <Facts data={m.supporting} />}
          </div>
        ))}
        {busy && <p className="text-sm text-slate-500" role="status">Analyzing your inventory data…</p>}
        <div ref={end} />
      </div>
      {error && (
        <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error.text}{" "}
          {error.upgrade && <Link href="/dashboard/billing" className="font-medium underline">View plans</Link>}</div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000} placeholder="Ask about your inventory…" aria-label="Your question" disabled={remaining === 0}
          className="h-11 flex-1 rounded border border-slate-300 bg-white px-3 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal" />
        <Button type="submit" disabled={busy || !input.trim() || remaining === 0} aria-label="Send"><Send className="h-4 w-4" /></Button>
      </form>
      <p className="text-xs text-slate-500">The assistant reads summaries of your own organization's data and cannot change stock, create orders or approve anything. Estimates are labelled as estimates. Answers can be wrong: check important figures in the app.</p>
    </div>
  );
}
