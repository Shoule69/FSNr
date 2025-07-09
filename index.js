require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();


// Используйте DATABASE_URL для подключения к Render PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage: storage });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// Создание таблицы, если не существует
(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bugs (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'open',
      screenshot TEXT
    )
  `);
})();

app.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM bugs ORDER BY id DESC');
    rows.forEach(bug => {
      if (bug.screenshot) {
        bug.screenshot = '/uploads/' + path.basename(bug.screenshot);
      }
    });
    res.render('index', { bugs: rows });
  } catch (err) {
    res.status(500).send('Ошибка подключения к базе данных');
  }
});

app.get('/new', (req, res) => {
  res.render('new');
});

app.post('/new', upload.single('screenshot'), async (req, res) => {
  const { title, description } = req.body;
  let screenshotPath = null;
  if (req.file) {
    screenshotPath = req.file.path;
  }
  try {
    await pool.query(
      'INSERT INTO bugs (title, description, screenshot) VALUES ($1, $2, $3)',
      [title, description, screenshotPath]
    );
    res.redirect('/');
  } catch (err) {
    res.status(500).send('Ошибка при добавлении бага');
  }
});

app.post('/close/:id', async (req, res) => {
  try {
    await pool.query('UPDATE bugs SET status = $1 WHERE id = $2', ['closed', req.params.id]);
    res.redirect('/');
  } catch (err) {
    res.status(500).send('Ошибка при закрытии бага');
  }
});

app.post('/delete/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT screenshot FROM bugs WHERE id = $1', [req.params.id]);
    if (rows.length && rows[0].screenshot) {
      const filePath = rows[0].screenshot;
      fs.unlink(filePath, () => {
        pool.query('DELETE FROM bugs WHERE id = $1', [req.params.id])
          .then(() => res.redirect('/'))
          .catch(() => res.status(500).send('Ошибка при удалении бага'));
      });
    } else {
      await pool.query('DELETE FROM bugs WHERE id = $1', [req.params.id]);
      res.redirect('/');
    }
  } catch (err) {
    res.status(500).send('Ошибка при удалении бага');
  }
});

