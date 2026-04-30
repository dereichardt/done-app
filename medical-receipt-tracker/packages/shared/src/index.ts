import { z } from "zod";

export const expenseStatusSchema = z.enum([
  "new",
  "reviewed",
  "ready_for_submission",
  "submitted",
  "reimbursed"
]);

export const extractedFieldsSchema = z.object({
  vendor: z.string().min(1),
  serviceDate: z.string().min(1),
  amount: z.number().nonnegative(),
  currency: z.string().default("USD"),
  confidence: z.object({
    vendor: z.number().min(0).max(1),
    serviceDate: z.number().min(0).max(1),
    amount: z.number().min(0).max(1)
  })
});

export type ExpenseStatus = z.infer<typeof expenseStatusSchema>;
export type ExtractedFields = z.infer<typeof extractedFieldsSchema>;
