const axios = require('axios');

async function check() {
    try {
        console.log('Logging in...');
        const loginRes = await axios.post('https://dentafull-production.up.railway.app/api/auth/login', {
            username: 'superadminulugbek',
            password: 'superadminpassword'
        });

        const token = loginRes.data.token;
        console.log('Login successful. Token received.');

        console.log('Fetching clinics...');
        const clinicsRes = await axios.get('https://dentafull-production.up.railway.app/api/clinics', {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log(`Total clinics from API: ${clinicsRes.data.length}`);
        clinicsRes.data.forEach(c => {
            console.log(`- ${c.name} (ID: ${c.id})`);
        });
    } catch (e) {
        console.error('Error:', e.response ? e.response.data : e.message);
    }
}

check();
