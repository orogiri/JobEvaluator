import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.JOBEVAL_DATA_DIR
  ? join(process.env.JOBEVAL_DATA_DIR, 'data.db')
  : join(__dirname, 'data.db');

let _db = null;

function save() {
  writeFileSync(DB_PATH, Buffer.from(_db.export()));
}

// Provides a better-sqlite3-compatible synchronous interface over sql.js
const db = {
  prepare(sql) {
    return {
      all(...args) {
        const params = args.flat(1).filter((v) => v !== undefined);
        const stmt = _db.prepare(sql);
        if (params.length) stmt.bind(params);
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        stmt.free();
        return rows;
      },
      get(...args) {
        const params = args.flat(1).filter((v) => v !== undefined);
        const stmt = _db.prepare(sql);
        if (params.length) stmt.bind(params);
        const row = stmt.step() ? stmt.getAsObject() : undefined;
        stmt.free();
        return row;
      },
      run(...args) {
        const params = args.flat(1).filter((v) => v !== undefined);
        const stmt = _db.prepare(sql);
        stmt.run(params.length ? params : undefined);
        stmt.free();
        const lastInsertRowid =
          _db.exec('SELECT last_insert_rowid()')[0]?.values[0][0] ?? 0;
        save();
        return { lastInsertRowid };
      },
    };
  },
};

