'use client';

import { useState, useMemo, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import NumberField from '@/components/NumberField';
import { useResolvedTheme } from '@/hooks/useTheme';
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

// Chart.js draws on a canvas, so it needs literal colours (same palettes as globals.css)
const CHART_COLORS = {
  dark: {
    text: '#e7edf7',
    muted: '#8d9bb3',
    dim: '#64748b',
    panel: '#101a2e',
    line: 'rgba(148, 163, 184, 0.28)',
    grid: 'rgba(148, 163, 184, 0.12)',
    green: '#34d399',
    indigo: '#818cf8',
    red: '#f87171',
    redSoft: '#fca5a5',
  },
  light: {
    text: '#0f172a',
    muted: '#526078',
    dim: '#8592a6',
    panel: '#ffffff',
    line: 'rgba(15, 23, 42, 0.16)',
    grid: 'rgba(15, 23, 42, 0.07)',
    green: '#059669',
    indigo: '#4f46e5',
    red: '#dc2626',
    redSoft: '#f87171',
  },
};

// Highlight for the scenario with the higher net worth
const WIN_CARD = { background: 'rgba(52, 211, 153, 0.08)', borderColor: 'rgba(52, 211, 153, 0.55)' };

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
  // Column description opened by clicking/tapping its ⓘ icon (touch screens have no hover)
  const CHART = CHART_COLORS[useResolvedTheme()];
  const [openTooltip, setOpenTooltip] = useState<{ key: string; text: string; left: number; top: number; above: boolean } | null>(null);

  useEffect(() => {
    if (!openTooltip) return;
    const close = () => setOpenTooltip(null);
    document.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [openTooltip]);

  const toggleTooltip = (e: React.MouseEvent<HTMLElement>, key: string, text: string) => {
    e.stopPropagation(); // Keep the document click handler from closing it right away
    if (openTooltip?.key === key) {
      setOpenTooltip(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const width = 220;
    // Measure against the visible area: on phones the page can be wider than the
    // screen, which makes window.innerWidth/innerHeight larger than what is shown
    const vv = window.visualViewport;
    const viewLeft = vv?.offsetLeft ?? 0;
    const viewTop = vv?.offsetTop ?? 0;
    const viewWidth = vv?.width ?? window.innerWidth;
    const viewHeight = vv?.height ?? window.innerHeight;
    const left = Math.min(Math.max(viewLeft + 8, rect.left + rect.width / 2 - width / 2), viewLeft + viewWidth - width - 8);
    // Open above the icon when there is no room below it (e.g. icon at the bottom of a phone screen)
    const above = rect.bottom + 100 > viewTop + viewHeight;
    setOpenTooltip({ key, text, left, top: above ? rect.top - 6 : rect.bottom + 6, above });
  };
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

  // For the summary cards: a normal space after a currency code (e.g. "CZK 7,720,949")
  // lets narrow phone cards wrap there instead of in the middle of the number
  const formatSummary = (val: number) => formatCurrency(val).replace(/\u00a0/g, ' ');

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
      <div className="page-header">
        <div>
          <h1><Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>TrueCalc</Link></h1>
          <p style={{ color: 'var(--muted)' }}>Compare extra mortgage down payment vs. investing your money. No opinios, make your decission based on Math.</p>
          <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '8px', lineHeight: '1.4' }}>
            * Notice a simple matematical dependecy on the overall net worth.<br />
            * Reliefs from Interest and Taxes are not considered
          </div>
        </div>
        <div className="header-selects">
          <ThemeToggle />
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
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--line)' }}>
            <button
              type="button"
              onClick={loadCurrentRates}
              disabled={ratesStatus.state === 'loading'}
              style={{ padding: '9px 16px', fontSize: '13px', fontWeight: 600, color: '#04120c', background: 'linear-gradient(135deg, var(--green), #22d3ee)', boxShadow: '0 6px 24px rgba(52, 211, 153, 0.22)', border: 'none', borderRadius: '8px', cursor: ratesStatus.state === 'loading' ? 'wait' : 'pointer', whiteSpace: 'nowrap', opacity: ratesStatus.state === 'loading' ? 0.7 : 1 }}
            >
              {ratesStatus.state === 'loading' ? 'Loading…' : `Use current rates for ${COUNTRIES.find(c => c.code === country)?.name}`}
            </button>
            <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.5, alignSelf: 'center' }}>
              {ratesStatus.state === 'idle' && 'Fills in the latest published mortgage rate and inflation for the selected country.'}
              {ratesStatus.state === 'error' && <span style={{ color: 'var(--red)' }}>{ratesStatus.message}</span>}
              {ratesStatus.state === 'done' && (
                <>
                  {ratesStatus.filled.map(({ label, rate }) => (
                    <div key={label}>
                      <strong>{label}: {rate.value}%</strong> ({formatPeriod(rate.period)}) –{' '}
                      <a href={rate.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--indigo)' }}>{rate.source}</a>
                    </div>
                  ))}
                  {ratesStatus.missing.length > 0 && (
                    <div style={{ color: 'var(--amber)' }}>
                      No current {ratesStatus.missing.join(' or ')} available for this country – please enter it manually.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="inputs-grid">
            {/* Loan Details */}
            <div>
              <h2 className="section-label">Loan Details</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Loan Amount</label>
                  <NumberField value={principal} onValueChange={setPrincipal} onFocus={(e) => e.target.select()} style={{ padding: '8px', width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Interest Rate (%)</label>
                  <NumberField step="0.1" value={rate} onValueChange={setRate} onFocus={(e) => e.target.select()} style={{ padding: '8px', width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Term (Years)</label>
                  <NumberField min="1" value={years} onValueChange={setYears} onFocus={(e) => e.target.select()} style={{ padding: '8px', width: '100%' }} />
                </div>
              </div>
            </div>

            {/* Extra Payment Strategy */}
            <div>
              <h2 className="section-label">Extra Payment Strategy</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Monthly Extra</label>
                  <NumberField value={extraPayment} onValueChange={setExtraPayment} onFocus={(e) => e.target.select()} style={{ padding: '8px', width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Inv. Return (%)</label>
                  <NumberField step="0.1" value={investmentRate} onValueChange={setInvestmentRate} onFocus={(e) => e.target.select()} style={{ padding: '8px', width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Inflation (%)</label>
                  <NumberField step="0.1" value={inflationRate} onValueChange={setInflationRate} onFocus={(e) => e.target.select()} style={{ padding: '8px', width: '100%' }} />
                </div>
              </div>
            </div>

            {/* One-Time Extra Payment */}
            <div>
              <h2 className="section-label">One-Time Extra Payment</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Payment Amount</label>
                  <NumberField value={oneTimePaymentAmount} onValueChange={setOneTimePaymentAmount} onFocus={(e) => e.target.select()} style={{ padding: '8px', width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Payment Month</label>
                  <NumberField min="0" max={years * 12} value={oneTimePaymentMonth} onValueChange={setOneTimePaymentMonth} onFocus={(e) => e.target.select()} style={{ padding: '8px', width: '100%' }} />
                </div>
              </div>
            </div>

            {/* Post-Payoff Strategy */}
            <div>
              <h2 className="section-label">Post-Payoff Strategy</h2>
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
                    <NumberField
                      value={postPayoffInvestmentAmount}
                      onValueChange={setPostPayoffInvestmentAmount}
                      onFocus={(e) => e.target.select()}
                      style={{ padding: '8px', width: '100%' }}
                    />
                  </div>
                )}
                {continueInvestingAfterPayoff && (
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginLeft: '24px' }}>
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
          <div className="scenarios-grid">
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
                  <div className="scenario-col">
                    <h3 className="scenario-title" style={{ color: 'var(--indigo)' }}>Scenario A: Pay Off Early & Invest</h3>
                    <div className="card net-card" style={strategyAIsBetter ? WIN_CARD : undefined}>
                      <h3>Net Worth {showInflationAdjusted && '(Real)'}</h3>
                      <div className="net-value" style={{ color: strategyAIsBetter ? 'var(--green)' : 'var(--text)' }}>{formatSummary(netWorthA)}</div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)' }}>After {years} years</div>
                    </div>
                    <div className="stat-grid">
                      <div className="card stat-card">
                        <h3>Cumulative Interest</h3>
                        <div className="stat-value" style={{ color: 'var(--red)' }}>{formatSummary(cumulativeInterestA)}</div>
                      </div>
                      <div className="card stat-card">
                        <h3>Inv. Yield</h3>
                        <div className="stat-value" style={{ color: 'var(--green)' }}>{formatSummary(paydownSavingsGrowth)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Scenario B: Invest the Difference */}
                  <div className="scenario-col">
                    <h3 className="scenario-title" style={{ color: 'var(--green)' }}>Scenario B: Invest the Difference</h3>
                    <div className="card net-card" style={!strategyAIsBetter ? WIN_CARD : undefined}>
                      <h3>Net Worth {showInflationAdjusted && '(Real)'}</h3>
                      <div className="net-value" style={{ color: !strategyAIsBetter ? 'var(--green)' : 'var(--text)' }}>{formatSummary(netWorthB)}</div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)' }}>After {years} years</div>
                    </div>
                    <div className="stat-grid">
                      <div className="card stat-card">
                        <h3>Cumulative Interest</h3>
                        <div className="stat-value" style={{ color: 'var(--red)' }}>{formatSummary(cumulativeInterestB)}</div>
                      </div>
                      <div className="card stat-card">
                        <h3>Inv. Yield</h3>
                        <div className="stat-value" style={{ color: 'var(--green)' }}>{formatSummary(investmentYield)}</div>
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
            <div style={{ flex: 1, minHeight: '300px', minWidth: 0, position: 'relative' }}>
              <Line
                data={{
                  labels: result.schedule.filter((_, i) => i % 12 === 0 || i === result.schedule.length - 1).map(d => `Y${Math.floor(d.month / 12)}`),
                  datasets: [
                    {
                      label: 'Mortgage Balance A',
                      data: result.schedule.filter((_, i) => i % 12 === 0 || i === result.schedule.length - 1).map(d => d.remainingBalance),
                      borderColor: CHART.red,
                      backgroundColor: 'rgba(248, 113, 113, 0.12)',
                      fill: true,
                      tension: 0.4,
                      pointRadius: 0,
                      borderWidth: 2,
                      yAxisID: 'y',
                    },
                    {
                      label: 'Mortgage Balance B',
                      data: result.schedule.filter((_, i) => i % 12 === 0 || i === result.schedule.length - 1).map(d => d.baselineBalance),
                      borderColor: CHART.redSoft,
                      backgroundColor: 'rgba(252, 165, 165, 0.08)',
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
                      borderColor: CHART.indigo,
                      backgroundColor: 'rgba(129, 140, 248, 0.1)',
                      fill: false,
                      tension: 0.4,
                      pointRadius: 0,
                      borderWidth: 2,
                      yAxisID: 'y',
                    },
                    {
                      label: 'Net Worth B',
                      data: result.schedule.filter((_, i) => i % 12 === 0 || i === result.schedule.length - 1).map(d => d.netWorthB),
                      borderColor: CHART.green,
                      backgroundColor: 'rgba(52, 211, 153, 0.1)',
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
                        color: CHART.muted,
                        font: { size: 12 },
                        usePointStyle: true,
                        padding: 30,
                        boxWidth: 15,
                      }
                    },
                    tooltip: {
                      mode: 'index' as const,
                      intersect: false,
                      backgroundColor: CHART.panel,
                      titleColor: CHART.text,
                      bodyColor: CHART.muted,
                      borderColor: CHART.line,
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
                      ticks: { color: CHART.dim, font: { size: 11 } }
                    },
                    y: {
                      type: 'linear' as const,
                      display: true,
                      position: 'left' as const,
                      grid: { color: CHART.grid },
                      ticks: {
                        color: CHART.dim,
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
          <div className="table-toolbar">
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
                  background: 'rgba(129, 140, 248, 0.16)',
                  color: 'var(--indigo)',
                  border: '1px solid rgba(129, 140, 248, 0.4)',
                  borderRadius: '6px',
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
                  background: 'var(--tint)',
                  color: 'var(--text)',
                  border: '1px solid var(--line-strong)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500'
                }}
              >
                Simple View
              </button>
            </div>
          </div>
          <div style={{ marginBottom: '10px', padding: '10px 12px', background: 'var(--tint)', border: '1px solid var(--line)', borderRadius: '8px', fontSize: '12px', color: 'var(--muted)' }}>
            <strong>Customize columns:</strong> Click checkboxes in column headers to show/hide. Hover over or tap ⓘ for explanations.
            {Object.values(visibleColumns).filter(v => !v).length > 0 && (
              <span style={{ marginLeft: '10px', color: 'var(--amber)', fontWeight: '600' }}>
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
                      background: 'var(--panel-2)',
                      boxShadow: '0 1px 0 var(--line-strong)',
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
                            role="button"
                            tabIndex={0}
                            aria-label={`About ${col.label}`}
                            aria-expanded={openTooltip?.key === col.key}
                            title={col.tooltip}
                            onClick={(e) => toggleTooltip(e, col.key, col.tooltip)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.currentTarget.click();
                              }
                            }}
                            style={{
                              display: 'inline-block',
                              width: '12px',
                              height: '12px',
                              borderRadius: '50%',
                              background: 'rgba(129, 140, 248, 0.18)',
                              color: 'var(--indigo)',
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
                    {visibleColumns.principal && <td style={{ color: 'var(--green)', textAlign: 'center' }}>{formatCurrency(row.principal)}</td>}
                    {visibleColumns.interest && <td style={{ color: 'var(--red)', textAlign: 'center' }}>{formatCurrency(row.interest)}</td>}
                    {visibleColumns.cumulativeInterest && <td style={{ color: 'var(--red)', fontWeight: '600', textAlign: 'center' }}>{formatCurrency(row.totalInterestPaid)}</td>}
                    {visibleColumns.extra && (
                      <td style={{ color: row.extraPayment > 0 ? 'var(--green)' : 'var(--dim)', textAlign: 'center' }}>
                        {row.extraPayment > 0 ? `+${formatCurrency(row.extraPayment)}` : '-'}
                      </td>
                    )}
                    {visibleColumns.balance && <td style={{ textAlign: 'center' }}>{formatCurrency(row.remainingBalance)}</td>}
                    {visibleColumns.baselineBalance && <td style={{ color: 'var(--muted)', textAlign: 'center' }}>{formatCurrency(row.baselineBalance)}</td>}
                    {visibleColumns.baselineInterest && <td style={{ color: 'var(--red)', opacity: 0.6, textAlign: 'center' }}>{formatCurrency(row.baselineInterest)}</td>}
                    {visibleColumns.baselineCumulativeInterest && <td style={{ color: 'var(--red)', opacity: 0.6, textAlign: 'center' }}>{formatCurrency(row.baselineCumulativeInterest)}</td>}
                    {visibleColumns.invValue && <td style={{ color: 'var(--indigo)', fontWeight: '600', textAlign: 'center' }}>{formatCurrency(row.investmentValue)}</td>}
                    {visibleColumns.invGain && <td style={{ color: 'var(--green)', fontWeight: '600', textAlign: 'center' }}>{formatCurrency(row.investmentGain)}</td>}
                    {visibleColumns.interestSaved && <td style={{ color: 'var(--amber)', fontWeight: '600', textAlign: 'center' }}>{formatCurrency(row.cumulativeInterestSaved)}</td>}
                    {visibleColumns.netWorthA && <td style={{ color: 'var(--indigo)', fontWeight: '600', textAlign: 'center' }}>{formatCurrency(row.netWorthA)}</td>}
                    {visibleColumns.netWorthB && <td style={{ color: 'var(--green)', fontWeight: '600', textAlign: 'center' }}>{formatCurrency(row.netWorthB)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {openTooltip && (
        <div
          role="tooltip"
          style={{
            position: 'fixed',
            top: openTooltip.top,
            left: openTooltip.left,
            transform: openTooltip.above ? 'translateY(-100%)' : undefined,
            width: '220px',
            zIndex: 1000,
            padding: '8px 10px',
            background: 'var(--panel-2)',
            color: 'var(--text)',
            border: '1px solid var(--line-strong)',
            fontSize: '12px',
            lineHeight: 1.4,
            borderRadius: '6px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)'
          }}
        >
          {openTooltip.text}
        </div>
      )}

      {/* Footer */}
      <div style={{
        marginTop: '40px',
        paddingTop: '20px',
        borderTop: '1px solid var(--line)',
        textAlign: 'center',
        fontSize: '12px',
        color: 'var(--muted)'
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
            opacity: 0.85
          }}
          className="brand-logo"
        />
        <p style={{ margin: '0 0 8px 0' }}>Created by Blacktree Studio - All rights reserved</p>
        <p style={{ margin: 0 }}>
          Mailto: <a href="mailto:plasticxpower@gmail.com" style={{ color: 'var(--green)', textDecoration: 'none' }}>plasticxpower@gmail.com</a> - Your feedback is appreciated
        </p>
      </div>
    </div>
  );
}
