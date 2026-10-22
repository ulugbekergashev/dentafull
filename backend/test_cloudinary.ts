import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';

// Configure Cloudinary with the same credentials as server.ts
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

async function testUpload() {
    console.log('Testing Cloudinary upload...');
    console.log('Cloud Name:', cloudinary.config().cloud_name);
    console.log('API Key:', cloudinary.config().api_key ? '***' : 'Missing');

    const testFilePath = path.join(__dirname, 'test_image.txt');

    // Create a dummy file if it doesn't exist
    if (!fs.existsSync(testFilePath)) {
        fs.writeFileSync(testFilePath, 'This is a test image content');
    }

    try {
        const result = await cloudinary.uploader.upload(testFilePath, {
            folder: 'test_uploads',
            resource_type: 'auto'
        });
        console.log('✅ Upload successful!');
        console.log('URL:', result.secure_url);

        // Clean up
        await cloudinary.uploader.destroy(result.public_id);
        console.log('✅ Cleanup successful!');
    } catch (error) {
        console.error('❌ Upload failed:', error);
    }
}

testUpload();
