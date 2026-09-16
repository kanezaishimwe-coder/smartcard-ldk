const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('C:\\Users\\Gdgetg store\\Documents\\ldk\\smartcard.db');

// Create test payment
db.run(`
  INSERT INTO payments (reference_id, external_id, student_id, payer_phone, requested_amount, service_fee, charged_amount, wallet_credit, currency, status, credited)
  VALUES ('TEST-PAY-001', 'LDK-TEST-001', 'ST20260001', '0780000000', 10000, 200, 10000, 9800, 'RWF', 'PENDING', 0)
`, function(err) {
  if (err) {
    console.error('Insert error:', err.message);
    db.close();
    return;
  }
  
  db.get(`SELECT * FROM payments WHERE reference_id = 'TEST-PAY-001'`, (err, row) => {
    console.log('Created payment:', JSON.stringify(row, null, 2));
    db.close();
  });
});