const fs = require('fs');

// Fix server.js - add notification integration to library borrow/return and canteen
let server = fs.readFileSync('C:\\Users\\Gdgetg store\\Documents\\ldk\\backend\\server.js', 'utf8');

// Add library borrow notification
const libBorrowOld = `        await run(
            \`UPDATE library_books SET available = 0 WHERE id = ?\`,
            [bookId]
        );

        return res.status(201).json({
            success: true,
            loan: {
                id: result.id,
                studentId,
                studentName: student.name,
                bookId: book.id,
                bookTitle: book.title,
                borrowDate,
                expectedReturnDate,
                status: "BORROWED"
            },
            message: "Book borrowed successfully."
        });`;

const libBorrowNew = `        await run(
            \`UPDATE library_books SET available = 0 WHERE id = ?\`,
            [bookId]
        );

        // Create parent notification for library borrow
        try {
            const parentLink = await get(
                \`SELECT parent_id FROM parent_student_links WHERE student_id = ?\`,
                [studentId]
            );
            if (parentLink?.parent_id) {
                await run(
                    \`INSERT INTO notifications (parent_id, student_id, type, title, message, read_flag) VALUES (?, ?, ?, ?, ?, 0)\`,
                    [
                        parentLink.parent_id,
                        studentId,
                        "LIBRARY_BORROW",
                        "Book borrowed",
                        \`\${student.name} borrowed "\${book.title}". Due back by \${expectedReturnDate}.\`,
                    ]
                );
            }
        } catch (notifErr) {
            console.error("Library borrow notification error:", notifErr.message);
        }

        return res.status(201).json({
            success: true,
            loan: {
                id: result.id,
                studentId,
                studentName: student.name,
                bookId: book.id,
                bookTitle: book.title,
                borrowDate,
                expectedReturnDate,
                status: "BORROWED"
            },
            message: "Book borrowed successfully."
        });`;

server = server.replace(libBorrowOld, libBorrowNew);

// Add library return notification
const libReturnOld = `        await run(
            \`UPDATE library_books SET available = 1 WHERE id = ?\`,
            [loan.book_id]
        );

        return res.json({
            success: true,
            message: "Book returned successfully.",
            loan: {
                id: loan.id,
                bookId: loan.book_id,
                bookTitle: loan.book_title,
                studentId: loan.student_id,
                status: "RETURNED",
                returnDate
            }
        });`;

const libReturnNew = `        await run(
            \`UPDATE library_books SET available = 1 WHERE id = ?\`,
            [loan.book_id]
        );

        // Create parent notification for library return
        try {
            const parentLink = await get(
                \`SELECT parent_id FROM parent_student_links WHERE student_id = ?\`,
                [loan.student_id]
            );
            if (parentLink?.parent_id) {
                await run(
                    \`INSERT INTO notifications (parent_id, student_id, type, title, message, read_flag) VALUES (?, ?, ?, ?, ?, 0)\`,
                    [
                        parentLink.parent_id,
                        loan.student_id,
                        "LIBRARY_RETURN",
                        "Book returned",
                        \`\${loan.book_title} has been returned.\`,
                    ]
                );
            }
        } catch (notifErr) {
            console.error("Library return notification error:", notifErr.message);
        }

        return res.json({
            success: true,
            message: "Book returned successfully.",
            loan: {
                id: loan.id,
                bookId: loan.book_id,
                bookTitle: loan.book_title,
                studentId: loan.student_id,
                status: "RETURNED",
                returnDate
            }
        });`;

server = server.replace(libReturnOld, libReturnNew);

// Add canteen purchase notification
const canteenOld = `        if (parentLink?.parent_id) {
            await createParentNotification(
                parentLink.parent_id,
                studentId,
                "Canteen purchase",
                \`\${student.name} purchased \${item.name} for \${amount.toLocaleString()} RWF. Remaining wallet: \${balanceAfter.toLocaleString()} RWF.\`,
                "CANTEEN"
            );
        }

        return res.json({
            success: true,
            transactionId: transactionResult.id,
            message: "Canteen purchase successful.",
            purchase: {
                studentId,
                studentName: student.name,
                itemId: item.id,
                itemName: item.name,
                amount,
                balanceBefore,
                balanceAfter,
                status: "SUCCESS"
            }
        });`;

const canteenNew = `        if (parentLink?.parent_id) {
            await run(
                \`INSERT INTO notifications (parent_id, student_id, type, title, message, read_flag) VALUES (?, ?, ?, ?, ?, 0)\`,
                [
                    parentLink.parent_id,
                    studentId,
                    "CANTEEN_PURCHASE",
                    "Canteen purchase",
                    \`\${student.name} purchased \${item.name} for \${amount.toLocaleString()} RWF. Remaining wallet: \${balanceAfter.toLocaleString()} RWF.\`,
                ]
            );
        }

        return res.json({
            success: true,
            transactionId: transactionResult.id,
            message: "Canteen purchase successful.",
            purchase: {
                studentId,
                studentName: student.name,
                itemId: item.id,
                itemName: item.name,
                amount,
                balanceBefore,
                balanceAfter,
                status: "SUCCESS"
            }
        });`;

server = server.replace(canteenOld, canteenNew);

fs.writeFileSync('C:\\Users\\Gdgetg store\\Documents\\ldk\\backend\\server.js', server);
console.log('Server notification integration complete');