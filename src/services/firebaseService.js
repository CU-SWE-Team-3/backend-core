const admin = require('firebase-admin');

let firebaseInitialized = false;

try {
  // Read directly from the .env file instead of a JSON file
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // The replace regex ensures the newlines are formatted correctly
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
  firebaseInitialized = true;
  console.log('[Firebase] Admin SDK Initialized Successfully from .env');
} catch (error) {
  console.warn('[Firebase] Initialization skipped. Missing or invalid env variables.');
  console.error(error);
}

/**
 * Send a push notification to specific FCM tokens
 */
exports.sendPushNotification = async (tokens, title, body, dataPayload = {}) => {
  if (!firebaseInitialized || !tokens || tokens.length === 0) return;

  const message = {
    notification: {
      title,
      body,
    },
    data: {
      ...dataPayload,
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
    },
    tokens,
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    
    const failedTokens = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        failedTokens.push(tokens[idx]);
      }
    });

    if (failedTokens.length > 0) {
      console.log('[Firebase] Dead tokens found:', failedTokens);
    }
  } catch (error) {
    console.error('[Firebase] Error sending push notification:', error);
  }
};