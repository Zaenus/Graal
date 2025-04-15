const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const morgan = require('morgan');
const winston = require('winston');
const rateLimit = require('express-rate-limit');
const twilio = require('twilio');

require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST'],
  },
});
const port = process.env.PORT || 3000;

// Mock SerialPort
const serialPort = {
  write: (data, cb) => {
    console.log(`Mock serial write: ${data}`);
    cb(null);
  },
  on: (event, cb) => {
    console.log(`Mock serial event: ${event}`);
    if (event === 'data') {
      setTimeout(() => cb(Buffer.from('OK DEACTIVATE 1\n')), 100);
    }
  },
  removeListener: () => {},
};
let buffer = '';

// Logger setup (console only for Railway free tier)
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

// PostgreSQL setup
async function setupDatabase() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const client = await pool.connect();
    logger.info('Connected to PostgreSQL database');

    // Initialize tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        cpf VARCHAR(255) UNIQUE,
        name VARCHAR(255),
        password VARCHAR(255),
        profile VARCHAR(255),
        image VARCHAR(255)
      );
      CREATE TABLE IF NOT EXISTS users_turismo (
        id SERIAL PRIMARY KEY,
        cpf VARCHAR(255) UNIQUE,
        name VARCHAR(255),
        matricula VARCHAR(255),
        enterprise VARCHAR(255),
        password VARCHAR(255),
        profile VARCHAR(255),
        points INTEGER DEFAULT 0,
        total_time INTEGER DEFAULT 0,
        last_check_in TIMESTAMP,
        last_check_out TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS qr_codes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(255) UNIQUE,
        expiration_time TIMESTAMP,
        used BOOLEAN DEFAULT FALSE,
        enterprise_name VARCHAR(255),
        conductor_name VARCHAR(255),
        plate VARCHAR(255)
      );
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        cost FLOAT,
        image VARCHAR(255),
        quantity INTEGER
      );
      CREATE TABLE IF NOT EXISTS worked_hours (
        id SERIAL PRIMARY KEY,
        employer_name VARCHAR(255),
        date VARCHAR(255),
        value FLOAT,
        manager VARCHAR(255),
        motive TEXT
      );
      CREATE TABLE IF NOT EXISTS worked_hours_posto (
        id SERIAL PRIMARY KEY,
        employer_name VARCHAR(255),
        date VARCHAR(255),
        value FLOAT,
        manager VARCHAR(255),
        motive TEXT
      );
      CREATE TABLE IF NOT EXISTS files (
        id SERIAL PRIMARY KEY,
        cpf VARCHAR(255),
        file_name VARCHAR(255),
        hashed_file_name VARCHAR(255)
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        date VARCHAR(255),
        sector VARCHAR(255),
        observation TEXT,
        situation VARCHAR(255),
        name VARCHAR(255),
        answer TEXT,
        attachments TEXT
      );
      CREATE TABLE IF NOT EXISTS rescued_products (
        id SERIAL PRIMARY KEY,
        cpf VARCHAR(255),
        product_id INTEGER,
        points INTEGER,
        rescue_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    logger.info('Database tables initialized');
    client.release();
    return pool;
  } catch (err) {
    logger.error('Failed to initialize PostgreSQL database', { error: err.message });
    throw err;
  }
}
const dbPromise = setupDatabase();

// Session store (memory for free tier)
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: true, maxAge: 24 * 60 * 60 * 1000 },
  })
);

// Mock Multer (no persistent storage)
const upload = {
  single: () => (req, res, next) => {
    logger.warn('File upload disabled in free tier');
    next();
  },
  array: () => (req, res, next) => {
    logger.warn('File uploads disabled in free tier');
    next();
  },
};

// Twilio setup
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FIXED_RECIPIENT_PHONE = process.env.WHATSAPP_RECIPIENT_NUMBER;

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(bodyParser.json());
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// Rate limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many login attempts, try again in 15 minutes' },
});

// Shower states
let showerStates = Array(10).fill(false);
let showerTimers = Array(10).fill(0);

setInterval(() => {
  for (let i = 0; i < 10; i++) {
    if (showerStates[i] && showerTimers[i] > 0) {
      showerTimers[i] -= 1000;
      if (showerTimers[i] <= 0) {
        showerStates[i] = false;
        showerTimers[i] = 0;
        const command = `DEACTIVATE ${i + 1}\n`;
        serialPort.write(command, (err) => {
          if (err) {
            logger.error('Serial write error in timer loop', { command, error: err.message });
          }
        });
      }
    }
  }
}, 1000);

// Authentication middleware
function isAuthenticated(req, res, next) {
  logger.debug('isAuthenticated:', { loggedIn: req.session.loggedIn, user: req.session.user });
  if (!req.session.loggedIn || !req.session.user) {
    logger.info('Redirecting to /index', { ip: req.ip });
    return res.redirect('/index');
  }
  const profileAccess = {
    Master: ['relatorios', 'home', 'usuarios', 'holerites', 'password', 'chamados', 'checkOut', 'banho', 'products', 'user_profile', 'posto', 'restaurante', 'chuveiros-manual'],
    Administrador: ['relatorios', 'home', 'usuarios', 'holerites', 'password', 'chamados', 'checkOut', 'banho', 'products', 'user_profile', 'posto', 'restaurante', 'chuveiros-manual'],
    Encarregado: ['relatorios', 'home', 'holerites', 'password', 'chamados', 'checkOut', 'banho', 'user_profile', 'posto', 'restaurante', 'chuveiros-manual'],
    RH: ['home', 'usuarios', 'holerites', 'password', 'chamados', 'user_profile'],
    manutencao: ['home', 'holerites', 'password', 'chamados', 'user_profile'],
    'T.I.': ['home', 'holerites', 'password', 'chamados', 'user_profile'],
    Colaborador: ['home', 'holerites', 'password', 'user_profile'],
  };
  const userProfile = req.session.user.profile;
  const requestedRoute = req.originalUrl.split('?')[0].replace(/^\/+/, '');
  logger.debug('Checking access:', { requestedRoute, userProfile });
  if (profileAccess[userProfile]?.includes(requestedRoute)) {
    return next();
  }
  logger.warn('Access denied, redirecting to /home', { requestedRoute, userProfile });
  return res.status(403).redirect('/home');
}