export async function initDb() {
  const SQL = await initSqlJs();
  _db = existsSync(DB_PATH)
    ? new SQL.Database(readFileSync(DB_PATH))
    : new SQL.Database();

  _db.run('PRAGMA foreign_keys = ON');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS resumes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      UNIQUE(category_id, name)
    );

    CREATE TABLE IF NOT EXISTS job_descriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL REFERENCES job_descriptions(id) ON DELETE CASCADE,
      resume_id INTEGER NOT NULL REFERENCES resumes(id) ON DELETE RESTRICT,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      company TEXT DEFAULT '',
      title TEXT DEFAULT '',
      salary_min REAL,
      salary_max REAL,
      years_experience REAL,
      score_duties REAL,
      score_requirements REAL,
      score_years_experience REAL,
      score_skills REAL,
      score_industry REAL,
      score_details TEXT DEFAULT '{}',
      field_values TEXT DEFAULT '{}',
      llm_provider TEXT,
      llm_model TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS benchmark_imports (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      company           TEXT DEFAULT '',
      date              TEXT,
      title             TEXT DEFAULT '',
      rank              INTEGER,
      rto               TEXT,
      function          TEXT,
      report_to         TEXT,
      state             TEXT,
      is_public         INTEGER DEFAULT 0,
      years_experience  REAL,
      salary_low        REAL,
      salary_mid        REAL,
      salary_high       REAL,
      pct_benchmark     REAL,
      level             TEXT,
      created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cover_letter_templates (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      body         TEXT NOT NULL,
      instructions TEXT DEFAULT '',
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cover_letters (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id      INTEGER NOT NULL REFERENCES job_descriptions(id) ON DELETE CASCADE,
      resume_id   INTEGER NOT NULL REFERENCES resumes(id) ON DELETE RESTRICT,
      template_id INTEGER REFERENCES cover_letter_templates(id) ON DELETE SET NULL,
      provider    TEXT,
      llm_model   TEXT,
      content     TEXT NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contact_searches (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      evaluation_id INTEGER NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
      mode          TEXT NOT NULL,
      query_title   TEXT DEFAULT '',
      summary       TEXT DEFAULT '',
      contacts      TEXT NOT NULL DEFAULT '[]',
      llm_model     TEXT,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS company_research (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      evaluation_id INTEGER NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
      summary       TEXT DEFAULT '',
      findings      TEXT NOT NULL DEFAULT '[]',
      llm_model     TEXT,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT NOT NULL DEFAULT 'New Chat',
      provider   TEXT DEFAULT '',
      model      TEXT DEFAULT '',
      messages   TEXT NOT NULL DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const defaultWeights = JSON.stringify({
    duties: 20,
    requirements: 20,
    years_experience: 15,
    skills: 15,
    preferences: 10,
    industry: 20,
  });

  // INSERT OR IGNORE to preserve existing values
  _db.run(
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('weights', ?)",
    [defaultWeights]
  );
  _db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('openai_key', '')", []);
  _db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('anthropic_key', '')", []);
  _db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('qwen_key', '')", []);
  _db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('serper_key', '')", []);

  // Default guidance for the Cover Letters "Research Company" hook — user-editable in
  // the UI (see CoverLetters.tsx), not hard-coded in the prompt builder itself, so the
  // user can change what kind of material it looks for and how it's written without a code change.
  const defaultCompanyResearchInstructions =
    'Find 2-3 distinct, recent, notable developments about the company — e.g. a funding round, product launch, major ' +
    'partnership, leadership change, expansion, acquisition, award, or other newsworthy milestone from roughly the last ' +
    '6-12 months. For each, write a short paragraph (2-4 sentences) in first person, ready to paste directly into a ' +
    'cover letter, that:\n' +
    '- Names the specific event directly — don\'t gesture vaguely at it ("your recent growth" is too vague).\n' +
    '- Connects the event to genuine, specific interest in the role or company — ideally tying it thematically to the ' +
    'job title or function, where it\'s a natural fit.\n' +
    '- Avoids generic flattery ("impressed by your innovative culture") — every sentence grounded in the specific fact.\n' +
    '- Sounds like a real, specific person wrote it, not a template.';
  _db.run(
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('company_research_instructions', ?)",
    [defaultCompanyResearchInstructions]
  );

  // Migrations: add new columns without breaking existing databases
  for (const sql of [
    'ALTER TABLE job_descriptions ADD COLUMN applied INTEGER DEFAULT 0',
    'ALTER TABLE job_descriptions ADD COLUMN interview_1 INTEGER DEFAULT 0',
    'ALTER TABLE job_descriptions ADD COLUMN interview_2 INTEGER DEFAULT 0',
    'ALTER TABLE job_descriptions ADD COLUMN interview_3 INTEGER DEFAULT 0',
    'ALTER TABLE job_descriptions ADD COLUMN offer_made INTEGER DEFAULT 0',
    'ALTER TABLE job_descriptions ADD COLUMN cover_letter_sent INTEGER DEFAULT 0',
    'ALTER TABLE evaluations ADD COLUMN applied INTEGER DEFAULT 0',
    'ALTER TABLE evaluations ADD COLUMN interview_1 INTEGER DEFAULT 0',
    'ALTER TABLE evaluations ADD COLUMN interview_2 INTEGER DEFAULT 0',
    'ALTER TABLE evaluations ADD COLUMN interview_3 INTEGER DEFAULT 0',
    'ALTER TABLE evaluations ADD COLUMN offer_made INTEGER DEFAULT 0',
    'ALTER TABLE evaluations ADD COLUMN cover_letter_sent INTEGER DEFAULT 0',
    'ALTER TABLE evaluations ADD COLUMN company_industry TEXT',
    'ALTER TABLE evaluations ADD COLUMN reports_to TEXT',
    'ALTER TABLE evaluations ADD COLUMN remote TEXT',
    'ALTER TABLE evaluations ADD COLUMN score_preferences REAL',
    'ALTER TABLE evaluations ADD COLUMN job_level TEXT',
    'ALTER TABLE evaluations ADD COLUMN meets_requirements TEXT',
    'ALTER TABLE evaluations ADD COLUMN meets_requirements_notes TEXT',
    'ALTER TABLE evaluations ADD COLUMN meets_preferences TEXT',
    'ALTER TABLE evaluations ADD COLUMN meets_preferences_notes TEXT',
    'ALTER TABLE evaluations ADD COLUMN resume_suggestions TEXT',
    'ALTER TABLE evaluations ADD COLUMN posted_date TEXT',
    "ALTER TABLE cover_letter_templates ADD COLUMN instructions TEXT DEFAULT ''",
    "ALTER TABLE contact_searches ADD COLUMN provider TEXT DEFAULT 'anthropic'",
    "ALTER TABLE company_research ADD COLUMN provider TEXT DEFAULT 'anthropic'",
    'ALTER TABLE benchmark_imports ADD COLUMN level TEXT',
    'ALTER TABLE evaluations ADD COLUMN salary_zones TEXT',
  ]) {
    try { _db.run(sql); } catch { /* column already exists */ }
  }

  // One-time migration: copy tracking data from evaluations → job_descriptions
  const trackingMigrated = _db.exec("SELECT value FROM settings WHERE key='tracking_migrated'");
  if (!trackingMigrated.length || !trackingMigrated[0].values.length) {
    _db.run(`
      UPDATE job_descriptions SET
        applied     = COALESCE((SELECT MAX(applied)     FROM evaluations WHERE job_id = job_descriptions.id), 0),
        interview_1 = COALESCE((SELECT MAX(interview_1) FROM evaluations WHERE job_id = job_descriptions.id), 0),
        interview_2 = COALESCE((SELECT MAX(interview_2) FROM evaluations WHERE job_id = job_descriptions.id), 0),
        interview_3 = COALESCE((SELECT MAX(interview_3) FROM evaluations WHERE job_id = job_descriptions.id), 0),
        offer_made  = COALESCE((SELECT MAX(offer_made)  FROM evaluations WHERE job_id = job_descriptions.id), 0)
    `);
    _db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('tracking_migrated', '1')");
  }

  // Migrate stored weights: add preferences dimension if missing
  const wRow = _db.exec("SELECT value FROM settings WHERE key='weights'");
  if (wRow.length && wRow[0].values.length) {
    const w = JSON.parse(wRow[0].values[0][0]);
    if (!('preferences' in w)) {
      w.preferences = 10;
      w.years_experience = Math.max(0, (w.years_experience ?? 20) - 5);
      w.skills = Math.max(0, (w.skills ?? 20) - 5);
      _db.run("UPDATE settings SET value=? WHERE key='weights'", [JSON.stringify(w)]);
    }
  }

  save();
}

export default db;
