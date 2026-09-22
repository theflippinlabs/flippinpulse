import { supabase } from '../supabase.js';
import { spendPulse } from './economy.js';
import { earnPulse } from './games.js';

const INTEREST_PER_WEEK = 0.01; // 1% weekly on savings

export interface BankAccount { discord_id: string; savings: number; last_interest_at: string; }

async function loadOrCreateAccount(discordId: string): Promise<BankAccount> {
  const { data } = await supabase.from('bank_accounts').select('*').eq('discord_id', discordId).maybeSingle();
  if (data) return data as BankAccount;
  const now = new Date().toISOString();
  const insert = { discord_id: discordId, savings: 0, last_interest_at: now };
  await supabase.from('bank_accounts').insert(insert);
  return insert as BankAccount;
}

async function accrueInterest(discordId: string, acct: BankAccount): Promise<BankAccount> {
  const nowMs = Date.now();
  const lastMs = new Date(acct.last_interest_at).getTime();
  const weeks = Math.floor((nowMs - lastMs) / (7 * 86_400_000));
  if (weeks <= 0 || acct.savings <= 0) return acct;
  const gained = Math.floor(acct.savings * (Math.pow(1 + INTEREST_PER_WEEK, weeks) - 1));
  if (gained <= 0) return acct;
  const nextSavings = acct.savings + gained;
  const nextLast = new Date(lastMs + weeks * 7 * 86_400_000).toISOString();
  await supabase.from('bank_accounts').update({ savings: nextSavings, last_interest_at: nextLast }).eq('discord_id', discordId);
  return { ...acct, savings: nextSavings, last_interest_at: nextLast };
}

export async function bankStatus(discordId: string): Promise<{ savings: number; last_interest_at: string; weekly_rate: number }> {
  let acct = await loadOrCreateAccount(discordId);
  acct = await accrueInterest(discordId, acct);
  return { savings: acct.savings, last_interest_at: acct.last_interest_at, weekly_rate: INTEREST_PER_WEEK };
}

export async function deposit(discordId: string, amount: number): Promise<{ ok: boolean; error?: string; savings?: number }> {
  const amt = Math.floor(amount);
  if (amt <= 0) return { ok: false, error: 'bad_amount' };
  let acct = await loadOrCreateAccount(discordId);
  acct = await accrueInterest(discordId, acct);
  const debit = await spendPulse(discordId, amt, `Bank deposit`);
  if (!debit.success) return { ok: false, error: debit.error ?? 'debit_failed' };
  const nextSavings = acct.savings + amt;
  await supabase.from('bank_accounts').update({ savings: nextSavings }).eq('discord_id', discordId);
  return { ok: true, savings: nextSavings };
}

export async function withdraw(discordId: string, amount: number): Promise<{ ok: boolean; error?: string; savings?: number; newBalance?: number }> {
  const amt = Math.floor(amount);
  if (amt <= 0) return { ok: false, error: 'bad_amount' };
  let acct = await loadOrCreateAccount(discordId);
  acct = await accrueInterest(discordId, acct);
  if (acct.savings < amt) return { ok: false, error: 'insufficient_savings' };
  const nextSavings = acct.savings - amt;
  await supabase.from('bank_accounts').update({ savings: nextSavings }).eq('discord_id', discordId);
  await earnPulse(discordId, amt, `Bank withdrawal`, `bank:withdraw`);
  return { ok: true, savings: nextSavings };
}

// ---- Loans ----
export interface Loan {
  id: number;
  lender_id: string;
  borrower_id: string;
  principal: number;
  interest_percent: number;
  due_at: string;
  repaid_at: string | null;
  status: 'pending' | 'active' | 'repaid' | 'defaulted' | 'declined';
  created_at: string;
}

