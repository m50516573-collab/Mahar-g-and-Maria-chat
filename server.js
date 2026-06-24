/**
 * server.js
 *
 * A tiny, free-hostable Node.js server that watches Firebase Realtime
 * Database for new chat messages and sends a real FCM push notification
 * to the recipient's device — no Firebase billing (Blaze plan) required.
 *
 * WHY THIS EXISTS: Firebase Cloud Functions requires a billing account
 * (Blaze plan) even though usage stays free. This script does the exact
 * same job, but runs on Render.com's free tier instead, which needs no
 * card at all.
 *
 * ===================== ONE-TIME SETUP (do this once) =====================
 *
 * 1. Get a Firebase service account key (this lets the server send pushes
 *    on Firebase's behalf):
 *      - Firebase Console -> gear icon -> Project Settings
 *      - Go to "Service accounts" tab
 *      - Click "Generate new private key" -> downloads a .json file
 *      - Keep this file SECRET. Do not put it in GitHub Pages or any
 *        public folder. It only goes into Render's private environment.
 *
 * 2. Create a free GitHub repo with just two files:
 *      - server.js   (this file)
 *      - package.json (see below)
 *
 * 3. Go to render.com -> sign up free (no card) -> "New +" -> "Web Service"
 *    -> connect your GitHub repo
 *
 * 4. In Render's dashboard, under "Environment", add these variables:
 *      FIREBASE_SERVICE_ACCOUNT  = (paste the ENTIRE content of the
 *                                   downloaded .json file as one line)
 *      FIREBASE_DATABASE_URL     = https://al-nikah-c2d05-default-rtdb.firebaseio.com
 *
 * 5. Build command:  npm install
 *    Start command:   node server.js
 *
 * 6. Deploy. Render gives you a free URL — you don't even need to visit
 *    it; this server just runs in the background listening for messages.
 *
 * package.json needed alongside this file:
 * {
 *   "name": "maria-push-relay",
 *   "version": "1.0.0",
 *   "main": "server.js",
 *   "dependencies": {
 *     "firebase-admin": "^12.0.0"
 *   }
 * }
 * ===========================================================================
 */

const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();

// Watch every user's trigger inbox for new messages and push them.
const triggersRef = db.ref('pushTriggers');

triggersRef.on('child_added', (userSnap) => {
  const userId = userSnap.key; // 'mahar' or 'maria'
  userSnap.ref.on('child_added', async (triggerSnap) => {
    const trigger = triggerSnap.val();
    if (!trigger) return;

    try {
      const tokenSnap = await db.ref(`fcmTokens/${userId}`).get();
      const token = tokenSnap.val();

      if (!token) {
        console.log(`No FCM token for ${userId}, skipping.`);
        await triggerSnap.ref.remove();
        return;
      }

      await admin.messaging().send({
        token,
        notification: {
          title: trigger.fromName || 'Maria Chat',
          body: trigger.text || 'Naya message aaya hai'
        },
        webpush: {
          fcmOptions: { link: '/' }
        }
      });

      console.log(`Push sent to ${userId} from ${trigger.fromName}`);
    } catch (err) {
      console.error(`Push failed for ${userId}:`, err.message);
    }

    // Clean up so the database doesn't grow forever.
    await triggerSnap.ref.remove();
  });
});

console.log('Maria Chat push relay is running and watching for new messages...');

// Render's free tier needs an HTTP server to stay alive / pass health checks.
const http = require('http');
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Maria Chat push relay is running.');
}).listen(process.env.PORT || 3000);
