import React, { useState } from 'react';
import { updateDoc, addDoc, deleteDoc, doc, collection } from 'firebase/firestore';
import { Eye, EyeOff, PlusCircle, RefreshCw, Edit, Trash2, Sparkles, Loader } from 'lucide-react';
import { db, appId } from '../services/firebase';
import { callGemini } from '../services/ai';
import { COURSE_TYPES } from '../constants';
import Modal from './Modal';
import Input from './Input';

const CoursesManager = ({ courses, cohorts }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [showArchived, setShowArchived] = useState(false);
    const [isEditing, setIsEditing] = useState(null);
    const [newCourse, setNewCourse] = useState({ name: '', type: 'CFP', content: '', frequency: '', materials: '' });
    const [isGenerating, setIsGenerating] = useState(false);

    const handleSave = async (e) => {
        e.preventDefault();
        const duplicate = courses.find(c => c.name.toLowerCase() === newCourse.name.toLowerCase() && c.id !== isEditing);
        if (duplicate) return alert("Ya existe un curso con este nombre.");
        try {
            if (isEditing) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'courses', isEditing), newCourse);
            else await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'courses'), { ...newCourse, archived: false });
            setNewCourse({ name: '', type: 'CFP', content: '', frequency: '', materials: '' });
            setIsEditing(null);
            setIsModalOpen(false);
        } catch (err) { alert("Error guardando curso"); }
    };

    const handleDelete = async (courseId) => {
        const hasCohorts = cohorts.some(c => c.courseId === courseId);
        if (hasCohorts) {
            if (confirm("Este curso tiene cohortes asociadas. ¿Desea ARCHIVARLO?")) {
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'courses', courseId), { archived: true });
            }
        } else {
            if (confirm("¿Eliminar permanentemente?")) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'courses', courseId));
        }
    };

    const handleRestore = async (courseId) => {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'courses', courseId), { archived: false });
    }

    const generateAIContent = async () => {
        if (!newCourse.name) return alert("Ingresa el nombre.");
        setIsGenerating(true);
        const content = await callGemini(`Temario corto para curso "${newCourse.name}" tipo "${newCourse.type}".`);
        setNewCourse(prev => ({ ...prev, content }));
        setIsGenerating(false);
    };

    const filteredCourses = courses.filter(c => showArchived ? c.archived : !c.archived);

    return (
        <div className="w-full">
            <div className="flex justify-between items-center mb-6 no-print">
                <button onClick={() => setShowArchived(!showArchived)} className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg text-sm font-bold text-slate-600">{showArchived ? <EyeOff size={16} /> : <Eye size={16} />} {showArchived ? "Ver Activos" : "Ver Archivados"}</button>
                <button onClick={() => { setNewCourse({ name: '', type: 'CFP', content: '', frequency: '', materials: '' }); setIsEditing(null); setIsModalOpen(true); }} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-blue-700"><PlusCircle size={18} /> Nuevo Curso</button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {filteredCourses.map(c => (
                    <div key={c.id} className={`bg-white p-6 rounded-xl shadow-sm border transition ${c.archived ? 'opacity-70' : ''}`}>
                        <div className="flex justify-between mb-4"><h3 className="font-bold text-lg">{c.name}</h3><span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded font-bold">{c.type}</span></div>
                        <p className="text-sm text-slate-600 line-clamp-3 mb-4">{c.content}</p>
                        <div className="flex justify-end gap-2 border-t pt-4">
                            {c.archived ? (
                                <button onClick={() => handleRestore(c.id)} className="text-green-600 hover:bg-green-50 p-1 rounded"><RefreshCw size={16} /></button>
                            ) : (
                                <>
                                    <button onClick={() => { setNewCourse(c); setIsEditing(c.id); setIsModalOpen(true); }} className="text-blue-600 hover:bg-blue-50 p-1 rounded"><Edit size={16} /></button>
                                    <button onClick={() => handleDelete(c.id)} className="text-red-600 hover:bg-red-50 p-1 rounded"><Trash2 size={16} /></button>
                                </>
                            )}
                        </div>
                    </div>
                ))}
            </div>
            {isModalOpen && (
                <Modal title={isEditing ? "Editar Curso" : "Nuevo Curso"} onClose={() => setIsModalOpen(false)}>
                    <form onSubmit={handleSave} className="space-y-4">
                        <Input label="Nombre" value={newCourse.name} onChange={v => setNewCourse({ ...newCourse, name: v })} required />
                        <div><label className="block text-sm font-medium mb-1">Tipo</label><select className="w-full border border-slate-300 bg-white text-slate-900 rounded p-2" value={newCourse.type} onChange={e => setNewCourse({ ...newCourse, type: e.target.value })}>{COURSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                        <div className="flex justify-end"><button type="button" onClick={generateAIContent} disabled={isGenerating} className="text-xs text-purple-600 font-bold flex items-center gap-1">{isGenerating ? <Loader size={12} className="animate-spin" /> : <Sparkles size={12} />} Autocompletar</button></div>
                        <textarea className="w-full border border-slate-300 bg-white text-slate-900 rounded p-2 h-24 text-sm" value={newCourse.content} onChange={e => setNewCourse({ ...newCourse, content: e.target.value })} placeholder="Contenidos..."></textarea>
                        <button className="w-full bg-blue-600 text-white py-2 rounded font-bold">Guardar</button>
                    </form>
                </Modal>
            )}
        </div>
    );
};

export default CoursesManager;