export async function offerLoan(lenderId: string, borrowerId: string, principal: number, days: number): Promise<{ ok: boolean; error?: string; loanId?: number }> {
  if (lenderId === borrowerId) return { ok: false, error: 'self_loan' };
  const p = Math.floor(principal);
  if (p < 1 || p > 100_000) return { ok: false, error: 'bad_amount' };
  if (days < 1 || days > 30) return { ok: false, error: 'bad_duration' };
  const debit = await spendPulse(lenderId, p, `Loan offer to ${borrowerId}`);
  if (!debit.success) return { ok: false, error: debit.error ?? 'debit_failed' };
  const dueAt = new Date(Date.now() + days * 86_400_000).toISOString();
  const { data, error } = await supabase.from('loans').insert({
    lender_id: lenderId, borrower_id: borrowerId, principal: p, interest_percent: 5, due_at: dueAt, status: 'pending',
  }).select('id').single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };
  return { ok: true, loanId: data.id as number };
}

export async function acceptLoan(loanId: number, byUserId: string): Promise<{ ok: boolean; error?: string; loan?: Loan }> {
  const { data: loan } = await supabase.from('loans').select('*').eq('id', loanId).maybeSingle();
  if (!loan) return { ok: false, error: 'not_found' };
  const L = loan as Loan;
  if (L.status !== 'pending') return { ok: false, error: 'not_pending' };
  if (byUserId !== L.borrower_id) return { ok: false, error: 'not_borrower' };
  await earnPulse(L.borrower_id, L.principal, `Loan #${L.id} from ${L.lender_id}`, `loan:${L.id}`);
  await supabase.from('loans').update({ status: 'active' }).eq('id', L.id);
  return { ok: true, loan: { ...L, status: 'active' } };
}

export async function declineLoan(loanId: number, byUserId: string): Promise<{ ok: boolean; error?: string; refundedTo?: string }> {
  const { data: loan } = await supabase.from('loans').select('*').eq('id', loanId).maybeSingle();
  if (!loan) return { ok: false, error: 'not_found' };
  const L = loan as Loan;
  if (L.status !== 'pending') return { ok: false, error: 'not_pending' };
  if (byUserId !== L.borrower_id && byUserId !== L.lender_id) return { ok: false, error: 'not_yours' };
  await earnPulse(L.lender_id, L.principal, `Loan #${L.id} declined refund`, `loan:${L.id}`);
  await supabase.from('loans').update({ status: 'declined' }).eq('id', L.id);
  return { ok: true, refundedTo: L.lender_id };
}

export async function repayLoan(loanId: number, byUserId: string): Promise<{ ok: boolean; error?: string; repaid?: number }> {
  const { data: loan } = await supabase.from('loans').select('*').eq('id', loanId).maybeSingle();
  if (!loan) return { ok: false, error: 'not_found' };
  const L = loan as Loan;
  if (L.status !== 'active') return { ok: false, error: 'not_active' };
  if (byUserId !== L.borrower_id) return { ok: false, error: 'not_borrower' };
  const owed = Math.ceil(L.principal * (1 + L.interest_percent / 100));
  const debit = await spendPulse(L.borrower_id, owed, `Loan #${L.id} repayment`);
  if (!debit.success) return { ok: false, error: debit.error ?? 'debit_failed' };
  await earnPulse(L.lender_id, owed, `Loan #${L.id} repaid`, `loan:${L.id}`);
  await supabase.from('loans').update({ status: 'repaid', repaid_at: new Date().toISOString() }).eq('id', L.id);
  return { ok: true, repaid: owed };
}

export async function myLoans(discordId: string): Promise<{ asBorrower: Loan[]; asLender: Loan[] }> {
  const [{ data: b }, { data: l }] = await Promise.all([
    supabase.from('loans').select('*').eq('borrower_id', discordId).in('status', ['pending', 'active']).order('created_at', { ascending: false }),
    supabase.from('loans').select('*').eq('lender_id', discordId).in('status', ['pending', 'active']).order('created_at', { ascending: false }),
  ]);
  return { asBorrower: (b ?? []) as Loan[], asLender: (l ?? []) as Loan[] };
}
