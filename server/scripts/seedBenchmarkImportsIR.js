import { initDb } from '../db.js';
import db from '../db.js';

await initDb();

// Coarse seniority tier, consistent with the original FP&A/SF import batch (1=VP tier .. 4=Analyst tier).
const RANK_BY_TITLE = {
  'IR Associate': 4,
  'IR Analyst': 4,
  'IR Lead': 3,
  'Manager IR': 3,
  'Senior Manager IR': 3,
  'Director IR': 2,
  'Senior Director IR': 2,
  'VP IR': 1,
};

// [company, date, title, rto, years_experience, salary_low, salary_mid, salary_high]
// Salary figures from the source sheet are in $thousands; stored here in full dollars.
const rows = [
  ['Samsara', '2023-06-06', 'IR Associate', 'Remote', 2, 86000, 106000, 126000],
  ['Genmab', '2024-03-15', 'IR Associate', 'Remote', 0, 71000, 95000, 119000],
  ['Bill.com', '2023-07-20', 'IR Analyst', 'Onsite', 3, 100000, 125000, 150000],
  ['Assurant', '2023-12-02', 'IR Analyst', 'Remote', 3, 86000, 114000, 143000],
  ['Snap', '2024-03-15', 'IR Analyst', 'Onsite', 2, 88000, 122000, 156000],
  ['10x Genomics', '2024-01-01', 'IR Analyst', 'Onsite', 5, 149000, 166000, 183000],
  ['Confluent', '2024-03-01', 'IR Analyst', 'Remote', 3, 100000, 108000, 117000],
  ['Tesla', '2024-03-05', 'IR Lead', 'Onsite', 5, 68000, 148000, 228000],
  ['DocuSign', '2023-09-26', 'IR Analyst', 'Onsite', 5, 94000, 118000, 143000],
  ['RingCentral', '2023-04-31', 'Manager IR', 'Onsite', 3, 110000, 133000, 156000],
  ['Interpublic Group', '2023-06-01', 'Senior Manager IR', 'Onsite', 3, 125000, 145000, 165000],
  ['CSX', '2023-06-01', 'Senior Manager IR', 'Onsite', 3, 120000, 123000, 125000],
  ['Crowdstrike', '2024-03-05', 'Senior Manager IR', 'Remote', 6, 135000, 168000, 200000],
  ['Lyft', '2023-10-05', 'Senior Manager IR', 'Onsite', 7, 171000, 181000, 190000],
  ['Foot Locker', '2023-10-05', 'Manager IR', 'Onsite', 3, 90000, 104000, 117000],
  ['PayPal', '2023-06-01', 'Manager IR', 'Onsite', 4, 83000, 135000, 188000],
  ['DXC Technologies', '2025-06-15', 'Manager IR', null, 2, 70000, 100000, 130000],
  ['Nebius', '2025-06-15', 'Manager IR', 'Remote', 5, 125000, 138000, 150000],
  ['Dropbox', '2023-05-28', 'Manager IR', 'Remote', 5, 96000, 137000, 177000],
  ['JetBlue', '2024-01-01', 'Manager IR', 'Hybrid', 5, 115000, 138000, 160000],
  ['SentinelOne', '2025-06-15', 'Manager IR', 'Remote', 5, 158000, 187000, 217000],
  ['Fanatics', '2024-01-01', 'Senior Manager IR', 'Hybrid', 5, 150000, 165000, 180000],
  ['Fisker', '2023-05-28', 'Manager IR', 'Onsite', 5, 67000, 109000, 150000],
  ['Ross', '2023-08-01', 'Manager IR', 'Onsite', 5, 103000, 130000, 157000],
  ['Aurora', '2023-09-01', 'Manager IR', 'Onsite', 5, 135000, 176000, 216000],
  ['H.B. Fuller', '2023-07-18', 'Manager IR', 'Remote', 7, 120000, 130000, 140000],
  ['axogen', '2023-04-31', 'Director IR', null, 5, 140000, 158000, 176000],
  ['SAGE Therapeutics', '2023-04-31', 'Director IR', 'Remote', 7, 175000, 208000, 241000],
  ['23andMe', '2002-07-14', 'Director IR', 'Onsite', 7, 192000, 240000, 288000],
  ['General Mills', '2024-01-01', 'Director IR', 'Onsite', 10, 166000, 222000, 278000],
  ['Fiserv', '2023-08-16', 'Director IR', 'Onsite', 7, 134000, 179000, 223000],
  ['Insight', '2022-09-23', 'Director IR', 'Remote', 8, 210000, 220000, 230000],
  ['Samsara', '2023-08-01', 'Director IR', 'Onsite', 8, 127000, 163000, 199000],
  ['Foot Locker', '2023-04-31', 'Senior Director IR', null, 8, 200000, 225000, 250000],
  ['Zimmer Biomet', '2022-11-23', 'Director IR', 'Remote', 10, 195000, 215000, 235000],
  ['Nvidia', '2024-01-10', 'Director IR', 'Onsite', 15, 224000, 285000, 345000],
  ["Chico's FAS", '2022-12-12', 'Director IR', 'Onsite', 10, null, 160000, null],
  ['NextDoor', '2023-08-01', 'Director IR', 'Onsite', 10, 200000, 238000, 275000],
  ['Ligand Pharmaceuticals', '2023-10-29', 'Director IR', 'Onsite', 8, 185000, 200000, 215000],
  ['DoorDash', '2024-03-01', 'Senior Director IR', 'Onsite', 12, 216000, 270000, 324000],
  ['Lyft', '2024-06-18', 'Senior Director IR', 'Onsite', 12, 220000, 260000, 300000],
  ['Weyerhaeuser', '2023-09-01', 'Director IR', 'Onsite', 10, 165000, 207000, 249000],
  ['Freshworks', '2024-03-01', 'Director IR', 'Onsite', 8, 226000, 296000, 367000],
  ['Black Hills Energy', '2024-03-01', 'Director IR', 'Onsite', 10, 148000, 197000, 245000],
  ['Hunt Companies', '2023-10-24', 'Director IR', 'Onsite', 5, 185000, 205000, 225000],
  ['Fortive', '2023-06-21', 'Director IR', 'Remote', 12, 141000, 201000, 261000],
  ['Trupanion', '2023-09-27', 'Director IR', 'Onsite', 5, 150000, 158000, 165000],
  ['Block', '2023-09-27', 'Director IR', 'Remote', 5, 153000, 189000, 225000],
  ['axogen', '2023-09-27', 'VP IR', 'Remote', 15, 251000, 267000, 282000],
  ['Paramount', '2023-10-24', 'VP IR', 'Onsite', 10, 200000, 238000, 275000],
  ['C3 AI', '2023-04-31', 'VP IR', 'Onsite', 10, 251000, 313000, 375000],
  ['Taboola', '2023-09-01', 'VP IR', 'Onsite', 10, 225000, 263000, 300000],
  ['Citi', '2023-06-12', 'VP IR', 'Onsite', 12, 170000, 235000, 300000],
  ['Skyworks Solutions', '2023-06-01', 'VP IR', 'Onsite', 15, 207000, 310000, 414000],
  ['Dropbox', '2023-11-10', 'VP IR', 'Remote', 12, 199000, 234000, 269000],
  ['ShipBob', '2024-01-31', 'VP IR', 'Remote', 15, 225000, 238000, 250000],
  ['Omada Health', '2023-11-10', 'VP IR', 'Remote', 10, 224000, 268000, 312000],
  ['Micron', '2023-07-14', 'VP IR', 'Onsite', 15, 278000, 314000, 350000],
  ['Viatris', '2022-11-17', 'Senior Director IR', 'Remote', null, 152000, 226000, 299000],
  ['eBay', '2023-06-01', 'Senior Director IR', 'Onsite', null, 184000, 248000, 312000],
  ['Cognizant', '2023-06-18', 'Senior Director IR', 'Onsite', null, 163000, 197000, 230000],
  ['Purecycle', '2022-02-01', 'Director IR', 'Onsite', null, 100000, 140000, 180000],
  ['Novartis', '2022-11-23', 'Director IR', 'Onsite', null, 202000, 252000, 302000],
  ['May Mobility', '2022-12-09', 'Director IR', 'Remote', null, null, 165000, null],
  ['MariaDB', '2023-01-12', 'Director IR', 'Remote', null, 205000, 221000, 237000],
  ['Komodo Health', '2023-03-09', 'Director IR', null, null, 230000, 268000, 306000],
  ['Arm', '2023-01-30', 'Director IR', 'Onsite', null, 183000, 210000, 237000],
  ['Arlo Technologies', '2023-04-31', 'Director IR', 'Onsite', null, 135000, 173000, 210000],
  ['Citi', '2023-07-01', 'Director IR', 'Onsite', null, 171000, 214000, 256000],
  ['East West Bank', '2023-07-01', 'Director IR', 'Onsite', null, 200000, 225000, 250000],
  ['Recruiting firm', '2022-11-23', 'IR Associate', 'Onsite', null, 90000, 100000, 110000],
  ['Dropbox', '2022-12-01', 'IR Associate', 'Remote', null, 80000, 102000, 124000],
  ['Large Medical Device client', '2022-10-01', 'Manager IR', null, null, null, 180000, null],
  ['Supermicro', '2024-01-01', 'Senior Manager IR', 'Onsite', null, 151000, 168000, 185000],
  ['Nordstrom', '2023-03-10', 'Senior Director IR', 'Remote', null, 165000, 220000, 275000],
  ['DISH', '2022-11-23', 'VP IR', 'Onsite', null, 185000, 243000, 300000],
  ['Gitlab', '2023-11-30', 'VP IR', 'Remote', null, 296000, 304000, 312000],
  ['Upwork', '2023-10-07', 'VP IR', 'Remote', null, 217000, 224000, 230000],
  ['Medkick', '2022-11-23', 'VP IR', 'Remote', null, null, 250000, null],
  ['Brookdale', '2022-11-23', 'VP IR', 'Onsite', null, 173000, 197000, 221000],
  ['Twilio', '2022-12-01', 'VP IR', 'Remote', null, 285000, 308000, 330000],
  ['Everest Re', '2023-04-31', 'VP IR', 'Onsite', null, 190000, 208000, 225000],
  ['Rubrik', '2023-04-31', 'VP IR', 'Onsite', null, 225000, 281000, 337000],
];

const insert = db.prepare(`
  INSERT INTO benchmark_imports
    (company, date, title, rank, rto, function, report_to, state, is_public, years_experience, salary_low, salary_mid, salary_high, pct_benchmark)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const [company, date, title, rto, years_experience, salary_low, salary_mid, salary_high] of rows) {
  insert.run(
    company, date, title, RANK_BY_TITLE[title] ?? null, rto, 'IR',
    null, null, 0, years_experience, salary_low, salary_mid, salary_high, null
  );
}

console.log(`Inserted ${rows.length} benchmark_imports rows (IR category)`);
