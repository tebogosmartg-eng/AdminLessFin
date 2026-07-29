-- Align payslip_item_type enum with Payroll Rules Engine line item types.
ALTER TYPE payslip_item_type ADD VALUE IF NOT EXISTS 'employer_contribution';
