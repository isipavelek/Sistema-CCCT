import React, { useState } from 'react';
import { updateDoc, addDoc, deleteDoc, doc, collection } from 'firebase/firestore';
import { FileSpreadsheet, Printer, CheckCircle, PlusCircle, Eye, Edit, Trash2, Search, X } from 'lucide-react';
import { db, appId } from '../services/firebase';
import Modal from './Modal';
import Input from './Input';

const exportToCSV = (filename, rows) => {
    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

const handlePrint = () => {
    window.print();
};

const CohortsManager = ({ cohorts, courses, teachers, students, attendanceLogs }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(null);
    const [viewDetailId, setViewDetailId] = useState(null);
    const [formData, setFormData] = useState({ courseId: '', teacherId: '', startDate: '', endDate: '', studentIds: [] });
    const [searchTermStudent, setSearchTermStudent] = useState('');
    const [searchTermTeacher, setSearchTermTeacher] = useState('');

    const activeCourses = courses.filter(c => !c.archived);
    const filteredTeachers = teachers.filter(t =>
        (t.firstName + ' ' + t.lastName).toLowerCase().includes(searchTermTeacher.toLowerCase()) ||
        (t.dni || '').includes(searchTermTeacher)
    );
    const availableStudents = students.filter(s =>
        !formData.studentIds.includes(s.id) &&
        ((s.firstName + ' ' + s.lastName).toLowerCase().includes(searchTermStudent.toLowerCase()) || (s.dni || '').includes(searchTermStudent))
    );
    const selectedStudentsData = students.filter(s => formData.studentIds.includes(s.id));

    // Detail View Logic
    if (viewDetailId) {
        const cohort = cohorts.find(c => c.id === viewDetailId);
        if (!cohort) return setViewDetailId(null);
        const course = courses.find(c => c.id === cohort.courseId);
        const teacher = teachers.find(t => t.id === cohort.teacherId);
        const enrolled = students.filter(s => cohort.studentIds?.includes(s.id));

        const [attendanceHistoryStudent, setAttendanceHistoryStudent] = useState(null);

        const handleToggleDoc = async (studentId) => {
            const currentDocs = cohort.documentationStatus || {};
            const newStatus = !currentDocs[studentId];
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cohorts', cohort.id), { [`documentationStatus.${studentId}`]: newStatus });
        };
        const handleExportList = () => {
            const rows = [["Nombre", "Apellido", "DNI", "CUIL", "Email", "Documentacion", "Ausencias"]];
            enrolled.forEach(s => {
                const studentLogs = attendanceLogs.filter(l => l.cohortId === cohort.id);
                const absences = studentLogs.filter(l => !l.presentIds?.includes(s.id)).length;
                rows.push([s.firstName, s.lastName, s.dni, s.cuil || '-', s.email, cohort.documentationStatus?.[s.id] ? "SI" : "NO", absences]);
            });
            exportToCSV(`Lista_Cohorte_${course?.name || 'Curso'}.csv`, rows);
        };

        const getStudentStats = (studentId) => {
            const studentLogs = attendanceLogs.filter(l => l.cohortId === cohort.id);
            const totalClasses = studentLogs.length;
            const absences = studentLogs.filter(l => !l.presentIds?.includes(studentId)).length;
            const history = studentLogs.map(l => ({
                date: l.date,
                present: l.presentIds?.includes(studentId)
            })).sort((a, b) => new Date(b.date) - new Date(a.date));
            return { totalClasses, absences, history };
        };

        return (
            <div className="w-full bg-white p-8 min-h-screen animate-in slide-in-from-right duration-200 print:p-0">
                <div className="flex justify-between items-center mb-8 no-print">
                    <button onClick={() => setViewDetailId(null)} className="flex items-center text-slate-500 hover:text-slate-800 gap-2 font-medium"><span className="text-lg">←</span> Volver</button>
                    <div className="flex gap-3"><button onClick={handleExportList} className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100"><FileSpreadsheet size={18} /> Exportar</button><button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900"><Printer size={18} /> Imprimir</button></div>
                </div>
                <div className="mb-8 pb-6 border-b border-slate-100">
                    <h2 className="text-3xl font-bold text-slate-800 mb-2">{course?.name}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-slate-600"><p><strong>Docente:</strong> {teacher ? `${teacher.firstName} ${teacher.lastName}` : 'Sin asignar'}</p><p><strong>Fechas:</strong> {cohort.startDate} - {cohort.endDate}</p><p><strong>Alumnos:</strong> {enrolled.length}</p></div>
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-4">Lista de Alumnos</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm"><thead className="bg-slate-100 text-slate-600 uppercase text-xs font-bold"><tr><th className="p-3">Nombre</th><th className="p-3">Apellido</th><th className="p-3">DNI / CUIL</th><th className="p-3">Contacto</th><th className="p-3 text-center">Ausencias</th><th className="p-3 text-center">Documentación</th></tr></thead><tbody className="divide-y divide-slate-100">{enrolled.map(s => {
                        const docOk = cohort.documentationStatus?.[s.id];
                        const stats = getStudentStats(s.id);
                        return (
                            <tr key={s.id} className="hover:bg-slate-50">
                                <td className="p-3 font-medium text-slate-800">{s.firstName}</td>
                                <td className="p-3 font-medium text-slate-800">{s.lastName}</td>
                                <td className="p-3 text-slate-500">{s.dni}<br /><span className="text-xs text-slate-400">{s.cuil}</span></td>
                                <td className="p-3 text-slate-500">{s.email}<br /><span className="text-xs">{s.phone}</span></td>
                                <td className="p-3 text-center">
                                    <button onClick={() => setAttendanceHistoryStudent({ ...s, stats })} className="px-3 py-1 rounded bg-red-50 text-red-600 font-bold hover:bg-red-100 transition">
                                        {stats.absences}
                                    </button>
                                </td>
                                <td className="p-3 text-center no-print"><button onClick={() => handleToggleDoc(s.id)} className={`px-3 py-1 rounded-full text-xs font-bold flex items-center justify-center gap-1 w-24 mx-auto transition ${docOk ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>{docOk ? <><CheckCircle size={12} /> OK</> : "Pendiente"}</button></td><td className="p-3 text-center print-only hidden">{docOk ? "ENTREGADO" : "PENDIENTE"}</td>
                            </tr>
                        );
                    })}</tbody></table>
                </div>

                {attendanceHistoryStudent && (
                    <Modal title={`Asistencia: ${attendanceHistoryStudent.firstName} ${attendanceHistoryStudent.lastName}`} onClose={() => setAttendanceHistoryStudent(null)}>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg">
                                <span className="text-sm font-bold text-slate-600">Total Clases: {attendanceHistoryStudent.stats.totalClasses}</span>
                                <span className="text-sm font-bold text-red-600">Ausencias: {attendanceHistoryStudent.stats.absences}</span>
                            </div>
                            <div className="max-h-60 overflow-y-auto border rounded-lg">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-100 text-slate-500 font-bold"><tr><th className="p-2">Fecha</th><th className="p-2 text-right">Estado</th></tr></thead>
                                    <tbody>
                                        {attendanceHistoryStudent.stats.history.map((h, i) => (
                                            <tr key={i} className="border-t">
                                                <td className="p-2">{h.date}</td>
                                                <td className={`p-2 text-right font-bold ${h.present ? 'text-green-600' : 'text-red-600'}`}>{h.present ? 'PRESENTE' : 'AUSENTE'}</td>
                                            </tr>
                                        ))}
                                        {attendanceHistoryStudent.stats.history.length === 0 && <tr><td colSpan="2" className="p-4 text-center text-slate-400">No hay registros de asistencia.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                            <button onClick={() => setAttendanceHistoryStudent(null)} className="w-full bg-slate-800 text-white py-2 rounded-lg font-bold">Cerrar</button>
                        </div>
                    </Modal>
                )}
            </div>
        );
    }

    const resetForm = () => { setFormData({ courseId: '', teacherId: '', startDate: '', endDate: '', studentIds: [] }); setIsEditing(null); setIsModalOpen(false); setSearchTermStudent(''); setSearchTermTeacher(''); }
    const openEdit = (cohort) => { setIsEditing(cohort.id); setFormData({ ...cohort }); setIsModalOpen(true); }
    const handleDelete = async (cohortId) => { if (confirm("¿Eliminar?")) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cohorts', cohortId)); }

    const handleSave = async (e) => {
        e.preventDefault();
        if (!formData.courseId || !formData.startDate) return alert("Faltan datos");
        try {
            if (isEditing) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cohorts', isEditing), formData);
            else await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'cohorts'), formData);
            resetForm();
        } catch (err) { console.error(err); }
    };

    const addStudent = (studentId) => { if (!formData.studentIds.includes(studentId)) { setFormData({ ...formData, studentIds: [...formData.studentIds, studentId] }); setSearchTermStudent(''); } };
    const removeStudent = (studentId) => { setFormData({ ...formData, studentIds: formData.studentIds.filter(id => id !== studentId) }); };
    const selectTeacher = (teacherId) => { setFormData({ ...formData, teacherId }); setSearchTermTeacher(''); }

    return (
        <div className="w-full">
            <div className="flex justify-end mb-6 no-print"><button onClick={() => { resetForm(); setIsModalOpen(true); }} className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 shadow-sm transition"><PlusCircle size={18} /> Iniciar Nueva Cohorte</button></div>
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm w-full bg-white">
                <table className="w-full bg-white text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                        <tr><th className="p-4">Curso</th><th className="p-4">Docente</th><th className="p-4">Fechas</th><th className="p-4 text-center">Inscriptos</th><th className="p-4">Estado</th><th className="p-4 text-right no-print">Acciones</th></tr>
                    </thead>
                    <tbody>
                        {cohorts.map(c => {
                            const courseName = courses.find(x => x.id === c.courseId)?.name || 'Curso Eliminado/Archivado';
                            const teacherData = teachers.find(x => x.id === c.teacherId);
                            const teacherName = teacherData ? `${teacherData.firstName} ${teacherData.lastName}` : 'Sin Asignar';
                            const isActive = new Date(c.endDate) > new Date();
                            return (
                                <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                    <td className="p-4 font-semibold text-slate-800">{courseName}</td><td className="p-4">{teacherName}</td><td className="p-4 text-slate-600">{c.startDate} - {c.endDate}</td><td className="p-4 text-center"><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-full text-xs font-bold">{c.studentIds?.length || 0}</span></td><td className="p-4"><span className={`px-2 py-1 rounded text-xs font-bold ${isActive ? 'text-green-600 bg-green-100' : 'text-slate-500 bg-slate-100'}`}>{isActive ? 'En Curso' : 'Finalizado'}</span></td>
                                    <td className="p-4 text-right no-print">
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => setViewDetailId(c.id)} title="Ver Lista" className="text-slate-600 hover:bg-slate-100 p-1.5 rounded bg-slate-50 border border-slate-200"><Eye size={16} /></button>
                                            <button onClick={() => openEdit(c)} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded"><Edit size={16} /></button>
                                            <button onClick={() => handleDelete(c.id)} className="text-red-600 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16} /></button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {isModalOpen && (
                <Modal title={isEditing ? "Editar Cohorte" : "Lanzar Cohorte"} onClose={resetForm}>
                    <form onSubmit={handleSave} className="space-y-4">
                        <div><label className="block text-sm font-medium text-slate-700 mb-1">Curso</label><select className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg p-2" value={formData.courseId} onChange={e => setFormData({ ...formData, courseId: e.target.value })}><option value="">Seleccionar...</option>{activeCourses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                        <div><label className="block text-sm font-medium text-slate-700 mb-1">Docente</label>{formData.teacherId ? (<div className="flex justify-between items-center p-2 bg-blue-50 border border-blue-200 rounded-lg"><span className="text-sm font-medium text-blue-800">{teachers.find(t => t.id === formData.teacherId) ? `${teachers.find(t => t.id === formData.teacherId).firstName} ${teachers.find(t => t.id === formData.teacherId).lastName}` : 'Desconocido'}</span><button type="button" onClick={() => setFormData({ ...formData, teacherId: '' })} className="text-blue-500 hover:text-blue-700"><X size={16} /></button></div>) : (<div className="relative"><div className="flex items-center border border-slate-300 rounded-lg bg-white p-2 focus-within:ring-2 focus-within:ring-blue-500"><Search size={16} className="text-slate-400 mr-2" /><input type="text" placeholder="Buscar docente..." className="w-full outline-none text-sm bg-transparent text-slate-900" value={searchTermTeacher} onChange={e => setSearchTermTeacher(e.target.value)} /></div>{searchTermTeacher && (<div className="absolute z-10 mt-1 w-full bg-white border shadow-lg rounded-lg max-h-40 overflow-y-auto">{filteredTeachers.map(t => (<div key={t.id} onClick={() => selectTeacher(t.id)} className="p-2 hover:bg-slate-50 cursor-pointer text-sm border-b last:border-0"><div className="font-medium text-slate-900">{t.firstName} {t.lastName}</div></div>))}</div>)}</div>)}</div>
                        <div className="grid grid-cols-2 gap-4"><Input type="date" label="Inicio" value={formData.startDate} onChange={v => setFormData({ ...formData, startDate: v })} /><Input type="date" label="Final" value={formData.endDate} onChange={v => setFormData({ ...formData, endDate: v })} /></div>
                        <div className="border-t pt-4"><label className="block text-sm font-medium text-slate-700 mb-2">Inscribir Alumnos</label><div className="relative mb-3"><div className="flex items-center border border-slate-300 rounded-lg bg-white p-2 focus-within:ring-2 focus-within:ring-orange-500"><Search size={16} className="text-slate-400 mr-2" /><input type="text" placeholder="Buscar alumno..." className="w-full outline-none text-sm bg-transparent text-slate-900" value={searchTermStudent} onChange={e => setSearchTermStudent(e.target.value)} /></div>{searchTermStudent && (<div className="absolute z-10 mt-1 w-full bg-white border shadow-lg rounded-lg max-h-40 overflow-y-auto">{availableStudents.map(s => (<div key={s.id} onClick={() => addStudent(s.id)} className="p-2 hover:bg-orange-50 cursor-pointer text-sm border-b last:border-0"><div className="font-medium text-slate-900">{s.firstName} {s.lastName}</div><div className="text-xs text-slate-500">{s.dni}</div></div>))}</div>)}</div><div className="bg-slate-50 p-2 rounded-lg border min-h-[100px] max-h-[200px] overflow-y-auto"><div className="flex flex-wrap gap-2">{selectedStudentsData.map(s => (<span key={s.id} className="inline-flex items-center gap-1 px-2 py-1 bg-white border shadow-sm rounded-full text-xs font-medium text-slate-700">{s.firstName} {s.lastName}<button type="button" onClick={() => removeStudent(s.id)} className="text-slate-400 hover:text-red-500 ml-1"><X size={14} /></button></span>))}</div></div></div>
                        <button type="submit" className="w-full bg-orange-500 text-white py-2 rounded-lg font-bold hover:bg-orange-600">Guardar</button>
                    </form>
                </Modal>
            )}
        </div>
    );
};

export default CohortsManager;
