import React, { useState, useMemo } from 'react';
import { updateDoc, addDoc, deleteDoc, doc, collection } from 'firebase/firestore';
import { FileSpreadsheet, Printer, CheckCircle, PlusCircle, Eye, Edit, Trash2, Search, X, BarChart2, List, Award, Medal } from 'lucide-react';
import { db, appId } from '../services/firebase';
import { DAYS_OF_WEEK, MONTHS } from '../constants';
import { eachDayOfInterval, format, parseISO } from 'date-fns';
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

// Convierte definiciones de feriados/recesos en un Set de strings 'YYYY-MM-DD'
const getFlatHolidayDates = (holidays) => {
    const dates = new Set();
    if (!holidays) return dates;
    holidays.forEach(h => {
        try {
            const start = parseISO(h.startDate);
            const end = parseISO(h.endDate || h.startDate);
            const range = eachDayOfInterval({ start, end });
            range.forEach(d => dates.add(format(d, 'yyyy-MM-dd')));
        } catch (e) {
            console.error("Feriado inválido", h);
        }
    });
    return dates;
};

// Calcula la fecha de fin basada en horas del curso, horas por encuentro, y los días de la semana
const calculateEndDate = (startDateStr, totalHours, hoursPerMeeting, selectedDays, holidayDates = new Set()) => {
    if (!startDateStr || !totalHours || !hoursPerMeeting || !selectedDays || selectedDays.length === 0) return '';
    const sessions = Math.ceil(Number(totalHours) / Number(hoursPerMeeting));
    let date = new Date(startDateStr + 'T12:00:00');
    let sessionCount = 0;
    let iterations = 0;
    while (sessionCount < sessions && iterations < 1000) {
        const dateStr = date.toISOString().split('T')[0];
        const isHoliday = holidayDates.has(dateStr);
        
        if (selectedDays.includes(date.getDay()) && !isHoliday) {
            sessionCount++;
        }
        if (sessionCount < sessions) {
            date.setDate(date.getDate() + 1);
        }
        iterations++;
    }
    return date.toISOString().split('T')[0];
};

// --- Certificate Component ---
const Certificate = ({ student, cohort, course, onClose }) => {
    const today = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full relative overflow-hidden" id="certificate-print-area">
                {/* Decorative border */}
                <div className="absolute inset-0 border-[16px] border-double border-amber-200/60 rounded-2xl pointer-events-none" />
                <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-blue-700 via-blue-500 to-blue-700" />
                <div className="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-r from-blue-700 via-blue-500 to-blue-700" />

                <div className="p-12 text-center">
                    {/* Header */}
                    <div className="flex items-center justify-center gap-3 mb-2">
                        <Medal size={32} className="text-amber-500" />
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Centro de Formación Profesional</p>
                        <Medal size={32} className="text-amber-500" />
                    </div>

                    <h1 className="text-4xl font-black text-blue-800 tracking-tight mt-2 mb-1">Certificado de Finalización</h1>
                    <div className="w-24 h-1 bg-amber-400 mx-auto my-4 rounded-full" />

                    <p className="text-slate-500 text-sm mb-6">Se certifica que</p>

                    <h2 className="text-5xl font-black text-slate-800 mb-2" style={{ fontFamily: 'Georgia, serif' }}>
                        {student.firstName} {student.lastName}
                    </h2>
                    <p className="text-slate-500 text-sm mb-6">DNI: {student.dni}</p>

                    <p className="text-slate-600 text-lg mb-2">ha completado satisfactoriamente el curso de</p>

                    <h3 className="text-3xl font-bold text-blue-700 mb-2">{course?.name || 'Curso'}</h3>

                    {course?.totalHours && (
                        <p className="text-slate-500 text-sm mb-6">con una carga horaria de <strong>{course.totalHours} horas reloj</strong></p>
                    )}

                    {cohort?.endDate && (
                        <p className="text-slate-500 text-sm mb-8">Período: {cohort.startDate} — {cohort.endDate}</p>
                    )}

                    <div className="w-24 h-1 bg-amber-400 mx-auto my-4 rounded-full" />

                    {/* Signatures */}
                    <div className="grid grid-cols-2 gap-16 mt-8 pt-4">
                        <div className="flex flex-col items-center">
                            <div className="h-px w-48 bg-slate-400 mb-2" />
                            <p className="text-sm font-bold text-slate-700">Firma del Docente</p>
                            <p className="text-xs text-slate-400">Aclaración</p>
                        </div>
                        <div className="flex flex-col items-center">
                            <div className="h-px w-48 bg-slate-400 mb-2" />
                            <p className="text-sm font-bold text-slate-700">Sello / Firma Institución</p>
                            <p className="text-xs text-slate-400">Aclaración</p>
                        </div>
                    </div>

                    <p className="text-xs text-slate-300 mt-8">{today}</p>
                </div>
            </div>

            <div className="absolute bottom-8 flex gap-3 no-print">
                <button onClick={() => window.print()} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg">
                    <Printer size={18} /> Imprimir / Guardar PDF
                </button>
                <button onClick={onClose} className="flex items-center gap-2 bg-white text-slate-700 px-6 py-3 rounded-xl font-bold border hover:bg-slate-50 shadow-lg">
                    <X size={18} /> Cerrar
                </button>
            </div>
        </div>
    );
};

