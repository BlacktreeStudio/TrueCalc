'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { useDebounce } from '@/hooks/useDebounce';
import { calculateMortgage } from '@/utils/calculations';
import { COUNTRIES, CurrencyCode, RateValue, RatesFile } from '@/utils/countries';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const CURRENCIES: Record<CurrencyCode, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CAD: 'C$',
  CZK: 'Kč',
};

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

type RatesStatus =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'done'; filled: { label: string; rate: RateValue }[]; missing: string[] }
  | { state: 'error'; message: string };

// Periods come as 'YYYY', 'YYYY-MM' or 'YYYY-MM-DD'
const formatPeriod = (period: string) => {
  const [y, m, d] = period.split('-').map(Number);
  if (!m) return String(y);
  const date = new Date(Date.UTC(y, m - 1, d || 1));
  return date.toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', ...(d ? { day: 'numeric' } : {}) });
};

export default function Home() {
  const [principal, setPrincipal] = useState(300000);
  const [rate, setRate] = useState(5.5);
  const [years, setYears] = useState(30);
  const [extraPayment, setExtraPayment] = useState(200);
  const [investmentRate, setInvestmentRate] = useState(7);
  const [inflationRate, setInflationRate] = useState(2.5);
  const [oneTimePaymentAmount, setOneTimePaymentAmount] = useState(0);
  const [oneTimePaymentMonth, setOneTimePaymentMonth] = useState(0);
  const [continueInvestingAfterPayoff, setContinueInvestingAfterPayoff] = useState(true);
  const [postPayoffInvestmentAmount, setPostPayoffInvestmentAmount] = useState(0);
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [country, setCountry] = useState('US');
  const [ratesStatus, setRatesStatus] = useState<RatesStatus>({ state: 'idle' });
  const [showInflationAdjusted, setShowInflationAdjusted] = useState(false);

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState({
    month: true,
    payment: true,
    principal: true,
    interest: true,
    cumulativeInterest: true,
    extra: true,
    balance: true,
    baselineBalance: true,
    baselineInterest: true,
    baselineCumulativeInterest: true,
    invValue: true,
    invGain: true,
    interestSaved: true,
    netWorthA: true,
    netWorthB: true
  });

  const selectCountry = (code: string) => {
    setCountry(code);
    const match = COUNTRIES.find(c => c.code === code);
    if (match) setCurrency(match.currency);
    setRatesStatus({ state: 'idle' });
  };

  // rates.json is refreshed daily by the deploy workflow (scripts/fetch-rates.mjs)
  const loadCurrentRates = async () => {
    setRatesStatus({ state: 'loading' });
    try {
      const res = await fetch(`${BASE_PATH}/rates.json`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: RatesFile = await res.json();
      const entry = data.countries?.[country];
      const filled: { label: string; rate: RateValue }[] = [];
      const missing: string[] = [];
      if (entry?.mortgage) {
        setRate(entry.mortgage.value);
        filled.push({ label: 'Mortgage rate', rate: entry.mortgage });
      } else {
        missing.push('mortgage rate');
      }
      if (entry?.inflation) {
        setInflationRate(entry.inflation.value);
        filled.push({ label: 'Inflation', rate: entry.inflation });
      } else {
        missing.push('inflation');
      }
      setRatesStatus({ state: 'done', filled, missing });
    } catch {
      setRatesStatus({ state: 'error', message: 'Current rates are not available right now. Please try again later or enter the rates manually.' });
    }
  };

  const toggleColumn = (column: keyof typeof visibleColumns) => {
    setVisibleColumns(prev => ({ ...prev, [column]: !prev[column] }));
  };

  // Group inputs for debouncing
  const calculationInputs = {
    principal,
    rate,
    years,
    extraPayment,
    investmentRate,
    inflationRate,
    oneTimePaymentAmount,
    oneTimePaymentMonth,
    continueInvestingAfterPayoff,
    postPayoffInvestmentAmount
  };

  const debouncedInputs = useDebounce(calculationInputs, 300);

  // Calculate monthly payment for post-payoff investment (memoized)
  const monthlyPayment = useMemo(() => {
    const monthlyRate = debouncedInputs.rate / 100 / 12;
    const totalMonths = debouncedInputs.years * 12;
    return monthlyRate > 0
      ? (debouncedInputs.principal * monthlyRate * Math.pow(1 + monthlyRate, totalMonths)) / (Math.pow(1 + monthlyRate, totalMonths) - 1)
      : debouncedInputs.principal / totalMonths;
  }, [debouncedInputs.rate, debouncedInputs.years, debouncedInputs.principal]);

  const result = useMemo(() => calculateMortgage(
    debouncedInputs.principal,
    debouncedInputs.rate,
    debouncedInputs.years,
    debouncedInputs.extraPayment,
    debouncedInputs.investmentRate,
    debouncedInputs.inflationRate,
    debouncedInputs.oneTimePaymentAmount,
    debouncedInputs.oneTimePaymentMonth,
    true,
    debouncedInputs.continueInvestingAfterPayoff ? monthlyPayment : debouncedInputs.postPayoffInvestmentAmount
  ), [debouncedInputs, monthlyPayment]);
  const symbol = CURRENCIES[currency];

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(val);

  // Column definitions with tooltips
  const columnDefs = [
    { key: 'month', label: 'Month', tooltip: 'Month number in the loan term' },
    { key: 'payment', label: 'Payment', tooltip: 'Total monthly payment (principal + interest + extra)' },
    { key: 'principal', label: 'Principal', tooltip: 'Amount going toward loan principal this month' },
    { key: 'interest', label: 'Interest', tooltip: 'Amount going toward interest this month' },
    { key: 'cumulativeInterest', label: 'Cumul. Interest', tooltip: 'Total interest paid so far (with extra payments)' },
    { key: 'extra', label: 'Extra', tooltip: 'Extra payment applied to principal this month' },
    { key: 'balance', label: 'Balance', tooltip: 'Remaining loan balance after this payment' },
    { key: 'baselineBalance', label: 'Baseline Balance', tooltip: 'What the balance would be WITHOUT extra payments' },
    { key: 'baselineInterest', label: 'Baseline Interest', tooltip: 'Monthly interest WITHOUT extra payments' },
    { key: 'baselineCumulativeInterest', label: 'Baseline Cumul. Int.', tooltip: 'Cumulative interest WITHOUT extra payments' },
    { key: 'invValue', label: 'Investment Value', tooltip: 'Investment value if extra payments were invested instead' },
    { key: 'invGain', label: 'Investment Yield', tooltip: 'Cumulative yield from investment based on return rate' },
    { key: 'interestSaved', label: 'Interest Saved', tooltip: 'Cumulative interest saved by making extra payments' },
    { key: 'netWorthA', label: 'Net Worth A', tooltip: 'Net Worth for Scenario A (Pay Off Early & Invest)' },
    { key: 'netWorthB', label: 'Net Worth B', tooltip: 'Net Worth for Scenario B (Invest the Difference)' }
  ];

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h1>TrueCalc  </h1>
          <p style={{ color: '#666' }}>Compare extra mortgage down payment vs. investing your money. No opinios, make your decission based on Math.</p>
          <div style={{ fontSize: '11px', color: '#999', marginTop: '8px', lineHeight: '1.4' }}>
            * Notice a simple matematical dependecy on the overall net worth.<br />
            * Reliefs from Interest and Taxes are not considered
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <select aria-label="Country" value={country} onChange={(e) => selectCountry(e.target.value)} style={{ width: 'auto' }}>
            {COUNTRIES.map(c => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
          <select aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)} style={{ width: 'auto' }}>
            {Object.keys(CURRENCIES).map(code => (
              <option key={code} value={code}>{CURRENCIES[code as CurrencyCode]} {code}</option>
            ))}
          </select>
        </div>
      </div>


      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'stretch' }}>
        {/* Inputs */}
        <div className="card" style={{ marginBottom: 0, padding: '20px' }}>
          {/* Current rates */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #e5e7eb' }}>
            <button
              type="button"
              onClick={loadCurrentRates}
              disabled={ratesStatus.state === 'loading'}
              style={{ padding: '8px 14px', fontSize: '13px', fontWeight: 600, color: '#fff', backgroundColor: '#4f46e5', border: 'none', borderRadius: '6px', cursor: ratesStatus.state === 'loading' ? 'wait' : 'pointer', whiteSpace: 'nowrap', opacity: ratesStatus.state === 'loading' ? 0.7 : 1 }}
            >
              {ratesStatus.state === 'loading' ? 'Loading…' : `Use current rates for ${COUNTRIES.find(c => c.code === country)?.name}`}
            </button>
            <div style={{ fontSize: '12px', color: '#666', lineHeight: 1.5, alignSelf: 'center' }}>
              {ratesStatus.state === 'idle' && 'Fills in the latest published mortgage rate and inflation for the selected country.'}
              {ratesStatus.state === 'error' && <span style={{ color: '#dc2626' }}>{ratesStatus.message}</span>}
              {ratesStatus.state === 'done' && (
                <>
                  {ratesStatus.filled.map(({ label, rate }) => (
                    <div key={label}>
                      <strong>{label}: {rate.value}%</strong> ({formatPeriod(rate.period)}) –{' '}
                      <a href={rate.url} target="_blank" rel="noopener noreferrer" style={{ color: '#4f46e5' }}>{rate.source}</a>
                    </div>
                  ))}
                  {ratesStatus.missing.length > 0 && (
                    <div style={{ color: '#b45309' }}>
                      No current {ratesStatus.missing.join(' or ')} available for this country – please enter it manually.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
            {/* Loan Details */}
            <div>
              <h2 style={{ marginTop: 0, marginBottom: '15px', fontSize: '16px', fontWeight: 'bold', color: '#333' }}>Loan Details</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Loan Amount</label>
                  <input type="number" value={principal} onChange={(e) => setPrincipal(Number(e.target.value))} onFocus={(e) => e.target.select()} style={{ padding: '8px', width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Interest Rate (%)</label>
                  <input type="number" step="0.1" value={rate} onChange={(e) => setRate(Number(e.target.value))} onFocus={(e) => e.target.select()} style={{ padding: '8px', width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Term (Years)</label>
                  <input type="number" min="1" value={years} onChange={(e) => setYears(Number(e.target.value))} onFocus={(e) => e.target.select()} style={{ padding: '8px', width: '100%' }} />
                </div>
              </div>
            </div>

            {/* Extra Payment Strategy */}
            <div>
              <h2 style={{ marginTop: 0, marginBottom: '15px', fontSize: '16px', fontWeight: 'bold', color: '#333' }}>Extra Payment Strategy</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Monthly Extra</label>
                  <input type="number" value={extraPayment} onChange={(e) => setExtraPayment(Number(e.target.value))} onFocus={(e) => e.target.select()} style={{ padding: '8px', width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Inv. Return (%)</label>
                  <input type="number" step="0.1" value={investmentRate} onChange={(e) => setInvestmentRate(Number(e.target.value))} onFocus={(e) => e.target.select()} style={{ padding: '8px', width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Inflation (%)</label>
                  <input type="number" step="0.1" value={inflationRate} onChange={(e) => setInflationRate(Number(e.target.value))} onFocus={(e) => e.target.select()} style={{ padding: '8px', width: '100%' }} />
                </div>
              </div>
            </div>

            {/* One-Time Extra Payment */}
            <div>
              <h2 style={{ marginTop: 0, marginBottom: '15px', fontSize: '16px', fontWeight: 'bold', color: '#333' }}>One-Time Extra Payment</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Payment Amount</label>
                  <input type="number" value={oneTimePaymentAmount} onChange={(e) => setOneTimePaymentAmount(Number(e.target.value))} onFocus={(e) => e.target.select()} style={{ padding: '8px', width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Payment Month</label>
                  <input type="number" min="0" max={years * 12} value={oneTimePaymentMonth} onChange={(e) => setOneTimePaymentMonth(Number(e.target.value))} onFocus={(e) => e.target.select()} style={{ padding: '8px', width: '100%' }} />
                </div>
              </div>
            </div>

            {/* Post-Payoff Strategy */}
            <div>
              <h2 style={{ marginTop: 0, marginBottom: '15px', fontSize: '16px', fontWeight: 'bold', color: '#333' }}>Post-Payoff Strategy</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                  <input
                    type="checkbox"
                    checked={continueInvestingAfterPayoff}
                    onChange={(e) => setContinueInvestingAfterPayoff(e.target.checked)}
                    style={{ width: 'auto', marginRight: '10px' }}
                  />
                  <label style={{ marginBottom: 0, fontSize: '14px' }}>Invest mortgage payment after payoff</label>
                </div>
                {!continueInvestingAfterPayoff && (
                  <div>
                    <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Custom Monthly Investment Amount</label>
                    <input
                      type="number"
                      value={postPayoffInvestmentAmount}
                      onChange={(e) => setPostPayoffInvestmentAmount(Number(e.target.value))}
                      onFocus={(e) => e.target.select()}
                      style={{ padding: '8px', width: '100%' }}
                    />
                  </div>
                )}
                {continueInvestingAfterPayoff && (
                  <div style={{ fontSize: '12px', color: '#666', marginLeft: '24px' }}>
                    Will invest {formatCurrency(monthlyPayment)}/mo + extra payments
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Results */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Checkbox for inflation adjusted values */}
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={showInflationAdjusted}
                onChange={(e) => setShowInflationAdjusted(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              Show Inflation adjusted values
            </label>
          </div>

          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px', flexShrink: 0 }}>
            {(() => {
              const investmentYield = showInflationAdjusted
                ? result.investmentComparison.investmentYieldReal
                : (result.schedule[result.schedule.length - 1]?.investmentGain || 0);

              const interestSaved = result.investmentComparison.interestSaved; // Interest saved is difference in nominal

              const paydownSavingsGrowth = showInflationAdjusted
                ? result.investmentComparison.paydownSavingsGrowthReal
                : result.investmentComparison.paydownSavingsGrowth;

              const netWorthA = showInflationAdjusted
                ? result.investmentComparison.netWorthAReal
                : result.investmentComparison.netWorthA;

              const netWorthB = showInflationAdjusted
                ? result.investmentComparison.netWorthBReal
                : result.investmentComparison.netWorthB;

              const cumulativeInterestA = showInflationAdjusted
                ? result.investmentComparison.totalInterestReal
                : result.totalInterest;

              const cumulativeInterestB = showInflationAdjusted
                ? result.investmentComparison.baselineCumulativeInterestReal
                : (result.schedule[result.schedule.length - 1]?.baselineCumulativeInterest || 0);

              const strategyAIsBetter = netWorthA > netWorthB;

              return (
                <>
                  {/* Scenario A: Pay Off Early & Invest */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', color: '#4f46e5' }}>Scenario A: Pay Off Early & Invest</h3>
                    <div className="card" style={{ background: strategyAIsBetter ? '#dcfce7' : '#fff', border: strategyAIsBetter ? '1px solid #059669' : '1px solid #e5e7eb' }}>
                      <h3>Net Worth {showInflationAdjusted && '(Real)'}</h3>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: strategyAIsBetter ? '#059669' : '#333' }}>{formatCurrency(netWorthA)}</div>
                      <div style={{ fontSize: '12px', color: '#666' }}>After {years} years</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div className="card" style={{ padding: '15px' }}>
                        <h3 style={{ fontSize: '12px' }}>Cumulative Interest</h3>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#ef4444' }}>{formatCurrency(cumulativeInterestA)}</div>
                      </div>
                      <div className="card" style={{ padding: '15px' }}>
                        <h3 style={{ fontSize: '12px' }}>Inv. Yield</h3>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#10b981' }}>{formatCurrency(paydownSavingsGrowth)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Scenario B: Invest the Difference */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', color: '#059669' }}>Scenario B: Invest the Difference</h3>
                    <div className="card" style={{ background: !strategyAIsBetter ? '#dcfce7' : '#fff', border: !strategyAIsBetter ? '1px solid #059669' : '1px solid #e5e7eb' }}>
                      <h3>Net Worth {showInflationAdjusted && '(Real)'}</h3>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: !strategyAIsBetter ? '#059669' : '#333' }}>{formatCurrency(netWorthB)}</div>
                      <div style={{ fontSize: '12px', color: '#666' }}>After {years} years</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div className="card" style={{ padding: '15px' }}>
                        <h3 style={{ fontSize: '12px' }}>Cumulative Interest</h3>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#ef4444' }}>{formatCurrency(cumulativeInterestB)}</div>
                      </div>
                      <div className="card" style={{ padding: '15px' }}>
                        <h3 style={{ fontSize: '12px' }}>Inv. Yield</h3>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#10b981' }}>{formatCurrency(investmentYield)}</div>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Chart */}
          <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', marginBottom: 0 }}>
            <h3>Financial Projection</h3>
            <div style={{ flex: 1, minHeight: '300px' }}>
              <Line
                data={{
                  labels: result.schedule.filter((_, i) => i % 12 === 0 || i === result.schedule.length - 1).map(d => `Y${Math.floor(d.month / 12)}`),
                  datasets: [
                    {
                      label: 'Mortgage Balance A',
                      data: result.schedule.filter((_, i) => i % 12 === 0 || i === result.schedule.length - 1).map(d => d.remainingBalance),
                      borderColor: '#ef4444',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      fill: true,
                      tension: 0.4,
                      pointRadius: 0,
                      borderWidth: 2,
                      yAxisID: 'y',
                    },
                    {
                      label: 'Mortgage Balance B',
                      data: result.schedule.filter((_, i) => i % 12 === 0 || i === result.schedule.length - 1).map(d => d.baselineBalance),
                      borderColor: '#f87171',
                      backgroundColor: 'rgba(248, 113, 113, 0.1)',
                      borderDash: [5, 5],
                      fill: false,
                      tension: 0.4,
                      pointRadius: 0,
                      borderWidth: 2,
                      yAxisID: 'y',
                    },
                    {
                      label: 'Net Worth A',
                      data: result.schedule.filter((_, i) => i % 12 === 0 || i === result.schedule.length - 1).map(d => d.netWorthA),
                      borderColor: '#10b981',
                      backgroundColor: 'rgba(16, 185, 129, 0.1)',
                      fill: false,
                      tension: 0.4,
                      pointRadius: 0,
                      borderWidth: 2,
                      yAxisID: 'y',
                    },
                    {
                      label: 'Net Worth B',
                      data: result.schedule.filter((_, i) => i % 12 === 0 || i === result.schedule.length - 1).map(d => d.netWorthB),
                      borderColor: '#4f46e5',
                      backgroundColor: 'rgba(79, 70, 229, 0.1)',
                      fill: false,
                      tension: 0.4,
                      pointRadius: 0,
                      borderWidth: 2,
                      yAxisID: 'y',
                    }
                  ]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'top' as const,
                      labels: {
                        color: '#666',
                        font: { size: 12 },
                        usePointStyle: true,
                        padding: 30,
                        boxWidth: 15,
                      }
                    },
                    tooltip: {
                      mode: 'index' as const,
                      intersect: false,
                      backgroundColor: '#fff',
                      titleColor: '#333',
                      bodyColor: '#666',
                      borderColor: '#ddd',
                      borderWidth: 1,
                      callbacks: {
                        label: function (context: { dataset: { label?: string }, parsed: { y: number | null } }) {
                          let label = context.dataset.label || '';
                          if (label) { label += ': '; }
                          if (context.parsed.y !== null) {
                            label += formatCurrency(context.parsed.y);
                          }
                          return label;
                        }
                      }
                    },
                  },
                  scales: {
                    x: {
                      grid: { display: false },
                      ticks: { color: '#999', font: { size: 11 } }
                    },
                    y: {
                      type: 'linear' as const,
                      display: true,
                      position: 'left' as const,
                      grid: { color: '#f0f0f0' },
                      ticks: {
                        color: '#999',
                        font: { size: 11 },
                        callback: function (value: string | number) {
                          const numValue = typeof value === 'string' ? parseFloat(value) : value;
                          return symbol + (numValue / 1000).toFixed(0) + 'k';
                        }
                      }
                    },
                    y1: {
                      display: false
                    }
                  },
                }}
              />
            </div>
          </div>
        </div>

        {/* Table - Full Width */}
        <div className="card" style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3 style={{ margin: 0 }}>Amortization Schedule ({result.schedule.length} months)</h3>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setVisibleColumns({
                  month: true,
                  payment: true,
                  principal: true,
                  interest: true,
                  cumulativeInterest: true,
                  extra: true,
                  balance: true,
                  baselineBalance: true,
                  baselineInterest: true,
                  baselineCumulativeInterest: true,
                  invValue: true,
                  invGain: true,
                  interestSaved: true,
                  netWorthA: true,
                  netWorthB: true
                })}
                style={{
                  padding: '6px 12px',
                  background: '#4f46e5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500'
                }}
              >
                Show All Columns
              </button>
              <button
                onClick={() => setVisibleColumns({
                  month: true,
                  payment: true,
                  principal: true,
                  interest: true,
                  cumulativeInterest: true,
                  extra: true,
                  balance: true,
                  baselineBalance: false,
                  baselineInterest: false,
                  baselineCumulativeInterest: false,
                  invValue: true,
                  invGain: false,
                  interestSaved: true,
                  netWorthA: true,
                  netWorthB: true
                })}
                style={{
                  padding: '6px 12px',
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500'
                }}
              >
                Simple View
              </button>
            </div>
          </div>
          <div style={{ marginBottom: '10px', padding: '10px', background: '#f9f9f9', borderRadius: '4px', fontSize: '12px' }}>
            <strong>Customize columns:</strong> Click checkboxes in column headers to show/hide. Hover over ⓘ for explanations.
            {Object.values(visibleColumns).filter(v => !v).length > 0 && (
              <span style={{ marginLeft: '10px', color: '#f59e0b', fontWeight: '600' }}>
                ({Object.values(visibleColumns).filter(v => !v).length} column{Object.values(visibleColumns).filter(v => !v).length !== 1 ? 's' : ''} hidden)
              </span>
            )}
          </div>
          <div style={{ maxHeight: '400px', overflow: 'auto' }}>
            <table>
              <thead>
                <tr>
                  {columnDefs.map(col => visibleColumns[col.key as keyof typeof visibleColumns] && (
                    <th key={col.key} style={{
                      cursor: 'pointer',
                      userSelect: 'none',
                      position: 'sticky',
                      top: 0,
                      zIndex: 10,
                      background: '#fff',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                      padding: '4px 8px', // Reduced padding
                      fontSize: '11px', // Slightly smaller font
                      verticalAlign: 'top'
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                          <input
                            type="checkbox"
                            checked={visibleColumns[col.key as keyof typeof visibleColumns]}
                            onChange={(e) => {
                              e.stopPropagation(); // Prevent header click when checking box
                              toggleColumn(col.key as keyof typeof visibleColumns);
                            }}
                            style={{ cursor: 'pointer', margin: 0 }}
                          />
                          <span
                            title={col.tooltip}
                            style={{
                              display: 'inline-block',
                              width: '12px',
                              height: '12px',
                              borderRadius: '50%',
                              background: '#e5e7eb',
                              color: '#666',
                              fontSize: '9px',
                              lineHeight: '12px',
                              textAlign: 'center',
                              cursor: 'help'
                            }}
                          >
                            ⓘ
                          </span>
                        </div>
                        <span style={{ textAlign: 'center', lineHeight: '1.2' }}>{col.label}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.schedule.map((row) => (
                  <tr key={row.month}>
                    {visibleColumns.month && <td style={{ textAlign: 'center' }}>{row.month}</td>}
                    {visibleColumns.payment && <td style={{ textAlign: 'center' }}>{formatCurrency(row.payment)}</td>}
                    {visibleColumns.principal && <td style={{ color: '#059669', textAlign: 'center' }}>{formatCurrency(row.principal)}</td>}
                    {visibleColumns.interest && <td style={{ color: '#dc2626', textAlign: 'center' }}>{formatCurrency(row.interest)}</td>}
                    {visibleColumns.cumulativeInterest && <td style={{ color: '#dc2626', fontWeight: '600', textAlign: 'center' }}>{formatCurrency(row.totalInterestPaid)}</td>}
                    {visibleColumns.extra && (
                      <td style={{ color: row.extraPayment > 0 ? '#10b981' : '#999', textAlign: 'center' }}>
                        {row.extraPayment > 0 ? `+${formatCurrency(row.extraPayment)}` : '-'}
                      </td>
                    )}
                    {visibleColumns.balance && <td style={{ textAlign: 'center' }}>{formatCurrency(row.remainingBalance)}</td>}
                    {visibleColumns.baselineBalance && <td style={{ color: '#6b7280', textAlign: 'center' }}>{formatCurrency(row.baselineBalance)}</td>}
                    {visibleColumns.baselineInterest && <td style={{ color: '#dc2626', opacity: 0.6, textAlign: 'center' }}>{formatCurrency(row.baselineInterest)}</td>}
                    {visibleColumns.baselineCumulativeInterest && <td style={{ color: '#dc2626', opacity: 0.6, textAlign: 'center' }}>{formatCurrency(row.baselineCumulativeInterest)}</td>}
                    {visibleColumns.invValue && <td style={{ color: '#4f46e5', fontWeight: '600', textAlign: 'center' }}>{formatCurrency(row.investmentValue)}</td>}
                    {visibleColumns.invGain && <td style={{ color: '#10b981', fontWeight: '600', textAlign: 'center' }}>{formatCurrency(row.investmentGain)}</td>}
                    {visibleColumns.interestSaved && <td style={{ color: '#f59e0b', fontWeight: '600', textAlign: 'center' }}>{formatCurrency(row.cumulativeInterestSaved)}</td>}
                    {visibleColumns.netWorthA && <td style={{ color: '#059669', fontWeight: '600', textAlign: 'center' }}>{formatCurrency(row.netWorthA)}</td>}
                    {visibleColumns.netWorthB && <td style={{ color: '#4f46e5', fontWeight: '600', textAlign: 'center' }}>{formatCurrency(row.netWorthB)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        marginTop: '40px',
        paddingTop: '20px',
        borderTop: '1px solid #e5e7eb',
        textAlign: 'center',
        fontSize: '12px',
        color: '#666'
      }}>
        <Image
          src={`${BASE_PATH}/blacktree-logo.png`}
          alt="Blacktree Studio"
          width={180}
          height={60}
          style={{
            width: '180px',
            height: 'auto',
            marginBottom: '12px',
            opacity: 0.8
          }}
        />
        <p style={{ margin: '0 0 8px 0' }}>Created by Blacktree Studio - All rights reserved</p>
        <p style={{ margin: 0 }}>
          Mailto: <a href="mailto:plasticxpower@gmail.com" style={{ color: '#4f46e5', textDecoration: 'none' }}>plasticxpower@gmail.com</a> - Your feedback is appreciated
        </p>
      </div>
    </div>
  );
}
