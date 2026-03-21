// Use your computer's IP address for local development (e.g., 192.168.1.x)
// This is required because the Android emulator cannot access 'localhost' directly
// For production, this will use the Vercel URL
export const API_URL = 'http://192.168.31.169:3000';

// Database types
export interface User {
  id: string;
  clerk_id: string;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  push_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  user_id?: string | null; // null = system category
  category_type: 'expense' | 'income';
  created_at: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
  icon: string;
  created_at: string;
}

export interface Expense {
  id: string;
  user_id: string;
  category_id: string | null;
  user_category_id: string | null;
  payment_method_id: string;
  amount: number;
  type: 'expense' | 'income';
  note: string | null;
  expense_date: string;
  created_at: string;
  updated_at: string;
}

export interface ExpenseWithDetails extends Expense {
  category: Category | null;
  user_category: UserCategory | null;
  payment_method: PaymentMethod;
}

// Helper for API calls
async function apiCall<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'API request failed');
  }

  return response.json();
}

// User APIs
export async function getUserByClerkId(clerkId: string): Promise<User | null> {
  const data = await apiCall<{ user: User | null }>(`/api/users?clerk_id=${clerkId}`);
  return data.user;
}

export async function createUser(user: { clerk_id: string; email?: string; name?: string }): Promise<User> {
  const data = await apiCall<{ user: User }>('/api/users', {
    method: 'POST',
    body: JSON.stringify(user),
  });
  return data.user;
}

export async function updateUserPushToken(userId: string, pushToken: string): Promise<void> {
  await apiCall('/api/users', {
    method: 'PUT',
    body: JSON.stringify({ id: userId, push_token: pushToken }),
  });
}

// Category APIs
export async function getCategories(userId?: string, categoryType?: 'expense' | 'income'): Promise<Category[]> {
  let url = '/api/categories';
  const params = [];
  if (userId) params.push(`user_id=${userId}`);
  if (categoryType) params.push(`category_type=${categoryType}`);
  if (params.length > 0) url += '?' + params.join('&');
  const data = await apiCall<{ categories: Category[] }>(url);
  return data.categories;
}

export async function createCategory(category: {
  user_id: string;
  name: string;
  color?: string;
  icon?: string;
  category_type?: 'expense' | 'income';
}): Promise<Category> {
  const data = await apiCall<{ category: Category }>('/api/categories', {
    method: 'POST',
    body: JSON.stringify(category),
  });
  return data.category;
}

export async function deleteCategory(categoryId: string): Promise<void> {
  await apiCall(`/api/categories?id=${categoryId}`, {
    method: 'DELETE',
  });
}

// Payment Method APIs
export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  const data = await apiCall<{ payment_methods: PaymentMethod[] }>('/api/payment-methods');
  return data.payment_methods;
}

// Expense APIs
export async function getExpenses(
  userId: string,
  startDate?: string,
  endDate?: string
): Promise<ExpenseWithDetails[]> {
  let url = `/api/expenses?user_id=${userId}`;
  if (startDate) url += `&start_date=${startDate}`;
  if (endDate) url += `&end_date=${endDate}`;

  const data = await apiCall<{ expenses: ExpenseWithDetails[] }>(url);
  return data.expenses;
}

export async function createExpense(expense: {
  user_id: string;
  category_id?: string;
  user_category_id?: string;
  payment_method_id: string;
  amount: number;
  type?: 'expense' | 'income';
  note?: string;
  expense_date: string;
}): Promise<Expense> {
  const data = await apiCall<{ expense: Expense }>('/api/expenses', {
    method: 'POST',
    body: JSON.stringify(expense),
  });
  return data.expense;
}

export async function deleteExpense(expenseId: string): Promise<void> {
  await apiCall(`/api/expenses?id=${expenseId}`, {
    method: 'DELETE',
  });
}

// Stats APIs
export async function getMonthlyStats(userId: string, year: number, month: number) {
  const data = await apiCall<{
    stats: {
      // Expense stats
      totalSpent: number;
      dailyAverage: number;
      topCategory: { name: string; color: string; total: number } | null;
      categoryBreakdown: { name: string; color: string; total: number }[];
      transactionCount: number;
      // Income stats
      totalIncome: number;
      topIncomeCategory: { name: string; color: string; total: number } | null;
      incomeCategoryBreakdown: { name: string; color: string; total: number }[];
      incomeTransactionCount: number;
      // Net
      netBalance: number;
      savingsRate: number;
    };
  }>(`/api/stats?user_id=${userId}&year=${year}&month=${month}`);
  return data.stats;
}

// ====================
// DEBTS & REMINDERS
// ====================

export interface Debt {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  amount: number;
  debt_type: 'rent' | 'loan' | 'subscription' | 'emi' | 'other';
  direction: 'owed' | 'receivable';
  due_date: string | null;
  is_recurring: boolean;
  reminder_enabled: boolean;
  reminder_schedule: 'daily' | 'weekly' | 'monthly' | 'custom' | 'once' | null;
  reminder_day_of_week: number | null;
  reminder_day_of_month: number | null;
  reminder_time: string;
  is_paid: boolean;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  id: string;
  debt_id: string;
  user_id: string;
  scheduled_for: string;
  is_sent: boolean;
  debt?: Debt;
}

// Debt APIs
export async function getDebts(
  userId: string,
  options?: { direction?: 'owed' | 'receivable'; isPaid?: boolean }
): Promise<Debt[]> {
  let url = `/api/debts?user_id=${userId}`;
  if (options?.direction) url += `&direction=${options.direction}`;
  if (options?.isPaid !== undefined) url += `&is_paid=${options.isPaid}`;

  const data = await apiCall<{ debts: Debt[] }>(url);
  return data.debts;
}

