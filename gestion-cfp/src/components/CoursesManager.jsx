import React, { useState, useMemo } from 'react';
import { updateDoc, addDoc, deleteDoc, doc, collection, getDocs } from 'firebase/firestore';
import {
    Eye, EyeOff, PlusCircle, RefreshCw, Edit, Trash2,
    Sparkles, Loader, Megaphone, Search, LayoutGrid,
    List, Clock, ArrowUpDown, X
} from 'lucide-react';
import { db, appId } from '../services/firebase';
import { callGemini } from '../services/ai';
import { COURSE_TYPES } from '../constants';
import Modal from './Modal';
import Input from './Input';
import CourseFlyer from './CourseFlyer';

const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

const TYPE_STYLES = {
    CFP:   'bg-blue-100 text-blue-700',
    ACCFP: 'bg-indigo-100 text-indigo-700',
    AC:    'bg-emerald-100 text-emerald-700',
};

const SORT_OPTIONS = [
    { value: 'name_asc',   label: 'Nombre (A–Z)' },
    { value: 'name_desc',  label: 'Nombre (Z–A)' },
    { value: 'hours_desc', label: 'Más horas primero' },
    { value: 'hours_asc',  label: 'Menos horas primero' },
    { value: 'type',       label: 'Por tipo' },
];

