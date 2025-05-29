import { Position, User } from '@/lib/types';
import { supabase } from './supabase';

export async function fetchPositions(walletAddress: string): Promise<Position[]> {
  const { data, error } = await supabase
    .from('positions')
    .select('*')
    .eq('wallet_address', walletAddress)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
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
    currentPrice: position.currentPrice * (1 + (Math.random() - 0.5) * 0.001),
    pnl: 0, // This would be calculated based on the new currentPrice
    pnlPercentage: 0 // This would be calculated based on the new currentPrice
  }));
} 