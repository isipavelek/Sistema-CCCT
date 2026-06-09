import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const LOCAL_FIREBASE_CONFIG = {
    apiKey: "AIzaSyAo1kidRK4avyBhqd6HMBIZZ-MgGBjy4_o",
    authDomain: "sistema-3ct.firebaseapp.com",
    projectId: "sistema-3ct",
    storageBucket: "sistema-3ct.firebasestorage.app",
    messagingSenderId: "89481437348",
    appId: "1:89481437348:web:b3db71a3944b4254de8631",
    measurementId: "G-6MBCMNQS1Q"
};

let firebaseConfig = LOCAL_FIREBASE_CONFIG;
let appId = 'default-app-id';

try {
    if (typeof __firebase_config !== 'undefined' && __firebase_config) {
        firebaseConfig = JSON.parse(__firebase_config);
        appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    }
} catch (e) {
    console.warn("Usando configuración local de Firebase");
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export { appId };
