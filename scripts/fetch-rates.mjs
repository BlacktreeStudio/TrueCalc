// Fetches the latest mortgage and inflation rates per country and writes
// public/rates.json. Runs in the deploy workflow (daily), so the static site
// can serve current data without calling third-party APIs from the browser.
//
// If a source fails, the previously deployed value (PREVIOUS_RATES_URL) is
// kept, so one broken API never wipes out data. Every value carries the
// period it refers to and its source, which the UI shows to the user.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const OUTPUT = new URL('../public/rates.json', import.meta.url);
const TIMEOUT_MS = 20000;
const USER_AGENT = 'Mozilla/5.0 (compatible; TrueCalc rates fetcher; +https://github.com/plasticxpower/TrueCalc)';

// ---------- HTTP helpers ----------

async function get(url, { attempts = 2 } = {}) {
    let lastError;
    for (let i = 0; i < attempts; i++) {
        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.text();
        } catch (err) {
            lastError = err;
        }
    }
    throw new Error(`${url}: ${lastError?.message ?? lastError}`);
}

function parseCsv(text) {
    return text
        .trim()
        .split(/\r?\n/)
        .map((line) => line.split(',').map((cell) => cell.replace(/^"|"$/g, '').trim()));
}

function round(value) {
    return Math.round(value * 100) / 100;
}

function requireNumber(value, what) {
    const n = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(n)) throw new Error(`no numeric value for ${what}`);
    return n;
}

// Year-over-year % change from a list of { period: 'YYYY-MM', value } sorted ascending.
function yoyFromIndex(points, what) {
    const last = points[points.length - 1];
    if (!last) throw new Error(`no data for ${what}`);
    const [y, m] = last.period.split('-');
    const prevPeriod = `${Number(y) - 1}-${m}`;
    const prev = points.find((p) => p.period === prevPeriod);
    if (!prev) throw new Error(`no value 12 months before ${last.period} for ${what}`);
    return { value: round((last.value / prev.value - 1) * 100), period: last.period };
}

// ---------- Sources ----------

// ECB Data Portal: HICP (all EU countries) and MFI interest rates (euro area).
async function ecb(flow, key, label) {
    const url = `https://data-api.ecb.europa.eu/service/data/${flow}/${key}?lastNObservations=1&format=csvdata`;
    const rows = parseCsv(await get(url));
    const header = rows[0];
    const iPeriod = header.indexOf('TIME_PERIOD');
    const iValue = header.indexOf('OBS_VALUE');
    const last = rows[rows.length - 1];
    if (rows.length < 2 || iPeriod < 0 || iValue < 0) throw new Error(`unexpected ECB response for ${key}`);
    return {
        value: round(requireNumber(last[iValue], key)),
        period: last[iPeriod],
        source: label,
        url: `https://data.ecb.europa.eu/data/datasets/${flow}/${flow}.${key}`,
    };
}

const ecbHicp = (area) => ecb('ICP', `M.${area}.N.000000.4.ANR`, 'ECB – HICP, annual rate of change');
const ecbMortgage = (area) =>
    ecb('MIR', `M.${area}.B.A2C.AM.R.A.2250.EUR.N`, 'ECB – bank rates on new loans for house purchase');

