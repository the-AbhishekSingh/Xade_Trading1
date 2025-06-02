import { useState, useEffect } from 'react';
import { Position, PositionFilters } from '@/lib/types';
import { PositionsService } from '@/lib/positions-service';
import { formatPrice, formatPercentage } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface PositionsTableProps {
  userId: string;
  onPositionUpdate?: () => void;
}

export function PositionsTable({ userId, onPositionUpdate }: PositionsTableProps) {
  const { toast } = useToast();
  const [positions, setPositions] = useState<Position[]>([]);
  const [filters, setFilters] = useState<PositionFilters>({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [closeAmount, setCloseAmount] = useState<string>('');

  // Load positions
  const loadPositions = async () => {
    try {
      setIsLoading(true);
      const data = await PositionsService.getPositions(userId, filters);
      setPositions(data);
    } catch (error) {
      console.error('Error loading positions:', error);
      toast({
        title: 'Error',
        description: 'Failed to load positions',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize WebSocket for real-time updates
  useEffect(() => {
    const ws = new WebSocket('wss://stream.binance.com:9443/ws');
    
    ws.onopen = () => {
      const symbols = positions.map(pos => pos.market.toLowerCase());
      const subscribeMsg = {
        method: 'SUBSCRIBE',
        params: symbols.map(symbol => `${symbol}@ticker`),
        id: 1
      };
      ws.send(JSON.stringify(subscribeMsg));
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.e === 'ticker') {
          const symbol = data.s;
          const price = parseFloat(data.c);
          
          if (!isNaN(price)) {
            const position = positions.find(
              pos => pos.market.toUpperCase() === symbol.toUpperCase()
            );
            
            if (position) {
              const updatedPosition = await PositionsService.updatePosition(
                position.id,
                price
              );
              
              if (updatedPosition) {
                setPositions(prev =>
                  prev.map(p =>
                    p.id === updatedPosition.id ? updatedPosition : p
                  )
                );
                
                // Check for liquidation
                if (PositionsService.isLiquidatable(updatedPosition)) {
                  toast({
                    title: 'Warning',
                    description: `Position ${updatedPosition.market} is close to liquidation!`,
                    variant: 'destructive',
                  });
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    };

    return () => {
      ws.close();
    };
  }, [positions]);

  // Load positions on mount and when filters change
  useEffect(() => {
    loadPositions();
  }, [filters]);

  // Handle position close
  const handleClosePosition = async () => {
    if (!selectedPosition) return;

    try {
      const amount = parseFloat(closeAmount);
      if (isNaN(amount) || amount <= 0) {
        toast({
          title: 'Error',
          description: 'Please enter a valid amount',
          variant: 'destructive',
        });
        return;
      }

      const success = await PositionsService.closePosition(
        selectedPosition.id,
        amount
      );

      if (success) {
        toast({
          title: 'Success',
          description: 'Position closed successfully',
        });
        loadPositions();
        if (onPositionUpdate) onPositionUpdate();
      } else {
        toast({
          title: 'Error',
          description: 'Failed to close position',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error closing position:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Input
          placeholder="Market"
          value={filters.market || ''}
          onChange={(e) => setFilters({ ...filters, market: e.target.value })}
        />
        <Select
          value={filters.marginMode || ''}
          onChange={(value) => setFilters({ ...filters, marginMode: value as 'isolated' | 'cross' })}
        >
          <option value="">All Margin Modes</option>
          <option value="isolated">Isolated</option>
          <option value="cross">Cross</option>
        </Select>
        <Input
          type="number"
          placeholder="Min Size"
          value={filters.minSize || ''}
          onChange={(e) => setFilters({ ...filters, minSize: parseFloat(e.target.value) })}
        />
        <Input
          type="number"
          placeholder="Max Size"
          value={filters.maxSize || ''}
          onChange={(e) => setFilters({ ...filters, maxSize: parseFloat(e.target.value) })}
        />
      </div>

      {/* Positions Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left">
              <th className="p-2">Market</th>
              <th className="p-2">Type</th>
              <th className="p-2">Size</th>
              <th className="p-2">Entry Price</th>
              <th className="p-2">Current Price</th>
              <th className="p-2">Leverage</th>
              <th className="p-2">Margin Mode</th>
              <th className="p-2">Liquidation Price</th>
              <th className="p-2">PnL</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((position) => (
              <tr key={position.id} className="border-t">
                <td className="p-2">{position.market}</td>
                <td className="p-2">
                  <span className={`px-2 py-1 rounded ${
                    position.amount >= 0
                      ? 'bg-green-500/20 text-green-500'
                      : 'bg-red-500/20 text-red-500'
                  }`}>
                    {position.amount >= 0 ? 'LONG' : 'SHORT'}
                  </span>
                </td>
                <td className="p-2">{Math.abs(position.amount).toFixed(4)}</td>
                <td className="p-2">${position.entry_price.toFixed(2)}</td>
                <td className="p-2">${position.current_price.toFixed(2)}</td>
                <td className="p-2">{position.leverage}x</td>
                <td className="p-2">{position.margin_mode}</td>
                <td className="p-2">${position.liquidation_price.toFixed(2)}</td>
                <td className="p-2">
                  <span className={position.pnl >= 0 ? 'text-green-500' : 'text-red-500'}>
                    ${position.pnl.toFixed(2)} ({position.pnlPercentage.toFixed(2)}%)
                  </span>
                </td>
                <td className="p-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setSelectedPosition(position)}
                  >
                    Close
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Close Position Modal */}
      {selectedPosition && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-96">
            <h3 className="text-lg font-semibold mb-4">Close Position</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Amount to Close</label>
                <Input
                  type="number"
                  value={closeAmount}
                  onChange={(e) => setCloseAmount(e.target.value)}
                  placeholder="Enter amount"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setSelectedPosition(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleClosePosition}
                >
                  Confirm Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 