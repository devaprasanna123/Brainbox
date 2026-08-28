const { beforeUserCreated, beforeUserSignedIn } = require("firebase-functions/v2/identity");
const admin = require("firebase-admin");

admin.initializeApp();

exports.beforeCreated = beforeUserCreated((event) => {
  console.log(`Setting custom claim role:authenticated for new user ${event.data.uid}`);
  return {
    customClaims: {
      role: "authenticated"
    }
  };
});

exports.beforeSignedIn = beforeUserSignedIn((event) => {
  console.log(`Setting custom claim role:authenticated for signing in user ${event.data.uid}`);
  return {
    customClaims: {
      role: "authenticated"
    }
  };
});
