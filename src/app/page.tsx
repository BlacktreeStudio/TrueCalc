import Link from 'next/link';
import type { Metadata } from 'next';
import { calculateMortgage } from '@/utils/calculations';
import RatesTicker from '@/components/RatesTicker';
import styles from './landing.module.css';

export const metadata: Metadata = {
  title: 'TrueCalc – Pay off your mortgage or invest the difference?',
  description:
    'TrueCalc compares paying extra on your mortgage with investing the money, month by month, and shows which leaves you with more net worth.',
};

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

// Same defaults as the calculator, so the example matches what users see there
const EXAMPLE = { principal: 300000, rate: 5.5, years: 30, extra: 200, invRate: 7, inflation: 2.5 };

function buildExample() {
  const { principal, rate, years, extra, invRate, inflation } = EXAMPLE;
  const r = rate / 100 / 12;
  const n = years * 12;
  const monthlyPayment = (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const result = calculateMortgage(principal, rate, years, extra, invRate, inflation, 0, 0, true, monthlyPayment);
  const yearly = result.schedule.filter((m) => m.month % 12 === 0);
  const payoffYear = Math.ceil(result.payoffMonths / 12);
  return {
    netWorthA: result.investmentComparison.netWorthA,
    netWorthB: result.investmentComparison.netWorthB,
    payoffYear,
    series: [
      { month: 0, a: -principal, b: -principal, balance: principal },
      ...yearly.map((m) => ({ month: m.month, a: m.netWorthA, b: m.netWorthB, balance: m.remainingBalance })),
    ],
  };
}

const usd = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

function ExampleChart({ series }: { series: ReturnType<typeof buildExample>['series'] }) {
  const W = 480;
  const H = 220;
  const pad = { l: 8, r: 8, t: 12, b: 12 };
  const values = series.flatMap((p) => [p.a, p.b, p.balance]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const maxMonth = series[series.length - 1].month;
  const x = (m: number) => pad.l + (m / maxMonth) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + ((max - v) / (max - min)) * (H - pad.t - pad.b);
  const line = (key: 'a' | 'b' | 'balance') =>
    series.map((p, i) => `${i ? 'L' : 'M'}${x(p.month).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
  const zeroY = y(0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} role="img" aria-label="Net worth of both scenarios over 30 years">
      <defs>
        <linearGradient id="fillB" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={pad.l} x2={W - pad.r} y1={pad.t + f * (H - pad.t - pad.b)} y2={pad.t + f * (H - pad.t - pad.b)} className={styles.gridLine} />
      ))}
      <line x1={pad.l} x2={W - pad.r} y1={zeroY} y2={zeroY} className={styles.zeroLine} />
      <path d={`${line('b')} L${x(maxMonth)},${H - pad.b} L${x(0)},${H - pad.b} Z`} fill="url(#fillB)" />
      <path d={line('balance')} className={styles.lineBalance} />
      <path d={line('a')} className={styles.lineA} />
      <path d={line('b')} className={styles.lineB} />
    </svg>
  );
}

const FEATURES = [
  {
    title: 'Two strategies, side by side',
    text: 'Scenario A pays extra on the mortgage, then invests once it is paid off. Scenario B invests the extra from day one. You see the net worth of both.',
  },
  {
    title: 'Current rates for 18 countries',
    text: 'One click fills in the latest published mortgage rate and inflation from central banks and statistics offices, refreshed daily.',
  },
  {
    title: 'Inflation-adjusted view',
    text: 'Switch every result to today’s money, so a number 30 years out means something you can compare.',
  },
  {
    title: 'Every month, every number',
    text: 'A full amortization schedule: principal, interest, balance, investment value and net worth for each month of the loan.',
  },
  {
    title: 'One-time payments',
    text: 'Model a lump sum, such as a bonus or an inheritance, paid into the mortgage in any month you choose.',
  },
  {
    title: 'Private by design',
    text: 'No sign-up and no tracking of your figures. The calculation runs entirely in your browser.',
  },
];

const STEPS = [
  { n: '01', title: 'Enter your loan', text: 'Loan amount, interest rate and term, or use the current rates for your country.' },
  { n: '02', title: 'Set your strategy', text: 'How much extra you can put aside each month, and what return you expect from investing.' },
  { n: '03', title: 'Compare net worth', text: 'TrueCalc runs both scenarios month by month and highlights the one that ends up ahead.' },
];

export default function Landing() {
  const ex = buildExample();
  const diff = ex.netWorthB - ex.netWorthA;
  const winner = diff >= 0 ? 'B' : 'A';

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 17l5-5 4 3 8-9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          TrueCalc
        </Link>
        <nav className={styles.navLinks}>
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <Link href="/calculator" className={styles.navCta}>Open calculator</Link>
        </nav>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <p className={styles.eyebrow}>Mortgage · Invest · Compare</p>
            <h1 className={styles.title}>
              Pay off the mortgage early, <span className={styles.accent}>or invest the difference?</span>
            </h1>
            <p className={styles.lead}>
              TrueCalc runs both strategies month by month and shows which one leaves you with more net worth.
              No opinions. Make your decision based on math.
            </p>
            <div className={styles.ctaRow}>
              <Link href="/calculator" className={styles.btnPrimary}>Open the calculator <span aria-hidden="true">→</span></Link>
              <a href="#how" className={styles.btnGhost}>See how it works</a>
            </div>
            <ul className={styles.heroFacts}>
              <li><strong>18</strong> countries with current rates</li>
              <li><strong>360</strong> months modelled</li>
              <li><strong>0</strong> sign-ups</li>
            </ul>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>
              <span className={styles.mono}>example.calc</span>
            </div>
            <p className={`${styles.mono} ${styles.params}`}>
              {usd(EXAMPLE.principal)} loan · {EXAMPLE.rate}% · {EXAMPLE.years} yrs · {usd(EXAMPLE.extra)}/mo extra · {EXAMPLE.invRate}% return
            </p>
            <ExampleChart series={ex.series} />
            <div className={styles.legend}>
              <span><i className={styles.swA} /> Net worth A: pay off early</span>
              <span><i className={styles.swB} /> Net worth B: invest</span>
              <span><i className={styles.swBal} /> Mortgage balance</span>
            </div>
            <div className={styles.results}>
              <div className={winner === 'A' ? styles.win : ''}>
                <span className={styles.resLabel}>Scenario A</span>
                <span className={styles.resValue}>{usd(ex.netWorthA)}</span>
              </div>
              <div className={winner === 'B' ? styles.win : ''}>
                <span className={styles.resLabel}>Scenario B</span>
                <span className={styles.resValue}>{usd(ex.netWorthB)}</span>
              </div>
              <div>
                <span className={styles.resLabel}>Difference</span>
                <span className={`${styles.resValue} ${styles.up}`}>+{usd(Math.abs(diff))}</span>
              </div>
            </div>
            <p className={styles.panelNote}>
              In this example the mortgage in scenario A is paid off in year {ex.payoffYear}, and scenario {winner} ends{' '}
              {usd(Math.abs(diff))} ahead after {EXAMPLE.years} years.
            </p>
          </div>
        </section>

        <RatesTicker />

        <section id="features" className={styles.section}>
          <p className={styles.eyebrow}>Features</p>
          <h2 className={styles.h2}>Everything you need to compare the two, nothing you don’t</h2>
          <div className={styles.features}>
            {FEATURES.map((f) => (
              <article key={f.title} className={styles.feature}>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="how" className={styles.section}>
          <p className={styles.eyebrow}>How it works</p>
          <h2 className={styles.h2}>Three steps to an answer</h2>
          <ol className={styles.steps}>
            {STEPS.map((s) => (
              <li key={s.n} className={styles.step}>
                <span className={styles.stepNum}>{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.finalCta}>
          <h2 className={styles.h2}>Run your own numbers</h2>
          <p>It takes a minute and it’s free.</p>
          <Link href="/calculator" className={styles.btnPrimary}>Open the calculator <span aria-hidden="true">→</span></Link>
        </section>
      </main>

      <footer className={styles.footer}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${BASE_PATH}/blacktree-logo.png`} alt="Blacktree Studio" className={styles.footerLogo} />
        <p>Created by Blacktree Studio. All rights reserved.</p>
        <p>
          Feedback: <a href="mailto:plasticxpower@gmail.com">plasticxpower@gmail.com</a>
        </p>
        <p className={styles.disclaimer}>
          TrueCalc is a calculator, not financial advice. Tax effects and interest reliefs are not included.
        </p>
      </footer>
    </div>
  );
}
