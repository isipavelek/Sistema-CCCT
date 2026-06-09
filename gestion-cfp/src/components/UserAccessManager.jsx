import React, { useState, useEffect } from 'react';
import { onSnapshot, collection } from 'firebase/firestore';
import { UserPlus, Edit2, Trash2, Key, X, Check, Shield, User, Mail } from 'lucide-react';
import { db, appId } from '../services/firebase';
import { createTeacherInvite, deleteUserAccess, updateUserAccess, adminResetPassword } from '../services/userService';
import { ROLES } from '../constants';

const MultiRoleSelector = ({ selectedRoles = [], onChange }) => {
    const allRoles = Object.values(ROLES);
    
    const toggleRole = (role) => {
        const newRoles = selectedRoles.includes(role)
            ? selectedRoles.filter(r => r !== role)
            : [...selectedRoles, role];
        onChange(newRoles);
    };

    return (
        <div className="flex flex-wrap gap-2 mt-2">
            {allRoles.map(role => (
                <button
                    key={role}
                    type="button"
                    onClick={() => toggleRole(role)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-1.5 ${
                        selectedRoles.includes(role)
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'
                    }`}
                >
                    {selectedRoles.includes(role) && <Check size={12} />}
                    {role}
                </button>
            ))}
        </div>
    );
};

const UserAccessManager = () => {
    const [invites, setInvites] = useState([]);
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({ email: '', name: '', roles: [ROLES.TEACHER], lastName: '', dni: '', phone: '' });

    useEffect(() => {
        const q = collection(db, 'artifacts', appId, 'public', 'data', 'invites');
        const unsub = onSnapshot(q, (snap) => setInvites(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        return () => unsub();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.email || form.roles.length === 0) return alert("Email y al menos un rol son obligatorios");
        
        setLoading(true);
        try {
            if (editingId) {
                // Prepare form for update (we send 'role' as the first one for legacy)
                const payload = { ...form, role: form.roles[0] };
                await updateUserAccess(editingId, payload);
                alert("Usuario actualizado correctamente");
                setEditingId(null);
            } else {
                const payload = { ...form, role: form.roles }; // createTeacherInvite handles conversion
                await createTeacherInvite(payload);
                alert("Invitación creada correctamente");
            }
            setForm({ email: '', name: '', roles: [ROLES.TEACHER], lastName: '', dni: '', phone: '' });
        } catch (e) {
            console.error(e);
            alert("Error al procesar la solicitud");
        }
        setLoading(false);
    };

    const handleEdit = (inv) => {
        const roles = Array.isArray(inv.roles) ? inv.roles : (inv.role ? [inv.role] : []);
        setForm({
            email: inv.email || '',
            name: inv.name || '',
            roles: roles.length > 0 ? roles : [ROLES.TEACHER],
            lastName: inv.lastName || '',
            dni: inv.dni || '',
            phone: inv.phone || ''
        });
        setEditingId(inv.id);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleResetPassword = async (email) => {
        if (!email) return;
        if (confirm(`¿Enviar correo de restablecimiento de contraseña a ${email}?`)) {
            try {
                await adminResetPassword(email);
                alert("Correo enviado con éxito.");
            } catch (e) {
                alert("Error: " + e.message);
            }
        }
    };

    const deleteInvite = async (inv) => {
        if (confirm(`¿Borrar acceso para ${inv.email}? Esto también desactivará la cuenta si ya existe.`)) {
            await deleteUserAccess(inv.id, inv.email);
        }
    };

    const isTeacher = form.roles.includes(ROLES.TEACHER);

    return (
        <div className="space-y-8 w-full max-w-6xl mx-auto">
            {/* Form Section */}
            <div className={`bg-white p-8 rounded-2xl border shadow-sm transition-all ${editingId ? 'border-blue-400 ring-4 ring-blue-50' : 'border-slate-200'}`}>
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
                        {editingId ? <Edit2 className="text-blue-600" size={24} /> : <UserPlus className="text-emerald-600" size={24} />}
                        {editingId ? 'Editar Acceso de Usuario' : 'Generar Nuevo Acceso'}
                    </h3>
                    {editingId && (
                        <button 
                            onClick={() => { setEditingId(null); setForm({ email: '', name: '', roles: [ROLES.TEACHER], lastName: '', dni: '', phone: '' }); }}
                            className="text-slate-400 hover:text-slate-600 flex items-center gap-1 text-sm font-bold"
                        >
                            <X size={16} /> Cancelar edición
                        </button>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5"><Mail size={12} /> Email</label>
                            <input 
                                type="email" 
                                required 
                                disabled={editingId}
                                className="w-full bg-slate-50 text-slate-900 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition disabled:opacity-60" 
                                value={form.email} 
                                onChange={e => setForm({ ...form, email: e.target.value })} 
                                placeholder="ejemplo@email.com"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5"><User size={12} /> Nombre / Alias</label>
                            <input 
                                type="text" 
                                required 
                                className="w-full bg-slate-50 text-slate-900 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition" 
                                value={form.name} 
                                onChange={e => setForm({ ...form, name: e.target.value })} 
                                placeholder="Nombre visible"
                            />
                        </div>

                        {isTeacher && (
                            <>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Apellido (Docente)</label>
                                    <input type="text" required={isTeacher} className="w-full bg-slate-50 text-slate-900 border border-slate-200 rounded-xl p-3" value={form.lastName || ''} onChange={e => setForm({ ...form, lastName: e.target.value })} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider">DNI (Docente)</label>
                                    <input type="text" required={isTeacher} className="w-full bg-slate-50 text-slate-900 border border-slate-200 rounded-xl p-3" value={form.dni || ''} onChange={e => setForm({ ...form, dni: e.target.value })} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Teléfono</label>
                                    <input type="text" className="w-full bg-slate-50 text-slate-900 border border-slate-200 rounded-xl p-3" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} />
                                </div>
                            </>
                        )}
                    </div>

                    <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            <Shield size={12} /> Roles Asignados (Selección múltiple)
                        </label>
                        <MultiRoleSelector 
                            selectedRoles={form.roles} 
                            onChange={(roles) => setForm({ ...form, roles })} 
                        />
                        <p className="text-[10px] text-slate-400 mt-2 italic">* Los roles definen qué secciones y acciones tendrá permitidas el usuario al iniciar sesión.</p>
                    </div>

                    <div className="flex justify-end pt-4">
                        <button 
                            disabled={loading}
                            className={`flex items-center gap-2 px-10 py-3 rounded-xl font-bold text-white transition-all shadow-lg hover:shadow-xl active:scale-95 disabled:opacity-50 ${editingId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                        >
                            {loading ? 'Procesando...' : (editingId ? <><Check size={18} /> Guardar Cambios</> : <><UserPlus size={18} /> Crear Acceso</>)}
                        </button>
                    </div>
                </form>
            </div>

            {/* List Section */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden w-full">
                <div className="p-5 bg-slate-800 text-white font-bold flex justify-between items-center">
                    <span>Usuarios con Acceso Autorizado</span>
                    <span className="text-xs font-normal opacity-70">Total: {invites.length} usuarios</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] font-black tracking-widest">
                            <tr>
                                <th className="p-4">Usuario / Email</th>
                                <th className="p-4">Roles</th>
                                <th className="p-4 text-right">Acciones de Gestión</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {invites.map(inv => {
                                const roles = Array.isArray(inv.roles) ? inv.roles : (inv.role ? [inv.role] : []);
                                return (
                                    <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="p-4">
                                            <div className="font-bold text-slate-700">{inv.name || 'Sin nombre'}</div>
                                            <div className="text-xs text-slate-400 font-mono">{inv.email}</div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-wrap gap-1">
                                                {roles.map(r => (
                                                    <span key={r} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-bold border border-blue-100">
                                                        {r}
                                                    </span>
                                                ))}
                                                {roles.length === 0 && <span className="text-slate-300 italic text-xs">Sin roles</span>}
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex justify-end gap-2">
                                                <button 
                                                    onClick={() => handleResetPassword(inv.email)}
                                                    className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg transition-colors flex items-center gap-1.5"
                                                    title="Restablecer Contraseña"
                                                >
                                                    <Key size={16} />
                                                    <span className="hidden lg:inline text-[10px] font-bold">Reseteo</span>
                                                </button>
                                                <button 
                                                    onClick={() => handleEdit(inv)}
                                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5"
                                                    title="Editar"
                                                >
                                                    <Edit2 size={16} />
                                                    <span className="hidden lg:inline text-[10px] font-bold">Editar</span>
                                                </button>
                                                <button 
                                                    onClick={() => deleteInvite(inv)}
                                                    className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors flex items-center gap-1.5"
                                                    title="Eliminar acceso"
                                                >
                                                    <Trash2 size={16} />
                                                    <span className="hidden lg:inline text-[10px] font-bold">Borrar</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {invites.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="p-12 text-center text-slate-400 italic">
                                        No hay usuarios autorizados todavía. Comienza creando un acceso arriba.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default UserAccessManager;

