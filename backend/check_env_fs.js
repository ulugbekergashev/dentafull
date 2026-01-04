
const fs = require('fs');
try {
    const content = fs.readFileSync('.env', 'utf8');
    console.log('File content length:', content.length);
    const lines = content.split('\n');
    lines.forEach(line => {
        if (line.startsWith('DATABASE_URL')) {
            console.log('Found DATABASE_URL');
            const parts = line.split('=');
            if (parts.length > 1) {
                const url = parts.slice(1).join('=').trim().replace(/"/g, '');
                console.log('URL starts with:', url.substring(0, 15));
            }
        }
    });
} catch (e) {
    console.error('Error reading .env:', e.message);
}
