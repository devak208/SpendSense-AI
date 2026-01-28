-- Run this in your Supabase SQL Editor to add support for push notifications

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS push_token TEXT;

-- Verify it worked
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'push_token';
