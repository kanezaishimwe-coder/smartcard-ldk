const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('C:\\Users\\Gdgetg store\\Documents\\ldk\\smartcard.db');

// Create test payment with corrected fee calculation
// Parent requests 5,000 RWF
// Student receives 5,000 RWF (full amount)
// Parent pays 5,200 RWF to MTN (amount + 200 fee)
db.run(`
  INSERT INTO payments (reference_id, external_id, student_id, payer_phone, payer_name, requested_amount, service_fee, charged_amount, wallet_credit, currency, status, credited)
  VALUES ('TEST-FEE-001', 'LDK-FEE-001', 'ST20260001', '0788123456', 'John Doe', 5000, 200, 5200, 5000, 'RWF', 'PENDING', 0)
`, function(err) {
  if (err) {
    console.error('Insert error:', err.message);
    db.close();
    return;
  }
  
  db.get(`SELECT * FROM payments WHERE reference_id = 'TEST-FEE-001'`, (err, row) => {
    console.log('Created payment:', JSON.stringify(row, null, 2));
    db.close();
  });
});