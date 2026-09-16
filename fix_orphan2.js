const fs = require('fs');
let c = fs.readFileSync('C:\\Users\\Gdgetg store\\Documents\\ldk\\backend\\server.js', 'utf8');

// Find the orphaned block start
const startMarker = '});\n            `\n            SELECT id, parent_id';
const startIdx = c.indexOf(startMarker);

if (startIdx === -1) {
    console.log('Could not find orphaned code start');
    process.exit(1);
}

// Find the next app.post after the orphaned block
const endMarker = 'app.post("/api/parents/:parentId/notifications"';
const endIdx = c.indexOf(endMarker, startIdx);

if (endIdx === -1) {
    console.log('Could not find end marker');
    process.exit(1);
}

// Remove everything between startIdx+3 and endIdx
const before = c.substring(0, startIdx + 3);
const after = c.substring(endIdx);
c = before + '\n\n' + after;

fs.writeFileSync('C:\\Users\\Gdgetg store\\Documents\\ldk\\backend\\server.js', c);
console.log('Orphaned code removed successfully');