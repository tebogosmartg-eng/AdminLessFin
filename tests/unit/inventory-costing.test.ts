import { describe, expect, it } from 'vitest';
import {
  classifyMovementAgeDays,
  computeWeightedAverage,
  consumeFifo,
  stockTurnover,
  valuationAmount,
} from '../../src/lib/inventory/costing';

describe('inventory costing helpers', () => {
  it('computes weighted average cost on receipt', () => {
    expect(computeWeightedAverage(10, 100, 10, 200)).toBe(150);
    expect(computeWeightedAverage(0, 0, 5, 40)).toBe(40);
  });

  it('consumes FIFO layers oldest-first', () => {
    const result = consumeFifo(
      [
        { id: 'a', qty_remaining: 4, unit_cost: 10, received_at: '2026-01-01' },
        { id: 'b', qty_remaining: 6, unit_cost: 20, received_at: '2026-02-01' },
      ],
      5
    );
    expect(result.insufficient).toBe(false);
    expect(result.totalCost).toBe(4 * 10 + 1 * 20);
    expect(result.unitCost).toBeCloseTo(12);
    expect(result.layers).toEqual([
      { id: 'b', qty_remaining: 5, unit_cost: 20, received_at: '2026-02-01' },
    ]);
  });

  it('flags insufficient FIFO layers', () => {
    const result = consumeFifo(
      [{ id: 'a', qty_remaining: 2, unit_cost: 10, received_at: '2026-01-01' }],
      5
    );
    expect(result.insufficient).toBe(true);
  });

  it('values on-hand stock', () => {
    expect(valuationAmount(12, 7.5)).toBe(90);
  });

  it('classifies ageing bands', () => {
    expect(classifyMovementAgeDays(10)).toBe('current');
    expect(classifyMovementAgeDays(200)).toBe('slow');
    expect(classifyMovementAgeDays(400)).toBe('dead');
  });

  it('computes stock turnover', () => {
    expect(stockTurnover(1200, 300)).toBe(4);
    expect(stockTurnover(100, 0)).toBe(0);
  });
});
