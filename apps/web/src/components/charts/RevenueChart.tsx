import { format, parseISO } from 'date-fns';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMoney, formatMoneyCompact } from '@/lib/format';

/** Revenue actually received per day. Values arrive as integer paise. */
export function RevenueChart({ data }: { data: { date: string; amount: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
        <defs>
          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-teal-500)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--color-teal-500)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-ink-200)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(v: string) => format(parseISO(v), 'd MMM')}
          tick={{ fontSize: 11, fill: 'var(--color-ink-400)' }}
          axisLine={false}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tickFormatter={(v: number) => formatMoneyCompact(v)}
          tick={{ fontSize: 11, fill: 'var(--color-ink-400)' }}
          axisLine={false}
          tickLine={false}
          width={64}
        />
        <Tooltip
          formatter={(value: number) => [formatMoney(value), 'Received']}
          labelFormatter={(v: string) => format(parseISO(v), 'd MMMM yyyy')}
          contentStyle={{
            borderRadius: 10,
            border: '1px solid var(--color-ink-200)',
            fontSize: 12,
            boxShadow: 'var(--shadow-raised)',
          }}
        />
        <Area
          type="monotone"
          dataKey="amount"
          stroke="var(--color-teal-600)"
          strokeWidth={2}
          fill="url(#revenueFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
