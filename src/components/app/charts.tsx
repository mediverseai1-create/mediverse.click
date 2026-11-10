"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COLORS = ["#12A99A", "#101D32", "#5B8DB8", "#E0A030", "#8A6FB5", "#C9506B", "#7FAE5F"];

export function TrendChart({ data, label }: { data: { x: string; y: number }[]; label: string }) {
  if (!data.length) return <p className="py-10 text-center text-sm text-slate-500">No data in this period.</p>;
  return (
    <div role="img" aria-label={label} className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid stroke="#E2E8F0" vertical={false} />
          <XAxis dataKey="x" tick={{ fontSize: 11 }} tickMargin={6} />
          <YAxis tick={{ fontSize: 11 }} width={44} />
          <Tooltip />
          <Line type="monotone" dataKey="y" name={label} stroke="#12A99A" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarsChart({ data, label }: { data: { x: string; y: number }[]; label: string }) {
  if (!data.length) return <p className="py-10 text-center text-sm text-slate-500">No data in this period.</p>;
  return (
    <div role="img" aria-label={label} className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid stroke="#E2E8F0" vertical={false} />
          <XAxis dataKey="x" tick={{ fontSize: 11 }} interval={0} />
          <YAxis tick={{ fontSize: 11 }} width={50} />
          <Tooltip />
          <Bar dataKey="y" name={label} fill="#12A99A" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SharePie({ data, label }: { data: { name: string; value: number }[]; label: string }) {
  if (!data.length) return <p className="py-10 text-center text-sm text-slate-500">No stock recorded yet.</p>;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div role="img" aria-label={label} className="h-52 w-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={85}>{data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-1 text-sm">
        {data.map((d, i) => <li key={d.name} className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />{d.name}</li>)}
      </ul>
    </div>
  );
}