export async function createDebt(debt: {
  user_id: string;
  name: string;
  description?: string;
  amount: number;
  debt_type: string;
  direction: string;
  due_date?: string;
  is_recurring?: boolean;
  reminder_enabled?: boolean;
  reminder_schedule?: string;
  reminder_day_of_week?: number;
  reminder_day_of_month?: number;
  reminder_time?: string;
}): Promise<Debt> {
  const data = await apiCall<{ debt: Debt }>('/api/debts', {
    method: 'POST',
    body: JSON.stringify(debt),
  });
  return data.debt;
}

export async function updateDebt(id: string, updates: Partial<Debt>): Promise<Debt> {
  const data = await apiCall<{ debt: Debt }>('/api/debts', {
    method: 'PUT',
    body: JSON.stringify({ id, ...updates }),
  });
  return data.debt;
}

export async function deleteDebt(debtId: string): Promise<void> {
  await apiCall(`/api/debts?id=${debtId}`, { method: 'DELETE' });
}

export async function markDebtAsPaid(debtId: string): Promise<Debt> {
  const data = await apiCall<{ debt: Debt }>(`/api/debts/${debtId}/mark-paid`, {
    method: 'POST',
  });
  return data.debt;
}

// Reminder APIs
export async function createReminder(reminder: {
  debt_id: string;
  user_id: string;
  scheduled_for: string;
}): Promise<Reminder> {
  const data = await apiCall<{ reminder: Reminder }>('/api/reminders', {
    method: 'POST',
    body: JSON.stringify(reminder),
  });
  return data.reminder;
}

export async function getReminders(userId: string): Promise<Reminder[]> {
  const data = await apiCall<{ reminders: Reminder[] }>(`/api/reminders?user_id=${userId}`);
  return data.reminders;
}

export async function deleteReminder(reminderId: string): Promise<void> {
  await apiCall(`/api/reminders?id=${reminderId}`, { method: 'DELETE' });
}

export async function skipNextReminder(debtId: string): Promise<void> {
  // Get all pending reminders for this debt and delete the next one
  const data = await apiCall<{ reminders: Reminder[] }>(`/api/reminders?debt_id=${debtId}`);
  const pendingReminders = data.reminders.filter(r => !r.is_sent);

  if (pendingReminders.length > 0) {
    // Sort by scheduled_for and delete the earliest one
    pendingReminders.sort((a, b) =>
      new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime()
    );
    await deleteReminder(pendingReminders[0].id);
  }
}

// User Categories (custom categories/subcategories)
export interface UserCategory {
  id: string;
  user_id: string;
  parent_id: string | null;
  category_id: string | null; // Links to main categories table
  name: string;
  icon: string;
  color: string;
  created_at: string;
  subcategories?: UserCategory[];
}

export async function getUserCategories(userId: string): Promise<{ categories: UserCategory[]; all: UserCategory[] }> {
  const data = await apiCall<{ categories: UserCategory[]; all: UserCategory[] }>(
    `/api/user-categories?user_id=${userId}`
  );
  return data;
}

export async function createUserCategory(category: {
  user_id: string;
  name: string;
  parent_id?: string;
  category_id?: string;
  icon?: string;
  color?: string;
}): Promise<UserCategory> {
  const data = await apiCall<{ category: UserCategory }>('/api/user-categories', {
    method: 'POST',
    body: JSON.stringify(category),
  });
  return data.category;
}

export async function deleteUserCategory(categoryId: string): Promise<void> {
  await apiCall(`/api/user-categories?id=${categoryId}`, { method: 'DELETE' });
}

// Get all months with expense data
export interface AvailableMonth {
  year: number;
  month: number;
  label: string;
  key: string;
}

export async function getAvailableMonths(userId: string): Promise<AvailableMonth[]> {
  const data = await apiCall<{ months: AvailableMonth[] }>(
    `/api/stats/months?userId=${userId}`
  );
  return data.months;
}

// ====================
// BUDGETS & SETTINGS
// ====================

export interface UserPreferences {
  user_id: string;
  daily_limit: number | null;
  monthly_limit: number | null;
  savings_goal: number | null;
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id: string | null;
  user_category_id: string | null;
  amount: number;
  created_at: string;
  updated_at: string;
  category?: Category;
  user_category?: UserCategory;
}

export async function getUserPreferences(userId: string): Promise<UserPreferences | null> {
  const data = await apiCall<{ preferences: UserPreferences | null }>(`/api/user-preferences?user_id=${userId}`);
  return data.preferences;
}

export async function updateUserPreferences(preferences: Partial<UserPreferences> & { user_id: string }): Promise<UserPreferences> {
  const data = await apiCall<{ preferences: UserPreferences }>('/api/user-preferences', {
    method: 'POST',
    body: JSON.stringify(preferences),
  });
  return data.preferences;
}

export async function getBudgets(userId: string): Promise<Budget[]> {
  const data = await apiCall<{ budgets: Budget[] }>(`/api/budgets?user_id=${userId}`);
  return data.budgets;
}

export async function saveBudget(budget: { id?: string; user_id: string; category_id?: string; user_category_id?: string; amount: number }): Promise<Budget> {
  const data = await apiCall<{ budget: Budget }>('/api/budgets', {
    method: 'POST',
    body: JSON.stringify(budget),
  });
  return data.budget;
}

export async function deleteBudget(budgetId: string): Promise<void> {
  await apiCall(`/api/budgets?id=${budgetId}`, { method: 'DELETE' });
}

export async function getBudgetInsights(userId: string): Promise<string | null> {
  const data = await apiCall<{ insights?: string }>(`/api/insights/budget?user_id=${userId}`);
  return data.insights || null;
}
