// Theme colors - Navi-inspired exact theme
export const Colors = {
  // Base colors (pure white, minimal)
  background: '#FFFFFF',
  card: '#FFFFFF',
  cardHover: '#F8F9FA',
  surface: '#FFFFFF',
  
  // Primary accent (Navi green)
  primary: '#0C6B58',
  primaryLight: '#14A38B',
  primaryDark: '#094D40',
  primaryMuted: '#E8F5F2',
  
  // Secondary (dark navy for buttons)
  secondary: '#1A1D29',
  secondaryLight: '#2D3142',
  
  // Accent colors
  accent: '#FFB800', // Yellow/gold
  accentOrange: '#FF6B35',
  accentPurple: '#7B2CBF',
  
  // Status colors
  success: '#0C6B58',
  successLight: '#E8F5F2',
  warning: '#FFB800',
  warningLight: '#FFF8E5',
  error: '#DC3545',
  errorLight: '#FDE8EA',
  
  // Text colors (Navi uses very dark navy)
  textPrimary: '#1A1D29',
  textSecondary: '#6C7280',
  textMuted: '#9CA3AF',
  textLight: '#FFFFFF',
  
  // Border (very subtle gray)
  border: '#E8EAED',
  borderLight: '#F3F4F6',
  
  // Tab bar
  tabBar: '#FFFFFF',
  tabBarBorder: '#E8EAED',
  
  // Shadows (very subtle)
  shadow: 'rgba(0, 0, 0, 0.04)',
  shadowMedium: 'rgba(0, 0, 0, 0.08)',
  
  // Category colors
  category: {
    food: '#0C6B58',
    transport: '#3498DB',
    shopping: '#E91E63',
    bills: '#FF9800',
    entertainment: '#7B2CBF',
    health: '#14A38B',
    other: '#6C7280',
  } as Record<string, string>,
};

// Category icons mapping (using Feather icons)
export const CategoryIcons: Record<string, string> = {
  // Expense categories
  Food: 'coffee',
  Transport: 'truck',
  Shopping: 'shopping-bag',
  Bills: 'file-text',
  Entertainment: 'film',
  Health: 'heart',
  Other: 'package',
  // Income categories
  Salary: 'briefcase',
  Freelance: 'code',
  Business: 'trending-up',
  Investment: 'bar-chart-2',
  'Gift Received': 'gift',
  Refund: 'rotate-ccw',
  'Other Income': 'plus-circle',
};

// Payment method icons
export const PaymentIcons: Record<string, string> = {
  Cash: 'dollar-sign',
  GPay: 'smartphone',
  Card: 'credit-card',
  UPI: 'zap',
  'Bank Transfer': 'briefcase',
};