// ─── Card view ───────────────────────────────────────────────────────────────
const CourseCard = ({ c, onFlyer, onEdit, onDelete, onRestore }) => (
    <div className={`bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col transition hover:shadow-md ${c.archived ? 'opacity-60' : ''}`}>
        <div className="flex justify-between items-start mb-3 gap-3">
            <h3 className="font-bold text-slate-800 text-base leading-snug">{c.name}</h3>
            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full flex-shrink-0 ${TYPE_STYLES[c.type] || 'bg-slate-100 text-slate-600'}`}>
                {c.type}
            </span>
        </div>
        {c.totalHours && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-3">
                <Clock size={12} />
                <span>{c.totalHours} hs. reloj</span>
            </div>
        )}
        <p className="text-sm text-slate-500 line-clamp-3 flex-1 mb-4">{c.content || <span className="italic text-slate-300">Sin descripción</span>}</p>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 mt-auto">
            {c.archived ? (
                <button onClick={() => onRestore(c.id)} title="Restaurar" className="flex items-center gap-1 text-green-600 hover:bg-green-50 px-2 py-1 rounded text-xs font-bold">
                    <RefreshCw size={14} /> Restaurar
                </button>
            ) : (
                <>
                    <button title="Generar Flyer" onClick={() => onFlyer(c)} className="flex items-center gap-1 text-orange-500 hover:bg-orange-50 px-2 py-1 rounded text-xs font-bold">
                        <Megaphone size={14} /> Flyer
                    </button>
                    <button onClick={() => onEdit(c)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded"><Edit size={15} /></button>
                    <button onClick={() => onDelete(c.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={15} /></button>
                </>
            )}
        </div>
    </div>
);

// ─── List row ────────────────────────────────────────────────────────────────
const CourseRow = ({ c, onFlyer, onEdit, onDelete, onRestore }) => (
    <tr className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 transition ${c.archived ? 'opacity-60' : ''}`}>
        <td className="px-4 py-3">
            <p className="font-semibold text-slate-800 text-sm">{c.name}</p>
            {c.content && <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{c.content}</p>}
        </td>
        <td className="px-4 py-3">
            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${TYPE_STYLES[c.type] || 'bg-slate-100 text-slate-600'}`}>
                {c.type}
            </span>
        </td>
        <td className="px-4 py-3 text-sm text-slate-500">
            {c.totalHours ? `${c.totalHours} hs` : <span className="text-slate-300">—</span>}
        </td>
        <td className="px-4 py-3 text-right">
            <div className="flex justify-end gap-1">
                {c.archived ? (
                    <button onClick={() => onRestore(c.id)} title="Restaurar" className="flex items-center gap-1 text-green-600 hover:bg-green-50 px-2 py-1 rounded text-xs font-bold">
                        <RefreshCw size={13} /> Restaurar
                    </button>
                ) : (
                    <>
                        <button title="Generar Flyer" onClick={() => onFlyer(c)} className="flex items-center gap-1 text-orange-500 hover:bg-orange-50 px-2 py-1 rounded text-xs font-bold">
                            <Megaphone size={13} /> Flyer
                        </button>
                        <button onClick={() => onEdit(c)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded"><Edit size={14} /></button>
                        <button onClick={() => onDelete(c.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={14} /></button>
                    </>
                )}
            </div>
        </td>
    </tr>
);

// ─── Main Component ──────────────────────────────────────────────────────────
const CoursesManager = ({ courses, cohorts }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [showArchived, setShowArchived] = useState(false);
    const [isEditing, setIsEditing] = useState(null);
    const [newCourse, setNewCourse] = useState({ name: '', type: 'CFP', totalHours: '', content: '', frequency: '', materials: '', defaultCosts: [] });
    const [isGenerating, setIsGenerating] = useState(false);
    const [flyerCourse, setFlyerCourse] = useState(null);

    // View / filter / sort state
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
    const [searchName, setSearchName] = useState('');
    const [filterType, setFilterType] = useState('');
    const [sortBy, setSortBy] = useState('name_asc');

    const handleSave = async (e) => {
        e.preventDefault();
        const duplicate = courses.find(c => c.name.toLowerCase() === newCourse.name.toLowerCase() && c.id !== isEditing);
        if (duplicate) return alert('Ya existe un curso con este nombre.');
        try {
            if (isEditing) {
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'courses', isEditing), newCourse);
                const oldCourse = courses.find(c => c.id === isEditing);
                const defaultsChanged = JSON.stringify(oldCourse?.defaultCosts) !== JSON.stringify(newCourse.defaultCosts);
                if (defaultsChanged) {
                    if (confirm('Has modificado los costos predeterminados.\n¿Deseas aplicar estos nuevos costos predeterminados a TODAS las cohortes existentes de este curso en los presupuestos actuales?')) {
                        const budgetsSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'budgets'));
                        for (const bDoc of budgetsSnap.docs) {
                            const budget = bDoc.data();
                            let changed = false;
                            const newCohorts = (budget.plannedCohorts || []).map(pc => {
                                if (pc.courseId === isEditing) {
                                    changed = true;
                                    const teacherCost = (pc.courseCosts || []).find(c => c.isTeacherCost || c.id === '__teacher__');
                                    const customCosts = (pc.courseCosts || []).filter(c => !c.isDefault && !c.isTeacherCost && c.id !== '__teacher__');
                                    const newDefaults = (newCourse.defaultCosts || []).map(dc => ({ ...dc, id: generateId(), isDefault: true }));
                                    const baseCosts = teacherCost ? [teacherCost] : [];
                                    return { ...pc, courseCosts: [...baseCosts, ...newDefaults, ...customCosts] };
                                }
                                return pc;
                            });
                            if (changed) {
                                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'budgets', bDoc.id), { plannedCohorts: newCohorts });
                            }
                        }
                    }
                }
            } else {
                await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'courses'), { ...newCourse, archived: false });
            }
            setNewCourse({ name: '', type: 'CFP', totalHours: '', content: '', frequency: '', materials: '', defaultCosts: [] });
            setIsEditing(null);
            setIsModalOpen(false);
        } catch (e) { console.error("Error guardando curso:", e); alert('Error guardando curso: ' + e.message); }
    };

    const handleDelete = async (courseId) => {
        const hasCohorts = cohorts.some(c => c.courseId === courseId);
        if (hasCohorts) {
            if (confirm('Este curso tiene cohortes asociadas. ¿Desea ARCHIVARLO?'))
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'courses', courseId), { archived: true });
        } else {
            if (confirm('¿Eliminar permanentemente?'))
                await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'courses', courseId));
        }
    };

    const handleRestore = async (courseId) =>
        updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'courses', courseId), { archived: false });

    const openEdit = (c) => { setNewCourse({ ...c }); setIsEditing(c.id); setIsModalOpen(true); };

    const generateAIContent = async () => {
        if (!newCourse.name) return alert('Ingresa el nombre.');
        setIsGenerating(true);
        const content = await callGemini(`Temario corto para curso "${newCourse.name}" tipo "${newCourse.type}".`);
        setNewCourse(prev => ({ ...prev, content }));
        setIsGenerating(false);
    };

    // ── Compute filtered + sorted list ──
    const displayCourses = useMemo(() => {
        let list = courses.filter(c => (showArchived ? c.archived : !c.archived));

        if (searchName.trim())
            list = list.filter(c => c.name.toLowerCase().includes(searchName.toLowerCase()));

        if (filterType)
            list = list.filter(c => c.type === filterType);

        list = [...list].sort((a, b) => {
            switch (sortBy) {
                case 'name_asc':   return a.name.localeCompare(b.name, 'es');
                case 'name_desc':  return b.name.localeCompare(a.name, 'es');
                case 'hours_desc': return (Number(b.totalHours) || 0) - (Number(a.totalHours) || 0);
                case 'hours_asc':  return (Number(a.totalHours) || 0) - (Number(b.totalHours) || 0);
                case 'type':       return (a.type || '').localeCompare(b.type || '', 'es');
                default:           return 0;
            }
        });

        return list;
    }, [courses, showArchived, searchName, filterType, sortBy]);

    const hasFilters = searchName || filterType;

    return (
        <div className="w-full space-y-4">

            {/* ── Toolbar ── */}
            <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">

                {/* Search */}
                <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                    <input
                        type="text"
                        placeholder="Buscar por nombre..."
                        value={searchName}
                        onChange={e => setSearchName(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {searchName && (
                        <button onClick={() => setSearchName('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                            <X size={14} />
                        </button>
                    )}
                </div>

                {/* Type filter */}
                <select
                    value={filterType}
                    onChange={e => setFilterType(e.target.value)}
                    className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-medium"
                >
                    <option value="">Todos los tipos</option>
                    {COURSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>

                {/* Sort */}
                <div className="flex items-center gap-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <ArrowUpDown size={14} className="text-slate-400" />
                    <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value)}
                        className="bg-transparent outline-none text-slate-700 font-medium"
                    >
                        {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </div>

                {/* View toggle */}
                <div className="flex items-center bg-slate-100 rounded-lg p-1 gap-1">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-1.5 rounded transition ${viewMode === 'grid' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                        title="Vista tarjetas"
                    >
                        <LayoutGrid size={16} />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-1.5 rounded transition ${viewMode === 'list' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                        title="Vista lista"
                    >
                        <List size={16} />
                    </button>
                </div>

                {/* Divider */}
                <div className="w-px h-6 bg-slate-200" />

                {/* Archive toggle */}
                <button
                    onClick={() => setShowArchived(!showArchived)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition border ${showArchived ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                >
                    {showArchived ? <EyeOff size={15} /> : <Eye size={15} />}
                    {showArchived ? 'Archivados' : 'Activos'}
                </button>

                {/* New course */}
                <button
                    onClick={() => { setNewCourse({ name: '', type: 'CFP', totalHours: '', content: '', frequency: '', materials: '' }); setIsEditing(null); setIsModalOpen(true); }}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-blue-700 text-sm font-bold transition ml-auto"
                >
                    <PlusCircle size={16} /> Nuevo Curso
                </button>
            </div>

            {/* ── Results count ── */}
            <div className="flex items-center gap-2 text-xs text-slate-400 px-1">
                <span>{displayCourses.length} curso{displayCourses.length !== 1 ? 's' : ''}</span>
                {hasFilters && (
                    <button
                        onClick={() => { setSearchName(''); setFilterType(''); }}
                        className="flex items-center gap-1 text-blue-500 hover:text-blue-700 font-bold"
                    >
                        <X size={11} /> Limpiar filtros
                    </button>
                )}
            </div>

            {/* ── Empty state ── */}
            {displayCourses.length === 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
                    <Search size={36} className="text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">No se encontraron cursos</p>
                    <p className="text-slate-400 text-sm mt-1">Probá con otro término o filtro</p>
                </div>
            )}

            {/* ── Grid view ── */}
            {viewMode === 'grid' && displayCourses.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {displayCourses.map(c => (
                        <CourseCard
                            key={c.id}
                            c={c}
                            onFlyer={setFlyerCourse}
                            onEdit={openEdit}
                            onDelete={handleDelete}
                            onRestore={handleRestore}
                        />
                    ))}
                </div>
            )}

            {/* ── List view ── */}
            {viewMode === 'list' && displayCourses.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3">Nombre / Contenidos</th>
                                <th className="px-4 py-3">Tipo</th>
                                <th className="px-4 py-3">Horas</th>
                                <th className="px-4 py-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayCourses.map(c => (
                                <CourseRow
                                    key={c.id}
                                    c={c}
                                    onFlyer={setFlyerCourse}
                                    onEdit={openEdit}
                                    onDelete={handleDelete}
                                    onRestore={handleRestore}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ── Flyer modal ── */}
            {flyerCourse && (
                <CourseFlyer
                    course={flyerCourse}
                    cohort={null}
                    teacher={null}
                    onClose={() => setFlyerCourse(null)}
                />
            )}

            {/* ── Edit / New modal ── */}
            {isModalOpen && (
                <Modal title={isEditing ? 'Editar Curso' : 'Nuevo Curso'} onClose={() => setIsModalOpen(false)}>
                    <form onSubmit={handleSave} className="space-y-4">
                        <Input label="Nombre" value={newCourse.name} onChange={v => setNewCourse({ ...newCourse, name: v })} required />
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Tipo</label>
                                <select className="w-full border border-slate-300 bg-white text-slate-900 rounded p-2" value={newCourse.type} onChange={e => setNewCourse({ ...newCourse, type: e.target.value })}>
                                    {COURSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <Input label="Total de Horas Reloj" type="number" value={newCourse.totalHours} onChange={v => setNewCourse({ ...newCourse, totalHours: v })} />
                        </div>
                        
                        <div className="flex justify-end gap-3 pt-4">
                            <button type="button" onClick={generateAIContent} disabled={isGenerating} className="text-xs text-purple-600 font-bold flex items-center gap-1">
                                {isGenerating ? <Loader size={12} className="animate-spin" /> : <Sparkles size={12} />} Autocompletar con IA
                            </button>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Contenidos</label>
                            <textarea
                                className="w-full border border-slate-300 bg-white text-slate-900 rounded p-2 h-28 text-sm"
                                value={newCourse.content}
                                onChange={e => setNewCourse({ ...newCourse, content: e.target.value })}
                                placeholder="Descripción o temario del curso..."
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Materiales / Requisitos</label>
                            <textarea
                                className="w-full border border-slate-300 bg-white text-slate-900 rounded p-2 h-16 text-sm"
                                value={newCourse.materials || ''}
                                onChange={e => setNewCourse({ ...newCourse, materials: e.target.value })}
                                placeholder="Materiales necesarios, requisitos previos..."
                            />
                        </div>

                        <div className="pt-2 border-t border-slate-200 mt-4">
                            <div className="flex justify-between items-center mb-2">
                                <label className="block text-sm font-medium text-slate-800">Costos Predeterminados</label>
                                <button type="button" 
                                    onClick={() => setNewCourse(prev => ({ ...prev, defaultCosts: [...(prev.defaultCosts || []), { id: generateId(), name: '', amount: 0, frequency: 'per_student' }] }))}
                                    className="text-xs font-bold text-blue-600 bg-transparent hover:text-blue-800 flex items-center gap-1 border-0">
                                    <PlusCircle size={14} /> Añadir Costo
                                </button>
                            </div>
                            <div className="space-y-2">
                                {(newCourse.defaultCosts || []).map((cost, idx) => (
                                    <div key={cost.id} className="flex gap-2 items-center bg-slate-50 p-2 rounded border border-slate-200">
                                        <input type="text" placeholder="Ej. Certificación, Materiales" value={cost.name} 
                                            onChange={e => { const nc = [...newCourse.defaultCosts]; nc[idx].name = e.target.value; setNewCourse({...newCourse, defaultCosts: nc}); }} 
                                            className="flex-1 text-xs border border-slate-300 bg-white text-slate-900 p-1.5 rounded" />
                                        <div className="relative w-24">
                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                                            <input type="number" value={cost.amount} 
                                                onChange={e => { const nc = [...newCourse.defaultCosts]; nc[idx].amount = Number(e.target.value); setNewCourse({...newCourse, defaultCosts: nc}); }} 
                                                className="w-full pl-6 pr-2 py-1.5 text-xs border border-slate-300 bg-white text-slate-900 rounded" />
                                        </div>
                                        <select value={cost.frequency} 
                                            onChange={e => { const nc = [...newCourse.defaultCosts]; nc[idx].frequency = e.target.value; setNewCourse({...newCourse, defaultCosts: nc}); }}
                                            className="w-32 text-xs border border-slate-300 p-1.5 rounded bg-white text-slate-900">
                                            <option value="per_student">Por Alumno</option>
                                            <option value="monthly">Mensual</option>
                                            <option value="annual">Anual</option>
                                            <option value="once">Único</option>
                                        </select>
                                        <button type="button" onClick={() => setNewCourse(prev => ({ ...prev, defaultCosts: prev.defaultCosts.filter(c => c.id !== cost.id) }))} 
                                            className="text-red-500 bg-transparent hover:bg-red-50 p-1 rounded flex-shrink-0 border-0"><Trash2 size={14} /></button>
                                    </div>
                                ))}
                                {(newCourse.defaultCosts || []).length === 0 && <p className="text-xs text-slate-400 italic">No hay costos predeterminados definidos.</p>}
                            </div>
                        </div>
                        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold hover:bg-blue-700">Guardar</button>
                    </form>
                </Modal>
            )}
        </div>
    );
};

export default CoursesManager;