function ensureLoggedIn(req, res, next) {
  if (req.session?.loggedIn) return next();
  logger.info('Redirecting to /login-turismo', { ip: req.ip });
  res.redirect('/login-turismo');
}

// Routes
app.get('/index', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/chuveiros', (req, res) => res.sendFile(path.join(__dirname, 'public', 'activate_shower.html')));
app.get('/login-turismo', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login-turismo.html')));
app.get('/check-in', (req, res) => res.sendFile(path.join(__dirname, 'public', 'check-in.html')));
app.get('/resgate', ensureLoggedIn, (req, res) => res.sendFile(path.join(__dirname, 'public', 'resgate.html')));
app.get('/user_profile', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'user_profile.html')));
app.get('/posto', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'posto.html')));
app.get('/restaurante', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'restaurante.html')));
app.get('/relatorios', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'relatorios.html')));
app.get('/home', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'home.html')));
app.get('/usuarios', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'usuarios.html')));
app.get('/holerites', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'holerites.html')));
app.get('/password', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'password.html')));
app.get('/chamados', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'chamados.html')));
app.get('/checkOut', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'checkOut.html')));
app.get('/banho', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'banho.html')));
app.get('/products', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'products.html')));
app.get('/chuveiros-manual', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'control-shower.html')));

app.use(express.static(path.join(__dirname, 'public')));

// Socket.IO
io.on('connection', (socket) => {
  logger.info('A user connected', { socketId: socket.id });
  socket.on('disconnect', () => logger.info('User disconnected', { socketId: socket.id }));
  socket.on('send_message', (message, fromWho) => {
    logger.debug('Message received', { fromWho, message });
    io.emit('new_message', { text: message, username: fromWho });
  });
  socket.on('new_connection', (data) => {
    logger.debug('New connection message', { data });
    socket.broadcast.emit('new_message', data.message);
  });
  socket.on('requestInitialData', async () => {
    try {
      const pool = await dbPromise;
      const { rows } = await pool.query(
        'SELECT cpf, name, last_check_in FROM users_turismo WHERE last_check_out IS NULL'
      );
      socket.emit('activeCheckInsUpdate', rows);
    } catch (err) {
      logger.error('Error fetching active check-ins for Socket.IO', { error: err.message });
    }
  });
});

