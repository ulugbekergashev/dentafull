
import jwt from 'jsonwebtoken';
import axios from 'axios';

const JWT_SECRET = 'super_secret_jwt_key_denta_crm_2024';
const clinicId = '05bc3e4c-d409-4565-a53d-b690781a7a73';

const token = jwt.sign({ role: 'CLINIC_ADMIN', clinicId }, JWT_SECRET);

async function test() {
    try {
        console.log(`Testing endpoint for clinic: ${clinicId}`);
        const res = await axios.get(`http://localhost:3001/api/clinics/${clinicId}/bot-username`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Response:', res.data);
    } catch (e) {
        console.error('Error:', e.response ? e.response.data : e.message);
    }
}

test();
