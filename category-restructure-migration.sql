-- CATEGORY RESTRUCTURE MIGRATION
-- This restructures categories properly:
-- 1. User-created categories go in 'categories' table (with user_id)
-- 2. Subcategories go in 'user_categories' table (referencing category_id)
-- Run this in Supabase SQL Editor

-- =========================================
-- STEP 1: Add user_id to categories table
-- =========================================
-- NULL user_id = system category (available to all)
-- Non-null user_id = user's custom category

ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);

-- =========================================
-- STEP 2: Update user_categories for subcategories
-- =========================================
-- user_categories will now be used ONLY for subcategories
-- They reference category_id from the main categories table

-- Add category_id column if not exists (links subcategory to parent category)
ALTER TABLE user_categories 
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE CASCADE;

-- =========================================
-- STEP 3: Ensure expenses table has proper structure
-- =========================================
-- Already has: category_id, user_category_id (for subcategories)
-- user_category_id is now for SUBCATEGORIES only

-- Make sure user_category_id column exists
ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS user_category_id UUID REFERENCES user_categories(id) ON DELETE SET NULL;

-- Make category_id nullable
ALTER TABLE expenses 
ALTER COLUMN category_id DROP NOT NULL;

-- =========================================
-- STEP 4: Create RLS policies for custom categories
-- =========================================
-- Drop existing policies first
DROP POLICY IF EXISTS "Users can view system and own categories" ON categories;
DROP POLICY IF EXISTS "Users can insert own categories" ON categories;
DROP POLICY IF EXISTS "Users can update own categories" ON categories;
DROP POLICY IF EXISTS "Users can delete own categories" ON categories;

-- Allow viewing system categories (user_id IS NULL) or user's own categories
CREATE POLICY "Users can view system and own categories" ON categories
    FOR SELECT USING (user_id IS NULL OR user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('request.jwt.claims', true)::json->>'sub'));

-- Allow inserting only own categories
CREATE POLICY "Users can insert own categories" ON categories
    FOR INSERT WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('request.jwt.claims', true)::json->>'sub'));

-- Allow updating only own categories (not system ones)
CREATE POLICY "Users can update own categories" ON categories
    FOR UPDATE USING (user_id IS NOT NULL AND user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('request.jwt.claims', true)::json->>'sub'));

-- Allow deleting only own categories (not system ones)
CREATE POLICY "Users can delete own categories" ON categories
    FOR DELETE USING (user_id IS NOT NULL AND user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('request.jwt.claims', true)::json->>'sub'));

-- =========================================
-- STEP 5: Update user_categories RLS for subcategories
-- =========================================
DROP POLICY IF EXISTS "Users can view own subcategories" ON user_categories;
DROP POLICY IF EXISTS "Users can insert own subcategories" ON user_categories;
DROP POLICY IF EXISTS "Users can update own subcategories" ON user_categories;
DROP POLICY IF EXISTS "Users can delete own subcategories" ON user_categories;

CREATE POLICY "Users can view own subcategories" ON user_categories
    FOR SELECT USING (user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('request.jwt.claims', true)::json->>'sub'));

CREATE POLICY "Users can insert own subcategories" ON user_categories
    FOR INSERT WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('request.jwt.claims', true)::json->>'sub'));

CREATE POLICY "Users can update own subcategories" ON user_categories
    FOR UPDATE USING (user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('request.jwt.claims', true)::json->>'sub'));

CREATE POLICY "Users can delete own subcategories" ON user_categories
    FOR DELETE USING (user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('request.jwt.claims', true)::json->>'sub'));
