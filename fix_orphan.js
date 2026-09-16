const fs = require('fs');
let c = fs.readFileSync('C:\\Users\\Gdgetg store\\Documents\\ldk\\backend\\server.js', 'utf8');

// Remove the orphaned old notifications endpoint code
const orphaned = `    });
            \`
            SELECT id, parent_id, student_id, title, message, type, read_flag, created_at
            FROM notifications
            WHERE parent_id = ?
            ORDER BY id DESC
            \`,
            [parentId]
        );

        return res.json({
            success: true,
            notifications: notifications.map((notification) => ({
                id: notification.id,
                parentId: notification.parent_id,
                studentId: notification.student_id || null,
                title: notification.title,
                message: notification.message,
                type: notification.type,
                read: Boolean(notification.read_flag),
                createdAt: notification.created_at
            }))
        });
    } catch (error) {
        console.error("Parent notifications lookup error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not fetch notifications."
        });
    }
});

app.post("/api/parents/:parentId/notifications", async (req, res) => {`;

const replacement = `    });
});

app.post("/api/parents/:parentId/notifications", async (req, res) => {`;

c = c.replace(orphaned, replacement);

fs.writeFileSync('C:\\Users\\Gdgetg store\\Documents\\ldk\\backend\\server.js', c);
console.log('Fixed orphaned code');