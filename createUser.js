const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

// Connect to the SQLite database
const db = new sqlite3.Database('./Database.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        
        // Hash the password
        const hashedPassword = bcrypt.hashSync('4280', 10);

        // Insert user data into the 'users' table
        db.run(`INSERT INTO users (cpf, password, name) VALUES (?, ?, ?)`, 
        ['11632150824', hashedPassword, 'Raimundo Arruda'], function(err) {
            if (err) {
                console.error('Error inserting data:', err.message);
            } else {
                console.log('User added successfully');
            }

            // Close the database connection after the operation
            db.close((err) => {
                if (err) {
                    console.error('Error closing the database:', err.message);
                } else {
                    console.log('Database connection closed.');
                }
            });
        });
    }
});
