import React, { useState, useEffect } from 'react';
import { deleteDoc, doc, collection, onSnapshot } from 'firebase/firestore';
import { UserPlus } from 'lucide-react';
import { db, appId } from '../services/firebase';
import { createTeacherInvite, deleteUserAccess } from '../services/userService';
import { ROLES } from '../constants';

const UserAccessManager = ({ teachers }) => {
    const [invites, setInvites] = useState([]);
    const [form, setForm] = useState({ email: '', name: '', role: ROLES.TEACHER });

    useEffect(() => {
        const q = collection(db, 'artifacts', appId, 'public', 'data', 'invites');
        const unsub = onSnapshot(q, (snap) => setInvites(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        return () => unsub();
    }, []);

    const handleCreateInvite = async (e) => {
        e.preventDefault();
        if (!form.email) return alert("El correo es obligatorio");
        try {
            const result = await createTeacherInvite(form);
            alert(result.message);
            setForm({ email: '', name: '', lastName: '', dni: '', phone: '', role: ROLES.TEACHER });
        } catch (e) { console.error(e); alert("Error"); }
    };

    const deleteInvite = async (id, email) => {
        if (confirm("¿Borrar acceso? Esto también desactivará la cuenta del usuario si ya existe.")) {
            await deleteUserAccess(id, email);
        }
    };

    return (
        <div className="space-y-6 w-full">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm w-full">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><UserPlus size={20} /> Generar Nuevo Acceso</h3>
                <form onSubmit={handleCreateInvite} className="flex gap-4 items-end flex-wrap">
                    <div className="flex-1 min-w-[200px]"><label className="text-xs font-bold text-slate-500 mb-1 block">Email</label><input type="email" required className="w-full bg-white text-slate-900 border border-slate-300 rounded p-2" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                    <div className="flex-1 min-w-[200px]"><label className="text-xs font-bold text-slate-500 mb-1 block">Nombre</label><input type="text" required className="w-full bg-white text-slate-900 border border-slate-300 rounded p-2" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>

                    {form.role === ROLES.TEACHER && (
                        <>
                            <div className="flex-1 min-w-[200px]"><label className="text-xs font-bold text-slate-500 mb-1 block">Apellido</label><input type="text" required className="w-full bg-white text-slate-900 border border-slate-300 rounded p-2" value={form.lastName || ''} onChange={e => setForm({ ...form, lastName: e.target.value })} /></div>
                            <div className="w-32"><label className="text-xs font-bold text-slate-500 mb-1 block">DNI</label><input type="text" required className="w-full bg-white text-slate-900 border border-slate-300 rounded p-2" value={form.dni || ''} onChange={e => setForm({ ...form, dni: e.target.value })} /></div>
                            <div className="w-32"><label className="text-xs font-bold text-slate-500 mb-1 block">Teléfono</label><input type="text" className="w-full bg-white text-slate-900 border border-slate-300 rounded p-2" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                        </>
                    )}

                    <div className="w-48"><label className="text-xs font-bold text-slate-500 mb-1 block">Rol</label><select className="w-full bg-white text-slate-900 border border-slate-300 rounded p-2" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>{Object.values(ROLES).map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                    <button className="bg-green-600 text-white px-6 py-2 rounded font-bold hover:bg-green-700">Crear</button>
                </form>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden w-full">
                <div className="p-4 bg-slate-50 border-b font-bold text-slate-700">Invitaciones Pendientes</div>
                <table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-4">Correo</th><th className="p-4">Rol</th><th className="p-4">Nombre</th><th className="p-4 text-right">Acción</th></tr></thead><tbody>{invites.map(inv => (<tr key={inv.id} className="border-t hover:bg-slate-50"><td className="p-4 font-mono">{inv.email}</td><td className="p-4">{inv.role}</td><td className="p-4">{inv.name}</td><td className="p-4 text-right"><button onClick={() => deleteInvite(inv.id, inv.email)} className="text-red-500 hover:text-red-700 font-bold text-xs">Borrar</button></td></tr>))}</tbody></table>
            </div>
        </div>
    );
};

export default UserAccessManager;