// FRED (St. Louis Fed) public CSV download, no API key needed.
async function fredSeries(id) {
    const rows = parseCsv(await get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`));
    return rows
        .slice(1)
        .filter((r) => r[1] && r[1] !== '.')
        .map((r) => ({ date: r[0], value: parseFloat(r[1]) }))
        .filter((p) => Number.isFinite(p.value));
}

async function fredLatest(id, label) {
    const points = await fredSeries(id);
    const last = points[points.length - 1];
    if (!last) throw new Error(`no data for FRED ${id}`);
    return { value: round(last.value), period: last.date, source: label, url: `https://fred.stlouisfed.org/series/${id}` };
}

async function fredYoY(id, label) {
    const points = (await fredSeries(id)).map((p) => ({ period: p.date.slice(0, 7), value: p.value }));
    return { ...yoyFromIndex(points, `FRED ${id}`), source: label, url: `https://fred.stlouisfed.org/series/${id}` };
}

// Bank of Canada Valet API.
async function valetObservations(series, recent) {
    const json = JSON.parse(await get(`https://www.bankofcanada.ca/valet/observations/${series}/json?recent=${recent}`));
    return (json.observations ?? [])
        .map((o) => ({ date: o.d, value: parseFloat(o[series]?.v) }))
        .filter((p) => Number.isFinite(p.value))
        .sort((a, b) => a.date.localeCompare(b.date));
}

async function valetLatest(series, label) {
    const points = await valetObservations(series, 1);
    const last = points[points.length - 1];
    if (!last) throw new Error(`no data for Valet ${series}`);
    return { value: round(last.value), period: last.date, source: label, url: `https://www.bankofcanada.ca/valet/observations/${series}` };
}

async function valetYoY(series, label) {
    const points = (await valetObservations(series, 13)).map((p) => ({ period: p.date.slice(0, 7), value: p.value }));
    return { ...yoyFromIndex(points, `Valet ${series}`), source: label, url: `https://www.bankofcanada.ca/valet/observations/${series}` };
}

// UK Office for National Statistics: CPI annual rate (series D7G7).
async function onsCpi() {
    const json = JSON.parse(await get('https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/d7g7/mm23/data'));
    const months = json.months ?? [];
    const last = months[months.length - 1];
    if (!last) throw new Error('no monthly data from ONS D7G7');
    const monthIndex = new Date(`${last.month} 1, 2000`).getMonth() + 1;
    return {
        value: round(requireNumber(last.value, 'ONS D7G7')),
        period: `${last.year}-${String(monthIndex).padStart(2, '0')}`,
        source: 'ONS – CPI annual rate',
        url: 'https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/d7g7/mm23',
    };
}

// Bank of England database: quoted household mortgage rates.
async function boeSeries(code, label) {
    const url =
        'https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes' +
        `&Datefrom=01/Jan/${new Date().getUTCFullYear() - 1}&Dateto=now&SeriesCodes=${code}&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`;
    const rows = parseCsv(await get(url)).filter((r) => r.length >= 2 && Number.isFinite(parseFloat(r[1])));
    const last = rows[rows.length - 1];
    if (!last) throw new Error(`no data for BoE ${code}`);
    const date = new Date(`${last[0]} UTC`);
    return {
        value: round(parseFloat(last[1])),
        period: Number.isNaN(date.getTime()) ? last[0] : date.toISOString().slice(0, 10),
        source: label,
        url: `https://www.bankofengland.co.uk/boeapps/database/fromshowcolumns.asp?SeriesCodes=${code}&UsingCodes=Y`,
    };
}

// World Bank: annual CPI inflation, the fallback when no monthly source works.
async function worldBankInflation(iso3) {
    const json = JSON.parse(
        await get(`https://api.worldbank.org/v2/country/${iso3}/indicator/FP.CPI.TOTL.ZG?format=json&mrnev=1`)
    );
    const obs = json?.[1]?.[0];
    if (!obs) throw new Error(`no World Bank inflation for ${iso3}`);
    return {
        value: round(requireNumber(obs.value, `World Bank ${iso3}`)),
        period: obs.date,
        source: 'World Bank – annual CPI inflation',
        url: `https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG?locations=${iso3}`,
    };
}

// ---------- Countries ----------
// Each metric lists sources in order of preference; the first that works wins.
// Codes must match src/utils/countries.ts.

const euro = (area, iso3) => ({
    mortgage: [() => ecbMortgage(area)],
    inflation: [() => ecbHicp(area), () => worldBankInflation(iso3)],
});

const COUNTRIES = {
    US: {
        mortgage: [() => fredLatest('MORTGAGE30US', 'Freddie Mac – 30-year fixed mortgage average (via FRED)')],
        inflation: [() => fredYoY('CPIAUCSL', 'US BLS – CPI-U, year over year (via FRED)'), () => worldBankInflation('USA')],
    },
    GB: {
        mortgage: [() => boeSeries('IUMBV34', 'Bank of England – 2-year fixed mortgage, 75% LTV')],
        inflation: [onsCpi, () => worldBankInflation('GBR')],
    },
    CA: {
        mortgage: [() => valetLatest('V80691335', 'Bank of Canada – 5-year conventional mortgage rate')],
        inflation: [() => valetYoY('V41690973', 'Statistics Canada – CPI, year over year (via Bank of Canada)'), () => worldBankInflation('CAN')],
    },
    JP: {
        mortgage: [],
        inflation: [() => fredYoY('JPNCPIALLMINMEI', 'OECD – CPI, year over year (via FRED)'), () => worldBankInflation('JPN')],
    },
    CZ: {
        mortgage: [],
        inflation: [() => ecbHicp('CZ'), () => worldBankInflation('CZE')],
    },
    EA: euro('U2', 'EMU'),
    AT: euro('AT', 'AUT'),
    BE: euro('BE', 'BEL'),
    FI: euro('FI', 'FIN'),
    FR: euro('FR', 'FRA'),
    DE: euro('DE', 'DEU'),
    GR: euro('GR', 'GRC'),
    IE: euro('IE', 'IRL'),
    IT: euro('IT', 'ITA'),
    NL: euro('NL', 'NLD'),
    PT: euro('PT', 'PRT'),
    SK: euro('SK', 'SVK'),
    ES: euro('ES', 'ESP'),
};

// ---------- Main ----------

async function loadPrevious() {
    const url = process.env.PREVIOUS_RATES_URL;
    if (!url) return null;
    try {
        return JSON.parse(await get(url, { attempts: 1 }));
    } catch (err) {
        console.warn(`Could not load previous rates from ${url}: ${err.message}`);
        return null;
    }
}

async function resolve(sources, previous, label) {
    const errors = [];
    for (const source of sources) {
        try {
            return { ...(await source()), fetchedAt: new Date().toISOString() };
        } catch (err) {
            errors.push(err.message);
        }
    }
    if (sources.length) console.warn(`${label}: all sources failed:\n  ${errors.join('\n  ')}`);
    if (previous) {
        console.warn(`${label}: keeping previous value from ${previous.fetchedAt}`);
        return previous;
    }
    return null;
}

async function main() {
    const previous = await loadPrevious();
    const countries = {};

    await Promise.all(
        Object.entries(COUNTRIES).map(async ([code, metrics]) => {
            const prev = previous?.countries?.[code] ?? {};
            const [mortgage, inflation] = await Promise.all([
                resolve(metrics.mortgage, prev.mortgage, `${code} mortgage`),
                resolve(metrics.inflation, prev.inflation, `${code} inflation`),
            ]);
            countries[code] = { mortgage, inflation };
        })
    );

    const output = { generatedAt: new Date().toISOString(), countries };
    await mkdir(dirname(OUTPUT.pathname), { recursive: true });
    await writeFile(OUTPUT, JSON.stringify(output, null, 2) + '\n');

    for (const [code, { mortgage, inflation }] of Object.entries(countries).sort()) {
        const fmt = (m) => (m ? `${m.value}% (${m.period})` : '—');
        console.log(`${code.padEnd(3)} mortgage ${fmt(mortgage).padEnd(22)} inflation ${fmt(inflation)}`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
