import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, getDocs, query, where, setDoc, doc, addDoc } from 'firebase/firestore';
import { School, Crown, AlertTriangle, Briefcase, Mail, Lock, Loader } from 'lucide-react';
import { auth, db, appId } from '../services/firebase';
import { checkIsBanned } from '../services/userService';
import Input from './Input';

const ROLES = {
    ADMIN: 'Administrador',
    TEACHER: 'Docente',
    STAFF: 'Responsable Administrativo'
};

const AuthScreen = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [isFirstUserMode, setIsFirstUserMode] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const checkSystem = async () => {
            try {
                const usersSnapshot = await getDocs(collection(db, 'artifacts', appId, 'public', 'meta', 'users_list'));
                if (usersSnapshot.empty) {
                    setIsLogin(false);
                    setIsFirstUserMode(true);
                }
            } catch (e) {
                console.error("System check warning:", e);
            }
        };
        checkSystem();
    }, []);

    const handleAuth = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, email, password);
                try {
                    const isBanned = await checkIsBanned(email);
                    if (isBanned) {
                        await signOut(auth);
                        throw new Error("Tu cuenta ha sido desactivada. Contacta al administrador.");
                    }
                } catch (innerErr) {
                    if (innerErr.message.includes("desactivada")) throw innerErr;
                    console.warn("Could not verify ban status:", innerErr);
                }
            } else {
                let roleToAssign = null;
                const usersSnapshot = await getDocs(collection(db, 'artifacts', appId, 'public', 'meta', 'users_list'));
                const isFirstUser = usersSnapshot.empty;
                if (isFirstUser) {
                    roleToAssign = ROLES.ADMIN;
                } else {
                    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'invites'), where('email', '==', email));
                    const inviteSnapshot = await getDocs(q);
                    if (!inviteSnapshot.empty) {
                        roleToAssign = inviteSnapshot.docs[0].data().role;
                    } else {
                        throw new Error("No tienes invitación para registrarte.");
                    }
                }
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                // Split name for first user
                const names = name.split(' ');
                const firstName = names[0] || name;
                const lastName = names.slice(1).join(' ') || '';

                await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), {
                    email, firstName, lastName, role: roleToAssign, createdAt: new Date().toISOString()
                });
                await addDoc(collection(db, 'artifacts', appId, 'public', 'meta', 'users_list'), { uid: user.uid });
            }
        } catch (err) {
            console.error("Auth Error:", err);
            let msg = err.message;
            if (msg.includes('auth/email-already-in-use')) msg = "Este correo ya está registrado.";
            if (msg.includes('auth/weak-password')) msg = "La contraseña debe tener al menos 6 caracteres.";
            if (msg.includes('auth/invalid-credential')) msg = "Credenciales incorrectas.";
            setError(msg);
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-100 flex items-center justify-center p-4 z-50 w-screen h-screen">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col relative z-10 border border-slate-200">
                <div className="w-full p-8">
                    <div className="flex items-center gap-2 mb-6 justify-center"><School className="text-orange-500" size={32} /><h1 className="font-bold text-2xl text-slate-800">CFP Roberto Rocca</h1></div>
                    <div className="text-center mb-6">
                        <h2 className="text-xl font-bold text-slate-800">{isFirstUserMode ? 'Configuración Inicial' : (isLogin ? 'Iniciar Sesión' : 'Registro de Cuenta')}</h2>
                        {isFirstUserMode && <p className="text-sm text-orange-600 font-medium mt-1 flex items-center justify-center gap-1"><Crown size={14} /> Creando cuenta de Super Administrador</p>}
                    </div>
                    {error && <div className="bg-red-100 text-red-700 p-3 rounded-lg mb-4 text-sm flex items-center gap-2"><AlertTriangle size={16} /> {error}</div>}
                    <form onSubmit={handleAuth} className="space-y-4">
                        {!isLogin && <Input icon={<Briefcase size={18} />} placeholder="Nombre Completo" value={name} onChange={v => setName(v)} required />}
                        <Input icon={<Mail size={18} />} type="email" placeholder="Correo Electrónico" value={email} onChange={v => setEmail(v)} required />
                        <Input icon={<Lock size={18} />} type="password" placeholder="Contraseña" value={password} onChange={v => setPassword(v)} required />
                        <button disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition disabled:opacity-50 flex justify-center items-center gap-2">{loading && <Loader className="animate-spin" size={18} />}{loading ? 'Procesando...' : (isLogin ? 'Entrar' : 'Registrarse')}</button>
                    </form>
                    <div className="mt-6 text-center text-sm text-slate-500">
                        {!isFirstUserMode && <>{isLogin ? "¿No tienes cuenta? " : "¿Ya tienes cuenta? "}<button onClick={() => setIsLogin(!isLogin)} className="text-blue-600 font-bold hover:underline">{isLogin ? "Regístrate aquí" : "Inicia sesión"}
                        </button></>}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AuthScreen;
