'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { formatPrice } from '@/lib/api';
import { Loader } from 'lucide-react';
import { getCurrentUser, fetchPositions, closePosition } from '@/lib/api';
import { usePositionsReload } from './PositionsReloadContext';
import { Position } from '@/lib/types';

interface UserPositionsProps {
  reloadOrders: () => void;
}

export function UserPositions({ reloadOrders }: UserPositionsProps) {
  const { toast } = useToast();
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastFetchTimeRef = useRef<number>(Date.now());
  const CACHE_DURATION = 60000; // 1 minute cache

  const loadPositions = async () => {
    try {
      const walletAddress = localStorage.getItem('walletAddress');
      if (!walletAddress) {
        setError('Wallet not connected');
        return;
      }

      // Remove cache check to always get fresh data
      const positions = await fetchPositions(walletAddress);
      setPositions(positions.map((pos: any) => ({
        id: pos.id,
        user_id: pos.user_id || '',
        market: pos.symbol || pos.market || '',
        symbol: pos.symbol || pos.market || '',
        amount: Number(pos.amount) || 0,
        entry_price: Number(pos.entry_price) || 0,
        current_price: Number(pos.current_price) || 0,
        pnl: Number(pos.pnl) || 0,
        pnlPercentage: Number(pos.pnl_percentage) || 0,
        is_open: pos.is_open ?? true,
        created_at: pos.created_at || new Date().toISOString(),
        updated_at: pos.updated_at || new Date().toISOString()
      })));
      lastFetchTimeRef.current = Date.now();
      setError(null);
    } catch (err) {
      console.error('Error loading positions:', err);
      setError('Failed to load positions');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPositions();

    // Initialize WebSocket for all positions
    const initializeWebSocket = () => {
      // Filter out any invalid market symbols and ensure they exist
      const validSymbols = positions
        .filter(pos => pos.market && typeof pos.market === 'string')
        .map(pos => pos.market);
      
      if (validSymbols.length === 0) return;

      // Format symbols for Binance WebSocket (e.g., BTCUSDT -> btcusdt@ticker)
      const formattedSymbols = validSymbols
        .map(symbol => `${symbol.toLowerCase()}@ticker`)
        .join('/');

      console.log('Initializing WebSocket with symbols:', formattedSymbols); // Debug log

      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${formattedSymbols}`);
      
      ws.onopen = () => {
        console.log('WebSocket connection established'); // Debug log
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.e === 'ticker') {
            const symbol = data.s;
            const price = parseFloat(data.c);
            
            if (!isNaN(price)) {
              console.log(`Received price update for ${symbol}: ${price}`); // Debug log
              setPositions(prevPositions => 
                prevPositions.map(pos => {
                  // Compare symbols case-insensitively
                  if (pos.market && pos.market.toUpperCase() === symbol.toUpperCase()) {
                    const pnl = (price - pos.entry_price) * pos.amount;
                    const pnlPercentage = pos.entry_price ? ((price - pos.entry_price) / pos.entry_price) * 100 : 0;
                    return {
                      ...pos,
                      current_price: price,
                      pnl,
                      pnlPercentage
                    };
                  }
                  return pos;
                })
              );
            }
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        // Attempt to reconnect after a delay
        setTimeout(initializeWebSocket, 5000);
      };

      ws.onclose = () => {
        console.log('WebSocket connection closed, attempting to reconnect...'); // Debug log
        // Attempt to reconnect after a delay
        setTimeout(initializeWebSocket, 5000);
      };

      return ws;
    };

    let ws: WebSocket | null = null;
    if (positions.length > 0) {
      try {
        ws = initializeWebSocket() || null;
      } catch (error) {
        console.error('Error initializing WebSocket:', error);
        ws = null;
      }
    }

    // Set up periodic position refresh
    const refreshInterval = setInterval(() => {
      loadPositions();
    }, 30000); // Refresh every 30 seconds

    // Listen for position updates
    const handlePositionUpdate = () => {
      loadPositions();
    };

    // Listen for force position updates
    const handleForcePositionUpdate = () => {
      loadPositions();
    };

    window.addEventListener('positionUpdate', handlePositionUpdate);
    window.addEventListener('forcePositionUpdate', handleForcePositionUpdate);

    return () => {
      if (ws) {
        ws.close();
      }
      clearInterval(refreshInterval);
      window.removeEventListener('positionUpdate', handlePositionUpdate);
      window.removeEventListener('forcePositionUpdate', handleForcePositionUpdate);
    };
  }, [positions.map(p => p.market).join(',')]); // Re-run when the set of market symbols changes

  const handleClosePosition = async (positionId: string) => {
    try {
      const position = positions.find(p => p.id === positionId);
      if (!position) return;

      const success = await closePosition(positionId, position.current_price);
      if (success) {
        toast({
          title: "Position closed",
          description: "Your position has been closed successfully",
        });
        
        // Force immediate updates
        loadPositions(); // Reload positions immediately
        if (reloadOrders) reloadOrders(); // Trigger orders reload
        
        // Emit events to update other components
        const event = new CustomEvent('forcePositionUpdate', {
          detail: { timestamp: Date.now() }
        });
        window.dispatchEvent(event);
      } else {
        toast({
          title: "Failed to close position",
          description: "Please try again",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error closing position:', error);
      toast({
        title: "Error",
        description: "Failed to close position",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="h-full w-full bg-black flex flex-col">
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <span className="text-white text-base font-semibold">POSITIONS</span>
      </div>
      <div className="flex-1 overflow-y-auto px-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader className="w-6 h-6 text-white animate-spin" />
          </div>
        ) : error ? (
          <div className="text-red-500 text-center">{error}</div>
        ) : positions.length === 0 ? (
          <div className="text-neutral-400 text-center">No open positions</div>
        ) : (
          <div className="space-y-4">
            {positions.map((position) => (
              <div key={position.id} className="bg-neutral-900 rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-lg font-semibold ${position.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {position.market}
                    </span>
                    <span className={`text-sm px-2 py-1 rounded ${position.pnl >= 0 ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                      {position.pnl >= 0 ? 'LONG' : 'SHORT'}
                    </span>
                  </div>
                  <button
                    onClick={() => handleClosePosition(position.id)}
                    className="text-red-500 hover:text-red-400 text-sm font-medium"
                  >
                    Close
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-neutral-400">Amount</span>
                    <span className="text-white ml-2">{Number(position.amount || 0).toFixed(4)}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400">Entry Price</span>
                    <span className="text-white ml-2">${Number(position.entry_price || 0).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400">Current Price</span>
                    <span className="text-white ml-2">${Number(position.current_price || 0).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400">PnL</span>
                    <span className={`ml-2 ${position.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      ${Number(position.pnl || 0).toFixed(2)} ({Number(position.pnlPercentage || 0).toFixed(2)}%)
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}