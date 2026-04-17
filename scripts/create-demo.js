require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
  });
}

const email = 'demo@daymaker.com';
const password = 'demo-password-123';

async function verifyOrAddDemoUser() {
  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    console.log(`Demo user already exists: ${userRecord.uid}`);
    process.exit(0);
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      try {
        const newUser = await admin.auth().createUser({
          email,
          password,
          displayName: 'Demo User'
        });
        console.log(`Demo user created: ${newUser.uid}`);
        process.exit(0);
      } catch (createErr) {
        console.error('Error creating user:', createErr);
        process.exit(1);
      }
    } else {
      console.error('Error fetching user:', error);
      process.exit(1);
    }
  }
}

verifyOrAddDemoUser();
