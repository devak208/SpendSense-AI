// SpendSense AI Design System
// Dribbble-inspired dark fintech: charcoal + emerald green + amber gold
// No blue, no violet.

export const Colors = {
  // Base surfaces
  background: '#F8F9FA',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  card: '#FFFFFF',
  cardHover: '#F3F4F6',

  // Primary — Emerald Green
  primary: '#00C896',
  primaryDark: '#009E78',
  primaryLight: '#33D4A8',
  primaryMuted: '#00C89615',

  // Secondary — used for light CTA backgrounds
  secondary: '#E5E7EB',
  secondaryLight: '#F3F4F6',

  // Gold / Amber highlights
  gold: '#F5A623',
  goldLight: '#F5A62318',
  brown: '#C88A00',
  brownLight: '#F5C96C',
  cream: '#FDFBF7',

  // Feature card gradients
  featureStart: '#FFFFFF',
  featureEnd: '#F4F0E6',

  // Status
  success: '#00C896',
  successLight: '#00C89615',
  warning: '#F5A623',
  warningLight: '#F5A62318',
  error: '#FF5C5C',
  errorLight: '#FF5C5C18',

  // Text
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  textLight: '#FFFFFF',

  // Borders & dividers
  border: '#E5E7EB',
  borderLight: '#F3F4F6',

  // Tab bar
  tabBar: '#FFFFFF',
  tabBarBorder: '#E5E7EB',

  // Shadows
  shadow: 'rgba(0, 0, 0, 0.05)',
  shadowMedium: 'rgba(0, 0, 0, 0.1)',

  // Category palette — stays vivid against light backgrounds
  category: {
    food: '#00C896',
    transport: '#F5A623',
    shopping: '#FF5C5C',
    bills: '#FF8C42',
    entertainment: '#8B5CF6',
    health: '#34D399',
    other: '#6B7280',
  } as Record<string, string>,
};

// Category icons mapping
export const CategoryIcons: Record<string, string> = {
  Food: 'coffee',
  Transport: 'truck',
  Shopping: 'shopping-bag',
  Bills: 'file-text',
  Entertainment: 'film',
  Health: 'heart',
  Other: 'package',
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