// Validate QR code
app.post('/validate-qr', async (req, res) => {
  const { qrCode, showerNum } = req.body;
  if (!qrCode || !showerNum) {
    return res.status(400).json({ success: false, message: 'QR code and shower number required' });
  }
  const showerIndex = parseInt(showerNum) - 1;
  if (showerIndex < 0 || showerIndex >= 10) {
    return res.status(400).json({ success: false, message: 'Invalid shower number' });
  }
  if (showerStates[showerIndex]) {
    return res.status(400).json({ success: false, message: `Shower ${showerNum} is already active` });
  }

  try {
    const pool = await dbPromise;
    const { rows } = await pool.query(
      `SELECT id, used FROM qr_codes WHERE code = $1 AND expiration_time > CURRENT_TIMESTAMP`,
      [qrCode]
    );
    const row = rows[0];
    if (!row) {
      return res.status(404).json({ success: false, message: 'QR code inválido ou expirado.' });
    }
    if (row.used) {
      return res.status(400).json({ success: false, message: 'QR code já foi usado.' });
    }
    await pool.query(`UPDATE qr_codes SET used = TRUE WHERE id = $1`, [row.id]);
    res.status(200).json({ success: true, message: 'QR code validado com sucesso.' });
  } catch (error) {
    logger.error('Error validating QR code', { qrCode, error: error.message });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Activate shower
app.post('/activate-shower', async (req, res) => {
  const { showerNum } = req.body;
  const showerIndex = parseInt(showerNum) - 1;
  if (!showerNum || showerIndex < 0 || showerIndex >= 10) {
    return res.status(400).json({ success: false, message: 'Invalid shower number' });
  }
  if (showerStates[showerIndex]) {
    return res.status(400).json({ success: false, message: `Shower ${showerNum} is already active` });
  }

  serialPort.write(`ACTIVATE ${showerNum}\n`, (err) => {
    if (err) {
      logger.error('Serial write error in activate-shower', { command: `ACTIVATE ${showerNum}`, error: err.message });
      return res.status(500).json({ success: false, message: 'Error activating shower' });
    }
    showerStates[showerIndex] = true;
    showerTimers[showerIndex] = 480000;
    res.status(200).json({
      success: true,
      message: `Shower ${showerNum} activated`,
      states: showerStates,
      remainingTimes: showerTimers,
    });
  });
});

// Activate shower manually
app.post('/activate-shower-manual', async (req, res) => {
  const { showerNum } = req.body;
  if (!showerNum) {
    logger.warn('Missing shower number', { ip: req.ip });
    return res.status(400).json({ success: false, message: 'Shower number required' });
  }
  const showerIndex = parseInt(showerNum) - 1;
  if (showerIndex < 0 || showerIndex >= 10) {
    logger.warn('Invalid shower number', { showerNum, ip: req.ip });
    return res.status(400).json({ success: false, message: 'Invalid shower number' });
  }
  if (showerStates[showerIndex]) {
    logger.warn(`Shower ${showerNum} already active`, { ip: req.ip });
    return res.status(400).json({ success: false, message: `Shower ${showerNum} is already active` });
  }

  serialPort.write(`ACTIVATE ${showerNum}\n`, (err) => {
    if (err) {
      logger.error('Serial write error in activate-shower-manual', {
        command: `ACTIVATE ${showerNum}`,
        error: err.message,
      });
      return res.status(500).json({ success: false, message: 'Error activating shower' });
    }
    logger.info(`Shower ${showerNum} activated manually`, { ip: req.ip });
    showerStates[showerIndex] = true;
    showerTimers[showerIndex] = 480000;
    res.status(200).json({
      success: true,
      message: `Shower ${showerNum} activated`,
      states: showerStates,
      remainingTimes: showerTimers,
    });
  });
});

// Deactivate shower
app.post('/deactivate-shower', async (req, res) => {
  const { showerNum } = req.body;
  const showerIndex = parseInt(showerNum) - 1;
  if (!showerNum || showerIndex < 0 || showerIndex >= 10) {
    return res.status(400).json({ success: false, message: 'Invalid shower number' });
  }
  if (!showerStates[showerIndex]) {
    return res.status(400).json({ success: false, message: `Shower ${showerNum} is already inactive` });
  }

  const command = `DEACTIVATE ${showerNum}\n`;
  serialPort.write(command, (err) => {
    if (err) {
      logger.error('Serial write error', { command, error: err.message });
      return res.status(500).json({ success: false, message: 'Error sending command' });
    }

    const timeout = setTimeout(() => {
      logger.warn('No Arduino response', { showerNum });
      res.status(500).json({ success: false, message: 'No response from Arduino' });
    }, 2000);

    const dataHandler = (data) => {
      const response = data.toString().trim();
      if (response === `OK DEACTIVATE ${showerNum}`) {
        clearTimeout(timeout);
        serialPort.removeListener('data', dataHandler);
        showerStates[showerIndex] = false;
        showerTimers[showerIndex] = 0;
        res.status(200).json({
          success: true,
          message: `Shower ${showerNum} deactivated`,
          states: showerStates,
          remainingTimes: showerTimers,
        });
      }
    };

    serialPort.once('data', dataHandler);
  });
});

// Get shower states
app.get('/get-shower-states', (req, res) => {
  res.status(200).json({ success: true, states: showerStates, remainingTimes: showerTimers });
});

serialPort.on('data', (data) => {
  const dataStr = data.toString();
  buffer += dataStr;
  logger.info('Arduino raw data:', { data: dataStr });

  let newlineIndex;
  while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
    const line = buffer.substring(0, newlineIndex).trim();
    buffer = buffer.substring(newlineIndex + 1);
    logger.info('Arduino complete line:', { line });

    if (line.startsWith('TIMEOUT')) {
      const showerNumStr = line.replace('TIMEOUT', '').trim();
      const showerNum = parseInt(showerNumStr);
      if (showerNum >= 1 && showerNum <= 10) {
        const showerIndex = showerNum - 1;
        showerStates[showerIndex] = false;
        logger.info(`Shower ${showerNum} deactivated by timeout, new states:`, showerStates);
      } else {
        logger.warn(`Invalid TIMEOUT shower number: ${showerNumStr}`);
      }
    }
  }
});

app.get('/js/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, 'private/js', filename);
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(filePath, (err) => {
    if (err) {
      logger.error('Error serving JS file', { filename, error: err.message });
      res.status(404).send('File not found');
    }
  });
});

app.post('/login', loginLimiter, async (req, res) => {
  const { cpf, password } = req.body;
  if (!cpf || !password) {
    logger.warn('Login attempt with missing CPF or password', { ip: req.ip });
    return res.status(400).json({ success: false, message: 'CPF and password required' });
  }

  try {
    const pool = await dbPromise;
    const { rows } = await pool.query('SELECT * FROM users WHERE cpf = $1', [cpf]);
    const row = rows[0];
    if (!row) {
      logger.warn('Login failed: Invalid CPF', { cpf, ip: req.ip });
      return res.status(401).json({ success: false, message: 'Invalid CPF or password' });
    }

    const match = await bcrypt.compare(password, row.password);
    if (match) {
      req.session.loggedIn = true;
      req.session.user = { cpf: row.cpf, name: row.name, profile: row.profile, image: row.image };
      await new Promise((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            logger.error('Session save error during login', { cpf, error: err.message });
            reject(err);
          } else {
            logger.info('Login successful', { cpf, sessionID: req.sessionID });
            resolve();
          }
        });
      });
      res.status(200).json({ success: true, message: 'Login successful', redirect: '/home' });
    } else {
      logger.warn('Login failed: Incorrect password', { cpf, ip: req.ip });
      return res.status(401).json({ success: false, message: 'Invalid CPF or password' });
    }
  } catch (error) {
    logger.error('Error in login', { cpf, error: error.message });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/submit-form', async (req, res) => {
  const { name, date, value, motive } = req.body;
  const manager = req.session.user?.name || 'Unknown User';

  if (!name || !date || !value || !motive) {
    logger.warn('Invalid submit-form request', { ip: req.ip });
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  try {
    const pool = await dbPromise;
    await pool.query(
      `INSERT INTO worked_hours (employer_name, date, value, manager, motive) VALUES ($1, $2, $3, $4, $5)`,
      [name, date, value, manager, motive]
    );
    logger.info('Data inserted into worked_hours', { name, date, manager });
    res.status(200).json({ success: true, message: 'Data inserted successfully', manager });
  } catch (error) {
    logger.error('Error in submit-form', { error: error.message });
    res.status(500).json({ success: false, message: 'Error inserting data into database' });
  }
});

