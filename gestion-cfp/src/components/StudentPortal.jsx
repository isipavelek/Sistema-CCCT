import React, { useState } from 'react';
import { LogOut, BookOpen, CheckCircle, Clock, Medal, Award, BarChart2 } from 'lucide-react';
import { MONTHS_FULL } from '../constants';

const Certificate = ({ student, cohort, course, onClose }) => {
    const today = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full relative overflow-hidden">
                <div className="absolute inset-0 border-[16px] border-double border-amber-200/60 rounded-2xl pointer-events-none" />
                <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-blue-700 via-blue-500 to-blue-700" />
                <div className="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-r from-blue-700 via-blue-500 to-blue-700" />
                <div className="p-12 text-center">
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
                    {course?.totalHours && <p className="text-slate-500 text-sm mb-6">con una carga horaria de <strong>{course.totalHours} horas reloj</strong></p>}
                    {cohort?.endDate && <p className="text-slate-500 text-sm mb-8">Período: {cohort.startDate} — {cohort.endDate}</p>}
                    <div className="w-24 h-1 bg-amber-400 mx-auto my-4 rounded-full" />
                    <div className="grid grid-cols-2 gap-16 mt-8 pt-4">
                        <div className="flex flex-col items-center"><div className="h-px w-48 bg-slate-400 mb-2" /><p className="text-sm font-bold text-slate-700">Firma del Docente</p><p className="text-xs text-slate-400">Aclaración</p></div>
                        <div className="flex flex-col items-center"><div className="h-px w-48 bg-slate-400 mb-2" /><p className="text-sm font-bold text-slate-700">Sello / Firma Institución</p><p className="text-xs text-slate-400">Aclaración</p></div>
                    </div>
                    <p className="text-xs text-slate-300 mt-8">{today}</p>
                </div>
            </div>
            <div className="absolute bottom-8 flex gap-3">
                <button onClick={() => window.print()} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg">Imprimir / PDF</button>
                <button onClick={onClose} className="flex items-center gap-2 bg-white text-slate-700 px-6 py-3 rounded-xl font-bold border hover:bg-slate-50 shadow-lg">Cerrar</button>
            </div>
        </div>
    );
};

