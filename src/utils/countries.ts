// Countries offered in the picker. Codes must match scripts/fetch-rates.mjs,
// which writes public/rates.json keyed by these codes.

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CAD' | 'CZK';

export interface Country {
  code: string;
  name: string;
  currency: CurrencyCode;
}

export const COUNTRIES: Country[] = [
  { code: 'US', name: 'United States', currency: 'USD' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP' },
  { code: 'CA', name: 'Canada', currency: 'CAD' },
  { code: 'JP', name: 'Japan', currency: 'JPY' },
  { code: 'CZ', name: 'Czech Republic', currency: 'CZK' },
  { code: 'EA', name: 'Euro area (average)', currency: 'EUR' },
  { code: 'AT', name: 'Austria', currency: 'EUR' },
  { code: 'BE', name: 'Belgium', currency: 'EUR' },
  { code: 'FI', name: 'Finland', currency: 'EUR' },
  { code: 'FR', name: 'France', currency: 'EUR' },
  { code: 'DE', name: 'Germany', currency: 'EUR' },
  { code: 'GR', name: 'Greece', currency: 'EUR' },
  { code: 'IE', name: 'Ireland', currency: 'EUR' },
  { code: 'IT', name: 'Italy', currency: 'EUR' },
  { code: 'NL', name: 'Netherlands', currency: 'EUR' },
  { code: 'PT', name: 'Portugal', currency: 'EUR' },
  { code: 'SK', name: 'Slovakia', currency: 'EUR' },
  { code: 'ES', name: 'Spain', currency: 'EUR' },
];

export interface RateValue {
  value: number;
  period: string;
  source: string;
  url: string;
  fetchedAt: string;
}

export interface RatesFile {
  generatedAt: string;
  countries: Record<string, { mortgage: RateValue | null; inflation: RateValue | null }>;
}
