import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const API_URL = 'http://localhost:3001/api';

async function runTest() {
    try {
        console.log('1. Logging in...');
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            username: 'demoklinikaadmin',
            password: 'demoklinikaparol'
        });
        const { token, clinicId } = loginRes.data;
        console.log('   Login successful. Token received.');

        const headers = { Authorization: `Bearer ${token}` };

        console.log('2. Creating a test patient...');
        const patientRes = await axios.post(`${API_URL}/patients`, {
            firstName: 'Test',
            lastName: 'PhotoUser',
            phone: '+998901234567',
            dob: '1990-01-01',
            lastVisit: '2023-01-01',
            status: 'Active',
            gender: 'Male',
            medicalHistory: 'None',
            clinicId: clinicId
        }, { headers });
        const patientId = patientRes.data.id;
        console.log(`   Patient created. ID: ${patientId}`);

        console.log('3. Uploading a photo...');
        const form = new FormData();
        const filePath = path.join(__dirname, 'test_image.txt');
        form.append('photo', fs.createReadStream(filePath));
        form.append('description', 'Test Description');
        form.append('category', 'Before');

        const uploadRes = await axios.post(`${API_URL}/patients/${patientId}/photos`, form, {
            headers: {
                ...headers,
                ...form.getHeaders()
            }
        });
        const photoId = uploadRes.data.id;
        console.log(`   Photo uploaded. ID: ${photoId}`);

        console.log('4. Listing photos...');
        const listRes = await axios.get(`${API_URL}/patients/${patientId}/photos`, { headers });
        console.log(`   Found ${listRes.data.length} photos.`);
        if (listRes.data.length !== 1) throw new Error('Expected 1 photo');
        if (listRes.data[0].id !== photoId) throw new Error('Photo ID mismatch');

        console.log('5. Deleting photo...');
        await axios.delete(`${API_URL}/photos/${photoId}`, { headers });
        console.log('   Photo deleted.');

        console.log('6. Verifying deletion...');
        const listRes2 = await axios.get(`${API_URL}/patients/${patientId}/photos`, { headers });
        if (listRes2.data.length !== 0) throw new Error('Expected 0 photos');
        console.log('   Deletion verified.');

        console.log('7. Cleaning up patient...');
        await axios.delete(`${API_URL}/patients/${patientId}`, { headers });
        console.log('   Patient deleted.');

        console.log('✅ TEST PASSED!');

    } catch (error: any) {
        console.error('❌ TEST FAILED:', error.response?.data || error.message);
        process.exit(1);
    }
}

runTest();
