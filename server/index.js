import express from 'express';
import cors from 'cors';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initDb } from './db.js';
import categoriesRouter from './routes/categories.js';
import resumesRouter from './routes/resumes.js';
import settingsRouter from './routes/settings.js';
import jobsRouter from './routes/jobs.js';
import evaluateRouter from './routes/evaluate.js';
import fieldsRouter from './routes/fields.js';
import chatRouter from './routes/chat.js';
import compareRouter from './routes/compare.js';
import benchmarkImportsRouter from './routes/benchmarkImports.js';
import coverLettersRouter from './routes/coverLetters.js';
import contactSearchRouter from './routes/contactSearch.js';
import companyResearchRouter from './routes/companyResearch.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.JOBEVAL_PORT ? Number(process.env.JOBEVAL_PORT) : 3002;

app.use(cors({ origin: 'http://localhost:2888' }));
app.use(express.json({ limit: '2mb' }));

await initDb();

app.use('/api/categories', categoriesRouter);
app.use('/api/resumes', resumesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/evaluate', evaluateRouter);
app.use('/api/fields', fieldsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/compare', compareRouter);
app.use('/api/benchmark-imports', benchmarkImportsRouter);
app.use('/api/cover-letters', coverLettersRouter);
app.use('/api/contact-search', contactSearchRouter);
app.use('/api/company-research', companyResearchRouter);

// Serve the built client (present in packaged/production builds; absent in
// `npm run dev`, where Vite's own dev server handles the client instead).
const clientDist = join(__dirname, '../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
