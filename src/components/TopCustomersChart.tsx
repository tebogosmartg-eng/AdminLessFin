import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatCurrency } from '../lib/utils';

type CustomerData = {
  name: string;
  amount: number;
};

interface TopCustomersChartProps {
  data: CustomerData[];
}

const TopCustomersChart = ({ data }: TopCustomersChartProps) => {
  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8 h-[300px] flex items-center justify-center">No revenue data for the current period.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
      >
        <XAxis type="number" hide />
        <YAxis 
          dataKey="name" 
          type="category" 
          width={100}
          tick={{ fontSize: 12 }} 
        />
        <Tooltip 
          cursor={{ fill: 'transparent' }}
          formatter={(value: number) => formatCurrency(value)}
        />
        <Bar dataKey="amount" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={32}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={index === 0 ? '#2563eb' : '#60a5fa'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

export default TopCustomersChart;