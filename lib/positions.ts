import { Position, User } from '@/lib/types';
import { supabase } from './supabase';

export async function fetchPositions(walletAddress: string): Promise<Position[]> {
  // First get the user's ID from their wallet address
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('wallet_address', walletAddress)
    .single();

  if (userError || !userData) {
    console.error('Error fetching user:', userError);
    return [];
  }

  // Then get positions using the user's ID
  const { data, error } = await supabase
    .from('active_positions')
    .select('*')
    .eq('user_id', userData.id)
    .eq('is_open', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching positions:', error);
    return [];
  }

  // Parse numeric values from strings and add symbol field
  return (data || []).map(position => ({
    ...position,
    symbol: position.market,
    amount: parseFloat(position.amount as unknown as string),
    entry_price: parseFloat(position.entry_price as unknown as string),
    current_price: parseFloat(position.current_price as unknown as string),
    pnl: parseFloat(position.pnl as unknown as string),
    pnlPercentage: position.entry_price > 0 
      ? (position.amount >= 0 
        ? ((position.current_price - position.entry_price) / position.entry_price) * 100
        : ((position.entry_price - position.current_price) / position.entry_price) * 100)
      : 0
  }));
}

export async function getCurrentUser(walletAddress: string): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('wallet_address', walletAddress)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updatePositionPrices(positions: Position[]): Promise<Position[]> {
  // In a real implementation, you would fetch current prices from your price feed
  // For now, we'll simulate price updates with small random changes
  return positions.map(position => ({
    ...position,
    currentPrice: position.current_price * (1 + (Math.random() - 0.5) * 0.001),
    pnl: 0, // This would be calculated based on the new currentPrice
    pnlPercentage: 0 // This would be calculated based on the new currentPrice
  }));
} 