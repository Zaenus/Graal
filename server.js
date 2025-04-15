const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const morgan = require('morgan');
const fs = require('fs');
const winston = require('winston');
const rateLimit = require('express-rate-limit');
const twilio = require('twilio');

require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'https://app.yourdomain.com',
    methods: ['GET', 'POST'],
  },
});
const port = process.env.PORT || 3000;

// Mock SerialPort for Cyclic
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
  once: (event, cb) => {
    if (event === 'data') {
      setTimeout(() => cb(Buffer.from('OK DEACTIVATE 1\n')), 100);
    }
  },
};
let buffer = '';

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: '/app/error.log', level: 'error' }),
    new winston.transports.File({ filename: '/app/combined.log' }),
    new winston.transports.Console(),
  ],
});

// SQLite setup
async function setupDatabase() {
  const db = await open({
    filename: '/app/Database.db',
    driver: sqlite3.Database,
  });
  logger.info('Connected to SQLite database on Cyclic');
  return db;
}
const dbPromise = setupDatabase();

// Active check-ins
async function getActiveCheckIns() {
  const db = await dbPromise;
  return await db.all(`SELECT cpf, name, last_check_in FROM users_turismo WHERE last_check_out IS NULL`);
}

async function broadcastActiveCheckIns() {
  const activeCheckIns = await getActiveCheckIns();
  io.emit('activeCheckInsUpdate', activeCheckIns);
}

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

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, '/app/files'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

// Rate limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many login attempts, try again in 15 minutes' },
});

// Twilio setup
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FIXED_RECIPIENT_PHONE = process.env.WHATSAPP_RECIPIENT_NUMBER;

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || 'https://app.yourdomain.com' }));
app.use('/uploads', express.static('/app/files'));
app.use(bodyParser.json());
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: true, maxAge: 24 * 60 * 60 * 1000 },
  })
);

// Authentication middleware
function isAuthenticated(req, res, next) {
  logger.debug('isAuthenticated:', { loggedIn: req.session.loggedIn, user: req.session.user });
  if (!req.session.loggedIn || !req.session.user) {
    logger.info('Redirecting to /index', { ip: req.ip });
    return res.redirect('/index');
  }
  const profileAccess = {
    Master: [
      'relatorios',
      'home',
      'usuarios',
      'holerites',
      'password',
      'chamados',
      'checkOut',
      'banho',
      'products',
      'user_profile',
      'posto',
      'restaurante',
      'chuveiros-manual',
    ],
    Administrador: [
      'relatorios',
      'home',
      'usuarios',
      'holerites',
      'password',
      'chamados',
      'checkOut',
      'banho',
      'products',
      'user_profile',
      'posto',
      'restaurante',
      'chuveiros-manual',
    ],
    Encarregado: [
      'relatorios',
      'home',
      'holerites',
      'password',
      'chamados',
      'checkOut',
      'banho',
      'user_profile',
      'posto',
      'restaurante',
      'chuveiros-manual',
    ],
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
app.get('/chuveiros-manual', isAuthenticated, (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'control-shower.html'))
);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/files', express.static(path.join(__dirname, 'files')));

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
    const activeCheckIns = await getActiveCheckIns();
    socket.emit('activeCheckInsUpdate', activeCheckIns);
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
    const db = await dbPromise;
    const row = await db.get(`SELECT id, used FROM qr_codes WHERE code = ? AND expiration_time > ?`, [
      qrCode,
      new Date().toISOString(),
    ]);
    if (!row) {
      return res.status(404).json({ success: false, message: 'QR code inválido ou expirado.' });
    }
    if (row.used) {
      return res.status(400).json({ success: false, message: 'QR code já foi usado.' });
    }
    await db.run(`UPDATE qr_codes SET used = 1 WHERE id = ?`, [row.id]);
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
    const db = await dbPromise;
    const row = await db.get(`SELECT * FROM users WHERE cpf = ?`, [cpf]);
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
    const db = await dbPromise;
    await db.run(
      `INSERT INTO worked_hours (employer_name, date, value, manager, motive) VALUES (?, ?, ?, ?, ?)`,
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
    const db = await dbPromise;
    await db.run(
      `INSERT INTO worked_hours_posto (employer_name, date, value, manager, motive) VALUES (?, ?, ?, ?, ?)`,
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
    query += ` WHERE date BETWEEN ? AND ? ORDER BY date`;
    params.push(startDate, endDate);
  }

  try {
    const db = await dbPromise;
    const rows = await db.all(query, params);
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
    query += ` WHERE date BETWEEN ? AND ? ORDER BY date`;
    params.push(startDate, endDate);
  }

  try {
    const db = await dbPromise;
    const rows = await db.all(query, params);
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
    const db = await dbPromise;
    await db.run(`INSERT INTO users (name, cpf, password, profile) VALUES (?, ?, ?, ?)`, [
      name,
      cpf,
      hashedPassword,
      profile,
    ]);
    logger.info('User created', { cpf });
    res.status(200).json({ success: true, message: 'User created successfully' });
  } catch (error) {
    logger.error('Error creating user', { cpf, error: error.message });
    res.status(500).json({ success: false, message: 'Failed to create user' });
  }
});

