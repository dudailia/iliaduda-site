import type { Account, Line } from '@/lib/closebooks'

/**
 * SYNTHETIC. An invented client chart and bank feed, with invented model
 * suggestions and stated confidences, built so that every rule the pipeline
 * applies fires at least once. No client, transaction or model output here is
 * real; the rules the figure applies to them are CloseBooks' own.
 */

export const chart: readonly Account[] = [
  { code: '4000', name: 'Consulting Revenue', type: 'revenue' },
  { code: '6000', name: 'Payroll', type: 'expense' },
  { code: '6100', name: 'Office Supplies', type: 'expense' },
  { code: '6150', name: 'Merchant Fees', type: 'expense' },
  { code: '6250', name: 'Occupancy', type: 'expense' },
  { code: '6300', name: 'Travel', type: 'expense' },
  { code: '6350', name: 'Meals', type: 'expense' },
  { code: '6400', name: 'Software', type: 'expense' },
  { code: '6500', name: 'Utilities', type: 'expense' },
]

export const feed: readonly Line[] = [
  { date: '2026-09-01', description: 'GUSTO PAYROLL', amount: 18420.0, type: 'debit', suggested: { code: '6000', name: 'Payroll' }, stated: 0.99 },
  { date: '2026-09-01', description: 'AMAZON WEB SERVICES EMEA', amount: 1184.22, type: 'debit', suggested: { code: '6400', name: 'Software' }, stated: 0.96 },
  { date: '2026-09-02', description: 'STRIPE FEE', amount: 12.4, type: 'debit', suggested: { code: '6150', name: 'Merchant Fees' }, stated: 0.96 },
  { date: '2026-09-03', description: 'Client payment Harbor Dental', amount: 4500.0, type: 'credit', suggested: { code: '4000', name: 'Consulting Revenue' }, stated: 0.94 },
  { date: '2026-09-04', description: 'WEWORK MEMBERSHIP', amount: 650.0, type: 'debit', suggested: { code: '6200', name: 'Rent Expense' }, stated: 0.97 },
  { date: '2026-09-05', description: 'UBER *TRIP HELP.UBER.COM', amount: 23.5, type: 'debit', suggested: { code: '6300', name: 'Travel' }, stated: 0.82 },
  { date: '2026-09-08', description: 'REFUND AMZN MKTP', amount: 64.99, type: 'credit', suggested: { code: '6100', name: 'Office Supplies' }, stated: 0.93 },
  { date: '2026-09-09', description: 'Venmo', amount: 42.0, type: 'debit', suggested: { code: '6350', name: 'Meals' }, stated: 0.88 },
  { date: '2026-09-10', description: 'COMCAST BUSINESS', amount: 189.99, type: 'debit', suggested: { code: '6500', name: 'Utilities' }, stated: 0.97 },
  { date: '2026-09-11', description: 'SQ *BLUE BOTTLE', amount: 14.25, type: 'debit', suggested: { code: '6350', name: 'Meals' }, stated: 0.86 },
  { date: '2026-09-12', description: 'ACH', amount: 2300.0, type: 'debit', suggested: { code: '6250', name: 'Occupancy' }, stated: 0.9 },
  { date: '2026-09-15', description: 'NOTION LABS INC', amount: 96.0, type: 'debit', suggested: { code: '6400', name: 'Software' }, stated: 0.95 },
]

/** Where a human would remap a suggestion the chart does not have. */
export const remap: Readonly<Record<string, string>> = { '6200': '6250' }
