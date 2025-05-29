export interface User {
  id: string;
  wallet_address: string;
  email?: string;
  username?: string;
  tier?: string;
  stage?: string;
  current_balance?: number;
  current_pnl?: number;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  market: string;
  position_type: 'Buy' | 'Sell';
  amount: number;
  entry_price: number;
  order_type: 'market' | 'limit';
  status: 'pending' | 'filled' | 'cancelled';
  created_at: string;
}

export interface Position {
  id: string;
  user_id: string;
  market: string;
  symbol: string;
  amount: number;
  entry_price: number;
  current_price: number;
  pnl: number;
  pnlPercentage: number;
  is_open: boolean;
  created_at: string;
  updated_at: string;
}

export interface Token {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  price_change_percentage_24h: number;
}

export interface OrderBookEntry {
  price: number;
  quantity: number;
}

export interface OrderBook {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
}

export interface Market {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  volume_24h: number;
  price_change_24h: number;
  high_24h: number;
  low_24h: number;
  circulating_supply: number;
  total_supply: number;
}