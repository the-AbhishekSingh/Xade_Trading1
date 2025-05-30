'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUser } from '@/lib/auth';
import { createOrder } from '@/lib/trading';
import { Loader } from 'lucide-react';
import { usePositionsReload } from './PositionsReloadContext';

interface TradePanelProps {
  market: string;
  currentPrice?: number;
}

export function TradePanel({ market, currentPrice = 0 }: TradePanelProps) {
  const { toast } = useToast();
  const [amount, setAmount] = useState<string>('');
  const [price, setPrice] = useState<number>(currentPrice);
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [total, setTotal] = useState<number>(0);
  const [inputMode, setInputMode] = useState<'token' | 'usdc'>('token');
  const [balance, setBalance] = useState<number>(0);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [leverage, setLeverage] = useState(5);
  const [availableMargin, setAvailableMargin] = useState(0);
  const userFetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchTimeRef = useRef<number>(Date.now());
  const CACHE_DURATION = 60000; // 1 minute cache
  const { reloadPositions } = usePositionsReload();
  const [summaryOpen, setSummaryOpen] = useState(true);
  
  useEffect(() => {
    // Update price when currentPrice changes
    if (currentPrice > 0) {
      setPrice(currentPrice);
    }
  }, [currentPrice]);
  
  useEffect(() => {
    // Calculate total based on amount and price
    if (amount === '') {
      setTotal(0);
    } else {
      const amountValue = parseFloat(amount);
      if (inputMode === 'token') {
        setTotal(amountValue * price);
      } else {
        setTotal(amountValue);
      }
    }
  }, [amount, price, inputMode]);

  // Separate effect for user data fetching
  useEffect(() => {
    const walletAddr = localStorage.getItem('walletAddress') || '';
    setWalletAddress(walletAddr);
    
    if (walletAddr) {
      // Initial fetch
      updateUserData(walletAddr);

      // Set up polling for user data updates
      const pollInterval = setInterval(() => {
        updateUserData(walletAddr);
      }, 2000); // Poll every 2 seconds

      return () => {
        clearInterval(pollInterval);
      };
    }
  }, []); // Only run on mount

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow empty string, numbers, and decimal points
    if (value === '' || /^[0-9]*\.?[0-9]*$/.test(value)) {
      setAmount(value);
    }
  };

  const handleTotalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow empty string, numbers, and decimal points
    if (value === '' || /^[0-9]*\.?[0-9]*$/.test(value)) {
      setAmount(value === '' ? '' : (parseFloat(value) / price).toString());
    }
  };

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow empty string, numbers, and decimal points
    if (value === '' || /^[0-9]*\.?[0-9]*$/.test(value)) {
      setPrice(parseFloat(value) || 0);
    }
  };

  // Add event emitter for order updates
  const emitOrderUpdate = () => {
    const event = new CustomEvent('orderUpdate', {
      detail: { timestamp: Date.now() }
    });
    window.dispatchEvent(event);
  };

  // Add event emitter for position updates
  const emitPositionUpdate = () => {
    const event = new CustomEvent('positionUpdate', {
      detail: { timestamp: Date.now() }
    });
    window.dispatchEvent(event);
  };

  // Add function to update user data
  const updateUserData = async (walletAddr: string) => {
    try {
      const user = await getCurrentUser(walletAddr);
      if (user) {
        // Set buying power (current balance)
        const newBalance = user.current_balance || 0;
        setBalance(newBalance);
        
        // Set leverage (default to 5 if not set)
        const userLeverage = 5;
        setLeverage(userLeverage);
        
        // Calculate available margin (buying power * leverage)
        const margin = newBalance * userLeverage;
        setAvailableMargin(margin);
      }
    } catch (error) {
      console.error('Error updating user data:', error);
    }
  };

  const handleOrder = async (positionType: 'Buy' | 'Sell') => {
    if (!walletAddress) {
      toast({
        title: "Not connected",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    if (amount === '') {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    // Calculate order value based on input mode
    let orderValue: number;
    let orderAmount: number;
    
    if (inputMode === 'usdc') {
      orderValue = parseFloat(amount);
      orderAmount = orderValue / price;
    } else {
      orderAmount = parseFloat(amount);
      orderValue = orderAmount * price;
    }

    // Check if user has enough balance for the order
    if (orderValue > balance) {
      toast({
        title: "Insufficient balance",
        description: `You need ${orderValue.toFixed(2)} USDC but have ${balance.toFixed(2)} USDC`,
        variant: "destructive",
      });
      return;
    }

    // Check if user has enough margin for leveraged trading
    if (positionType === 'Buy' && orderValue > availableMargin) {
      toast({
        title: "Insufficient margin",
        description: `You need ${orderValue.toFixed(2)} USDC margin but have ${availableMargin.toFixed(2)} USDC available`,
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      const result = await createOrder(
        walletAddress,
        market,
        positionType,
        orderAmount,
        price,
        orderType
      );
      
      if (result) {
        // Update user data immediately
        await updateUserData(walletAddress);

        toast({
          title: "Order placed successfully",
          description: `${positionType} ${orderAmount.toFixed(4)} ${market} at $${price.toFixed(2)}`,
        });
        
        // Reset form
        setAmount('');
        
        // Trigger updates immediately
        reloadPositions(); // Trigger positions reload
        emitOrderUpdate(); // Emit order update event
        emitPositionUpdate(); // Emit position update event

        // Force an immediate position reload
        const event = new CustomEvent('forcePositionUpdate', {
          detail: { timestamp: Date.now() }
        });
        window.dispatchEvent(event);

        // Force an immediate user data update
        lastFetchTimeRef.current = 0; // Reset cache to force immediate update
        await updateUserData(walletAddress);
      } else {
        toast({
          title: "Failed to place order",
          description: "Please check your balance and try again",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error placing order:', error);
      toast({
        title: "Error placing order",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full w-full bg-black px-0 py-0 flex flex-col gap-0">
      {/* Account Summary Collapsible Header */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2 cursor-pointer select-none" onClick={() => setSummaryOpen(!summaryOpen)}>
        <span className="text-white text-base font-semibold">ACCOUNT SUMMARY</span>
        <svg className={`w-4 h-4 text-white transition-transform ${summaryOpen ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </div>
      {summaryOpen && (
        <div className="bg-black px-6 pb-2">
          <div className="flex flex-col gap-1 text-white text-sm mb-2">
            <div className="flex justify-between items-center">
              <span className="text-neutral-400">Buying Power</span>
              <span className="text-white font-semibold">${Number(balance || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-neutral-400">Available Margin</span>
              <span className="text-white font-semibold">${Number(availableMargin || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-neutral-400">Leverage</span>
              <span className="text-white font-semibold">x{Number(leverage || 1)}</span>
            </div>
          </div>
        </div>
      )}
      {/* Order Form */}
      <div className="bg-black px-6 pb-4 flex flex-col gap-2">
        <div className="flex gap-2 mb-2">
          <button 
            className={`flex-1 py-2 rounded text-white font-semibold ${orderType === 'market' ? 'bg-green-500' : 'bg-neutral-900 border border-neutral-800'}`} 
            onClick={() => setOrderType('market')}
          >
            MARKET
          </button>
          <button 
            className={`flex-1 py-2 rounded text-white font-semibold ${orderType === 'limit' ? 'bg-green-500' : 'bg-neutral-900 border border-neutral-800'}`} 
            onClick={() => setOrderType('limit')}
          >
            LIMIT
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <Label className="text-white text-sm">Amount</Label>
              <div className="flex gap-2">
                <button 
                  className={`text-xs px-2 py-1 rounded ${inputMode === 'token' ? 'bg-green-500 text-white' : 'bg-neutral-800 text-neutral-400'}`}
                  onClick={() => setInputMode('token')}
                >
                  {market.replace('USDT', '')}
                </button>
                <button 
                  className={`text-xs px-2 py-1 rounded ${inputMode === 'usdc' ? 'bg-green-500 text-white' : 'bg-neutral-800 text-neutral-400'}`}
                  onClick={() => setInputMode('usdc')}
                >
                  USDC
                </button>
              </div>
            </div>
            <Input
              type="text"
              value={amount}
              onChange={handleAmountChange}
              placeholder="0.00"
              className="bg-neutral-900 border-neutral-800 text-white"
            />
          </div>
          {orderType === 'limit' && (
            <div className="flex flex-col gap-1">
              <Label className="text-white text-sm">Price</Label>
              <Input
                type="text"
                value={price}
                onChange={handlePriceChange}
                placeholder="0.00"
                className="bg-neutral-900 border-neutral-800 text-white"
              />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <Label className="text-white text-sm">Total</Label>
            <Input
              type="text"
              value={total.toFixed(2)}
              onChange={handleTotalChange}
              placeholder="0.00"
              className="bg-neutral-900 border-neutral-800 text-white"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-2">
          <button 
            className="flex-1 bg-green-500 text-white font-semibold rounded py-2"
            onClick={() => handleOrder('Buy')}
            disabled={isLoading || !amount || parseFloat(amount) <= 0}
          >
            {isLoading ? 'PLACING ORDER...' : 'BUY/LONG'}
          </button>
          <button 
            className="flex-1 bg-red-500 text-white font-semibold rounded py-2"
            onClick={() => handleOrder('Sell')}
            disabled={isLoading || !amount || parseFloat(amount) <= 0}
          >
            {isLoading ? 'PLACING ORDER...' : 'SELL/SHORT'}
          </button>
        </div>
      </div>
    </div>
  );
}