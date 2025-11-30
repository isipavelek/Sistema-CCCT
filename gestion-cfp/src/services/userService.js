import { addDoc, deleteDoc, doc, collection, query, where, getDocs, updateDoc, setDoc } from 'firebase/firestore';
import { db, appId } from './firebase';
import { ROLES } from '../constants';

// --- Helpers ---
const getCollection = (name) => collection(db, 'artifacts', appId, 'public', 'data', name);

// --- Sync Logic ---

export const createTeacherInvite = async (form) => {
    // 1. Create Invite
    const inviteRef = await addDoc(getCollection('invites'), { ...form, createdAt: new Date().toISOString() });

    // 2. Sync: Create Teacher if not exists
    if (form.role === ROLES.TEACHER) {
        const q = query(getCollection('teachers'), where('email', '==', form.email));
        const snap = await getDocs(q);

        if (snap.empty) {
            const firstName = form.name;
            const lastName = form.lastName || '';

            await addDoc(getCollection('teachers'), {
                firstName,
                lastName,
                email: form.email,
                dni: form.dni || '',
                phone: form.phone || '',
                cuil: '',
                address: '',
                comments: 'Auto-generado desde Usuarios'
            });
            return { success: true, message: "Invitación creada. Docente agregado al directorio." };
        } else {
            return { success: true, message: "Invitación creada. (El docente ya existía)." };
        }
    }
    return { success: true, message: "Invitación creada." };
};

export const createTeacherDirectly = async (person) => {
    // 1. Create Teacher
    const teacherRef = await addDoc(getCollection('teachers'), person);

    // 2. Sync: Create Invite if not exists
    if (person.email) {
        const q = query(getCollection('invites'), where('email', '==', person.email));
        const snap = await getDocs(q);

        if (snap.empty) {
            await addDoc(getCollection('invites'), {
                email: person.email,
                name: person.firstName + ' ' + person.lastName,
                role: ROLES.TEACHER,
                createdAt: new Date().toISOString()
            });
            return { success: true, message: "Docente creado. Se generó automáticamente una invitación de acceso." };
        }
    }
    return { success: true, message: "Docente creado." };
};

export const deleteUserAccess = async (inviteId, email) => {
    // 1. Delete Invite
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'invites', inviteId));

    // 2. Soft Delete User (Ban)
    // We need to find the user in the 'users' collection by email (if possible) or just rely on the invite deletion preventing future sign-ups.
    // However, if the user ALREADY has an account, deleting the invite doesn't stop them from logging in.
    // We must find their user profile and set active: false.

    // Note: We can't query 'users' collection easily if we don't have the UID. 
    // But we can try to find them in a 'users_list' meta collection if we had one indexed by email, 
    // or we rely on the fact that we might not have their UID here.

    // WORKAROUND: We will maintain a 'banned_emails' collection or similar, OR we try to find the teacher and mark them as inactive?
    // Better approach: When deleting an invite, we are saying "this email is no longer authorized".
    // If we want to ban an existing user, we need their UID. 
    // Let's try to find the user profile by querying the 'users' collection group or similar? No, that's expensive.

    // ALTERNATIVE: We will add a 'banned' flag to the Teacher record if it exists? No, that's for the directory.

    // Let's implement a 'banned_users' collection in 'public/meta' that AuthScreen checks.
    if (email) {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'meta', 'banned_users', email), {
            bannedAt: new Date().toISOString()
        });
    }
};

export const deleteTeacher = async (teacherId, email) => {
    // 1. Delete Teacher
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teachers', teacherId));

    // 2. Sync: Delete Invite if exists
    if (email) {
        const q = query(getCollection('invites'), where('email', '==', email));
        const snap = await getDocs(q);
        snap.forEach(async (d) => {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'invites', d.id));
        });

        // 3. Ban User
        await setDoc(doc(db, 'artifacts', appId, 'public', 'meta', 'banned_users', email), {
            bannedAt: new Date().toISOString()
        });
    }
};

export const checkIsBanned = async (email) => {
    if (!email) return false;
    const docRef = doc(db, 'artifacts', appId, 'public', 'meta', 'banned_users', email);
    const snap = await getDocs(query(collection(db, 'artifacts', appId, 'public', 'meta', 'banned_users'), where('__name__', '==', email)));
    // getDoc on a collection inside 'public/meta' might work if we structure it right.
    // Actually, let's just use a query to be safe with the weird path structure we have.
    // Wait, 'banned_users' is a collection.
    const q = query(collection(db, 'artifacts', appId, 'public', 'meta', 'banned_users'), where('__name__', '==', email));
    const s = await getDocs(q);
    return !s.empty;
};
