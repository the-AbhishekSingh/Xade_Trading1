import { supabase } from './supabase';
import { Position, PositionFilters, PositionUpdate } from './types';
import { v4 as uuidv4 } from 'uuid';

// Constants
const MAX_LEVERAGE = 50;
const MAINTENANCE_MARGIN_RATE = 0.005; // 0.5% maintenance margin
const INITIAL_MARGIN_RATE = 0.01; // 1% initial margin

export class PositionsService {
  // Create a new position
  static async createPosition(
    userId: string,
    market: string,
    amount: number,
    entryPrice: number,
    collateral: number,
    leverage: number,
    marginMode: 'isolated' | 'cross'
  ): Promise<Position | null> {
    try {
      // Validate leverage
      if (leverage > MAX_LEVERAGE) {
        throw new Error(`Leverage cannot exceed ${MAX_LEVERAGE}x`);
      }

      // Calculate liquidation price
      const liquidationPrice = this.calculateLiquidationPrice(
        amount,
        entryPrice,
        collateral,
        leverage,
        marginMode
      );

      const position: Position = {
        id: uuidv4(),
        user_id: userId,
        market,
        symbol: market,
        amount,
        entry_price: entryPrice,
        current_price: entryPrice,
        collateral,
        leverage,
        liquidation_price: liquidationPrice,
        margin_mode: marginMode,
        pnl: 0,
        pnlPercentage: 0,
        is_open: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('active_positions')
        .insert(position)
        .select()
        .single();

      if (error) throw error;
      return data as Position;
    } catch (error) {
      console.error('Error creating position:', error);
      return null;
    }
  }

  // Get user's positions with filters
  static async getPositions(
    userId: string,
    filters?: PositionFilters
  ): Promise<Position[]> {
    try {
      let query = supabase
        .from('active_positions')
        .select('*')
        .eq('user_id', userId);

      if (filters) {
        if (filters.market) {
          query = query.eq('market', filters.market);
        }
        if (filters.minSize) {
          query = query.gte('amount', filters.minSize);
        }
        if (filters.maxSize) {
          query = query.lte('amount', filters.maxSize);
        }
        if (filters.minPnL) {
          query = query.gte('pnl', filters.minPnL);
        }
        if (filters.maxPnL) {
          query = query.lte('pnl', filters.maxPnL);
        }
        if (filters.marginMode) {
          query = query.eq('margin_mode', filters.marginMode);
        }
        if (filters.isOpen !== undefined) {
          query = query.eq('is_open', filters.isOpen);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Position[];
    } catch (error) {
      console.error('Error fetching positions:', error);
      return [];
    }
  }

  // Update position with new price
  static async updatePosition(
    positionId: string,
    currentPrice: number
  ): Promise<Position | null> {
    try {
      const { data: position, error: fetchError } = await supabase
        .from('active_positions')
        .select('*')
        .eq('id', positionId)
        .single();

      if (fetchError) throw fetchError;

      const pos = position as Position;
      const pnl = this.calculatePnL(pos, currentPrice);
      const pnlPercentage = this.calculatePnLPercentage(pos, currentPrice);
      const liquidationPrice = this.calculateLiquidationPrice(
        pos.amount,
        currentPrice,
        pos.collateral,
        pos.leverage,
        pos.margin_mode
      );

      const { data, error } = await supabase
        .from('active_positions')
        .update({
          current_price: currentPrice,
          pnl,
          pnlPercentage,
          liquidation_price: liquidationPrice,
          updated_at: new Date().toISOString()
        })
        .eq('id', positionId)
        .select()
        .single();

      if (error) throw error;
      return data as Position;
    } catch (error) {
      console.error('Error updating position:', error);
      return null;
    }
  }

  // Close or reduce position
  static async closePosition(
    positionId: string,
    closeAmount?: number
  ): Promise<boolean> {
    try {
      const { data: position, error: fetchError } = await supabase
        .from('active_positions')
        .select('*')
        .eq('id', positionId)
        .single();

      if (fetchError) throw fetchError;

      const pos = position as Position;
      if (closeAmount && closeAmount >= Math.abs(pos.amount)) {
        // Close entire position
        const { error } = await supabase
          .from('active_positions')
          .update({
            is_open: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', positionId);
        if (error) throw error;
      } else if (closeAmount) {
        // Reduce position
        const newAmount = pos.amount > 0
          ? pos.amount - closeAmount
          : pos.amount + closeAmount;

        const { error } = await supabase
          .from('active_positions')
          .update({
            amount: newAmount,
            updated_at: new Date().toISOString()
          })
          .eq('id', positionId);
        if (error) throw error;
      }

      return true;
    } catch (error) {
      console.error('Error closing position:', error);
      return false;
    }
  }

  // Calculate PnL
  private static calculatePnL(position: Position, currentPrice: number): number {
    return position.amount >= 0
      ? (currentPrice - position.entry_price) * position.amount
      : (position.entry_price - currentPrice) * Math.abs(position.amount);
  }

  // Calculate PnL percentage
  private static calculatePnLPercentage(
    position: Position,
    currentPrice: number
  ): number {
    return position.entry_price > 0
      ? (position.amount >= 0
        ? ((currentPrice - position.entry_price) / position.entry_price) * 100
        : ((position.entry_price - currentPrice) / position.entry_price) * 100)
      : 0;
  }

  // Calculate liquidation price
  private static calculateLiquidationPrice(
    amount: number,
    entryPrice: number,
    collateral: number,
    leverage: number,
    marginMode: 'isolated' | 'cross'
  ): number {
    const positionValue = Math.abs(amount) * entryPrice;
    const margin = positionValue / leverage;
    const maintenanceMargin = positionValue * MAINTENANCE_MARGIN_RATE;

    if (marginMode === 'isolated') {
      return amount > 0
        ? entryPrice * (1 - (collateral - maintenanceMargin) / positionValue)
        : entryPrice * (1 + (collateral - maintenanceMargin) / positionValue);
    } else {
      // Cross margin calculation would consider total account equity
      return amount > 0
        ? entryPrice * (1 - (collateral - maintenanceMargin) / positionValue)
        : entryPrice * (1 + (collateral - maintenanceMargin) / positionValue);
    }
  }

  // Check if position is liquidatable
  static isLiquidatable(position: Position): boolean {
    const maintenanceMargin = Math.abs(position.amount) * position.current_price * MAINTENANCE_MARGIN_RATE;
    const margin = position.collateral;
    return margin <= maintenanceMargin;
  }
} 