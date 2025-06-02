-- Add new columns to active_positions table
ALTER TABLE active_positions
ADD COLUMN IF NOT EXISTS collateral DECIMAL(20, 8) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS leverage INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS liquidation_price DECIMAL(20, 8) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS margin_mode TEXT NOT NULL DEFAULT 'isolated' CHECK (margin_mode IN ('isolated', 'cross')),
ADD COLUMN IF NOT EXISTS pnl_percentage DECIMAL(20, 8) NOT NULL DEFAULT 0;

-- Create index for faster position queries
CREATE INDEX IF NOT EXISTS idx_active_positions_user_id ON active_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_active_positions_market ON active_positions(market);
CREATE INDEX IF NOT EXISTS idx_active_positions_is_open ON active_positions(is_open);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_active_positions_updated_at
    BEFORE UPDATE ON active_positions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 