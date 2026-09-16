const fs = require('fs');
let c = fs.readFileSync('C:\\Users\\Gdgetg store\\Documents\\ldk\\backend\\routes\\paymentRoutes.js', 'utf8');

// Fix 1: walletTotal = walletAmount (not walletAmount + serviceFee)
c = c.replace(
  '// Amount the parent is charged for the top-up.\n            const walletTotal =\n                walletAmount +\n                serviceFee;',
  '// Amount MTN actually charges the parent.\n            const walletTotal =\n                walletAmount;'
);

// Fix 2: Add idempotency check before crediting
const oldStr = '                // --------------------------------\n                // CREDIT STUDENT WALLET\n                // --------------------------------\n\n                const student =\n                    await get(\n                        `\n                        SELECT\n                            id,\n                            name,\n                            class,\n                            balance\n                        FROM students\n                        WHERE id = ?\n                        `,\n                        [payment.student_id]\n                    );';

const newStr = '                // --------------------------------\n                // IDEMPOTENCY CHECK: Only credit once\n                // --------------------------------\n                if (payment.credited === 1) {\n                    const alreadyStudent = await get(\n                        `SELECT id, name, class, balance FROM students WHERE id = ?`,\n                        [payment.student_id]\n                    );\n                    return res.json({\n                        success: true,\n                        referenceId,\n                        status: "SUCCESS",\n                        credited: true,\n                        walletCredit: Number(payment.wallet_credit || 0),\n                        requestedAmount: Number(payment.requested_amount || 0),\n                        serviceFee: Number(payment.service_fee || 0),\n                        chargedAmount: Number(payment.charged_amount || 0),\n                        balanceBefore: Number(alreadyStudent?.balance || 0),\n                        newBalance: Number(alreadyStudent?.balance || 0),\n                        payment: {\n                            referenceId,\n                            studentId: payment.student_id,\n                            requestedAmount: Number(payment.requested_amount || 0),\n                            serviceFee: Number(payment.service_fee || 0),\n                            chargedAmount: Number(payment.charged_amount || 0),\n                            walletCredit: Number(payment.wallet_credit || 0),\n                            balanceBefore: Number(alreadyStudent?.balance || 0),\n                            newBalance: Number(alreadyStudent?.balance || 0),\n                            status: "SUCCESS"\n                        },\n                        message: "Payment already credited."\n                    });\n                }\n\n                // --------------------------------\n                // CREDIT STUDENT WALLET\n                // --------------------------------\n\n                const student =\n                    await get(\n                        `\n                        SELECT\n                            id,\n                            name,\n                            class,\n                            balance\n                        FROM students\n                        WHERE id = ?\n                        `,\n                        [payment.student_id]\n                    );';

c = c.replace(oldStr, newStr);

// Fix 3: Update transaction type from WALLET_FUNDING to TOP_UP
c = c.replace(/type: "WALLET_FUNDING"/g, 'type: "TOP_UP"');

// Fix 4: Update webhook transaction type
c = c.replace(/"WALLET_FUNDING"/g, '"TOP_UP"');

fs.writeFileSync('C:\\Users\\Gdgetg store\\Documents\\ldk\\backend\\routes\\paymentRoutes.js', c);
console.log('Payment routes updated successfully');