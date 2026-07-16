import { initDb } from '../db.js';
import db from '../db.js';

await initDb();

// [company, date, title, rank, rto, function, report_to, state, is_public, years_experience, salary_low, salary_mid, salary_high, pct_benchmark]
// Salary figures from the source sheet are in $thousands; stored here in full dollars to match evaluations.salary_min/max units.
const rows = [
  ['Porch Group', '2024-01-01', 'Analyst', 4, 'Remote', 'FP&A', null, null, 0, 3, 84000, 101000, 118000, 82],
  ['SecureAuth', '2024-01-01', 'Analyst', 4, 'Remote', 'FP&A', null, null, 0, 4, 90000, 95000, 100000, 71],
  ['Storable', '2024-01-01', 'Analyst', 4, 'Remote', 'FP&A', null, null, 0, 3, 105000, 113000, 120000, 92],
  ['Vanta', '2024-01-01', 'Analyst', 4, 'Remote', 'FP&A', null, null, 0, 4, 132000, 144000, 155000, 108],
  ['Instacart', '2024-01-01', 'Analyst', 4, 'Remote', 'FP&A', null, null, 1, 4, 123000, 144000, 165000, 108],
  ['PetDesk', '2024-01-01', 'Analyst', 4, 'Remote', 'FP&A', null, null, 0, 2, 100000, 113000, 125000, 101],
  ['Fivetran', '2024-01-01', 'Analyst', 4, 'Remote', 'FP&A', null, null, 0, 5, 132000, 149000, 165000, 103],
  ['Transfr', '2024-01-01', 'Analyst', 4, 'Remote', 'FP&A', null, null, 0, 3, 100000, 105000, 110000, 86],
  ['The Harris Poll', '2024-01-01', 'Analyst', 4, 'Remote', 'FP&A', null, null, 0, 5, 80000, 105000, 130000, 73],
  ['Newsela', '2024-01-01', 'Analyst', 4, 'Remote', 'FP&A', null, null, 0, 1, 70000, 73000, 75000, 72],
  ['Vic.ai', '2024-01-01', 'Analyst', 4, 'Remote', 'FP&A', null, null, 0, 3, 95000, 110000, 125000, 90],
  ['Confluent', '2024-01-01', 'Analyst', 4, 'Remote', 'FP&A', null, null, 1, 3, 99000, 107000, 114000, 87],

  ['Coalition', '2024-01-01', 'Senior Manager', 3, 'Remote', 'FP&A', null, null, 0, 5, 148000, 176000, 205000, 122],
  ['Lattice', '2024-01-01', 'Senior Manager', 3, 'Remote', 'FP&A', null, null, 0, 8, 107000, 142000, 178000, 80],
  ['Jellysmack', '2024-01-01', 'Senior Manager', 3, 'Remote', 'FP&A', null, null, 0, 6, 139000, 150000, 160000, 96],
  ['Databricks', '2024-01-01', 'Manager', 3, 'Remote', 'FP&A', null, null, 0, 5, 117000, 162000, 207000, 112],
  ['Microsoft', '2024-01-01', 'Manager', 3, 'Hybrid', 'FP&A', null, null, 1, 2, 73000, 115000, 158000, 103],
  ['Microsoft', '2024-01-01', 'Senior Manager', 3, 'Remote', 'FP&A', null, null, 1, 4, 92000, 143000, 195000, 107],
  ['Zscaler', '2024-01-01', 'Manager', 3, 'Onsite', 'FP&A', null, null, 1, 7, 123000, 136000, 149000, 82],
  ['Zscaler', '2024-01-01', 'Senior Manager', 3, 'Onsite', 'FP&A', null, null, 1, 8, 147000, 164000, 180000, 93],
  ['Meta', '2024-01-01', 'Manager', 3, 'Onsite', 'FP&A', null, null, 1, 7, 115000, 141000, 166000, 85],
  ['Aegion', '2024-01-01', 'Senior Manager', 3, 'Onsite', 'FP&A', 'VP', 'FL', 0, 5, 145000, 165000, 185000, 114],
  ['Plaid', '2024-09-30', 'Manager', 3, 'Remote', 'SF', null, null, 0, 5, 111000, 131000, 150000, 90],
  ['Skylight', '2024-01-01', 'Manager', 3, 'Remote', 'FP&A', 'Director', null, 0, 5, 100000, 118000, 135000, 81],
  ['Patriot Growth Insurance Services', '2024-01-01', 'Manager', 3, 'Remote', 'FP&A', null, null, 0, 5, 140000, 145000, 150000, 101],
  ['Zendesk', '2024-01-01', 'Manager', 3, 'Remote', 'FP&A', null, null, 0, 5, 113000, 141000, 169000, 98],
  ['NextRoll', '2024-01-01', 'Senior Manager', 3, 'Remote', 'FP&A', 'Director', null, 0, 10, 150000, 167000, 184000, 84],
  ['SentinelOne', '2024-01-01', 'Manager', 3, 'Remote', 'FP&A', 'Sr. Director', null, 1, 5, 128000, 152000, 176000, 105],
  ['Rula', '2025-03-31', 'Senior Manager', 3, 'Remote', 'SF', null, null, 0, 8, null, null, null, null],
  ['Shippo', '2025-03-31', 'Senior Manager', 3, 'Remote', 'FP&A', null, null, 0, 8, 149000, 175000, 201000, 99],
  ['Reltio', '2025-03-31', 'Manager', 3, 'Onsite', 'FP&A', null, null, 0, 5, 95000, 136000, 177000, 94],
  ['Cohesity', '2025-03-31', 'Senior Manager', 3, 'Remote', 'FP&A', null, null, 0, 8, 148000, 166000, 185000, 94],
  ['Zelis', '2025-03-31', 'Senior Manager', 3, 'Onsite', 'FP&A', null, null, 0, 7, null, null, null, null],
  ['Thumbtack', '2025-03-31', 'Senior Manager', 3, 'Remote', 'FP&A', null, null, 0, 5, 176000, 196000, 215000, 136],
  ['Panorama Education', '2025-03-31', 'Manager', 3, 'Remote', 'SF', null, null, 0, 7, 153000, 162000, 170000, 97],
  ['Olo', '2025-03-31', 'Senior Manager', 3, 'Remote', 'FP&A', null, null, 0, 8, null, null, null, null],
  ['Kentik', '2025-03-31', 'Senior Manager', 3, 'Remote', 'FP&A', null, null, 0, 5, 150000, 188000, 225000, 130],
  ['Seatgeek', '2025-03-31', 'Manager', 3, 'Remote', 'FP&A', null, null, 0, 6, 109000, 138000, 167000, 89],
  ['Diligent', '2025-03-31', 'Manager', 3, 'Remote', 'FP&A', null, null, 0, 4, 140000, 145000, 150000, 109],
  ['Rula', '2025-05-14', 'Senior Manager', 3, 'Remote', 'FP&A', null, null, 0, 8, 170000, 180000, 190000, 102],
  ['Cribl', '2025-03-31', 'Manager', 3, 'Remote', 'FP&A', null, null, 0, 5, 111000, 142000, 173000, 98],
  ['SentiLink', '2025-05-14', 'Strategic Finance Lead', 3, 'Remote', 'SF', null, null, 0, 8, 170000, 205000, 240000, 116],
  ['Sophos', '2025-05-14', 'Senior Manager', 3, 'Remote', 'FP&A', null, null, 0, 8, 134000, 179000, 224000, 101],
  ['Ascenda', '2025-05-14', 'FP&A Lead', 3, 'Remote', 'FP&A', null, null, 0, 8, 150000, 175000, 200000, 99],
  ['Wrapbook', '2025-03-31', 'Manager', 3, 'Remote', 'SF', null, null, 0, 8, 110000, 142000, 174000, 81],
  ['Workiva', '2025-05-16', 'Manager', 3, 'Remote', 'FP&A', null, null, 0, 5, 106000, 139000, 172000, 96],
  ['Chainlink', '2025-03-31', 'Manager', 3, 'Remote', 'FP&A', null, null, 0, 5, null, null, null, null],
  ['OneStream', '2025-05-28', 'Sr Manager FP&A', 3, 'Remote', 'FP&A', null, null, 0, 5, 138000, 157000, 175000, 108],
  ['Engine', '2026-01-22', 'Sr Finance Manager', 3, 'Remote', 'FP&A', null, null, 0, 10, 166000, 183000, 200000, 92],
  ['Engine', '2026-01-23', 'Strategic Finance Manager', 3, 'Remote', 'SF', null, null, 0, 5, 150000, 168000, 185000, 116],
  ['Smartling', '2026-01-29', 'FP&A Manager', 3, 'Remote', 'FP&A', null, null, 0, 6, 120000, 130000, 140000, 84],
  ['Rula', '2026-01-29', 'Sr SF Manager', 3, 'Remote', 'SF', null, null, 0, 7, 178000, 189000, 199000, 114],
  ['Infoblox', '2026-01-29', 'SF Sr Manager', 3, 'Remote', 'SF', null, null, 0, 8, 141000, 170000, 200000, 96],
  ['Sophos', '2026-01-29', 'Finance Manager', 3, 'Remote', 'FP&A', null, null, 0, 6, 110000, 147000, 183000, 94],
  ['Alteryx', '2026-01-29', 'Sr FP&A Manager', 3, 'Remote', 'FP&A', null, null, 0, 7.5, 136000, 157000, 177000, 91],
  ['Mitek Systems', '2026-02-02', 'Sr Mgr FP&A', 3, 'Remote', 'FP&A', null, null, 1, 7, 160000, 180000, 200000, 109],
  ['GeneDX', '2026-02-04', 'Sr Mgr SF', 3, 'Remote', 'SF', null, null, 0, 5.5, 140000, 150000, 160000, 100],
  ['Dataiku', '2026-02-13', 'FP&A Manager', 3, 'Remote', 'FP&A', null, null, 0, 7, 149000, 154000, 160000, 93],
  ['Salsify', '2026-02-18', 'Senior Manager, FP&A', 3, 'Remote', 'FP&A', null, null, 0, 8, 162000, 176000, 190000, 100],
  ['Roo', '2025-03-31', 'Senior Manager', 3, 'Remote', 'FP&A', null, null, 0, 6, 125000, 145000, 165000, 94],

  ['Leidos', '2024-01-01', 'Director', 2, 'Remote', 'FP&A', null, null, 0, 12, 131000, 184000, 237000, 84],
  ['AlphaSense', '2024-01-01', 'Director', 2, 'Onsite', 'FP&A', null, null, 0, 8, 193000, 203000, 213000, 115],
  ['Zscaler', '2024-01-01', 'Senior Director', 2, 'Onsite', 'FP&A', null, null, 1, 15, 196000, 217000, 238000, 86],
  ['Granicus', '2024-01-01', 'Director', 2, 'Remote', 'FP&A', null, null, 0, 7, 165000, 174000, 183000, 105],
  ['Booking Holdings (Kayak division)', '2024-01-01', 'Director', 2, 'Remote', 'FP&A', null, null, 0, 6, 172000, 194000, 216000, 125],
  ['Outreach', '2024-01-01', 'Director', 2, 'Remote', 'FP&A', null, null, 0, 7, 130000, 165000, 200000, 99],
  ['Voltage Park', '2024-01-01', 'Director', 2, 'Remote', 'FP&A', null, null, 0, 4, 130000, 153000, 175000, 114],
  ['Dataiku', '2023-09-30', 'Director', 2, 'Remote', 'SF', null, null, 0, 10, 190000, 195000, 200000, 98],
  ['Lyric', '2023-09-30', 'Senior Director', 2, 'Remote', 'SF', null, null, 0, 10, 190000, 215000, 240000, 108],
  ['1Password', '2024-06-23', 'Director', 2, 'Remote', 'FP&A', null, null, 0, 8, 175000, 206000, 237000, 117],
  ['Omnidian', '2024-06-24', 'Director', 2, 'Remote', 'FP&A', null, null, 0, 8, null, 155000, null, 88],
  ['Pattern Energy Group', '2023-09-30', 'Director', 2, 'Remote', 'SF', null, null, 0, 8, 149000, 175000, 201000, 99],
  ['GHK', '2024-01-01', 'Director', 2, 'Remote', 'FP&A', null, null, 0, 8, 138000, 161000, 184000, 91],
  ['HashiCorp', '2024-03-01', 'Director', 2, 'Onsite', 'FP&A', null, null, 0, 10, 196000, 224000, 252000, 113],
  ['Reverb', '2024-01-01', 'Director', 2, 'Remote', 'FP&A', null, null, 0, 8, 157000, 181000, 205000, 102],
  ['Paycor', '2024-01-01', 'Director', 2, 'Remote', 'FP&A', null, null, 0, 10, 113000, 153000, 193000, 77],
  ['Sprout Social', '2025-06-17', 'Director', 2, 'Remote', 'FP&A', null, null, 0, 10, 165000, 206000, 247000, 104],
  ['brightwheel', '2024-01-01', 'Director', 2, 'Remote', 'FP&A', null, null, 0, 10, 127000, 181000, 235000, 91],
  ['Bestow', '2025-05-11', 'Director', 2, 'Remote', 'SF', null, null, 0, 8, 200000, 225000, 250000, 127],
  ['Salesloft', '2025-05-13', 'Director', 2, 'Remote', 'FP&A', null, null, 0, 7, 130000, 140000, 150000, 84],
  ['CIRE Equity', '2024-01-01', 'Director', 2, 'Remote', 'FP&A', null, null, 0, 8, 150000, 175000, 200000, 99],

  ['Vituity', '2024-01-01', 'VP', 1, null, 'FP&A', null, null, 0, 15, 200000, 225000, 250000, 89],
  ['OpenAI', '2024-01-01', 'VP', 1, null, 'SF', null, null, 0, 7, null, 265000, null, 160],
  ['Rula', '2025-06-17', 'VP', 1, null, 'FP&A', null, null, 0, 12, 242000, 249000, 256000, 113],
  ['Abnormal Security', '2024-06-21', 'VP', 1, null, 'FP&A', null, null, 0, 10, 188000, 205000, 221000, 103],
  ['Wing', '2024-01-01', 'VP', 1, null, 'FP&A', null, null, 0, 12, 200000, 240000, 280000, 109],
  ['Mastercard', '2024-03-01', 'VP', 1, null, 'FP&A', null, null, 0, null, 195000, 249000, 302000, null],
  ['Drop', '2024-09-30', 'VP', 1, null, 'FP&A', null, null, 0, 10, 200000, 225000, 250000, 113],
  ['Circle', '2024-01-01', 'VP', 1, null, 'SF', null, null, 0, 15, 253000, 293000, 333000, 116],
  ['Olo', '2024-01-01', 'VP', 1, null, 'FP&A', 'CFO', null, 1, 12, 183000, 222000, 262000, 101],
];

const insert = db.prepare(`
  INSERT INTO benchmark_imports
    (company, date, title, rank, rto, function, report_to, state, is_public, years_experience, salary_low, salary_mid, salary_high, pct_benchmark)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const r of rows) insert.run(...r);

console.log(`Inserted ${rows.length} benchmark_imports rows`);
