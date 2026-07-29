-- V3.2.22 — Protect production employees with payroll history from DELETE.
-- Root cause: payslips.employee_id ON DELETE CASCADE allowed Edge Function DELETE
-- to remove employees and cascade-destroy payslips when no expense_claims existed.
-- Fix: RESTRICT payslip FK (defense in depth). Application guard lives in employees Edge Function.

ALTER TABLE public.payslips
  DROP CONSTRAINT IF EXISTS payslips_employee_id_fkey;

ALTER TABLE public.payslips
  ADD CONSTRAINT payslips_employee_id_fkey
  FOREIGN KEY (employee_id)
  REFERENCES public.employees(id)
  ON DELETE RESTRICT;