app.post('/submit-form-posto', async (req, res) => {
  const { name, date, value, motive } = req.body;
  const manager = req.session.user?.name || 'Unknown User';

  if (!name || !date || !value || !motive) {
    logger.warn('Invalid submit-form-posto request', { ip: req.ip });
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  try {
    const pool = await dbPromise;
    await pool.query(
      `INSERT INTO worked_hours_posto (employer_name, date, value, manager, motive) VALUES ($1, $2, $3, $4, $5)`,
      [name, date, value, manager, motive]
    );
    logger.info('Data inserted into worked_hours_posto', { name, date, manager });
    res.status(200).json({ success: true, message: 'Data inserted successfully', manager });
  } catch (error) {
    logger.error('Error in submit-form-posto', { error: error.message });
    res.status(500).json({ success: false, message: 'Error inserting data into database' });
  }
});

app.get('/logout', async (req, res) => {
  try {
    await new Promise((resolve, reject) => {
      req.session.destroy((err) => {
        if (err) {
          logger.error('Session destroy error in logout', { error: err.message });
          reject(err);
        } else {
          logger.info('User logged out', { ip: req.ip });
          resolve();
        }
      });
    });
    res.redirect('/index');
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to log out' });
  }
});

app.get('/get-worked-hours', async (req, res) => {
  const { startDate, endDate } = req.query;
  let query = `SELECT * FROM worked_hours`;
  const params = [];

  if (startDate && endDate) {
    query += ` WHERE date BETWEEN $1 AND $2 ORDER BY date`;
    params.push(startDate, endDate);
  }

  try {
    const pool = await dbPromise;
    const { rows } = await pool.query(query, params);
    res.status(200).json(rows);
  } catch (error) {
    logger.error('Error fetching worked hours', { error: error.message });
    res.status(500).json({ success: false, message: 'Error fetching data' });
  }
});

app.get('/get-worked-hours-posto', async (req, res) => {
  const { startDate, endDate } = req.query;
  let query = `SELECT * FROM worked_hours_posto`;
  const params = [];

  if (startDate && endDate) {
    query += ` WHERE date BETWEEN $1 AND $2 ORDER BY date`;
    params.push(startDate, endDate);
  }

  try {
    const pool = await dbPromise;
    const { rows } = await pool.query(query, params);
    res.status(200).json(rows);
  } catch (error) {
    logger.error('Error fetching worked hours posto', { error: error.message });
    res.status(500).json({ success: false, message: 'Error fetching data' });
  }
});

app.get('/user-data', (req, res) => {
  if (!req.session.loggedIn) {
    logger.warn('Unauthorized access to user-data', { ip: req.ip });
    return res.status(403).send('Access Denied');
  }
  const { user } = req.session;
  res.json({ name: user.name, cpf: user.cpf, image: user.image });
});

app.post('/create-user', async (req, res) => {
  const { name, cpf, profile } = req.body;
  const defaultPassword = '123456';

  try {
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    const pool = await dbPromise;
    await pool.query(
      `INSERT INTO users (name, cpf, password, profile) VALUES ($1, $2, $3, $4)`,
      [name, cpf, hashedPassword, profile]
    );
    logger.info('User created', { cpf });
    res.status(200).json({ success: true, message: 'User created successfully' });
  } catch (error) {
    logger.error('Error creating user', { cpf, error: error.message });
    res.status(500).json({ success: false, message: 'Failed to create user' });
  }
});

app.post('/upload-profile', (req, res) => {
  logger.warn('Profile upload disabled in free tier', { ip: req.ip });
  res.status(400).json({ error: 'File uploads disabled in free tier' });
});

app.post('/change-password', async (req, res) => {
  const { cpf, password } = req.body;
  if (!cpf || !password) {
    logger.warn('Invalid change-password request', { ip: req.ip });
    return res.status(400).json({ success: false, message: 'CPF ou senha não fornecidos' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const pool = await dbPromise;
    await pool.query('UPDATE users SET password = $1 WHERE cpf = $2', [hashedPassword, cpf]);
    logger.info('Password changed', { cpf });
    res.json({ success: true, message: 'Senha alterada com sucesso' });
  } catch (error) {
    logger.error('Error changing password', { cpf, error: error.message });
    res.status(500).json({ success: false, message: 'Erro ao alterar a senha' });
  }
});

app.get('/get-users', async (req, res) => {
  try {
    const pool = await dbPromise;
    const { rows } = await pool.query('SELECT id, cpf, name, profile FROM users');
    res.json(rows);
  } catch (error) {
    logger.error('Error fetching users', { error: error.message });
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});

app.delete('/delete-user/:cpf', async (req, res) => {
  const { cpf } = req.params;
  try {
    const pool = await dbPromise;
    await pool.query('DELETE FROM users WHERE cpf = $1', [cpf]);
    logger.info('User deleted', { cpf });
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    logger.error('Error deleting user', { cpf, error: error.message });
    res.status(500).json({ error: 'Error deleting user' });
  }
});

app.post('/upload-file', (req, res) => {
  logger.warn('File upload disabled in free tier', { ip: req.ip });
  res.status(400).json({ error: 'File uploads disabled in free tier' });
});

app.get('/files/:cpf', async (req, res) => {
  const cpf = req.params.cpf;
  try {
    const pool = await dbPromise;
    const { rows } = await pool.query('SELECT * FROM files WHERE cpf = $1', [cpf]);
    res.json({ files: rows });
  } catch (error) {
    logger.error('Error fetching files', { cpf, error: error.message });
    res.status(500).json({ error: 'Error fetching files' });
  }
});

app.get('/files/download/:fileName', (req, res) => {
  logger.warn('File download disabled in free tier', { ip: req.ip });
  res.status(400).json({ error: 'File downloads disabled in free tier' });
});

app.post('/create-task', async (req, res) => {
  const { date, setor, obs, name } = req.body;
  if (!date || !setor || !obs || !name) {
    logger.warn('Invalid task creation request', { ip: req.ip });
    return res.status(400).json({ success: false, message: 'Dados incompletos' });
  }

  try {
    const pool = await dbPromise;
    await pool.query(
      `INSERT INTO tasks (date, sector, observation, situation, name, attachments) 
       VALUES ($1, $2, $3, 'aberto', $4, '{}')`,
      [date, setor, obs, name]
    );
    logger.info('Task created', { name, date });

    try {
      const messageBody = `Novo chamado criado: "${obs}" para o setor "${setor}" em ${date}.`;
      await client.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:${FIXED_RECIPIENT_PHONE}`,
        body: messageBody,
      });
      logger.info('WhatsApp message sent', { recipientPhone: FIXED_RECIPIENT_PHONE });
    } catch (whatsappError) {
      logger.error('Failed to send WhatsApp message', { error: whatsappError.message });
    }

    res.status(200).json({ success: true, message: 'Chamado criado com sucesso' });
  } catch (error) {
    logger.error('Error creating task', { error: error.message });
    res.status(500).json({ success: false, message: 'Erro ao criar chamado' });
  }
});

app.get('/tasks', async (req, res) => {
  const situation = req.query.situation;
  const userProfile = req.session.user?.profile;
  let query = `SELECT id, date, sector, observation, situation, name, attachments FROM tasks`;
  const params = [];

  if (situation) {
    query += ` WHERE situation = $1`;
    params.push(situation);
  }

  if (userProfile === 'Administrador') {
    // No filter
  } else if (userProfile === 'Manutencao') {
    query += situation ? ` AND` : ` WHERE`;
    query += ` sector = 'Manutencao'`;
  } else if (userProfile === 'T.I.') {
    query += situation ? ` AND` : ` WHERE`;
    query += ` sector = 'T.I.'`;
  } else if (userProfile === 'RH') {
    query += situation ? ` AND` : ` WHERE`;
    query += ` sector = 'RH'`;
  }

  try {
    const pool = await dbPromise;
    const { rows } = await pool.query(query, params);
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    logger.error('Error fetching tasks', { error: error.message });
    res.status(500).json({ success: false, message: 'Erro ao buscar chamados' });
  }
});

app.get('/task/:id', async (req, res) => {
  const taskId = req.params.id;
  try {
    const pool = await dbPromise;
    const { rows } = await pool.query(
      `SELECT id, date, sector, observation, situation, answer, attachments 
       FROM tasks WHERE id = $1`,
      [taskId]
    );
    const row = rows[0];
    if (!row) {
      logger.warn('Task not found', { taskId });
      return res.status(404).json({ success: false, message: 'Tarefa não encontrada' });
    }
    res.status(200).json({
      success: true,
      data: {
        id: row.id,
        date: row.date,
        sector: row.sector,
        obs: row.observation,
        situation: row.situation,
        answer: row.answer,
        attachments: row.attachments,
      },
    });
  } catch (error) {
    logger.error('Error fetching task', { taskId, error: error.message });
    res.status(500).json({ success: false, message: 'Erro ao obter chamado' });
  }
});

app.put('/update-task/:id', async (req, res) => {
  const taskId = req.params.id;
  const { situation, answer } = req.body;
  if (!situation && answer === undefined) {
    logger.warn('Invalid update-task request', { taskId, ip: req.ip });
    return res.status(400).json({ success: false, message: 'Situação ou resposta não fornecida' });
  }

  try {
    const pool = await dbPromise;
    const { rows } = await pool.query(
      `SELECT situation, answer, attachments FROM tasks WHERE id = $1`,
      [taskId]
    );
    const row = rows[0];
    if (!row) {
      logger.warn('Task not found for update', { taskId });
      return res.status(404).json({ success: false, message: 'Tarefa não encontrada' });
    }

    const newSituation = situation || row.situation;
    const newAnswer = answer !== undefined ? answer : row.answer;
    await pool.query(
      `UPDATE tasks SET situation = $1, answer = $2 WHERE id = $3`,
      [newSituation, newAnswer, taskId]
    );
    logger.info('Task updated', { taskId });
    res.status(200).json({ success: true, message: 'Tarefa atualizada com sucesso' });
  } catch (error) {
    logger.error('Error updating task', { taskId, error: error.message });
    res.status(500).json({ success: false, message: 'Erro ao atualizar a tarefa' });
  }
});

app.post('/create-user-turismo', async (req, res) => {
  const { name, cpf, matricula, empresa, password, profile } = req.body;
  if (!name || !cpf || !matricula || !empresa || !password || !profile) {
    logger.warn('Invalid create-user-turismo request', { ip: req.ip });
    return res.status(400).json({ success: false, message: 'Todos os campos são obrigatórios' });
  }

  try {
    const pool = await dbPromise;
    const { rows } = await pool.query(`SELECT * FROM users_turismo WHERE cpf = $1`, [cpf]);
    if (rows[0]) {
      logger.warn('CPF already registered', { cpf, ip: req.ip });
      return res.status(400).json({ success: false, message: 'CPF já cadastrado' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO users_turismo (name, cpf, matricula, enterprise, password, profile, points, total_time) 
       VALUES ($1, $2, $3, $4, $5, $6, 0, 0)`,
      [name, cpf, matricula, empresa, hashedPassword, profile]
    );
    logger.info('Turismo user created', { cpf });
    res.json({ success: true });
  } catch (error) {
    logger.error('Error creating turismo user', { cpf, error: error.message });
    res.status(500).json({ success: false, message: 'Erro ao criar usuário' });
  }
});

app.get('/get-users-turismo', async (req, res) => {
  try {
    const pool = await dbPromise;
    const { rows } = await pool.query('SELECT cpf, name, enterprise, profile FROM users_turismo');
    logger.debug('Fetched turismo users', { count: rows.length });
    res.json(rows);
  } catch (error) {
    logger.error('Error fetching turismo users', { error: error.message });
    res.status(500).json({ message: 'Erro ao buscar usuários' });
  }
});

app.post('/check-in-turismo', async (req, res) => {
  const { cpf } = req.body;
  if (!cpf) {
    logger.warn('Missing CPF in check-in-turismo', { ip: req.ip });
    return res.status(400).json({ success: false, message: 'CPF required' });
  }

  try {
    const pool = await dbPromise;
    const { rows } = await pool.query(`SELECT * FROM users_turismo WHERE cpf = $1`, [cpf]);
    const row = rows[0];
    if (!row) {
      logger.warn('CPF not found for check-in', { cpf, ip: req.ip });
      return res.status(400).json({ success: false, message: 'CPF não encontrado' });
    }

    await pool.query(
      `UPDATE users_turismo SET last_check_in = CURRENT_TIMESTAMP - INTERVAL '3 hours', total_time = total_time + 0, last_check_out = NULL WHERE cpf = $1`,
      [cpf]
    );
    logger.info('Check-in successful', { cpf });
    res.status(200).json({ success: true, message: 'Checked in successfully' });
  } catch (error) {
    logger.error('Error in check-in-turismo', { cpf, error: error.message });
    res.status(500).json({ success: false, message: 'Error checking in' });
  }
});

app.post('/check-out-turismo', async (req, res) => {
  const { cpf } = req.body;
  if (!cpf) {
    logger.warn('Missing CPF in check-out-turismo', { ip: req.ip });
    return res.status(400).json({ success: false, message: 'CPF required' });
  }

  try {
    const pool = await dbPromise;
    const { rows } = await pool.query(
      'SELECT profile, last_check_in FROM users_turismo WHERE cpf = $1 AND last_check_out IS NULL',
      [cpf]
    );
    const user = rows[0];
    if (!user) {
      logger.warn('User not found or already checked out', { cpf, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Usuário não encontrado ou já fez check-out' });
    }

    const pointsPerHalfHour = { turismo: 40, guia: 30, linha: 20 };
    const pointsMultiplier = pointsPerHalfHour[user.profile] || 0;
    if (pointsMultiplier === 0) {
      logger.warn('Invalid profile for user', { cpf, profile: user.profile });
      return res.status(400).json({ success: false, message: 'Perfil inválido para cálculo de pontos' });
    }

    const { rows: timeRows } = await pool.query(
      `SELECT EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - INTERVAL '3 hours' - last_check_in)) AS time_diff
       FROM users_turismo WHERE cpf = $1`,
      [cpf]
    );
    const timeDiff = parseInt(timeRows[0].time_diff);
    const pointsToAdd = Math.floor(timeDiff / 1800) * pointsMultiplier;

    const result = await pool.query(
      `UPDATE users_turismo 
       SET last_check_out = CURRENT_TIMESTAMP - INTERVAL '3 hours', 
           total_time = total_time + $1, 
           points = COALESCE(points, 0) + $2
       WHERE cpf = $3 AND last_check_out IS NULL
       RETURNING *`,
      [timeDiff, pointsToAdd, cpf]
    );

    if (result.rowCount === 0) {
      logger.warn('No check-out performed, possibly already checked out', { cpf });
      return res.status(400).json({ success: false, message: 'Check-out já realizado ou usuário não encontrado' });
    }

    logger.info('Check-out successful', {
      cpf,
      profile: user.profile,
      pointsAdded: pointsToAdd,
      timeDiff,
      lastCheckIn: user.last_check_in,
    });
    res.json({ success: true, message: 'Check-out realizado com sucesso' });
  } catch (error) {
    logger.error('Error in check-out-turismo', { cpf, error: error.message });
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

app.get('/user-data-turismo', async (req, res) => {
  const { cpf } = req.query;
  if (!cpf) {
    logger.warn('Missing CPF in user-data-turismo', { ip: req.ip });
    return res.status(400).json({ success: false, message: 'CPF required' });
  }

  try {
    const pool = await dbPromise;
    const { rows } = await pool.query(`SELECT * FROM users_turismo WHERE cpf = $1`, [cpf]);
    const row = rows[0];
    res.status(200).json({ success: true, data: row });
  } catch (error) {
    logger.error('Error fetching user data turismo', { cpf, error: error.message });
    res.status(500).json({ success: false, message: 'Error fetching user data' });
  }
});

app.get('/get-active-check-ins', async (req, res) => {
  try {
    const pool = await dbPromise;
    const { rows } = await pool.query(
      'SELECT cpf, name, last_check_in FROM users_turismo WHERE last_check_out IS NULL'
    );
    res.json(rows);
  } catch (error) {
    logger.error('Error fetching active check-ins', { error: error.message });
    res.status(500).json({ error: 'Error fetching active check-ins' });
  }
});

app.post('/insert-qr-code', async (req, res) => {
  const { code, expiration, enterprise_name, conductor_name, plate } = req.body;
  if (!code || !expiration) {
    logger.warn('Invalid QR code insertion request', { ip: req.ip });
    return res.status(400).json({ success: false, message: 'QR code data or expiration time is missing' });
  }

  try {
    const pool = await dbPromise;
    await pool.query(
      `INSERT INTO qr_codes (code, expiration_time, used, enterprise_name, conductor_name, plate) 
       VALUES ($1, $2, FALSE, $3, $4, $5)`,
      [code, expiration, enterprise_name || null, conductor_name || null, plate || null]
    );
    logger.info('QR code inserted', { code });
    res.status(200).json({ success: true, message: 'QR code data inserted successfully' });
  } catch (error) {
    logger.error('Error inserting QR code', { code, error: error.message });
    res.status(500).json({ success: false, message: 'Failed to insert QR code data' });
  }
});

app.get('/used-qr-codes', async (req, res) => {
  const { startDate, endDate } = req.query;
  let query = `SELECT code, expiration_time, enterprise_name, conductor_name, plate 
               FROM qr_codes WHERE used = TRUE`;
  const params = [];

  if (startDate && endDate) {
    query += ` AND expiration_time::date BETWEEN $1 AND $2 ORDER BY expiration_time`;
    params.push(startDate, endDate);
  }

  try {
    const pool = await dbPromise;
    const { rows } = await pool.query(query, params);
    res.status(200).json(rows);
  } catch (error) {
    logger.error('Error fetching used QR codes', { error: error.message });
    res.status(500).json({ success: false, message: 'Error fetching data' });
  }
});

app.post('/register-product', async (req, res) => {
  logger.warn('Product registration disabled in free tier', { ip: req.ip });
  res.status(400).json({ error: 'File uploads disabled in free tier' });
});

app.get('/api/products', async (req, res) => {
  try {
    const pool = await dbPromise;
    const { rows } = await pool.query('SELECT id, name, cost AS points, image, quantity FROM products');
    res.json(rows);
  } catch (error) {
    logger.error('Error fetching products', { error: error.message });
    res.status(500).json({ error: 'Error fetching products' });
  }
});

app.put('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const { name, cost, quantity } = req.body;
  if (!name || !cost || quantity === undefined) {
    return res.status(400).json({ error: 'All fields (name, cost, quantity) are required' });
  }

  const parsedQuantity = parseInt(quantity);
  if (isNaN(parsedQuantity) || parsedQuantity < 0) {
    logger.warn('Invalid quantity', { id, quantity });
    return res.status(400).json({ error: 'Quantity must be a non-negative number' });
  }

  try {
    const pool = await dbPromise;
    await pool.query(
      'UPDATE products SET name = $1, cost = $2, quantity = $3 WHERE id = $4',
      [name, cost, parsedQuantity, id]
    );
    logger.info('Product updated', { id });
    res.send('Product updated successfully');
  } catch (error) {
    logger.error('Error updating product', { id, error: error.message });
    res.status(500).send('Failed to edit product');
  }
});

app.delete('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await dbPromise;
    await pool.query('DELETE FROM products WHERE id = $1', [id]);
    logger.info('Product deleted', { id });
    res.send('Product deleted successfully');
  } catch (error) {
    logger.error('Error deleting product', { id, error: error.message });
    res.status(500).send('Failed to delete product');
  }
});

app.post('/login-turismo', loginLimiter, async (req, res) => {
  const { cpf, password } = req.body;
  if (!cpf || !password) {
    logger.warn('Login attempt with missing CPF or password', { ip: req.ip });
    return res.status(400).json({ success: false, message: 'CPF and password are required' });
  }

  try {
    const pool = await dbPromise;
    const { rows } = await pool.query(`SELECT * FROM users_turismo WHERE cpf = $1`, [cpf]);
    const row = rows[0];
    if (!row) {
      logger.warn('Login failed: Invalid CPF', { cpf, ip: req.ip });
      return res.status(401).json({ success: false, message: 'Invalid CPF or password' });
    }

    const match = await bcrypt.compare(password, row.password);
    if (match) {
      req.session.loggedIn = true;
      req.session.user = { cpf: row.cpf, name: row.name };
      await new Promise((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            logger.error('Session save error during login-turismo', { cpf, error: err.message });
            reject(err);
          } else {
            logger.info('Login successful for turismo user', { cpf, sessionID: req.sessionID });
            resolve();
          }
        });
      });
      res.status(200).json({ success: true, message: 'Login successful', redirect: '/checkOut' });
    } else {
      logger.warn('Login failed: Incorrect password', { cpf, ip: req.ip });
      res.status(401).json({ success: false, message: 'Invalid CPF or password' });
    }
  } catch (error) {
    logger.error('Error in login-turismo', { cpf, error: error.message });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/logout-turismo', async (req, res) => {
  if (req.session.loggedIn) {
    try {
      await new Promise((resolve, reject) => {
        req.session.destroy((err) => {
          if (err) {
            logger.error('Session destroy error in logout-turismo', { error: err.message });
            reject(err);
          } else {
            logger.info('Turismo user logged out', { ip: req.ip });
            resolve();
          }
        });
      });
      res.status(200).json({ success: true, message: 'Logout successful' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to log out' });
    }
  } else {
    logger.warn('No active session to log out', { ip: req.ip });
    res.status(400).json({ error: 'No active session to log out' });
  }
});

app.get('/api/user-turismo-points', async (req, res) => {
  const { cpf } = req.query;
  if (!cpf) {
    logger.warn('Missing CPF in user-turismo-points', { ip: req.ip });
    return res.status(400).json({ error: 'CPF required' });
  }

  try {
    const pool = await dbPromise;
    const { rows } = await pool.query('SELECT points FROM users_turismo WHERE cpf = $1', [cpf]);
    const row = rows[0];
    if (!row) {
      logger.warn('User not found for points', { cpf, ip: req.ip });
      return res.status(404).send('User not found');
    }
    res.json({ points: row.points });
  } catch (error) {
    logger.error('Error fetching user points', { cpf, error: error.message });
    res.status(500).send('Error fetching user points');
  }
});

app.post('/api/rescue', async (req, res) => {
  const { cpf, products } = req.body;
  if (!cpf || !products || products.length === 0) {
    logger.warn('Invalid rescue request', { ip: req.ip });
    return res.status(400).json({ error: 'Invalid request. CPF and products are required' });
  }

  try {
    const pool = await dbPromise;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const placeholders = products.map((_, i) => `$${i + 1}`).join(', ');
      const productQuery = `SELECT id, cost AS points, quantity FROM products WHERE id IN (${placeholders})`;
      const { rows: selectedProducts } = await client.query(productQuery, products);

      if (selectedProducts.length !== products.length) {
        await client.query('ROLLBACK');
        logger.warn('Some products not found', { cpf, products });
        return res.status(400).json({ error: 'One or more products not found' });
      }

      const insufficientStock = selectedProducts.some((product) => product.quantity < 1);
      if (insufficientStock) {
        await client.query('ROLLBACK');
        logger.warn('Insufficient stock for rescue', { cpf, products });
        return res.status(400).json({ error: 'One or more products are out of stock' });
      }

      const totalCost = selectedProducts.reduce((sum, product) => sum + product.points, 0);

      const { rows: userRows } = await client.query('SELECT points FROM users_turismo WHERE cpf = $1', [cpf]);
      const userRow = userRows[0];
      if (!userRow) {
        await client.query('ROLLBACK');
        logger.warn('User not found for rescue', { cpf, ip: req.ip });
        return res.status(404).json({ error: 'User not found' });
      }
      if (userRow.points < totalCost) {
        await client.query('ROLLBACK');
        logger.warn('Not enough points for rescue', { cpf, totalCost, userPoints: userRow.points });
        return res.status(400).json({ error: 'Not enough points for this rescue' });
      }

      await client.query('UPDATE users_turismo SET points = points - $1 WHERE cpf = $2', [totalCost, cpf]);

      const rescueInsertQuery = `INSERT INTO rescued_products (cpf, product_id, points) VALUES ($1, $2, $3)`;
      const updateQuantityQuery = `UPDATE products SET quantity = quantity - 1 WHERE id = $1`;
      const operations = selectedProducts.map((product) =>
        Promise.all([
          client.query(rescueInsertQuery, [cpf, product.id, product.points]),
          client.query(updateQuantityQuery, [product.id]),
        ])
      );
      await Promise.all(operations);

      await client.query('COMMIT');
      logger.info('Rescue successful', { cpf, totalCost });
      res.status(200).json({ message: 'Rescue successful', totalCost });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error processing rescue', { cpf, error: error.message });
      res.status(500).json({ error: 'An error occurred while processing the rescue' });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Error initiating rescue transaction', { cpf, error: error.message });
    res.status(500).json({ error: 'An error occurred while processing the rescue' });
  }
});

app.get('/api/rescue-report', async (req, res) => {
  const { startDate, endDate } = req.query;
  const adjustedEndDate = `${endDate} 23:59:59`;

  const reportQuery = `
    SELECT r.id, r.cpf AS rescue_cpf, u.name AS rescued_by, r.product_id, p.name AS product_name, r.points, r.rescue_date
    FROM rescued_products r
    JOIN products p ON r.product_id = p.id
    JOIN users_turismo u ON r.cpf = u.cpf
    WHERE r.rescue_date >= $1 AND r.rescue_date <= $2
    ORDER BY r.rescue_date DESC
  `;

  try {
    const pool = await dbPromise;
    const { rows } = await pool.query(reportQuery, [startDate, adjustedEndDate]);
    res.status(200).json(rows);
  } catch (error) {
    logger.error('Error fetching rescue report', { error: error.message });
    res.status(500).json({ error: 'An error occurred while generating the report' });
  }
});

server.listen(port, () => {
  logger.info(`Server running on port ${port}`);
});
