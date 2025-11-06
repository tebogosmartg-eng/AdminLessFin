import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { HelpCircle } from 'lucide-react';

interface FinancialRatiosProps {
  ratios: {
    currentRatio: number | null;
    netProfitMargin: number | null;
    debtToEquity: number | null;
    returnOnEquity: number | null;
    returnOnAssets: number | null;
  };
}

const RatioCard = ({ title, value, tooltip }: { title: string, value: string, tooltip: string }) => (
  <Card>
    <CardHeader className="pb-2">
      <CardDescription className="flex items-center justify-between">
        {title}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <p>{tooltip}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardDescription>
      <CardTitle className="text-3xl">{value}</CardTitle>
    </CardHeader>
  </Card>
);

const FinancialRatios = ({ ratios }: FinancialRatiosProps) => {
  const formatRatio = (value: number | null) => {
    if (value === null || !isFinite(value)) return 'N/A';
    return value.toFixed(2);
  };

  const formatPercentage = (value: number | null) => {
    if (value === null || !isFinite(value)) return 'N/A';
    return `${(value * 100).toFixed(2)}%`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold mb-2">Profitability Ratios</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <RatioCard 
            title="Net Profit Margin" 
            value={formatPercentage(ratios.netProfitMargin)}
            tooltip="Measures how much net income is generated as a percentage of revenue. (Net Income / Total Income)"
          />
          <RatioCard 
            title="Return on Equity (ROE)" 
            value={formatPercentage(ratios.returnOnEquity)}
            tooltip="Measures the profitability of a corporation in relation to shareholders’ equity. (Net Income / Total Equity)"
          />
          <RatioCard 
            title="Return on Assets (ROA)" 
            value={formatPercentage(ratios.returnOnAssets)}
            tooltip="Indicates how profitable a company is in relation to its total assets. (Net Income / Total Assets)"
          />
        </div>
      </div>
      <div>
        <h3 className="text-xl font-semibold mb-2">Liquidity Ratios</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <RatioCard 
            title="Current Ratio" 
            value={formatRatio(ratios.currentRatio)}
            tooltip="Measures a company's ability to pay short-term obligations. (Current Assets / Current Liabilities)"
          />
        </div>
      </div>
      <div>
        <h3 className="text-xl font-semibold mb-2">Solvency Ratios</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <RatioCard 
            title="Debt-to-Equity Ratio" 
            value={formatRatio(ratios.debtToEquity)}
            tooltip="Indicates the relative proportion of shareholders' equity and debt used to finance a company's assets. (Total Liabilities / Total Equity)"
          />
        </div>
      </div>
    </div>
  );
};

export default FinancialRatios;