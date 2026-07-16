const Database = require('./server/node_modules/better-sqlite3');
const db = new Database('./server/data.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log(JSON.stringify(tables));
