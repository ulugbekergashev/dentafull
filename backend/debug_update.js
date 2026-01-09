const axios = require('axios');

async function debugUpdate() {
    try {
        // 1. Login
        console.log('Logging in...');
        const loginRes = await axios.post('http://localhost:3001/api/auth/login', {
            username: 'superadminulugbek',
            password: 'superadminpassword'
        });
        const token = loginRes.data.token;
        console.log('Login successful.');

        // 2. Update Clinic
        const clinicId = '33237d53-5ca4-4de5-be2e-fc4e103945a7'; // djurabek_mirzakarimov
        console.log(`Updating clinic ${clinicId}...`);

        const updateData = {
            status: 'Active',
            expiryDate: '2026-01-26',
            planId: 'basic', // START
            subscriptionType: 'Trial'
        };

        const updateRes = await axios.put(`http://localhost:3001/api/clinics/${clinicId}`, updateData, {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log('Update successful:', updateRes.data);

    } catch (e) {
        console.error('Update failed:', e.response ? e.response.data : e.message);
    }
}

debugUpdate();
