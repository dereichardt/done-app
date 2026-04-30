export type ExpenseStatus =
  | "new"
  | "reviewed"
  | "ready_for_submission"
  | "submitted"
  | "reimbursed";

export type Expense = {
  id: string;
  vendor: string;
  serviceDate: string;
  amount: number;
  currency: string;
  category: string;
  status: ExpenseStatus;
  notes: string;
  isReimbursable: boolean;
};
