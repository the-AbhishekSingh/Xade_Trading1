import React from 'react';
import { Position } from '@/lib/types';

interface PortfolioSummaryProps {
  balance: number; // Wallet balance
  positions: Position[];
  maxLeverage: number;
}

function getPortfolioSummary(balance: number, positions: Position[], maxLeverage: number) {
  const unrealizedPnl = positions.reduce((sum, p) => sum + (p.is_open ? p.pnl : 0), 0);
  const usedMargin = positions.reduce((sum, p) => sum + (p.is_open ? p.collateral : 0), 0);
  const accountEquity = balance + unrealizedPnl;
  const availableMargin = accountEquity - usedMargin;
  const buyingPower = availableMargin * maxLeverage;
  return { accountEquity, usedMargin, availableMargin, buyingPower, unrealizedPnl };
}

export const PortfolioSummary: React.FC<PortfolioSummaryProps> = ({ balance, positions, maxLeverage }) => {
  const { accountEquity, usedMargin, availableMargin, buyingPower, unrealizedPnl } = getPortfolioSummary(balance, positions, maxLeverage);

  return (
    <div className="flex flex-wrap gap-4 bg-neutral-900 rounded-lg p-4 mb-4">
      <div className="flex flex-col min-w-[120px]">
        <span className="text-xs text-neutral-400">Account Equity</span>
        <span className="text-base font-semibold text-white">${accountEquity.toFixed(2)}</span>
      </div>
      <div className="flex flex-col min-w-[120px]">
        <span className="text-xs text-neutral-400">Used Margin</span>
        <span className="text-base font-semibold text-white">${usedMargin.toFixed(2)}</span>
      </div>
      <div className="flex flex-col min-w-[120px]">
        <span className="text-xs text-neutral-400">Available Margin</span>
        <span className="text-base font-semibold text-white">${availableMargin.toFixed(2)}</span>
      </div>
      <div className="flex flex-col min-w-[120px]">
        <span className="text-xs text-neutral-400">Buying Power</span>
        <span className="text-base font-semibold text-white">${buyingPower.toFixed(2)}</span>
      </div>
      <div className="flex flex-col min-w-[120px]">
        <span className="text-xs text-neutral-400">Unrealized PnL</span>
        <span className={`text-base font-semibold ${unrealizedPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>${unrealizedPnl.toFixed(2)}</span>
      </div>
    </div>
  );
}; 