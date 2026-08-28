const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const projectId = process.env.FIREBASE_PROJECT_ID || "fheoy-4f41f";

console.log("Initializing Firebase Admin SDK using Firebase CLI access token...");

let app;
const apps = getApps();
if (apps.length > 0) {
  app = apps[0];
} else {
  try {
    const configPath = "C:\\Users\\Devaprasanna\\.config\\configstore\\firebase-tools.json";
    if (!fs.existsSync(configPath)) {
      throw new Error(`Firebase tools config file not found at ${configPath}`);
    }

    const firebaseToolsConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const accessToken = firebaseToolsConfig.tokens?.access_token;
    const expiresAt = firebaseToolsConfig.tokens?.expires_at;

    if (!accessToken) {
      throw new Error("No access token found in firebase-tools.json. Please run 'firebase login' first.");
    }

    app = initializeApp({
      credential: {
        getAccessToken: async () => {
          return {
            access_token: accessToken,
            expires_in: Math.floor((expiresAt - Date.now()) / 1000),
          };
        },
      },
      projectId,
    });
  } catch (err) {
    console.error("Failed to initialize with CLI credentials:", err.message);
    console.log("Falling back to application default credentials...");
    app = initializeApp({
      projectId,
    });
  }
}

const auth = getAuth(app);

async function migrateUsers() {
  console.log("Listing existing Firebase users and assigning 'role: authenticated' claim...");
  let count = 0;
  let nextPageToken;

  try {
    do {
      const listUsersResult = await auth.listUsers(1000, nextPageToken);
      for (const userRecord of listUsersResult.users) {
        const claims = userRecord.customClaims || {};
        if (claims.role === "authenticated") {
          console.log(`User ${userRecord.uid} (${userRecord.email || "no-email"}) already has role:authenticated claim.`);
          continue;
        }
        
        console.log(`Setting role:authenticated claim for user: ${userRecord.uid} (${userRecord.email || "no-email"})...`);
        const updatedClaims = { ...claims, role: "authenticated" };
        await auth.setCustomUserClaims(userRecord.uid, updatedClaims);
        count++;
      }
      nextPageToken = listUsersResult.pageToken;
    } while (nextPageToken);

    console.log(`Successfully updated claims for ${count} users.`);
    process.exit(0);
  } catch (error) {
    console.error("Migration failed with error:", error);
    process.exit(1);
  }
}

migrateUsers();
