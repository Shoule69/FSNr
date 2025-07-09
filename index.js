const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const db = new sqlite3.Database(':memory:');


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

db.serialize(() => {
  db.run(`CREATE TABLE bugs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'open',
    screenshot TEXT
  )`);
});

app.get('/', (req, res) => {
  db.all('SELECT * FROM bugs', (err, rows) => {
    rows.forEach(bug => {
      if (bug.screenshot) {
        bug.screenshot = '/uploads/' + path.basename(bug.screenshot);
      }
    });
    res.render('index', { bugs: rows });
  });
});

app.get('/new', (req, res) => {
  res.render('new');
});


app.post('/new', upload.single('screenshot'), (req, res) => {
  const { title, description } = req.body;
  let screenshotPath = null;
  if (req.file) {
    screenshotPath = req.file.path;
  }
  db.run(
    'INSERT INTO bugs (title, description, screenshot) VALUES (?, ?, ?)',
    [title, description, screenshotPath],
    () => {
      res.redirect('/');
    }
  );
});

app.post('/close/:id', (req, res) => {
  db.run('UPDATE bugs SET status = ? WHERE id = ?', ['closed', req.params.id], () => {
    res.redirect('/');
  });
});

app.listen(3000, () => console.log('Bug tracker running at http://localhost:3000'));
