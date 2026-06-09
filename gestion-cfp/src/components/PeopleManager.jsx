import React, { useState } from 'react';
import { updateDoc, addDoc, deleteDoc, doc, collection } from 'firebase/firestore';
import { Search, Edit, Trash2, Camera } from 'lucide-react';
import { db, appId } from '../services/firebase';
import { createTeacherDirectly, deleteTeacher } from '../services/userService';
import Modal from './Modal';
import Input from './Input';

const PeopleManager = ({ type, people, cohorts }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [person, setPerson] = useState({ firstName: '', lastName: '', dni: '', email: '', phone: '', cuil: '', address: '', comments: '', photoUrl: '' });
    const collectionName = type === 'student' ? 'students' : 'teachers';
    const title = type === 'student' ? 'Alumnos' : 'Docentes';

    const resetForm = () => { setPerson({ firstName: '', lastName: '', dni: '', email: '', phone: '', cuil: '', address: '', comments: '', photoUrl: '' }); setIsEditing(null); setIsModalOpen(false); setUploading(false); }
    const openEdit = (p) => { setPerson({ ...p }); setIsEditing(p.id); setIsModalOpen(true); }

    const handlePhotoUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        // Validate size (max 1MB)
        if (file.size > 1024 * 1024) {
            alert("La imagen es demasiado grande. Máximo 1MB.");
            return;
        }
        setUploading(true);
        const reader = new FileReader();
        reader.onload = (ev) => {
            setPerson(prev => ({ ...prev, photoUrl: ev.target.result }));
            setUploading(false);
        };
        reader.onerror = () => {
            alert("Error al leer la imagen.");
            setUploading(false);
        };
        reader.readAsDataURL(file);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            if (isEditing) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', collectionName, isEditing), person);
            else {
                if (type === 'teacher') {
                    const result = await createTeacherDirectly(person);
                    alert(result.message);
                } else {
                    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', collectionName), person);
                }
            }
            resetForm();
        } catch (err) { 
            console.error(err); 
            alert("No se pudo guardar: " + err.message);
        }
    };

    const handleDelete = async (id, email) => {
        if (type === 'teacher') {
            const hasCohorts = cohorts.some(c => c.teacherId === id);
            if (hasCohorts) return alert("No se puede eliminar el docente porque tiene cohortes asignadas.");

            if (confirm("¿Eliminar docente? Esto también eliminará su acceso al sistema.")) {
                await deleteTeacher(id, email);
            }
        } else {
            const hasCohorts = cohorts.some(c => c.studentIds && c.studentIds.includes(id));
            if (hasCohorts) return alert("No se puede eliminar el alumno porque está inscripto en cohortes.");

            if (confirm("¿Eliminar alumno?")) {
                await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', collectionName, id));
            }
        }
    }

    return (
        <div className="w-full">
            <div className="flex justify-between items-center mb-6 no-print">
                <div className="relative"><Search className="absolute left-3 top-2.5 text-slate-400" size={18} /><input type="text" placeholder={`Buscar ${title}...`} className="pl-10 pr-4 py-2 border rounded-lg text-sm w-64 bg-white" /></div>
                <button onClick={() => { resetForm(); setIsModalOpen(true); }} className="bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-900 shadow-sm transition text-sm font-medium">+ Agregar {type === 'student' ? 'Alumno' : 'Docente'}</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 w-full">
                {people.map(p => {
                    const displayInitial = p.firstName ? p.firstName.charAt(0) : (p.name ? p.name.charAt(0) : 'U');
                    const displayName = p.lastName && p.firstName ? `${p.lastName}, ${p.firstName}` : (p.name || 'Sin Nombre');
                    return (
                        <div key={p.id} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-start justify-between gap-4 group hover:shadow-md transition">
                            <div className="flex items-start gap-4 overflow-hidden">
                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold flex-shrink-0 overflow-hidden border border-slate-200">
                                    {p.photoUrl ? <img src={p.photoUrl} alt="" className="w-full h-full object-cover" /> : displayInitial}
                                </div>
                                <div className="overflow-hidden">
                                    <h4 className="font-bold text-slate-800 truncate">{displayName}</h4>
                                    <p className="text-xs text-slate-500 mt-1 font-mono">{p.dni || 'Sin DNI'}</p>
                                    <p className="text-xs text-slate-400 truncate">{p.email}</p>
                                    {p.cuil && <p className="text-xs text-slate-400 font-mono">CUIL: {p.cuil}</p>}
                                </div>
                            </div>
                            <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition">
                                <button onClick={() => openEdit(p)} className="text-blue-500 hover:bg-blue-50 p-1 rounded"><Edit size={14} /></button>
                                <button onClick={() => handleDelete(p.id, p.email)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size={14} /></button>
                            </div>
                        </div>
                    );
                })}
            </div>
            {isModalOpen && (
                <Modal title={`${isEditing ? 'Editar' : 'Alta de'} ${title}`} onClose={resetForm}>
                    <form onSubmit={handleSave} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2 flex items-center gap-4 mb-2">
                                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-200 flex-shrink-0">
                                    {person.photoUrl ? <img src={person.photoUrl} alt="Perfil" className="w-full h-full object-cover" /> : <Camera className="text-slate-400" size={24} />}
                                </div>
                                <div>
                                    <label className="bg-white border border-slate-200 hover:bg-slate-50 text-sm font-bold px-3 py-2 rounded-lg cursor-pointer transition inline-block text-slate-700">
                                        {uploading ? 'Subiendo...' : 'Subir Foto'}
                                        <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} disabled={uploading} />
                                    </label>
                                    <p className="text-xs text-slate-400 mt-1">Opcional. Formatos: JPG, PNG.</p>
                                </div>
                            </div>
                            <Input label="Nombre" value={person.firstName} onChange={v => setPerson({ ...person, firstName: v })} required />
                            <Input label="Apellido" value={person.lastName} onChange={v => setPerson({ ...person, lastName: v })} required />
                            <Input label="DNI" value={person.dni} onChange={v => setPerson({ ...person, dni: v })} required />
                            <Input label="CUIL" value={person.cuil} onChange={v => setPerson({ ...person, cuil: v })} />
                            <Input type="email" label="Email" value={person.email} onChange={v => setPerson({ ...person, email: v })} required={type === 'teacher'} />
                            <Input label="Teléfono" value={person.phone} onChange={v => setPerson({ ...person, phone: v })} />
                            <div className="col-span-2"><Input label="Dirección" value={person.address} onChange={v => setPerson({ ...person, address: v })} /></div>
                            <div className="col-span-2"><label className="block text-sm font-medium text-slate-700 mb-1">Comentarios</label><textarea className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg p-2 text-sm h-20" value={person.comments} onChange={e => setPerson({ ...person, comments: e.target.value })}></textarea></div>
                        </div>
                        <button type="submit" className="w-full bg-slate-800 text-white py-2 rounded-lg font-bold">Guardar</button>
                    </form>
                </Modal>
            )}
        </div>
    );
};

export default PeopleManager;
