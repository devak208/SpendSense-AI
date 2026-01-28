-- User Categories Proper Implementation Migration
-- Run this in Supabase SQL Editor

-- Step 1: Ensure user_categories table exists
CREATE TABLE IF NOT EXISTS user_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES user_categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT DEFAULT 'tag',
    color TEXT DEFAULT '#6B7280',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 2: Add user_category_id column to expenses table
ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS user_category_id UUID REFERENCES user_categories(id) ON DELETE SET NULL;

-- Step 3: Make category_id nullable (to support user-only categories)
ALTER TABLE expenses 
ALTER COLUMN category_id DROP NOT NULL;

-- Step 4: Add check constraint - must have either category_id or user_category_id
-- (Remove first if exists, then add)
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_category_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_category_check 
CHECK (category_id IS NOT NULL OR user_category_id IS NOT NULL);

-- Step 5: Create index for user_category_id
CREATE INDEX IF NOT EXISTS idx_expenses_user_category ON expenses(user_category_id);
CREATE INDEX IF NOT EXISTS idx_user_categories_user_id ON user_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_user_categories_parent_id ON user_categories(parent_id);

-- Step 6: Enable RLS on user_categories
ALTER TABLE user_categories ENABLE ROW LEVEL SECURITY;

-- Step 7: RLS Policies for user_categories (drop if exists first)
DROP POLICY IF EXISTS "Users can view own categories" ON user_categories;
DROP POLICY IF EXISTS "Users can insert own categories" ON user_categories;
DROP POLICY IF EXISTS "Users can update own categories" ON user_categories;
DROP POLICY IF EXISTS "Users can delete own categories" ON user_categories;

CREATE POLICY "Users can view own categories" ON user_categories
    FOR SELECT USING (user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('request.jwt.claims', true)::json->>'sub'));

CREATE POLICY "Users can insert own categories" ON user_categories
    FOR INSERT WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('request.jwt.claims', true)::json->>'sub'));

CREATE POLICY "Users can update own categories" ON user_categories
    FOR UPDATE USING (user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('request.jwt.claims', true)::json->>'sub'));

CREATE POLICY "Users can delete own categories" ON user_categories
    FOR DELETE USING (user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('request.jwt.claims', true)::json->>'sub'));
