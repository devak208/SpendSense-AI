-- Setu AA Integration Tables

-- 1. Consents Table
-- Stores the link between a User and Setu AA
CREATE TABLE IF NOT EXISTS bank_consents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    setu_consent_id TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL, -- 'PENDING', 'ACTIVE', 'REJECTED', 'REVOKED'
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Bank Transactions Staging Table
-- Stores raw transactions fetched from Setu before user approves adding them as Expenses
CREATE TABLE IF NOT EXISTS bank_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_id UUID REFERENCES bank_consents(id),
    
    -- Transaction Details from Setu
    amount DECIMAL(12, 2) NOT NULL,
    description TEXT, -- Narrative / Remarks
    txn_type TEXT, -- 'DEBIT' or 'CREDIT'
    txn_date TIMESTAMP WITH TIME ZONE,
    mode TEXT, -- UPI, CARD, etc.
    reference_id TEXT, -- Bank Ref No
    
    -- Metadata
    bank_name TEXT,
    account_number TEXT,
    
    -- Status in our App
    is_processed BOOLEAN DEFAULT FALSE, -- True if added to expenses
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bank_consents_user ON bank_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_consents_setu_id ON bank_consents(setu_consent_id);
CREATE INDEX IF NOT EXISTS idx_bank_txns_user ON bank_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_txns_processed ON bank_transactions(is_processed);

-- RLS Policies
ALTER TABLE bank_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own consents" ON bank_consents
    FOR SELECT USING (user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('request.jwt.claims', true)::json->>'sub'));

CREATE POLICY "Users can view own bank transactions" ON bank_transactions
    FOR SELECT USING (user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('request.jwt.claims', true)::json->>'sub'));
