'use client';

import { useEffect, useState } from 'react';
import { COUNTRIES, RatesFile } from '@/utils/countries';
import styles from '@/app/landing.module.css';

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

interface Item {
  code: string;
  mortgage?: number;
  inflation?: number;
}

// Scrolling strip of the current rates from rates.json (refreshed daily by the
// deploy workflow). Renders nothing until the data loads, or if it can't.
export default function RatesTicker() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [updated, setUpdated] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE_PATH}/rates.json`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: RatesFile) => {
        const list = COUNTRIES.map((c) => ({
          code: c.code === 'EA' ? 'EURO AREA' : c.code,
          mortgage: data.countries?.[c.code]?.mortgage?.value,
          inflation: data.countries?.[c.code]?.inflation?.value,
        })).filter((i) => i.mortgage !== undefined || i.inflation !== undefined);
        if (list.length) {
          setItems(list);
          setUpdated(new Date(data.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
        }
      })
      .catch(() => {});
  }, []);

  if (!items) return null;

  const row = (hidden: boolean) => (
    <ul className={styles.tickerRow} aria-hidden={hidden || undefined}>
      {items.map((i) => (
        <li key={i.code}>
          <span className={styles.tickerCode}>{i.code}</span>
          {i.mortgage !== undefined && <span>Mortgage <b>{i.mortgage.toFixed(2)}%</b></span>}
          {i.inflation !== undefined && <span>Inflation <b>{i.inflation.toFixed(1)}%</b></span>}
        </li>
      ))}
    </ul>
  );

  return (
    <section className={styles.ticker} aria-label="Current mortgage rates and inflation">
      <span className={styles.tickerLabel}>
        <span className={styles.liveDot} aria-hidden="true" /> Live rates{updated && ` · ${updated}`}
      </span>
      <div className={styles.tickerViewport}>
        {/* Two copies so the scroll loops seamlessly */}
        <div className={styles.tickerTrack}>
          {row(false)}
          {row(true)}
        </div>
      </div>
    </section>
  );
}