// --- Gantt View ---
const GanttView = ({ cohorts, courses }) => {
    // Build dynamic timeline from actual cohort dates
    const validCohorts = cohorts.filter(c => c.startDate);
    if (validCohorts.length === 0) {
        return (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center text-slate-400 text-sm">
                No hay cohortes con fechas definidas para mostrar en el cronograma.
            </div>
        );
    }

    const allStarts = validCohorts.map(c => new Date(c.startDate + 'T12:00:00'));
    const allEnds = validCohorts.map(c => new Date((c.endDate || c.startDate) + 'T12:00:00'));
    const minDate = new Date(Math.min(...allStarts));
    const maxDate = new Date(Math.max(...allEnds));

    // Build list of { year, month } columns
    const timelineColumns = [];
    const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    const endCursor = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
    while (cursor <= endCursor) {
        timelineColumns.push({ year: cursor.getFullYear(), month: cursor.getMonth() });
        cursor.setMonth(cursor.getMonth() + 1);
    }
    const totalCols = timelineColumns.length;

    // Helper: convert a date to a fractional column index in the timeline
    const dateToColPct = (date) => {
        const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        const colIndex = (date.getFullYear() - minDate.getFullYear()) * 12 + (date.getMonth() - minDate.getMonth());
        return ((colIndex + (date.getDate() - 1) / daysInMonth) / totalCols) * 100;
    };

    // Group columns by year for headers
    const yearGroups = [];
    timelineColumns.forEach(col => {
        const last = yearGroups[yearGroups.length - 1];
        if (last && last.year === col.year) { last.count++; }
        else yearGroups.push({ year: col.year, count: 1 });
    });

    const colorPalette = [
        'bg-blue-500', 'bg-emerald-500', 'bg-orange-400',
        'bg-violet-500', 'bg-rose-500', 'bg-cyan-600',
        'bg-amber-500', 'bg-teal-500', 'bg-indigo-500', 'bg-pink-500'
    ];

    const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    const colWidth = Math.max(56, Math.min(80, Math.floor(900 / totalCols)));

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-auto">
            <div style={{ minWidth: `${220 + totalCols * colWidth}px` }}>

                {/* Header row 1: Years */}
                <div className="flex border-b border-slate-200 bg-slate-800 sticky top-0 z-20">
                    <div className="flex-none w-[220px] p-2 text-xs font-bold text-slate-300 uppercase border-r border-slate-600 flex items-center">
                        Cohorte
                    </div>
                    {yearGroups.map((yg, i) => (
                        <div
                            key={i}
                            className="text-center font-black text-white text-sm py-2 border-l border-slate-600 flex items-center justify-center"
                            style={{ width: `${yg.count * colWidth}px`, flexShrink: 0 }}
                        >
                            {yg.year}
                        </div>
                    ))}
                </div>

                {/* Header row 2: Months */}
                <div className="flex border-b border-slate-200 bg-slate-50 sticky top-[37px] z-10">
                    <div className="flex-none w-[220px] p-2 border-r border-slate-200" />
                    {timelineColumns.map((col, i) => (
                        <div
                            key={i}
                            className="text-center text-[10px] font-bold text-slate-400 uppercase py-2 border-l border-slate-200 flex-shrink-0"
                            style={{ width: `${colWidth}px` }}
                        >
                            {MONTH_SHORT[col.month]}
                        </div>
                    ))}
                </div>

                {/* Cohort rows */}
                {validCohorts.map((cohort, idx) => {
                    const course = courses.find(c => c.id === cohort.courseId);
                    const start = new Date(cohort.startDate + 'T12:00:00');
                    const end = new Date((cohort.endDate || cohort.startDate) + 'T12:00:00');

                    const leftPct = dateToColPct(start);
                    const rightPct = 100 - dateToColPct(end);

                    const color = colorPalette[idx % colorPalette.length];
                    const daysLabel = cohort.days?.length > 0
                        ? cohort.days.map(d => ['', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'][d]).join('·')
                        : null;
                    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());

                    return (
                        <div key={cohort.id} className="flex border-b border-slate-100 hover:bg-slate-50" style={{ minHeight: '52px' }}>
                            {/* Label */}
                            <div className="flex-none w-[220px] p-3 border-r border-slate-100 flex flex-col justify-center">
                                <div className="font-bold text-xs text-slate-800 truncate">{course?.name || 'Sin curso'}</div>
                                <div className="text-[10px] text-slate-400 mt-0.5 flex flex-wrap gap-1">
                                    {daysLabel && <span>{daysLabel}</span>}
                                    {cohort.hoursPerMeeting && <span>· {cohort.hoursPerMeeting}hs</span>}
                                    {months > 0 && <span className="text-blue-500 font-semibold">· {months} {months === 1 ? 'mes' : 'meses'}</span>}
                                </div>
                            </div>

                            {/* Timeline bar */}
                            <div className="flex-1 relative" style={{ minHeight: '52px' }}>
                                {/* Grid lines */}
                                <div className="absolute inset-0 flex pointer-events-none">
                                    {timelineColumns.map((_, i) => (
                                        <div key={i} className="border-l border-slate-100 h-full flex-shrink-0" style={{ width: `${colWidth}px` }} />
                                    ))}
                                </div>
                                {/* Continuous bar */}
                                <div
                                    className={`absolute top-1/2 -translate-y-1/2 ${color} flex items-center overflow-hidden shadow-sm`}
                                    style={{
                                        left: `calc(${leftPct}% + 2px)`,
                                        right: `calc(${Math.max(0, rightPct)}% + 2px)`,
                                        height: '30px',
                                        borderRadius: '6px',
                                    }}
                                    title={`${course?.name} | ${cohort.startDate} → ${cohort.endDate}${course?.totalHours ? ' | ' + course.totalHours + ' hs' : ''}`}
                                >
                                    <span className="px-3 text-white text-[10px] font-bold whitespace-nowrap overflow-hidden text-ellipsis select-none">
                                        {course?.name}{course?.totalHours ? ` · ${course.totalHours}hs` : ''}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};




// --- Cohort Detail ---

const CohortDetail = ({ cohort, course, teacher, enrolled, attendanceLogs, onBack }) => {
    const [attendanceHistoryStudent, setAttendanceHistoryStudent] = useState(null);
    const [certificateStudent, setCertificateStudent] = useState(null);

    const handleToggleDoc = async (studentId) => {
        const currentDocs = cohort.documentationStatus || {};
        const newStatus = !currentDocs[studentId];
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cohorts', cohort.id), { [`documentationStatus.${studentId}`]: newStatus });
    };

    const handleToggleApproval = async (studentId) => {
        const current = cohort.approvalMap || {};
        const newStatus = !current[studentId];
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cohorts', cohort.id), { [`approvalMap.${studentId}`]: newStatus });
    };

    const handleExportList = () => {
        const rows = [["Nombre", "Apellido", "DNI", "CUIL", "Email", "Documentacion", "Ausencias", "Estado"]];
        enrolled.forEach(s => {
            const studentLogs = attendanceLogs.filter(l => l.cohortId === cohort.id);
            const absences = studentLogs.filter(l => !l.presentIds?.includes(s.id)).length;
            const approved = cohort.approvalMap?.[s.id] ? "APROBADO" : "EN CURSO";
            rows.push([s.firstName, s.lastName, s.dni, s.cuil || '-', s.email, cohort.documentationStatus?.[s.id] ? "SI" : "NO", absences, approved]);
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

    const teacherDisplayName = teacher
        ? (teacher.firstName && teacher.lastName ? `${teacher.firstName} ${teacher.lastName}` : teacher.name || 'Sin asignar')
        : 'Sin asignar';

    return (
        <div className="w-full bg-white p-8 min-h-screen animate-in slide-in-from-right duration-200 print:p-0">
            {certificateStudent && (
                <Certificate
                    student={certificateStudent}
                    cohort={cohort}
                    course={course}
                    onClose={() => setCertificateStudent(null)}
                />
            )}

            <div className="flex justify-between items-center mb-8 no-print">
                <button onClick={onBack} className="flex items-center text-slate-500 hover:text-slate-800 gap-2 font-medium"><span className="text-lg">←</span> Volver</button>
                <div className="flex gap-3">
                    <button onClick={handleExportList} className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100"><FileSpreadsheet size={18} /> Exportar</button>
                    <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900"><Printer size={18} /> Imprimir</button>
                </div>
            </div>
            <div className="mb-8 pb-6 border-b border-slate-100">
                <h2 className="text-3xl font-bold text-slate-800 mb-2">{course?.name}</h2>
                <div className="flex flex-wrap gap-6 text-sm text-slate-600">
                    <p><strong>Docente:</strong> {teacherDisplayName}</p>
                    <p><strong>Fechas:</strong> {cohort.startDate} — {cohort.endDate || 'Sin definir'}</p>
                    {cohort.days?.length > 0 && <p><strong>Días:</strong> {cohort.days.map(d => ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][d]).join(', ')}</p>}
                    {cohort.hoursPerMeeting && <p><strong>Horas/Encuentro:</strong> {cohort.hoursPerMeeting} hs.</p>}
                    {course?.totalHours && <p><strong>Total Horas:</strong> {course.totalHours} hs. reloj</p>}
                    <p><strong>Inscriptos:</strong> {enrolled.length}</p>
                </div>
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-4">Lista de Alumnos</h3>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-100 text-slate-600 uppercase text-xs font-bold">
                        <tr>
                            <th className="p-3">Nombre</th>
                            <th className="p-3">Apellido</th>
                            <th className="p-3">DNI / CUIL</th>
                            <th className="p-3">Contacto</th>
                            <th className="p-3 text-center">Ausencias</th>
                            <th className="p-3 text-center">Documentación</th>
                            <th className="p-3 text-center">Estado Final</th>
                            <th className="p-3 text-center no-print">Certificado</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {enrolled.map(s => {
                            const docOk = cohort.documentationStatus?.[s.id];
                            const approved = cohort.approvalMap?.[s.id];
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
                                    <td className="p-3 text-center no-print">
                                        <button onClick={() => handleToggleDoc(s.id)} className={`px-3 py-1 rounded-full text-xs font-bold flex items-center justify-center gap-1 w-24 mx-auto transition ${docOk ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
                                            {docOk ? <><CheckCircle size={12} />OK</> : "Pendiente"}
                                        </button>
                                    </td>
                                    <td className="p-3 text-center">
                                        <button onClick={() => handleToggleApproval(s.id)} className={`px-3 py-1 rounded-full text-xs font-bold inline-flex items-center justify-center gap-1 w-28 transition ${approved ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
                                            {approved ? <><Award size={12} /> Aprobado</> : "En Curso"}
                                        </button>
                                    </td>
                                    <td className="p-3 text-center no-print">
                                        {approved ? (
                                            <button onClick={() => setCertificateStudent(s)} className="flex items-center gap-1 px-3 py-1 bg-amber-50 text-amber-700 rounded-lg text-xs font-bold hover:bg-amber-100 mx-auto transition">
                                                <Medal size={14} /> Diploma
                                            </button>
                                        ) : (
                                            <span className="text-slate-300 text-xs">—</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
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
};

// --- Main Cohorts Manager ---
const CohortsManager = ({ cohorts, courses, teachers, students, attendanceLogs, holidays }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(null);
    const [viewDetailId, setViewDetailId] = useState(null);
    const [viewMode, setViewMode] = useState('list'); // 'list' | 'gantt'
    const [showFinished, setShowFinished] = useState(false);
    const [formData, setFormData] = useState({ courseId: '', teacherId: '', startDate: '', endDate: '', hoursPerMeeting: '', days: [], studentIds: [] });
    const [searchTermStudent, setSearchTermStudent] = useState('');
    const [searchTermTeacher, setSearchTermTeacher] = useState('');

    const activeCourses = courses.filter(c => !c.archived);
    const now = new Date();
    const ganttCohorts = cohorts.filter(c => {
        if (!c.endDate) return true; // no end date → consider active
        return showFinished || new Date(c.endDate) >= now;
    });

    const filteredTeachers = teachers.filter(t =>
        ((t.firstName || '') + ' ' + (t.lastName || '') + (t.name || '')).toLowerCase().includes(searchTermTeacher.toLowerCase()) ||
        (t.dni || '').includes(searchTermTeacher)
    );
    const availableStudents = students.filter(s =>
        !formData.studentIds.includes(s.id) &&
        (((s.firstName || '') + ' ' + (s.lastName || '') + (s.name || '')).toLowerCase().includes(searchTermStudent.toLowerCase()) || (s.dni || '').includes(searchTermStudent))
    );
    const selectedStudentsData = students.filter(s => formData.studentIds.includes(s.id));

    const holidayDates = useMemo(() => getFlatHolidayDates(holidays), [holidays]);

    // Auto-calculate end date when relevant fields change
    const handleFormChange = (changes) => {
        const newForm = { ...formData, ...changes };
        const selectedCourse = courses.find(c => c.id === newForm.courseId);
        if (newForm.startDate && selectedCourse?.totalHours && newForm.hoursPerMeeting && newForm.days?.length > 0) {
            newForm.endDate = calculateEndDate(newForm.startDate, selectedCourse.totalHours, newForm.hoursPerMeeting, newForm.days, holidayDates);
        }
        setFormData(newForm);
    };

    const toggleDay = (dayValue) => {
        const current = formData.days || [];
        const updated = current.includes(dayValue) ? current.filter(d => d !== dayValue) : [...current, dayValue];
        handleFormChange({ days: updated });
    };

    if (viewDetailId) {
        const cohort = cohorts.find(c => c.id === viewDetailId);
        if (!cohort) { setViewDetailId(null); return null; }
        const course = courses.find(c => c.id === cohort.courseId);
        const teacher = teachers.find(t => t.id === cohort.teacherId);
        const enrolled = students.filter(s => cohort.studentIds?.includes(s.id));
        return <CohortDetail cohort={cohort} course={course} teacher={teacher} enrolled={enrolled} attendanceLogs={attendanceLogs} onBack={() => setViewDetailId(null)} />;
    }

    const resetForm = () => { setFormData({ courseId: '', teacherId: '', startDate: '', endDate: '', hoursPerMeeting: '', days: [], studentIds: [] }); setIsEditing(null); setIsModalOpen(false); setSearchTermStudent(''); setSearchTermTeacher(''); };
    const openEdit = (cohort) => { setIsEditing(cohort.id); setFormData({ days: [], ...cohort }); setIsModalOpen(true); };
    const handleDelete = async (cohortId) => { if (confirm("¿Eliminar?")) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cohorts', cohortId)); };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!formData.courseId || !formData.startDate) return alert("Faltan datos");
        try {
            if (isEditing) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cohorts', isEditing), formData);
            else await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'cohorts'), formData);
            resetForm();
        } catch (err) { console.error(err); alert("Error: " + err.message); }
    };

    const addStudent = (studentId) => { if (!formData.studentIds.includes(studentId)) { handleFormChange({ studentIds: [...formData.studentIds, studentId] }); setSearchTermStudent(''); } };
    const removeStudent = (studentId) => { handleFormChange({ studentIds: formData.studentIds.filter(id => id !== studentId) }); };
    const selectTeacher = (teacherId) => { handleFormChange({ teacherId }); setSearchTermTeacher(''); };

    return (
        <div className="w-full">
            <div className="flex justify-between items-center mb-6 no-print">
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1">
                    <button onClick={() => setViewMode('list')} className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition ${viewMode === 'list' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                        <List size={15} /> Lista
                    </button>
                    <button onClick={() => setViewMode('gantt')} className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition ${viewMode === 'gantt' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                        <BarChart2 size={15} /> Cronograma
                    </button>
                </div>
                <button onClick={() => { resetForm(); setIsModalOpen(true); }} className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 shadow-sm transition">
                    <PlusCircle size={18} /> Iniciar Nueva Cohorte
                </button>
            </div>

            {viewMode === 'gantt' ? (
                <div className="space-y-3">
                    <div className="flex items-center justify-end">
                        <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                            <input
                                type="checkbox"
                                checked={showFinished}
                                onChange={e => setShowFinished(e.target.checked)}
                                className="accent-orange-500 w-4 h-4"
                            />
                            Mostrar cohortes finalizadas
                        </label>
                    </div>
                    <GanttView cohorts={ganttCohorts} courses={courses} />
                </div>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm w-full bg-white">
                    <table className="w-full bg-white text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                            <tr><th className="p-4">Curso</th><th className="p-4">Docente</th><th className="p-4">Fechas</th><th className="p-4">Días / Horas</th><th className="p-4 text-center">Inscriptos</th><th className="p-4">Estado</th><th className="p-4 text-right no-print">Acciones</th></tr>
                        </thead>
                        <tbody>
                            {cohorts.map(c => {
                                const courseName = courses.find(x => x.id === c.courseId)?.name || 'Curso Eliminado/Archivado';
                                const teacherData = teachers.find(x => x.id === c.teacherId);
                                const teacherName = teacherData
                                    ? (teacherData.firstName && teacherData.lastName ? `${teacherData.firstName} ${teacherData.lastName}` : teacherData.name || 'Sin Asignar')
                                    : 'Sin Asignar';
                                const isActive = !c.endDate || new Date(c.endDate) > new Date();
                                const daysLabel = c.days?.length > 0 ? c.days.map(d => ['', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'][d]).join('-') : '—';
                                return (
                                    <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                        <td className="p-4 font-semibold text-slate-800">{courseName}</td>
                                        <td className="p-4">{teacherName}</td>
                                        <td className="p-4 text-slate-600 text-xs">
                                            <span>{c.startDate}</span><br />
                                            <span>{c.endDate}</span>
                                            {c.startDate && c.endDate && (() => {
                                                const start = new Date(c.startDate + 'T12:00:00');
                                                const end = new Date(c.endDate + 'T12:00:00');
                                                const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
                                                const weeks = Math.round((end - start) / (1000 * 60 * 60 * 24 * 7));
                                                return <span className="inline-block mt-1 px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-bold text-[10px]">
                                                    {months > 0 ? `${months} mes${months !== 1 ? 'es' : ''}` : `${weeks} sem.`}
                                                </span>;
                                            })()}
                                        </td>
                                        <td className="p-4 text-slate-500 text-xs">{daysLabel}<br />{c.hoursPerMeeting ? `${c.hoursPerMeeting}hs/encuentro` : ''}</td>
                                        <td className="p-4 text-center"><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-full text-xs font-bold">{c.studentIds?.length || 0}</span></td>
                                        <td className="p-4"><span className={`px-2 py-1 rounded text-xs font-bold ${isActive ? 'text-green-600 bg-green-100' : 'text-slate-500 bg-slate-100'}`}>{isActive ? 'En Curso' : 'Finalizado'}</span></td>
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
            )}

            {isModalOpen && (
                <Modal title={isEditing ? "Editar Cohorte" : "Lanzar Cohorte"} onClose={resetForm}>
                    <form onSubmit={handleSave} className="space-y-4">
                        {/* Course */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Curso</label>
                            <select className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg p-2" value={formData.courseId} onChange={e => handleFormChange({ courseId: e.target.value })}>
                                <option value="">Seleccionar...</option>
                                {activeCourses.map(c => <option key={c.id} value={c.id}>{c.name} {c.totalHours ? `(${c.totalHours}hs)` : ''}</option>)}
                            </select>
                        </div>

                        {/* Schedule */}
                        <div className="grid grid-cols-2 gap-4">
                            <Input type="number" label="Horas por Encuentro" value={formData.hoursPerMeeting} onChange={v => handleFormChange({ hoursPerMeeting: v })} />
                            <Input type="date" label="Fecha de Inicio" value={formData.startDate} onChange={v => handleFormChange({ startDate: v })} />
                        </div>

                        {/* Days of week */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Días de Dictado</label>
                            <div className="flex flex-wrap gap-2">
                                {DAYS_OF_WEEK.map(day => (
                                    <button type="button" key={day.value} onClick={() => toggleDay(day.value)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${(formData.days || []).includes(day.value) ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-500 border-slate-300 hover:border-orange-300'}`}>
                                        {day.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* End Date (auto-calculated, but editable) */}
                        <div>
                            <Input type="date" label="Fecha de Fin (calculada automáticamente)" value={formData.endDate} onChange={v => setFormData({ ...formData, endDate: v })} />
                            {formData.endDate && formData.startDate && (
                                <p className="text-xs text-slate-400 mt-1">
                                    Duración estimada: {Math.round((new Date(formData.endDate) - new Date(formData.startDate)) / (1000 * 60 * 60 * 24 * 7))} semanas
                                </p>
                            )}
                        </div>

                        {/* Teacher */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Docente</label>
                            {formData.teacherId ? (
                                <div className="flex justify-between items-center p-2 bg-blue-50 border border-blue-200 rounded-lg">
                                    <span className="text-sm font-medium text-blue-800">
                                        {teachers.find(t => t.id === formData.teacherId)?.firstName || teachers.find(t => t.id === formData.teacherId)?.name || 'Docente'}{' '}
                                        {teachers.find(t => t.id === formData.teacherId)?.lastName || ''}
                                    </span>
                                    <button type="button" onClick={() => handleFormChange({ teacherId: '' })} className="text-blue-500 hover:text-blue-700"><X size={16} /></button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <div className="flex items-center border border-slate-300 rounded-lg bg-white p-2 focus-within:ring-2 focus-within:ring-blue-500">
                                        <Search size={16} className="text-slate-400 mr-2" />
                                        <input type="text" placeholder="Buscar docente..." className="w-full outline-none text-sm bg-transparent text-slate-900" value={searchTermTeacher} onChange={e => setSearchTermTeacher(e.target.value)} />
                                    </div>
                                    {searchTermTeacher && (
                                        <div className="absolute z-10 mt-1 w-full bg-white border shadow-lg rounded-lg max-h-40 overflow-y-auto">
                                            {filteredTeachers.map(t => (
                                                <div key={t.id} onClick={() => selectTeacher(t.id)} className="p-2 hover:bg-slate-50 cursor-pointer text-sm border-b last:border-0">
                                                    <div className="font-medium text-slate-900">{t.firstName || t.name} {t.lastName || ''}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Students */}
                        <div className="border-t pt-4">
                            <label className="block text-sm font-medium text-slate-700 mb-2">Inscribir Alumnos</label>
                            <div className="relative mb-3">
                                <div className="flex items-center border border-slate-300 rounded-lg bg-white p-2 focus-within:ring-2 focus-within:ring-orange-500">
                                    <Search size={16} className="text-slate-400 mr-2" />
                                    <input type="text" placeholder="Buscar alumno..." className="w-full outline-none text-sm bg-transparent text-slate-900" value={searchTermStudent} onChange={e => setSearchTermStudent(e.target.value)} />
                                </div>
                                {searchTermStudent && (
                                    <div className="absolute z-10 mt-1 w-full bg-white border shadow-lg rounded-lg max-h-40 overflow-y-auto">
                                        {availableStudents.map(s => (
                                            <div key={s.id} onClick={() => addStudent(s.id)} className="p-2 hover:bg-orange-50 cursor-pointer text-sm border-b last:border-0">
                                                <div className="font-medium text-slate-900">{s.firstName || s.name} {s.lastName || ''}</div>
                                                <div className="text-xs text-slate-500">{s.dni}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="bg-slate-50 p-2 rounded-lg border min-h-[80px] max-h-[160px] overflow-y-auto">
                                <div className="flex flex-wrap gap-2">
                                    {selectedStudentsData.map(s => (
                                        <span key={s.id} className="inline-flex items-center gap-1 px-2 py-1 bg-white border shadow-sm rounded-full text-xs font-medium text-slate-700">
                                            {s.firstName || s.name} {s.lastName || ''}
                                            <button type="button" onClick={() => removeStudent(s.id)} className="text-slate-400 hover:text-red-500 ml-1"><X size={14} /></button>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <button type="submit" className="w-full bg-orange-500 text-white py-2 rounded-lg font-bold hover:bg-orange-600">Guardar</button>
                    </form>
                </Modal>
            )}
        </div>
    );
};

export default CohortsManager;
