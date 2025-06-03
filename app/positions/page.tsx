'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { formatPrice, formatPercentage } from '@/lib/utils';
import { Position, User } from '@/lib/types';
import { fetchPositions, getCurrentUser, updatePositionPrices } from '@/lib/positions';

// Extend the Position interface to include symbol
interface ExtendedPosition extends Position {
  symbol: string;
}

const mapApiPositionToPosition = (apiPos: any): Position => ({
  id: apiPos.id,
  user_id: apiPos.user_id ?? '',
  market: apiPos.market ?? apiPos.symbol ?? '',
  symbol: apiPos.symbol ?? apiPos.market ?? '',
  amount: Number(apiPos.amount) || 0,
  entry_price: Number(apiPos.entry_price) || 0,
  current_price: Number(apiPos.current_price) || 0,
  pnl: Number(apiPos.pnl) || 0,
  pnlPercentage: Number(apiPos.pnl_percentage) || 0,
  is_open: apiPos.is_open,
  created_at: apiPos.created_at || new Date().toISOString(),
  updated_at: apiPos.updated_at || new Date().toISOString(),
  collateral: Number(apiPos.collateral) || 0,
  leverage: Number(apiPos.leverage) || 1,
  liquidation_price: Number(apiPos.liquidation_price) || 0,
  margin_mode: apiPos.margin_mode || 'cross',
});

export default function PositionsPage() {
  const [positions, setPositions] = useState<ExtendedPosition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isClosing, setIsClosing] = useState<string | null>(null);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<ExtendedPosition | null>(null);
  const [closePrice, setClosePrice] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const updateInterval = useRef<NodeJS.Timeout>();

  // Function to fetch positions with real-time prices
  const fetchPositionsWithPrices = async () => {
    try {
      if (!user?.wallet_address) return;
      
      const fetchedPositions = await fetchPositions(user.wallet_address);
      setPositions(fetchedPositions);
      setError(null);
    } catch (err) {
      console.error('Error fetching positions:', err);
      setError('Failed to fetch positions. Please try again.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Function to update position prices in real-time
  const updatePrices = async () => {
    try {
      const updatedPositions = await updatePositionPrices(positions);
      setPositions(updatedPositions);
    } catch (err) {
      console.error('Error updating prices:', err);
    }
  };

  useEffect(() => {
    const checkUser = async () => {
      try {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          const userData = JSON.parse(storedUser);
          const currentUser = await getCurrentUser(userData.wallet_address);
          setUser(currentUser);
        }
      } catch (err) {
        console.error('Error checking user:', err);
      }
    };

    checkUser();
  }, []);

  useEffect(() => {
    if (user?.wallet_address) {
      fetchPositionsWithPrices();
    }
  }, [user?.wallet_address]);

  // Set up real-time price updates
  useEffect(() => {
    if (positions.length > 0) {
      // Update prices every 5 seconds
      updateInterval.current = setInterval(updatePrices, 5000);
    }

    return () => {
      if (updateInterval.current) {
        clearInterval(updateInterval.current);
      }
    };
  }, [positions]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchPositionsWithPrices();
  };

  const handleCloseClick = (position: ExtendedPosition) => {
    setSelectedPosition(position);
    setShowCloseModal(true);
  };

  const handleCloseConfirm = () => {
    // Implement the logic to close the position
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Your Positions</h1>
          <div className="flex gap-4">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <Link
              href="/trade"
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              New Trade
            </Link>
          </div>
        </div>

        {error && (
          <div className="bg-red-500 text-white p-4 rounded-lg mb-4">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : positions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 mb-4">No open positions</p>
            <Link
              href="/trade"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Start Trading
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {positions.map((position) => (
              <div
                key={position.id}
                className="bg-gray-800 rounded-lg p-6 shadow-lg"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-xl font-semibold mb-2">
                      {position.symbol}
                    </h2>
                    <div className="flex gap-4 text-sm text-gray-400">
                      <span>Size: {position.amount.toFixed(4)}</span>
                      <span>Leverage: 5x</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-semibold ${
                      position.pnl >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {formatPrice(position.pnl)} ({formatPercentage(position.pnlPercentage)})
                    </div>
                    <div className="text-sm text-gray-400">
                      Entry: {formatPrice(position.entry_price)}
                    </div>
                    <div className="text-sm text-gray-400">
                      Current: {formatPrice(position.current_price)}
                    </div>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-400">
                    Opened: {new Date(position.created_at).toLocaleString()}
                  </div>
                  <button
                    onClick={() => handleCloseClick(position)}
                    disabled={isClosing === position.id}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {isClosing === position.id ? 'Closing...' : 'Close Position'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Close Position Modal */}
      {showCloseModal && selectedPosition && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4">Close Position</h2>
            <div className="mb-4">
              <p className="text-gray-400 mb-2">Current Price: {formatPrice(selectedPosition.current_price)}</p>
              <p className="text-gray-400 mb-2">Entry Price: {formatPrice(selectedPosition.entry_price)}</p>
              <p className="text-gray-400 mb-2">PnL: {formatPrice(selectedPosition.pnl)} ({formatPercentage(selectedPosition.pnlPercentage)})</p>
            </div>
            <div className="flex justify-end gap-4">
              <button
                onClick={() => setShowCloseModal(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleCloseConfirm}
                disabled={isClosing === selectedPosition.id}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {isClosing === selectedPosition.id ? 'Closing...' : 'Confirm Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 