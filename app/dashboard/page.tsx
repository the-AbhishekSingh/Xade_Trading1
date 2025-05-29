'use client';

import { useState, useEffect, useRef } from 'react';
import { redirect } from 'next/navigation';
import { DashboardHeader } from '@/components/dashboard/header';
import { DashboardSidebar } from '@/components/dashboard/sidebar';
import { MarketSelector } from '@/components/dashboard/market-selector';
import { TradePanel } from '@/components/dashboard/trade-panel';
import { TradingViewChart } from '@/components/dashboard/tradingview-chart';
import { OrderBook } from '@/components/dashboard/order-book';
import { UserPositions } from '@/components/dashboard/user-positions';
import { UserOrders } from '@/components/dashboard/user-orders';
import { Skeleton } from '@/components/ui/skeleton';
import { Token, User, Position } from '@/lib/types';
import { fetchTopTokens, initializeWebSocket, closeWebSocket, getCurrentUser, fetchPositions } from '@/lib/api';
import { isAuthenticated, getWalletAddress, updateUserBalance } from '@/lib/auth';
import TokenSelect from '@/components/ui/token-select';
import { TradeButtons } from '@/components/dashboard/trade-buttons';
import { PositionsReloadProvider } from '@/components/dashboard/PositionsReloadContext';
import { useToast } from '@/hooks/use-toast';

// Mapping functions to ensure type safety and compatibility
const mapApiUserToUser = (apiUser: any): User => ({
  id: apiUser.id,
  wallet_address: apiUser.wallet_address ?? apiUser.walletAddress ?? '',
  email: apiUser.email ?? '',
  username: apiUser.username ?? '',
  tier: apiUser.tier ?? '',
  stage: apiUser.stage ?? '',
  current_balance: Number(apiUser.current_balance ?? apiUser.balance ?? 0),
  current_pnl: Number(apiUser.current_pnl ?? apiUser.currentPnl ?? 0),
  created_at: apiUser.created_at ?? apiUser.createdAt ?? '',
  updated_at: apiUser.updated_at ?? apiUser.updatedAt ?? new Date().toISOString()
});

const mapApiPositionToPosition = (apiPos: any): Position => ({
  id: apiPos.id,
  user_id: apiPos.user_id ?? '',
  market: apiPos.market ?? apiPos.symbol ?? '',
  symbol: apiPos.symbol ?? apiPos.market ?? '',
  amount: Number(apiPos.amount ?? apiPos.size ?? 0),
  entry_price: Number(apiPos.entry_price ?? apiPos.entryPrice ?? 0),
  current_price: Number(apiPos.current_price ?? apiPos.currentPrice ?? 0),
  pnl: Number(apiPos.pnl ?? 0),
  pnlPercentage: Number(apiPos.pnlPercentage ?? 0),
  is_open: apiPos.is_open ?? true,
  created_at: apiPos.created_at ?? apiPos.createdAt ?? new Date().toISOString(),
  updated_at: apiPos.updated_at ?? apiPos.updatedAt ?? new Date().toISOString()
});

