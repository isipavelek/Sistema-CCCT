import { addDoc, deleteDoc, doc, collection, query, where, getDocs, updateDoc, setDoc } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { db, appId, auth } from './firebase';
import { ROLES } from '../constants';

// --- Helpers ---
const getCollection = (name) => collection(db, 'artifacts', appId, 'public', 'data', name);

// --- Sync Logic ---

export const createTeacherInvite = async (form) => {
    // Priority to 'roles' (array), then 'role' (legacy string/array)
    const rolesArr = Array.isArray(form.roles) ? form.roles : (Array.isArray(form.role) ? form.role : (form.role ? [form.role] : []));
    const dataToSave = { 
        ...form, 
        role: rolesArr[0] || '', // Legacy support
        roles: rolesArr, 
        createdAt: new Date().toISOString() 
    };

    // 1. Create Invite
    const inviteRef = await addDoc(getCollection('invites'), dataToSave);

    // 2. Sync: Create Teacher if not exists
    if (rolesArr.includes(ROLES.TEACHER)) {
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
            return { success: true, message: "Invitación creada. Docente agregado al directorio.", id: inviteRef.id };
        } else {
            return { success: true, message: "Invitación creada. (El docente ya existía).", id: inviteRef.id };
        }
    }
    return { success: true, message: "Invitación creada.", id: inviteRef.id };
};

export const updateUserAccess = async (id, form) => {
    // Priority to 'roles' (array), then 'role' (legacy string/array)
    const rolesArr = Array.isArray(form.roles) ? form.roles : (Array.isArray(form.role) ? form.role : (form.role ? [form.role] : []));
    const dataToUpdate = {
        ...form,
        role: rolesArr[0] || '', // Legacy
        roles: rolesArr,
        updatedAt: new Date().toISOString()
    };
    
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'invites', id), dataToUpdate);
    return { success: true, message: "Acceso actualizado correctamente." };
};

export const adminResetPassword = async (email) => {
    if (!email) throw new Error("Email requerido");
    await sendPasswordResetEmail(auth, email);
    return { success: true, message: `Se ha enviado un correo de recuperación a ${email}` };
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
                roles: [ROLES.TEACHER],
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

    // 2. Ban User logic...
    if (email) {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'meta', 'banned_users', email), {
            bannedAt: new Date().toISOString()
        });
    }
};

export const deleteTeacher = async (teacherId, email) => {
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teachers', teacherId));

    if (email) {
        const q = query(getCollection('invites'), where('email', '==', email));
        const snap = await getDocs(q);
        snap.forEach(async (d) => {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'invites', d.id));
        });

        await setDoc(doc(db, 'artifacts', appId, 'public', 'meta', 'banned_users', email), {
            bannedAt: new Date().toISOString()
        });
    }
};

export const checkIsBanned = async (email) => {
    if (!email) return false;
    const q = query(collection(db, 'artifacts', appId, 'public', 'meta', 'banned_users'), where('__name__', '==', email));
    const s = await getDocs(q);
    return !s.empty;
};