const StudentPortal = ({ user, userData, courses, cohorts, attendanceLogs, students, handleLogout }) => {
    const [certData, setCertData] = useState(null);

    // Find this student's record in the students collection by email
    const myStudentRecord = students.find(s => s.email === user.email);

    // Find cohorts this student is enrolled in
    const myCohorts = myStudentRecord
        ? cohorts.filter(c => c.studentIds?.includes(myStudentRecord.id))
        : [];

    const getStats = (cohortId) => {
        if (!myStudentRecord) return { totalClasses: 0, absences: 0, attendancePct: 100 };
        const logs = attendanceLogs.filter(l => l.cohortId === cohortId);
        const totalClasses = logs.length;
        const absences = logs.filter(l => !l.presentIds?.includes(myStudentRecord.id)).length;
        const present = totalClasses - absences;
        const attendancePct = totalClasses > 0 ? Math.round((present / totalClasses) * 100) : 100;
        return { totalClasses, absences, attendancePct };
    };

    const now = new Date();
    const activeCohorts = myCohorts.filter(c => !c.endDate || new Date(c.endDate) >= now);
    const finishedCohorts = myCohorts.filter(c => c.endDate && new Date(c.endDate) < now);

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100">
            {certData && (
                <Certificate
                    student={certData.student}
                    cohort={certData.cohort}
                    course={certData.course}
                    onClose={() => setCertData(null)}
                />
            )}

            {/* Header */}
            <header className="bg-white shadow-sm px-8 py-5 flex justify-between items-center sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-lg">
                        {userData.firstName?.[0] || user.email?.[0]?.toUpperCase() || 'A'}
                    </div>
                    <div>
                        <p className="font-bold text-slate-800">{userData.firstName || ''} {userData.lastName || ''}</p>
                        <p className="text-xs text-slate-500">Portal del Alumno · {user.email}</p>
                    </div>
                </div>
                <button onClick={handleLogout} className="flex items-center gap-2 text-slate-500 hover:text-red-500 text-sm font-medium transition">
                    <LogOut size={16} /> Salir
                </button>
            </header>

            <main className="max-w-5xl mx-auto px-6 py-10">
                {!myStudentRecord ? (
                    <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-slate-200">
                        <BookOpen size={48} className="text-slate-300 mx-auto mb-4" />
                        <h2 className="text-xl font-bold text-slate-700 mb-2">No encontramos tu registro</h2>
                        <p className="text-slate-500 text-sm">El correo <strong>{user.email}</strong> no está asociado a ningún alumno en el sistema. Consultá con el administrador.</p>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {/* Stats Summary */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 text-center">
                                <p className="text-3xl font-black text-blue-600">{myCohorts.length}</p>
                                <p className="text-xs text-slate-500 font-medium mt-1">Cursos Totales</p>
                            </div>
                            <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 text-center">
                                <p className="text-3xl font-black text-emerald-600">{activeCohorts.length}</p>
                                <p className="text-xs text-slate-500 font-medium mt-1">En Curso</p>
                            </div>
                            <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 text-center">
                                <p className="text-3xl font-black text-amber-500">{finishedCohorts.filter(c => c.approvalMap?.[myStudentRecord.id]).length}</p>
                                <p className="text-xs text-slate-500 font-medium mt-1">Aprobados</p>
                            </div>
                        </div>

                        {/* Active Courses */}
                        {activeCohorts.length > 0 && (
                            <section>
                                <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2"><Clock size={18} className="text-blue-500" /> Cursos Activos</h2>
                                <div className="space-y-3">
                                    {activeCohorts.map(cohort => {
                                        const course = courses.find(c => c.id === cohort.courseId);
                                        const stats = getStats(cohort.id);
                                        const daysLabel = cohort.days?.length > 0
                                            ? cohort.days.map(d => ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][d]).join(', ')
                                            : null;
                                        return (
                                            <div key={cohort.id} className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <h3 className="font-bold text-slate-800">{course?.name || 'Curso'}</h3>
                                                        <p className="text-xs text-slate-500">{cohort.startDate} — {cohort.endDate || 'En curso'}</p>
                                                        {daysLabel && <p className="text-xs text-slate-400">{daysLabel} · {cohort.hoursPerMeeting}hs por encuentro</p>}
                                                    </div>
                                                    <span className="text-xs font-bold px-3 py-1 bg-blue-100 text-blue-700 rounded-full">En Curso</span>
                                                </div>
                                                {/* Attendance bar */}
                                                <div className="flex items-center gap-3">
                                                    <BarChart2 size={14} className="text-slate-400" />
                                                    <div className="flex-1 bg-slate-100 rounded-full h-2">
                                                        <div
                                                            className={`h-2 rounded-full transition-all ${stats.attendancePct >= 75 ? 'bg-emerald-500' : stats.attendancePct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                            style={{ width: `${stats.attendancePct}%` }}
                                                        />
                                                    </div>
                                                    <span className={`text-xs font-bold ${stats.attendancePct >= 75 ? 'text-emerald-600' : stats.attendancePct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                                                        {stats.attendancePct}% asistencia
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-400 mt-1">{stats.totalClasses} clases · {stats.absences} ausencias</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        {/* Finished Courses */}
                        {finishedCohorts.length > 0 && (
                            <section>
                                <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2"><CheckCircle size={18} className="text-emerald-500" /> Cursos Finalizados</h2>
                                <div className="space-y-3">
                                    {finishedCohorts.map(cohort => {
                                        const course = courses.find(c => c.id === cohort.courseId);
                                        const stats = getStats(cohort.id);
                                        const approved = cohort.approvalMap?.[myStudentRecord.id];
                                        return (
                                            <div key={cohort.id} className={`bg-white rounded-xl p-5 shadow-sm border flex justify-between items-center ${approved ? 'border-emerald-200' : 'border-slate-200'}`}>
                                                <div>
                                                    <h3 className="font-bold text-slate-800">{course?.name || 'Curso'}</h3>
                                                    <p className="text-xs text-slate-500">{cohort.startDate} — {cohort.endDate}</p>
                                                    {course?.totalHours && <p className="text-xs text-slate-400">{course.totalHours} hs reloj · Asistencia: {stats.attendancePct}%</p>}
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${approved ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                        {approved ? <span className="flex items-center gap-1"><Award size={12} /> Aprobado</span> : 'Pendiente'}
                                                    </span>
                                                    {approved && (
                                                        <button
                                                            onClick={() => setCertData({ student: myStudentRecord, cohort, course })}
                                                            className="flex items-center gap-1 px-3 py-2 bg-amber-50 text-amber-700 rounded-lg text-xs font-bold hover:bg-amber-100 transition border border-amber-200"
                                                        >
                                                            <Medal size={14} /> Mi Diploma
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        {myCohorts.length === 0 && (
                            <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-slate-200">
                                <BookOpen size={48} className="text-slate-300 mx-auto mb-4" />
                                <h2 className="text-lg font-bold text-slate-700 mb-2">Todavía no estás inscripto en ningún curso</h2>
                                <p className="text-slate-500 text-sm">Cuando el equipo administrativo te inscriba, verás tu información aquí.</p>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
};

export default StudentPortal;