export default function DashboardPage() {
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMarket, setSelectedMarket] = useState('BTCUSDT');
  const [tokens, setTokens] = useState<Token[]>([]);
  const [selectedToken, setSelectedToken] = useState<Token | undefined>();
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [pnl, setPnl] = useState({ value: 0, percentage: 0 });
  const [marginInfo, setMarginInfo] = useState({
    available: 0,
    used: 0,
    total: 0
  });
  const [ordersReloadSignal, setOrdersReloadSignal] = useState(0);
  const [positionsReloadSignal, setPositionsReloadSignal] = useState(0);
  const lastFetchTimeRef = useRef<number>(Date.now());
  const CACHE_DURATION = 60000; // 1 minute cache
  const priceUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const updateInterval = useRef<NodeJS.Timeout>();

  const reloadOrders = () => {
    setOrdersReloadSignal(prev => prev + 1);
  };

  const reloadPositions = () => {
    setPositionsReloadSignal(prev => prev + 1);
  };

  useEffect(() => {
    const initializeDashboard = async () => {
      setIsClient(true);

      // Check authentication
      if (!isAuthenticated()) {
        console.log('User not authenticated, redirecting to home...');
        redirect('/');
        return;
      }

      // Handle selected balance from pricing page
      const selectedBalance = localStorage.getItem('selectedBalance');
      const walletAddress = localStorage.getItem('walletAddress');
      if (selectedBalance && walletAddress) {
        // Update the user's balance in the database
        await updateUserBalance(walletAddress, Number(selectedBalance), 0);
        // Trigger a storage event to update other components
        window.dispatchEvent(new Event('storage'));
        localStorage.removeItem('selectedBalance');
      }

      // Fetch top tokens
      try {
        setIsLoading(true);
        const tokensData = await fetchTopTokens();
        setTokens(tokensData);
      } catch (error) {
        console.error('Error fetching tokens:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeDashboard();
  }, []);

  // Periodically refresh tokens every 5 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const tokensData = await fetchTopTokens();
        setTokens(tokensData);
      } catch (error) {
        console.error('Error refreshing tokens:', error);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Initialize WebSocket for all tokens
    if (tokens.length > 0) {
      const symbols = tokens.map(token => token.id);
      initializeWebSocket(symbols);
    }

    // Listen for price updates with debouncing
    const handlePriceUpdate = (event: CustomEvent) => {
      const { symbol, price } = event.detail;
      
      // Update current price for selected token
      if (selectedToken?.id === symbol) {
        if (priceUpdateTimeoutRef.current) {
          clearTimeout(priceUpdateTimeoutRef.current);
        }
        
        priceUpdateTimeoutRef.current = setTimeout(() => {
          setCurrentPrice(price);
        }, 100);
      }

      // Update position prices
      setPositions(prevPositions => {
        const updated = prevPositions.map(position => {
          if (position.market === symbol) {
            const pnl = (price - position.entry_price) * position.amount;
            const pnlPercentage = ((price - position.entry_price) / position.entry_price) * 100;
            return {
              ...position,
              current_price: price,
              pnl,
              pnlPercentage
            };
          }
          return position;
        });
        console.log('Positions after WebSocket update:', updated); // Debug log
        return updated;
      });
    };

    // Handle WebSocket errors
    const handleWebSocketError = (event: CustomEvent) => {
      console.error('WebSocket error:', event.detail.message);
      toast({
        title: "Connection Error",
        description: event.detail.message,
        variant: "destructive",
      });
    };

    window.addEventListener('priceUpdate', handlePriceUpdate as EventListener);
    window.addEventListener('websocketError', handleWebSocketError as EventListener);

    return () => {
      window.removeEventListener('priceUpdate', handlePriceUpdate as EventListener);
      window.removeEventListener('websocketError', handleWebSocketError as EventListener);
      closeWebSocket();
      if (priceUpdateTimeoutRef.current) {
        clearTimeout(priceUpdateTimeoutRef.current);
      }
    };
  }, [tokens, selectedToken]);

  useEffect(() => {
    // Update selected token when market changes
    const token = tokens.find(t => `${t.symbol}USDT` === selectedMarket);
    if (token) {
      setSelectedToken(token);
    }
  }, [selectedMarket, tokens]);

  useEffect(() => {
    const updatePortfolioValue = async () => {
      try {
        const walletAddress = localStorage.getItem('walletAddress');
        if (!walletAddress) return;

        const apiUser = await getCurrentUser(walletAddress);
        if (apiUser) {
          const user = mapApiUserToUser(apiUser);
          const apiPositions = await fetchPositions(user.wallet_address);
          const positions = apiPositions.map(mapApiPositionToPosition);
          const totalPnL = positions.reduce((acc, pos) => acc + pos.pnl, 0);
          const totalNotional = positions.reduce((sum, pos) => sum + (pos.amount * pos.entry_price), 0);
          const portfolioValue = (user.current_balance ?? 0) + totalPnL;
          // PnL percentage vs. portfolio value
          const pnlPercentage = portfolioValue ? (totalPnL / portfolioValue) * 100 : 0;

          setPortfolioValue(portfolioValue);
          setPnl({ value: totalPnL, percentage: pnlPercentage });
          lastFetchTimeRef.current = Date.now();
        }
      } catch (error) {
        console.error('Error updating portfolio value:', error);
      }
    };

    updatePortfolioValue();

    // Set up polling for portfolio updates
    const pollInterval = setInterval(() => {
      const now = Date.now();
      if (now - lastFetchTimeRef.current >= CACHE_DURATION) {
        updatePortfolioValue();
      }
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(pollInterval);
  }, []);

  // Unified fetch for user and positions in parallel
  const fetchUserAndPositions = async (walletAddress: string) => {
    setIsLoading(true);
    try {
      const [apiUser, apiPositions] = await Promise.all([
        getCurrentUser(walletAddress),
        fetchPositions(walletAddress)
      ]);
      if (apiUser && apiPositions) {
        const user = mapApiUserToUser(apiUser);
        const positions = apiPositions.map(mapApiPositionToPosition);
        setUser(user);
        setPositions(positions);
        console.log('Positions from backend:', positions); // Debug log
        const balance = user.current_balance ?? 0;
        setPortfolioValue(balance);
        const notional = positions.reduce((sum: number, p: Position) => sum + (p.amount * p.entry_price), 0);
        const buyingPower = balance * 5 - notional;
        setMarginInfo({
          available: buyingPower,
          used: notional,
          total: balance * 5
        });
        const totalPnL = positions.reduce((acc: number, pos: Position) => acc + pos.pnl, 0);
        const pnlPercentage = balance ? (totalPnL / balance) * 100 : 0;
        setPnl({ value: totalPnL, percentage: pnlPercentage });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Add a useEffect to recalculate portfolio values from latest state
  useEffect(() => {
    if (!user) return;
    console.log('Live positions state:', positions); // Debug log
    const totalPnL = positions.reduce((acc, pos) => acc + pos.pnl, 0);
    const totalNotional = positions.reduce((sum, pos) => sum + (pos.amount * pos.entry_price), 0);
    const portfolioValue = (user.current_balance ?? 0) + totalPnL;
    const pnlPercentage = portfolioValue ? (totalPnL / portfolioValue) * 100 : 0;

    setPortfolioValue(portfolioValue);
    setPnl({ value: totalPnL, percentage: pnlPercentage });
  }, [positions, user]);

  // On pre-load
  useEffect(() => {
    const walletAddress = localStorage.getItem('walletAddress');
    if (walletAddress) fetchUserAndPositions(walletAddress);
  }, []);

  // On refresh
  const handleRefresh = () => {
    const walletAddress = localStorage.getItem('walletAddress');
    if (walletAddress) fetchUserAndPositions(walletAddress);
  };

  // If not authenticated and on the client, redirect to home
  if (isClient && !isAuthenticated()) {
    console.log('Client-side auth check failed, redirecting...');
    redirect('/');
    return null;
  }

  const handleMarketChange = (market: string) => {
    setSelectedMarket(market);
  };

  const handleTokenSelect = (token: Token) => {
    setSelectedToken(token);
    setCurrentPrice(token.current_price);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader />
        <div className="flex">
          <DashboardSidebar />
          <main className="flex-1 p-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
              <Skeleton className="h-[500px] rounded-lg" />
              <Skeleton className="h-[500px] rounded-lg" />
              <Skeleton className="h-[500px] rounded-lg" />
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <PositionsReloadProvider>
      <div className="flex flex-col min-h-screen bg-black">
        <DashboardHeader />
        <MarketSelector 
          selectedMarket={selectedMarket}
          onMarketChange={handleMarketChange}
          tokens={tokens}
        />
        <div className="flex flex-row w-full bg-black border-b border-neutral-800" style={{height: '420px', minHeight: '420px', maxHeight: '420px'}}>
          <div className="flex-1 min-w-0 h-full m-0 p-0 overflow-hidden flex flex-col">
            <div className="h-full w-full">
              <TradingViewChart symbol={selectedMarket} />
            </div>
          </div>
          <div className="w-[340px] h-full border-l border-neutral-800 m-0 p-0 overflow-hidden flex flex-col">
            <OrderBook market={selectedMarket} />
          </div>
          <div className="w-[340px] h-full border-l border-neutral-800 m-0 p-0 overflow-hidden flex flex-col">
            <TradePanel market={selectedMarket} currentPrice={currentPrice ?? undefined} />
          </div>
        </div>
        <div className="flex flex-row items-center justify-between w-full px-8 py-0 bg-black border-b border-neutral-800 h-16">
          <div className="flex flex-col items-start justify-center">
            <span className="text-xs text-neutral-400">Portfolio Value</span>
            <span className="text-white text-lg font-semibold">${portfolioValue.toFixed(2)}</span>
          </div>
          <div className="flex flex-col items-start justify-center">
            <span className="text-xs text-neutral-400">PnL</span>
            <span className={`text-lg font-semibold ${pnl.value >= 0 ? 'text-green-400' : 'text-red-400'}`}>${pnl.value.toFixed(2)} ({pnl.percentage.toFixed(2)}%)</span>
          </div>
          <div className="flex flex-col items-start justify-center">
            <span className="text-xs text-neutral-400">Leverage</span>
            <span className="text-white text-lg font-semibold">x5</span>
          </div>
          <div className="flex flex-col items-start justify-center">
            <span className="text-xs text-neutral-400">Buying Power</span>
            <span className="text-white text-lg font-semibold">${marginInfo.available.toFixed(2)}</span>
          </div>
        </div>
        <div className="flex flex-row w-full bg-black min-h-0 border-t border-neutral-800" style={{height: '180px'}}>
          <div className="flex-1 flex flex-col border-r border-neutral-800 min-h-0">
            <UserPositions reloadOrders={reloadOrders} />
          </div>
          <div className="flex-1 flex flex-col min-h-0">
            <UserOrders ordersReloadSignal={ordersReloadSignal} />
          </div>
        </div>
      </div>
    </PositionsReloadProvider>
  );
}
