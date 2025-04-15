const sqlite3 = require('sqlite3').verbose();

// Paths to your SQLite database files
const sourceDbPath = 'C:/Users/Zaenus/Documents/Code/Graal_extrasHolandes/Database.db'; // Replace with your source database file path
const targetDbPath = 'C:/Users/Zaenus/Documents/Code/Graal_extrasHolandes/DatabaseOld.db'; // Replace with your target database file path

// Connect to the source and target databases
const sourceDb = new sqlite3.Database(sourceDbPath, (err) => {
  if (err) {
    console.error('Error connecting to source database:', err);
  } else {
    console.log('Connected to source database');
  }
});

const targetDb = new sqlite3.Database(targetDbPath, (err) => {
  if (err) {
    console.error('Error connecting to target database:', err);
  } else {
    console.log('Connected to target database');
  }
});

// Function to copy a table
function copyTable(tableName) {
  return new Promise((resolve, reject) => {
    // Step 1: Get all rows from the source table
    sourceDb.all(`SELECT * FROM ${tableName}`, [], (err, rows) => {
      if (err) return reject(err);

      if (rows.length === 0) {
        console.log(`No data found in ${tableName}`);
        return resolve();
      }

      // Step 2: Prepare the INSERT statement
      const columns = Object.keys(rows[0]).join(', ');
      const placeholders = rows.map(() => `(${Object.keys(rows[0]).map(() => '?').join(', ')})`).join(', ');
      const values = rows.map(row => Object.values(row)).flat();

      const query = `INSERT INTO ${tableName} (${columns}) VALUES ${placeholders}`;

      // Step 3: Insert data into the target table
      targetDb.run(query, values, (err) => {
        if (err) return reject(err);
        console.log(`Copied ${rows.length} rows to ${tableName}`);
        resolve();
      });
    });
  });
}

// Copy both tables
async function copyTables() {
  try {
    await copyTable('users');
    await copyTable('worked_hours_posto');
    console.log('All tables copied successfully');
  } catch (err) {
    console.error('Error copying tables:', err);
  } finally {
    // Close the database connections
    sourceDb.close((err) => {
      if (err) console.error('Error closing source database:', err);
      else console.log('Source database connection closed');
    });
    targetDb.close((err) => {
      if (err) console.error('Error closing target database:', err);
      else console.log('Target database connection closed');
    });
  }
}

// Run the copy process
copyTables();