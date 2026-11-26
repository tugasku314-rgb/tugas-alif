export const firebaseConfig = {
  apiKey: "AIzaSyCDnRqVc6sQVHNWmAzX0Dbsqgkx7MTRZjE",
  authDomain: "sehatq-e13c1.firebaseapp.com",
  databaseURL: "https://sehatq-e13c1-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "sehatq-e13c1",
  appId: "1:230095949194:web:5f5bbe8ed8ebb131524c73"
};

export const adminUid = "CQg0DMJZ3CVLbKUOkzoWRdXU5JJ3";

export function isFirebaseConfigured(config = firebaseConfig) {
  return Boolean(config.apiKey && config.projectId && config.appId &&
    !Object.values(config).some(value => String(value).includes("GANTI_DENGAN")));
}
