// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA0AxMplAM4j1JtuR0dH5x686CjrC2xRV0",
  authDomain: "paradise-invoicing.firebaseapp.com",
  projectId: "paradise-invoicing",
  storageBucket: "paradise-invoicing.firebasestorage.app",
  messagingSenderId: "426771435281",
  appId: "1:426771435281:web:5952fd0081d16507f0c6b0"
};

// ?????????? ???????
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ????? ????? ???? ??????? ?? ???? ???????
export { app, auth, db };