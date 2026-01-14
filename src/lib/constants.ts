/**
 * Standard value used for Select components to avoid Radix UI 'empty string' error.
 * Using 'none' instead of '' prevents the 'A Select.Item must have a value prop' crash.
 */
export const EMPTY_SELECT_VALUE = 'none';

/**
 * Standard date format used across the application.
 */
export const DATE_FORMAT = 'yyyy-MM-dd';