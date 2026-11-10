// Clearly illustrative layout. The figures below are placeholders and are NOT customer data.
export function DashboardPreview() {
  const tiles = ["Total inventory value", "Low-stock items", "Expiring soon", "Pending purchase orders"];
  const bars = [38, 52, 44, 66, 58, 74, 62, 80];
  return (
    <figure className="overflow-hidden rounded-2xl border border-navy/10 bg-white shadow-xl">
      <div className="flex items-center gap-1.5 border-b border-slate-100 bg-soft px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" /><span className="h-2.5 w-2.5 rounded-full bg-slate-300" /><span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        <span className="ml-3 text-xs text-slate-500">Overview</span>
      </div>
      <div className="grid gap-4 p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((t) => (
            <div key={t} className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500">{t}</p>
              <p className="mt-2 text-xl font-bold text-slate-300">—</p>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500">Consumption trend</p>
          <div className="mt-3 flex h-28 items-end gap-2" aria-hidden>
            {bars.map((h, i) => <div key={i} className="flex-1 rounded-t bg-teal/70" style={{ height: `${h}%` }} />)}
          </div>
        </div>
      </div>
      <figcaption className="border-t border-slate-100 bg-soft px-5 py-3 text-xs text-slate-500">
        Illustrative layout only. Your dashboard shows figures calculated from your own organization&apos;s records.
      </figcaption>
    </figure>
  );
}
