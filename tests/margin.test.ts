import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import positions from './fixtures/positions.json';
import type { Tier } from '../src/shared/types';
import {
  commission,
  fundingPerDay,
  liquidationPrice,
  maintenanceMargin,
  selectTier,
  summarize,
} from '../src/risk/margin';

const tiers: Tier[] = [
  { maxNotional: '10000', mmr: '0.005', maintenanceAmount: '0', maxLeverage: 20 },
  { maxNotional: '50000', mmr: '0.01', maintenanceAmount: '50', maxLeverage: 10 },
];

describe('tiers', () => {
  it('picks the first tier whose cap covers the notional', () => {
    expect(selectTier(new Decimal('10000'), tiers).maxLeverage).toBe(20);
    expect(selectTier(new Decimal('10000.01'), tiers).maxLeverage).toBe(10);
    expect(selectTier(new Decimal('999999'), tiers).maxLeverage).toBe(10);
  });

  it('keeps maintenance margin continuous across a tier boundary', () => {
    const below = maintenanceMargin(new Decimal('9999.999'), tiers);
    const at = maintenanceMargin(new Decimal('10000'), tiers);
    const above = maintenanceMargin(new Decimal('10000.001'), tiers);
    expect(at.minus(below).abs().lt('0.0001')).toBe(true);
    expect(above.minus(at).abs().lt('0.0001')).toBe(true);
  });

  it('uses maintenance amount, not just the rate', () => {
    expect(maintenanceMargin(new Decimal('20000'), tiers).toString()).toBe('150');
  });
});

describe('liquidation price', () => {
  it('prices a long below entry', () => {
    const lp = liquidationPrice({ entryPrice: '50000', size: '0.1', leverage: '10', tiers });
    expect(lp?.toFixed(8)).toBe('45226.13065327');
  });

  it('prices a short above entry', () => {
    const lp = liquidationPrice({ entryPrice: '50000', size: '-0.1', leverage: '10', tiers });
    expect(lp?.toFixed(8)).toBe('54726.36815920');
    expect(lp?.gt('50000')).toBe(true);
  });

  it.each(['0.1', '-0.1'])('balances equity and maintenance at liquidation for signed size %s', (size) => {
    const entry = new Decimal('50000');
    const quantity = new Decimal(size);
    const wallet = new Decimal('500');
    const lp = liquidationPrice({ entryPrice: entry.toString(), size, leverage: '10', tiers });
    expect(lp).not.toBeNull();
    const equity = wallet.plus(lp!.minus(entry).mul(quantity));
    expect(equity.minus(maintenanceMargin(lp!.mul(quantity.abs()), tiers)).abs().lt('1e-12')).toBe(true);
  });

  it('solves using the tier at the liquidation price when a short crosses a boundary', () => {
    const lp = liquidationPrice({ entryPrice: '100', size: '-95', leverage: '10', tiers });
    expect(lp).not.toBeNull();
    const equity = new Decimal('950').plus(new Decimal('100').minus(lp!).mul('95'));
    expect(equity.minus(maintenanceMargin(lp!.mul('95'), tiers)).abs().lt('1e-12')).toBe(true);
    expect(selectTier(lp!.mul('95'), tiers).mmr).toBe('0.01');
  });

  it.each(['NaN', 'Infinity', '0', '-1'])('rejects invalid entry %s', (entryPrice) => {
    expect(() => liquidationPrice({ entryPrice, size: '1', leverage: '10', tiers })).toThrow();
  });

  it('returns null when no positive liquidation price exists', () => {
    expect(liquidationPrice({ entryPrice: '100', size: '0.0001', leverage: '1', tiers })).toBeNull();
  });
});

describe('fees and funding', () => {
  it('charges taker fee on notional', () => {
    expect(commission(new Decimal('5000'), '0.0005').toString()).toBe('2.5');
  });

  it('treats positive funding as a cost for longs', () => {
    const cost = fundingPerDay(new Decimal('0.1'), '50000', '0.0000125');
    expect(cost.toString()).toBe('-1.5');
  });
});

describe('summarize', () => {
  const base = {
    entryPrice: '50000',
    sizeUsd: '5000',
    leverage: '10',
    side: 'long' as const,
    tiers,
    fundingRate: '0.0000125',
    takerFeeRate: '0.0005',
  };

  it('builds the simulator numbers', () => {
    const summary = summarize(base);
    expect(summary.notional).toBe('5000');
    expect(summary.initialMargin).toBe('500');
    expect(summary.fee).toBe('2.5');
    expect(summary.fundingPerDay).toBe('-1.5');
    expect(new Decimal(summary.liquidationPrice ?? '0').toFixed(8)).toBe('45251.25628141');
    expect(summary.leverageClamped).toBe(false);
  });

  it('clamps leverage to the tier cap', () => {
    const summary = summarize({ ...base, sizeUsd: '30000', leverage: '50' });
    expect(summary.maxLeverage).toBe(10);
    expect(summary.leverageClamped).toBe(true);
    expect(summary.initialMargin).toBe('3000');
  });

  it.each(['NaN', 'Infinity', '0', '-5'])('rejects invalid notional %s', (sizeUsd) => {
    expect(() => summarize({ ...base, sizeUsd })).toThrow();
  });
});

describe('fixture cases', () => {
  for (const item of positions.cases) {
    it(`${item.symbol} ${item.side} liquidation price`, () => {
      const summary = summarize({
        entryPrice: item.entryPrice,
        sizeUsd: item.sizeUsd,
        leverage: item.leverage,
        side: item.side as 'long' | 'short',
        tiers: item.tiers,
        fundingRate: '0',
        takerFeeRate: '0',
      });
      const tolerance = new Decimal(10).pow(-item.quotePrecision);
      expect(summary.liquidationPrice).not.toBeNull();
      expect(new Decimal(summary.liquidationPrice ?? '0').minus(item.expected.liquidationPrice).abs().lt(tolerance)).toBe(true);
      expect(new Decimal(summary.maintenanceMargin).minus(item.expected.maintenanceMargin).abs().lt(tolerance)).toBe(true);
    });
  }
});
