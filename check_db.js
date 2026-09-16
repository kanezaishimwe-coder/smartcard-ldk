const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('C:\\Users\\Gdgetg store\\Documents\\ldk\\smartcard.db');

// Find parent linked to ST20260001
db.all(`SELECT * FROM parent_student_links WHERE student_id = 'ST20260001'`, (err, rows) => {
  if (err) {
    console.error('Error:', err.message);
    db.close();
    return;
  }
  console.log('Parent links for ST20260001:', JSON.stringify(rows, null, 2));
  
  // Check notifications
  db.all(`SELECT * FROM notifications ORDER BY id DESC LIMIT 10`, (err2, notifs) => {
    if (err2) {
      console.error('Notif error:', err2.message);
    } else {
      console.log('Recent notifications:', JSON.stringify(notifs, null, 2));
    }
    db.close();
  });
});