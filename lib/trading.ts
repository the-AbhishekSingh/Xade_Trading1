import { supabase } from './supabase';
import { v4 as uuidv4 } from 'uuid';
import { Order, Position, User } from './types';
import { updateUserBalance } from './auth';

// Create a new order
export const createOrder = async (
  walletAddress: string,
  market: string,
  positionType: 'Buy' | 'Sell',
  amount: number,
  entryPrice: number,
  orderType: 'market' | 'limit' = 'market'
): Promise<Order | null> => {
  try {
    // First get the user's ID from their wallet address
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, current_balance')
      .eq('wallet_address', walletAddress)
      .single();

    if (userError || !userData) {
      console.error('Error: User not found or invalid wallet address');
      return null;
    }

    // Calculate total cost
    const totalCost = amount * entryPrice;

    // Check if user has enough balance for buy orders
    if (positionType === 'Buy' && totalCost > userData.current_balance) {
      console.error('Error: Insufficient balance');
      return null;
    }

    // Ensure all required fields are present and match the schema
    const newOrder = {
      id: uuidv4(),
      user_id: userData.id,
      market,
      position_type: positionType,
      amount,
      entry_price: entryPrice,
      order_type: orderType,
      status: 'filled' // For now, we'll mark all orders as filled immediately
    };
    
    // Insert the order
    const { data, error } = await supabase
      .from('orders')
      .insert(newOrder)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating order:', error);
      return null;
    }

    // Calculate new balance
    const newBalance = positionType === 'Buy' 
      ? userData.current_balance - totalCost
      : userData.current_balance + totalCost;
    
    // Update user balance
    const { error: balanceError } = await supabase
      .from('users')
      .update({ 
        current_balance: newBalance 
      })
      .eq('id', userData.id);

    if (balanceError) {
      console.error('Error updating user balance:', balanceError);
      // Try to rollback the order
      await supabase
        .from('orders')
        .delete()
        .eq('id', data.id);
      return null;
    }
    
    // Create a new position for both buy and sell orders
    const positionResult = await createPosition(
      userData.id, 
      market, 
      positionType === 'Buy' ? amount : -amount, // Negative amount for sell orders
      entryPrice
    );
    if (!positionResult) {
      console.error('Error creating position');
      // Try to rollback the order and balance
      await supabase
        .from('orders')
        .delete()
        .eq('id', data.id);
      await supabase
        .from('users')
        .update({ 
          current_balance: userData.current_balance 
        })
        .eq('id', userData.id);
      return null;
    }
    
    return data as Order;
  } catch (error) {
    console.error('Error in createOrder:', error);
    return null;
  }
};

// Get user's orders
export const getUserOrders = async (walletAddress: string): Promise<Order[]> => {
  try {
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

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', userData.id)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching user orders:', error);
      return [];
    }
    
    // Convert numeric strings back to numbers
    return (data as Order[]).map(order => ({
      ...order,
      amount: parseFloat(order.amount as unknown as string),
      entry_price: parseFloat(order.entry_price as unknown as string)
    }));
  } catch (error) {
    console.error('Error in getUserOrders:', error);
    return [];
  }
};

// Create a new position
export const createPosition = async (
  userId: string,
  market: string,
  amount: number,
  entryPrice: number
): Promise<Position | null> => {
  try {
    // Set current price to entry price initially
    const currentPrice = entryPrice;
    // Calculate initial PnL (should be 0 for new position)
    const pnl = 0;

    // Check if there's an existing position for this market
    const { data: existingPosition, error: fetchError } = await supabase
      .from('active_positions')
      .select('*')
      .eq('user_id', userId)
      .eq('market', market)
      .eq('is_open', true)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      console.error('Error checking existing position:', fetchError);
      return null;
    }

    if (existingPosition) {
      // Update existing position
      const newAmount = parseFloat(existingPosition.amount) + amount;
      const { data: updatedPosition, error: updateError } = await supabase
        .from('active_positions')
        .update({
          amount: newAmount,
          entry_price: entryPrice,
          current_price: currentPrice,
          pnl: 0
        })
        .eq('id', existingPosition.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating existing position:', updateError);
        return null;
      }

      return {
        ...updatedPosition,
        amount: parseFloat(updatedPosition.amount as unknown as string),
        entry_price: parseFloat(updatedPosition.entry_price as unknown as string),
        current_price: parseFloat(updatedPosition.current_price as unknown as string),
        pnl: parseFloat(updatedPosition.pnl as unknown as string)
      } as Position;
    }

    // Create new position if none exists
    const newPosition = {
      id: uuidv4(),
      user_id: userId,
      market,
      amount,
      entry_price: entryPrice,
      current_price: currentPrice,
      pnl: pnl,
      is_open: true
    };
    
    const { data, error } = await supabase
      .from('active_positions')
      .insert(newPosition)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating position:', error);
      return null;
    }
    
    // Return the position with all values properly set
    return {
      ...data,
      amount: parseFloat(data.amount as unknown as string),
      entry_price: parseFloat(data.entry_price as unknown as string),
      current_price: parseFloat(data.current_price as unknown as string),
      pnl: parseFloat(data.pnl as unknown as string)
    } as Position;
  } catch (error) {
    console.error('Error in createPosition:', error);
    return null;
  }
};

// Get user's active positions
export const getUserPositions = async (walletAddress: string): Promise<Position[]> => {
  try {
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
      .eq('is_open', true);
    
    if (error) {
      console.error('Error fetching user positions:', error);
      return [];
    }
    
    // Parse numeric values from strings
    return (data as Position[]).map(position => ({
      ...position,
      amount: parseFloat(position.amount as unknown as string),
      entry_price: parseFloat(position.entry_price as unknown as string),
      current_price: parseFloat(position.current_price as unknown as string),
      pnl: parseFloat(position.pnl as unknown as string)
    }));
  } catch (error) {
    console.error('Error in getUserPositions:', error);
    return [];
  }
};

// Close a position
export const closePosition = async (
  positionId: string,
  closePrice: number
): Promise<boolean> => {
  try {
    const { data, error: fetchError } = await supabase
      .from('active_positions')
      .select('*, users!inner(wallet_address)')
      .eq('id', positionId)
      .single();
    
    if (fetchError) {
      console.error('Error fetching position for closing:', fetchError);
      return false;
    }
    
    const position = data as Position & { users: { wallet_address: string } };
    const finalPnl = position.amount >= 0 
      ? (closePrice - position.entry_price) * position.amount  // Long position
      : (position.entry_price - closePrice) * Math.abs(position.amount);  // Short position
    
    // Update user balance with profit/loss
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('current_balance, current_pnl')
      .eq('id', position.user_id)
      .single();
    
    if (userError) {
      console.error('Error fetching user for balance update on position close:', userError);
      return false;
    }
    
    const user = userData as User;
    const newBalance = (user.current_balance || 0) + finalPnl;
    const newPnl = (user.current_pnl || 0) + finalPnl;
    
    // Update user balance and PnL
    const { error: balanceError } = await supabase
      .from('users')
      .update({ 
        current_balance: newBalance,
        current_pnl: newPnl
      })
      .eq('id', position.user_id);

    if (balanceError) {
      console.error('Error updating user balance:', balanceError);
      return false;
    }
    
    // Close the position
    const { error: updateError } = await supabase
      .from('active_positions')
      .update({
        is_open: false,
        current_price: closePrice,
        pnl: finalPnl
      })
      .eq('id', positionId);
    
    if (updateError) {
      console.error('Error closing position:', updateError);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error in closePosition:', error);
    return false;
  }
};