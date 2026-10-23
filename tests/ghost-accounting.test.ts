import { describe, expect, it } from 'vitest';
import { feeFor, grossPnl, positionSizing, signedFundingCashFlow, summarizePosition } from '../src/ghost/accounting';

describe('ghost accounting', () => {
  it('matches the handoff synthetic long case', () => {
    const funding = signedFundingCashFlow('long', '0.01', '50000', '0.0001').toString();
    expect(funding).toBe('-0.05');
    const summary = summarizePosition({
      side: 'long',
      quantity: '0.01',
      entryPrice: '50000',
      exitPrice: '51000',
      entryFee: '0.25',
      exitFee: '0.255',
      allocatedCollateral: '100',
      fundingCashFlow: funding,
    });
    expect(summary.grossPnl).toBe('10');
    expect(summary.netExcludingUnknownFunding).toBe('9.445');
    expect(summary.roePct).toBe('9.445');
  });

  it('marks funding unknown instead of pretending it is zero', () => {
    const summary = summarizePosition({
      side: 'long',
      quantity: '0.01',
      entryPrice: '50000',
      exitPrice: '51000',
      entryFee: '0.25',
      exitFee: '0.255',
      allocatedCollateral: '100',
    });
    expect(summary.netExcludingUnknownFunding).toBe('9.495');
    expect(summary.fundingCashFlow).toBeNull();
    expect(summary.fundingStatus).toBe('not_reconstructed');
  });

  it('handles short profit, short loss and a zero move', () => {
    expect(grossPnl('short', '2', '100', '90').toString()).toBe('20');
    expect(grossPnl('short', '2', '100', '110').toString()).toBe('-20');
    expect(grossPnl('long', '3', '50', '50').toString()).toBe('0');
  });

  it('charges fees on the notional without double-counting price impact', () => {
    expect(feeFor('500', '0.0005').toString()).toBe('0.25');
    expect(feeFor('510', '0.0005').toString()).toBe('0.255');
  });

  it('makes funding signs explicit for both sides', () => {
    expect(signedFundingCashFlow('long', '1', '100', '0.001').toString()).toBe('-0.1');
    expect(signedFundingCashFlow('short', '1', '100', '0.001').toString()).toBe('0.1');
    expect(signedFundingCashFlow('long', '1', '100', '-0.001').toString()).toBe('0.1');
    expect(signedFundingCashFlow('short', '1', '100', '-0.001').toString()).toBe('-0.1');
  });

  it('keeps collateral and notional sizing separate', () => {
    expect(positionSizing('collateral', '100', 5)).toEqual({ requestedNotional: '500', allocatedCollateral: '100' });
    expect(positionSizing('notional', '500', 5)).toEqual({ requestedNotional: '500', allocatedCollateral: '100' });
    expect(positionSizing('notional', '500', 10).allocatedCollateral).toBe('50');
  });

  it('keeps gross dollars constant when leverage changes in notional mode', () => {
    const five = positionSizing('notional', '500', 5);
    const ten = positionSizing('notional', '500', 10);
    const base = { side: 'long' as const, quantity: '0.01', entryPrice: '50000', exitPrice: '51000', entryFee: '0.25', exitFee: '0.255' };
    const atFive = summarizePosition({ ...base, allocatedCollateral: five.allocatedCollateral });
    const atTen = summarizePosition({ ...base, allocatedCollateral: ten.allocatedCollateral });
    expect(atTen.grossPnl).toBe(atFive.grossPnl);
    expect(Number(atTen.roePct)).toBeCloseTo(Number(atFive.roePct) * 2, 10);
  });

  it('keeps tiny and large decimal values exact', () => {
    const summary = summarizePosition({
      side: 'long',
      quantity: '0.00001',
      entryPrice: '0.000001',
      exitPrice: '0.000002',
      entryFee: '0',
      exitFee: '0',
      allocatedCollateral: '0.000001',
    });
    expect(summary.grossPnl).toBe('1e-11');
    expect(summary.roePct).toBe('0.001');
  });
});
