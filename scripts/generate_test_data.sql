-- ============================================
-- TEST DATA FOR EXPENSE TRACKER APP
-- CORRECTED FOR YOUR SCHEMA
-- ============================================

-- STEP 1: Create payment methods (if they don't exist)
-- Payment methods are shared globally in your schema
INSERT INTO payment_methods (name, icon) VALUES 
    ('Cash', 'dollar-sign'),
    ('Credit Card', 'credit-card'),
    ('UPI', 'smartphone'),
    ('Bank Transfer', 'send')
ON CONFLICT DO NOTHING;

-- STEP 2: View your data to get the IDs
SELECT 'USERS:' as info;
SELECT id, email FROM users;

SELECT 'PAYMENT METHODS:' as info;
SELECT id, name FROM payment_methods;

SELECT 'CATEGORIES:' as info;
SELECT id, name, category_type FROM categories;

-- ============================================
-- STEP 3: RUN THIS FUNCTION TO GENERATE DATA
-- ============================================

CREATE OR REPLACE FUNCTION generate_test_expenses()
RETURNS void AS $$
DECLARE
    v_user_id UUID;
    v_payment_method_id UUID;
    v_expense_categories UUID[];
    v_income_categories UUID[];
    v_category_id UUID;
    v_month_start DATE;
    v_random_day INTEGER;
    v_amount DECIMAL;
    v_expense_notes TEXT[] := ARRAY['Groceries', 'Uber ride', 'Shopping mall', 'Movie night', 'Electricity bill', 'Medicine', 'Restaurant', 'Coffee', 'Gym'];
    v_income_notes TEXT[] := ARRAY['Monthly Salary', 'Freelance Income', 'Investment Returns', 'Bonus'];
    i INTEGER;
    j INTEGER;
    m INTEGER;
BEGIN
    -- Get the first user
    SELECT id INTO v_user_id FROM users LIMIT 1;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No users found! Please sign in to the app first.';
    END IF;
    RAISE NOTICE 'Using user_id: %', v_user_id;
    
    -- Get first payment method (shared table, no user_id filter)
    SELECT id INTO v_payment_method_id FROM payment_methods LIMIT 1;
    IF v_payment_method_id IS NULL THEN
        -- Create a default payment method
        INSERT INTO payment_methods (name, icon)
        VALUES ('Cash', 'dollar-sign')
        RETURNING id INTO v_payment_method_id;
    END IF;
    RAISE NOTICE 'Using payment_method_id: %', v_payment_method_id;
    
    -- Get expense category IDs
    SELECT ARRAY_AGG(id) INTO v_expense_categories 
    FROM categories 
    WHERE category_type = 'expense';
    
    IF v_expense_categories IS NULL OR array_length(v_expense_categories, 1) IS NULL THEN
        RAISE EXCEPTION 'No expense categories found! Add some categories first.';
    END IF;
    RAISE NOTICE 'Found % expense categories', array_length(v_expense_categories, 1);
    
    -- Get income category IDs
    SELECT ARRAY_AGG(id) INTO v_income_categories 
    FROM categories 
    WHERE category_type = 'income';
    
    IF v_income_categories IS NULL OR array_length(v_income_categories, 1) IS NULL THEN
        -- Use first expense category as fallback for income
        v_income_categories := ARRAY[v_expense_categories[1]];
        RAISE NOTICE 'No income categories found, using fallback';
    ELSE
        RAISE NOTICE 'Found % income categories', array_length(v_income_categories, 1);
    END IF;
    
    -- Generate data for last 12 months
    FOR m IN 0..11 LOOP
        v_month_start := DATE_TRUNC('month', CURRENT_DATE) - (m || ' months')::INTERVAL;
        RAISE NOTICE 'Generating data for month: %', v_month_start;
        
        -- Generate 10-20 expenses per month
        FOR i IN 1..(floor(random() * 11 + 10)::INTEGER) LOOP
            v_random_day := floor(random() * 28 + 1)::INTEGER;
            v_category_id := v_expense_categories[floor(random() * array_length(v_expense_categories, 1) + 1)::INTEGER];
            v_amount := (floor(random() * 2500) + 50)::DECIMAL;
            
            INSERT INTO expenses (user_id, category_id, payment_method_id, amount, note, expense_date, type, created_at)
            VALUES (
                v_user_id,
                v_category_id,
                v_payment_method_id,
                v_amount,
                v_expense_notes[floor(random() * array_length(v_expense_notes, 1) + 1)::INTEGER],
                (v_month_start + ((v_random_day - 1) || ' days')::INTERVAL)::DATE,
                'expense',
                v_month_start + ((v_random_day - 1) || ' days')::INTERVAL
            );
        END LOOP;
        
        -- Add 1-2 income entries per month
        FOR j IN 1..(floor(random() * 2 + 1)::INTEGER) LOOP
            v_amount := (floor(random() * 15000) + 20000)::DECIMAL;
            
            INSERT INTO expenses (user_id, category_id, payment_method_id, amount, note, expense_date, type, created_at)
            VALUES (
                v_user_id,
                v_income_categories[floor(random() * array_length(v_income_categories, 1) + 1)::INTEGER],
                v_payment_method_id,
                v_amount,
                v_income_notes[floor(random() * array_length(v_income_notes, 1) + 1)::INTEGER],
                (v_month_start + '5 days'::INTERVAL)::DATE,
                'income',
                v_month_start + '5 days'::INTERVAL
            );
        END LOOP;
    END LOOP;
    
    RAISE NOTICE '✅ Test data generation complete!';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 4: RUN THE GENERATOR
-- ============================================
SELECT generate_test_expenses();

-- ============================================
-- STEP 5: VERIFY THE DATA
-- ============================================
SELECT 
    TO_CHAR(expense_date, 'YYYY-MM') as month,
    type,
    COUNT(*) as transactions,
    SUM(amount) as total
FROM expenses
GROUP BY TO_CHAR(expense_date, 'YYYY-MM'), type
ORDER BY month DESC, type;

-- ============================================
-- CLEANUP (if needed)
-- ============================================
-- DELETE FROM expenses WHERE note IN ('Groceries', 'Uber ride', 'Shopping mall', 'Movie night', 'Electricity bill', 'Medicine', 'Restaurant', 'Coffee', 'Gym', 'Monthly Salary', 'Freelance Income', 'Investment Returns', 'Bonus');
-- DROP FUNCTION IF EXISTS generate_test_expenses();
