import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatKES } from "@/utils/format";

const tick = { fontSize: 12, fill: "var(--muted-foreground)" };
const k = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v));

export function RaisedAreaChart({ data, dataKey = "raised" }: { data: Record<string, string | number>[]; dataKey?: string }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ left: -10, right: 8, top: 8 }}>
          <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="month" tick={tick} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={k} tick={tick} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v: number) => formatKES(v)} contentStyle={{ borderRadius: 12, border: "1px solid var(--border)" }} />
          <Area type="monotone" dataKey={dataKey} stroke="var(--primary)" strokeWidth={2.5} fill="url(#g)" name="Raised" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CountBarChart({ data, dataKey, label }: { data: Record<string, string | number>[]; dataKey: string; label: string }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="month" tick={tick} axisLine={false} tickLine={false} />
          <YAxis tick={tick} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)" }} />
          <Bar dataKey={dataKey} fill="var(--primary)" radius={[6, 6, 0, 0]} name={label} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
