-- INCOME TRACKING MIGRATION
-- Run this in Supabase SQL Editor

-- =========================================
-- STEP 1: Add type column to expenses table
-- =========================================
-- 'expense' = money going out
-- 'income' = money coming in

ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'expense';

-- Add check constraint
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_type_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_type_check CHECK (type IN ('expense', 'income'));

-- =========================================
-- STEP 2: Add income categories to categories table
-- =========================================
-- These are system categories for income (user_id = NULL)

INSERT INTO categories (name, icon, color, user_id) VALUES 
  ('Salary', 'briefcase', '#22C55E', NULL),
  ('Freelance', 'code', '#3B82F6', NULL),
  ('Business', 'trending-up', '#8B5CF6', NULL),
  ('Investment', 'bar-chart-2', '#F59E0B', NULL),
  ('Gift Received', 'gift', '#EC4899', NULL),
  ('Refund', 'rotate-ccw', '#14B8A6', NULL),
  ('Other Income', 'plus-circle', '#10B981', NULL)
ON CONFLICT DO NOTHING;

-- =========================================
-- STEP 3: Add category_type to categories table
-- =========================================
-- To distinguish expense vs income categories

ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS category_type TEXT NOT NULL DEFAULT 'expense';

ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_type_check;
ALTER TABLE categories ADD CONSTRAINT categories_type_check CHECK (category_type IN ('expense', 'income'));

-- Update existing expense categories
UPDATE categories SET category_type = 'expense' 
WHERE name IN ('Food', 'Transport', 'Shopping', 'Entertainment', 'Bills', 'Health', 'Other');

-- Update income categories
UPDATE categories SET category_type = 'income' 
WHERE name IN ('Salary', 'Freelance', 'Business', 'Investment', 'Gift Received', 'Refund', 'Other Income');

-- =========================================
-- STEP 4: Create index for faster queries
-- =========================================
CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(type);
CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(category_type);
