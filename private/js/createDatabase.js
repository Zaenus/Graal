const sqlite3 = require('sqlite3').verbose();

// Connect to or create the database
const db = new sqlite3.Database('./Database.db');

db.serialize(() => {
  // Create a table for worked hours data
  const workedHoursQuery = `
    CREATE TABLE IF NOT EXISTS worked_hours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE NOT NULL,
      employer_name TEXT NOT NULL,
      value REAL NOT NULL,
      manager TEXT NOT NULL
     )
   `;
  db.run(workedHoursQuery);
});