app.post('/upload-profile', upload.single('image'), async (req, res) => {
  if (!req.session.loggedIn) {
    logger.warn('Unauthorized profile upload attempt', { ip: req.ip });
    return res.status(403).json({ error: 'Access Denied' });
  }
  if (!req.file) {
    logger.warn('No image uploaded', { ip: req.ip });
    return res.status(400).json({ error: 'No image file uploaded' });
  }

  const imagePath = `/uploads/${req.file.filename}`;
  const userCPF = req.session.user.cpf;

  try {
    const db = await dbPromise;
    await db.run('UPDATE users SET image = ? WHERE cpf = ?', [imagePath, userCPF]);
    req.session.user.image = imagePath;
    logger.info('Profile image updated', { cpf: userCPF });
    res.json({ message: 'Profile image updated successfully', image: imagePath });
  } catch (error) {
    logger.error('Error uploading profile image', { cpf: userCPF, error: error.message });
    res.status(500).json({ error: 'Failed to update profile image' });
  }
});

app.post('/change-password', async (req, res) => {
  const { cpf, password } = req.body;
  if (!cpf || !password) {
    logger.warn('Invalid change-password request', { ip: req.ip });
    return res.status(400).json({ success: false, message: 'CPF ou senha não fornecidos' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const db = await dbPromise;
    await db.run('UPDATE users SET password = ? WHERE cpf = ?', [hashedPassword, cpf]);
    logger.info('Password changed', { cpf });
    res.json({ success: true, message: 'Senha alterada com sucesso' });
  } catch (error) {
    logger.error('Error changing password', { cpf, error: error.message });
    res.status(500).json({ success: false, message: 'Erro ao alterar a senha' });
  }
});

app.get('/get-users', async (req, res) => {
  try {
    const db = await dbPromise;
    const rows = await db.all('SELECT id, cpf, name, profile FROM users');
    res.json(rows);
  } catch (error) {
    logger.error('Error fetching users', { error: error.message });
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});

app.delete('/delete-user/:cpf', async (req, res) => {
  const { cpf } = req.params;
  try {
    const db = await dbPromise;
    await db.run('DELETE FROM users WHERE cpf = ?', [cpf]);
    logger.info('User deleted', { cpf });
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    logger.error('Error deleting user', { cpf, error: error.message });
    res.status(500).json({ error: 'Error deleting user' });
  }
});

app.post('/upload-file', upload.single('file'), async (req, res) => {
  const { cpf } = req.body;
  const originalFileName = req.file.originalname;
  const hashedFileName = req.file.filename;

  try {
    const db = await dbPromise;
    await db.run(`INSERT INTO files (cpf, file_name, hashed_file_name) VALUES (?, ?, ?)`, [
      cpf,
      originalFileName,
      hashedFileName,
    ]);
    logger.info('File uploaded', { cpf, file: hashedFileName });
    res.status(200).json({ message: 'File uploaded successfully' });
  } catch (error) {
    logger.error('Error uploading file', { cpf, error: error.message });
    res.status(500).json({ message: 'Error uploading file' });
  }
});

app.get('/files/:cpf', async (req, res) => {
  const cpf = req.params.cpf;
  try {
    const db = await dbPromise;
    const rows = await db.all('SELECT * FROM files WHERE cpf = ?', [cpf]);
    res.json({ files: rows });
  } catch (error) {
    logger.error('Error fetching files', { cpf, error: error.message });
    res.status(500).json({ error: 'Error fetching files' });
  }
});

app.get('/files/download/:fileName', (req, res) => {
  const fileName = req.params.fileName;
  const filePath = path.join(__dirname, 'files', fileName);
  logger.debug(`Attempting to download file: ${filePath}`);
  res.download(filePath, (err) => {
    if (err) {
      logger.error('Error sending file', { fileName, error: err.message });
      res.status(500).send('Error downloading file');
    }
  });
});

app.post('/create-task', upload.array('attachments'), async (req, res) => {
  const { date, setor, obs, name } = req.body;
  if (!date || !setor || !obs || !name) {
    logger.warn('Invalid task creation request', { ip: req.ip });
    return res.status(400).json({ success: false, message: 'Dados incompletos' });
  }

  try {
    const db = await dbPromise;
    const attachments = req.files ? req.files.map((file) => file.path) : [];
    const result = await db.run(
      `INSERT INTO tasks (date, sector, observation, situation, name, attachments) 
       VALUES (?, ?, ?, 'aberto', ?, ?)`,
      [date, setor, obs, name, JSON.stringify(attachments)]
    );
    const taskId = result.lastID;

    logger.info('Task created', { name, date, taskId });

    try {
      const messageBody = `Novo chamado criado: "${obs}" para o setor "${setor}" em ${date}.`;
      await client.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:${FIXED_RECIPIENT_PHONE}`,
        body: messageBody,
      });
      logger.info('WhatsApp message sent', { recipientPhone: FIXED_RECIPIENT_PHONE, taskId });
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
    query += ` WHERE situation = ?`;
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
    const db = await dbPromise;
    const rows = await db.all(query, params);
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    logger.error('Error fetching tasks', { error: error.message });
    res.status(500).json({ success: false, message: 'Erro ao buscar chamados' });
  }
});

app.get('/task/:id', async (req, res) => {
  const taskId = req.params.id;
  try {
    const db = await dbPromise;
    const row = await db.get(
      `SELECT id, date, sector, observation, situation, answer, attachments 
       FROM tasks WHERE id = ?`,
      [taskId]
    );
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
    const db = await dbPromise;
    const row = await db.get(
      `SELECT situation, answer, attachments FROM tasks WHERE id = ?`,
      [taskId]
    );
    if (!row) {
      logger.warn('Task not found for update', { taskId });
      return res.status(404).json({ success: false, message: 'Tarefa não encontrada' });
    }

    const newSituation = situation || row.situation;
    const newAnswer = answer !== undefined ? answer : row.answer;
    await db.run(
      `UPDATE tasks SET situation = ?, answer = ? WHERE id = ?`,
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
    const db = await dbPromise;
    const existingUser = await db.get(`SELECT * FROM users_turismo WHERE cpf = ?`, [cpf]);
    if (existingUser) {
      logger.warn('CPF already registered', { cpf, ip: req.ip });
      return res.status(400).json({ success: false, message: 'CPF já cadastrado' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.run(
      `INSERT INTO users_turismo (name, cpf, matricula, enterprise, password, profile, points, total_time) 
       VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
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
    const db = await dbPromise;
    const users = await db.all('SELECT cpf, name, enterprise, profile FROM users_turismo');
    logger.debug('Fetched turismo users', { count: users.length });
    res.json(users);
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
    const db = await dbPromise;
    const row = await db.get(`SELECT * FROM users_turismo WHERE cpf = ?`, [cpf]);
    if (!row) {
      logger.warn('CPF not found for check-in', { cpf, ip: req.ip });
      return res.status(400).json({ success: false, message: 'CPF não encontrado' });
    }

    await db.run(
      `UPDATE users_turismo SET last_check_in = datetime(CURRENT_TIMESTAMP, '-3 hours'), total_time = total_time + 0, last_check_out = NULL WHERE cpf = ?`,
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
    const db = await dbPromise;
    const user = await db.get('SELECT profile, last_check_in FROM users_turismo WHERE cpf = ? AND last_check_out IS NULL', [
      cpf,
    ]);
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

    const nowMinus3 = await db.get("SELECT STRFTIME('%s', DATETIME('now', '-3 hours')) as now_ts");
    const lastCheckInTs = await db.get("SELECT STRFTIME('%s', last_check_in) as checkin_ts FROM users_turismo WHERE cpf = ?", [
      cpf,
    ]);
    const timeDiff = parseInt(nowMinus3.now_ts) - parseInt(lastCheckInTs.checkin_ts);
    const pointsToAdd = Math.floor(timeDiff / 1800) * pointsMultiplier;

    const query = `
      UPDATE users_turismo 
      SET 
        last_check_out = DATETIME('now', '-3 hours'), 
        total_time = total_time + (STRFTIME('%s', DATETIME('now', '-3 hours')) - STRFTIME('%s', last_check_in)), 
        points = COALESCE(points, 0) + (FLOOR((STRFTIME('%s', DATETIME('now', '-3 hours')) - STRFTIME('%s', last_check_in)) / 1800) * ?)
      WHERE 
        cpf = ? 
        AND last_check_out IS NULL
    `;

    const result = await db.run(query, [pointsMultiplier, cpf]);
    if (result.changes === 0) {
      logger.warn('No check-out performed, possibly already checked out', { cpf });
      return res.status(400).json({ success: false, message: 'Check-out já realizado ou usuário não encontrado' });
    }

    logger.info('Check-out successful', {
      cpf,
      profile: user.profile,
      pointsAdded: pointsToAdd,
      timeDiff,
      lastCheckIn: user.last_check_in,
      checkOutTime: nowMinus3.now_ts,
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
    const db = await dbPromise;
    const row = await db.get(`SELECT * FROM users_turismo WHERE cpf = ?`, [cpf]);
    res.status(200).json({ success: true, data: row });
  } catch (error) {
    logger.error('Error fetching user data turismo', { cpf, error: error.message });
    res.status(500).json({ success: false, message: 'Error fetching user data' });
  }
});

app.get('/get-active-check-ins', async (req, res) => {
  try {
    const activeCheckIns = await getActiveCheckIns();
    res.json(activeCheckIns);
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
    const db = await dbPromise;
    await db.run(
      `INSERT INTO qr_codes (code, expiration_time, used, enterprise_name, conductor_name, plate) VALUES (?, ?, ?, ?, ?, ?)`,
      [code, expiration, 0, enterprise_name || null, conductor_name || null, plate || null]
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
  let query = `
    SELECT code, expiration_time, enterprise_name, conductor_name, plate 
    FROM qr_codes 
    WHERE used = 1`;
  const params = [];

  if (startDate && endDate) {
    query += `
      AND DATE(DATETIME(expiration_time, '-3 hours')) 
      BETWEEN DATE(?) AND DATE(?) 
      ORDER BY expiration_time`;
    params.push(startDate, endDate);
  }

  try {
    const db = await dbPromise;
    const rows = await db.all(query, params);
    res.status(200).json(rows);
  } catch (error) {
    logger.error('Error fetching used QR codes', { error: error.message });
    res.status(500).json({ success: false, message: 'Error fetching data' });
  }
});

app.post('/register-product', upload.single('image'), async (req, res) => {
  const { name, cost, quantity } = req.body;
  if (!name || !cost || !quantity || !req.file) {
    logger.warn('Invalid product registration request', { ip: req.ip });
    return res.status(400).json({ error: 'All fields (name, cost, quantity, image) are required' });
  }

  const parsedQuantity = parseInt(quantity);
  if (isNaN(parsedQuantity) || parsedQuantity < 0) {
    logger.warn('Invalid quantity', { ip: req.ip, quantity });
    return res.status(400).json({ error: 'Quantity must be a non-negative number' });
  }

  const imagePath = `/uploads/${req.file.filename}`;
  try {
    const db = await dbPromise;
    await db.run(
      `INSERT INTO products (name, cost, image, quantity) VALUES (?, ?, ?, ?)`,
      [name, cost, imagePath, parsedQuantity]
    );
    logger.info('Product registered', { name });
    res.json({ message: 'Product registered successfully', id: db.lastID });
  } catch (error) {
    logger.error('Error registering product', { name, error: error.message });
    res.status(500).json({ error: 'Failed to register product' });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const db = await dbPromise;
    const rows = await db.all('SELECT id, name, cost AS points, image, quantity FROM products');
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
    const db = await dbPromise;
    await db.run(
      'UPDATE products SET name = ?, cost = ?, quantity = ? WHERE id = ?',
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
    const db = await dbPromise;
    await db.run('DELETE FROM products WHERE id = ?', [id]);
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
    const db = await dbPromise;
    const row = await db.get(`SELECT * FROM users_turismo WHERE cpf = ?`, [cpf]);
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
      return res.status(401).json({ success: false, message: 'Invalid CPF or password' });
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
    const db = await dbPromise;
    const row = await db.get('SELECT points FROM users_turismo WHERE cpf = ?', [cpf]);
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
    const db = await dbPromise;
    await db.run('BEGIN TRANSACTION');

    const placeholders = products.map(() => '?').join(', ');
    const productQuery = `SELECT id, cost AS points, quantity FROM products WHERE id IN (${placeholders})`;
    const selectedProducts = await db.all(productQuery, products);

    if (selectedProducts.length !== products.length) {
      await db.run('ROLLBACK');
      logger.warn('Some products not found', { cpf, products });
      return res.status(400).json({ error: 'One or more products not found' });
    }

    const insufficientStock = selectedProducts.some((product) => product.quantity < 1);
    if (insufficientStock) {
      await db.run('ROLLBACK');
      logger.warn('Insufficient stock for rescue', { cpf, products });
      return res.status(400).json({ error: 'One or more products are out of stock' });
    }

    const totalCost = selectedProducts.reduce((sum, product) => sum + product.points, 0);

    const userRow = await db.get('SELECT points FROM users_turismo WHERE cpf = ?', [cpf]);
    if (!userRow) {
      await db.run('ROLLBACK');
      logger.warn('User not found for rescue', { cpf, ip: req.ip });
      return res.status(404).json({ error: 'User not found' });
    }
    if (userRow.points < totalCost) {
      await db.run('ROLLBACK');
      logger.warn('Not enough points for rescue', { cpf, totalCost, userPoints: userRow.points });
      return res.status(400).json({ error: 'Not enough points for this rescue' });
    }

    await db.run('UPDATE users_turismo SET points = points - ? WHERE cpf = ?', [totalCost, cpf]);

    const rescueInsertQuery = `INSERT INTO rescued_products (cpf, product_id, points) VALUES (?, ?, ?)`;
    const updateQuantityQuery = `UPDATE products SET quantity = quantity - 1 WHERE id = ?`;
    const operations = selectedProducts.map((product) =>
      Promise.all([
        db.run(rescueInsertQuery, [cpf, product.id, product.points]),
        db.run(updateQuantityQuery, [product.id]),
      ])
    );
    await Promise.all(operations);

    await db.run('COMMIT');
    logger.info('Rescue successful', { cpf, totalCost });
    res.status(200).json({ message: 'Rescue successful', totalCost });
  } catch (error) {
    logger.error('Error processing rescue', { cpf, error: error.message });
    await db.run('ROLLBACK');
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
    WHERE r.rescue_date >= ? AND r.rescue_date <= ?
    ORDER BY r.rescue_date DESC
  `;

  try {
    const db = await dbPromise;
    const report = await db.all(reportQuery, [startDate, adjustedEndDate]);
    res.status(200).json(report);
  } catch (error) {
    logger.error('Error fetching rescue report', { error: error.message });
    res.status(500).json({ error: 'An error occurred while generating the report' });
  }
});

server.listen(port, () => {
  logger.info(`Server running on port ${port}`);
});
