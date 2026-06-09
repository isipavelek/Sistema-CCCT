import React from 'react';
import { X, Printer, Clock, Calendar, BookOpen, User, MapPin, Star, CheckCircle2 } from 'lucide-react';

const DAYS_LABEL = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const INSTITUTION_NAME = 'Centro de Capacitación y Certificación Tecnológica Roberto Rocca · Campana';

const TYPE_COLORS = {
    CFP:   { bg: 'from-blue-700 to-blue-900',   badge: 'bg-blue-100 text-blue-800', dot: 'bg-blue-600' },
    ACCFP: { bg: 'from-indigo-700 to-indigo-900', badge: 'bg-indigo-100 text-indigo-800', dot: 'bg-indigo-600' },
    AC:    { bg: 'from-emerald-700 to-emerald-900', badge: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-600' },
};

const fmt = (dateStr) => {
    if (!dateStr) return null;
    try {
        return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-AR', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
    } catch { return dateStr; }
};

const splitContent = (content) => {
    if (!content) return [];
    // Support bullet lists separated by newlines, semicolons, or dashes
    return content
        .split(/\n|;|•|·/)
        .map(s => s.replace(/^[-–*]\s*/, '').trim())
        .filter(Boolean);
};

// ─── Flyer layout ────────────────────────────────────────────────────────────
const FlyerContent = ({ course, cohort, teacher }) => {
    const colors = TYPE_COLORS[course?.type] || TYPE_COLORS.CFP;
    const contentItems = splitContent(course?.content);
    const daysLabel = cohort?.days?.length > 0
        ? cohort.days.map(d => DAYS_LABEL[d]).join(', ')
        : null;

    // Calc duration in weeks/months (cohort-specific)
    let durationLabel = null;
    if (cohort?.startDate && cohort?.endDate) {
        const start = new Date(cohort.startDate + 'T12:00:00');
        const end   = new Date(cohort.endDate   + 'T12:00:00');
        const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
        const weeks  = Math.round((end - start) / (1000 * 60 * 60 * 24 * 7));
        durationLabel = months > 0 ? `${months} ${months === 1 ? 'mes' : 'meses'}` : `${weeks} semanas`;
    }

    const teacherName = teacher
        ? [teacher.firstName, teacher.lastName].filter(Boolean).join(' ') || teacher.name
        : null;

    return (
        <div id="flyer-print-area" className="bg-white rounded-2xl overflow-hidden shadow-2xl" style={{ width: '100%', maxWidth: '680px', fontFamily: "'Inter', sans-serif" }}>
            {/* ── Header gradient ── */}
            <div className={`bg-gradient-to-br ${colors.bg} p-8 text-white relative overflow-hidden`}>
                {/* Decorative circles */}
                <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/5 rounded-full" />
                <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/5 rounded-full" />

                {/* Institution */}
                <p className="text-xs font-black uppercase tracking-widest text-white/60 mb-3">
                    {INSTITUTION_NAME}
                </p>

                {/* Type badge */}
                <span className={`inline-block text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full mb-3 ${colors.badge}`}>
                    {course?.type || 'CFP'}
                </span>

                {/* Course name */}
                <h1 className="text-3xl font-black leading-tight text-white mb-2 relative z-10">
                    {course?.name || 'Nombre del Curso'}
                </h1>

                {/* Quick stats row */}
                <div className="flex flex-wrap gap-4 mt-4 relative z-10">
                    {course?.totalHours && (
                        <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-lg px-3 py-1.5">
                            <Clock size={14} className="text-white/80" />
                            <span className="text-sm font-bold">{course.totalHours} horas reloj</span>
                        </div>
                    )}
                    {cohort && durationLabel && (
                        <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-lg px-3 py-1.5">
                            <Calendar size={14} className="text-white/80" />
                            <span className="text-sm font-bold">{durationLabel}</span>
                        </div>
                    )}
                    {cohort?.hoursPerMeeting && (
                        <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-lg px-3 py-1.5">
                            <BookOpen size={14} className="text-white/80" />
                            <span className="text-sm font-bold">{cohort.hoursPerMeeting} hs/encuentro</span>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Body ── */}
            <div className="p-8 space-y-6">

                {/* ── Cohort: teacher + dates block ── */}
                {cohort && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                        {/* Teacher card */}
                        {teacherName && (
                            <div className="border border-slate-200 rounded-xl p-4 flex items-center gap-4">
                                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0 border-2 border-slate-200">
                                    {teacher?.photoUrl ? (
                                        <img src={teacher.photoUrl} alt={teacherName} className="w-full h-full object-cover" />
                                    ) : (
                                        <User size={24} className="text-slate-400" />
                                    )}
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Docente</p>
                                    <p className="text-base font-bold text-slate-800">{teacherName}</p>
                                    {teacher?.email && <p className="text-xs text-slate-400 mt-0.5">{teacher.email}</p>}
                                </div>
                            </div>
                        )}

                        {/* Schedule card */}
                        <div className="border border-slate-200 rounded-xl p-4 space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Calendario</p>
                            {cohort.startDate && (
                                <div className="flex items-center gap-2 text-sm">
                                    <Calendar size={14} className="text-slate-400 flex-shrink-0" />
                                    <span>
                                        <strong>Inicio:</strong> {fmt(cohort.startDate)}
                                    </span>
                                </div>
                            )}
                            {cohort.endDate && (
                                <div className="flex items-center gap-2 text-sm">
                                    <Calendar size={14} className="text-slate-400 flex-shrink-0" />
                                    <span>
                                        <strong>Finalización:</strong> {fmt(cohort.endDate)}
                                    </span>
                                </div>
                            )}
                            {daysLabel && (
                                <div className="flex items-start gap-2 text-sm">
                                    <Star size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
                                    <span>
                                        <strong>Días:</strong> {daysLabel}
                                    </span>
                                </div>
                            )}
                            {cohort.hoursPerMeeting && (
                                <div className="flex items-center gap-2 text-sm">
                                    <Clock size={14} className="text-slate-400 flex-shrink-0" />
                                    <span>
                                        <strong>Frecuencia:</strong> {cohort.hoursPerMeeting} hs por encuentro
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Contents / Temario ── */}
                {contentItems.length > 0 && (
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
                            <BookOpen size={14} />
                            Contenidos del Curso
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {contentItems.map((item, i) => (
                                <div key={i} className="flex items-start gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full ${colors.dot} flex-shrink-0 mt-1.5`} />
                                    <p className="text-sm text-slate-700">{item}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Fallback if no content */}
                {contentItems.length === 0 && course?.content && (
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-3">Contenidos del Curso</h2>
                        <p className="text-sm text-slate-600">{course.content}</p>
                    </div>
                )}

                {/* ── Materials ── */}
                {course?.materials && (
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
                            <CheckCircle2 size={14} />
                            Materiales y Requisitos
                        </h2>
                        <p className="text-sm text-slate-600">{course.materials}</p>
                    </div>
                )}

                {/* ── Footer ── */}
                <div className="border-t border-slate-100 pt-5 flex items-center justify-between">
                    <p className="text-xs text-slate-400 font-medium">
                        {INSTITUTION_NAME}
                    </p>
                    <div className="flex items-center gap-1">
                        <MapPin size={12} className="text-slate-300" />
                        <p className="text-xs text-slate-400">
                            {course?.type === 'CFP' ? 'Título Oficial' : 'Certificación del Centro'}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Modal wrapper ────────────────────────────────────────────────────────────
const CourseFlyer = ({ course, cohort, teacher, onClose }) => {
    const handlePrint = () => {
        const el = document.getElementById('flyer-print-area');
        if (!el) return;
        const original = document.body.innerHTML;
        document.body.innerHTML = el.outerHTML;
        window.print();
        document.body.innerHTML = original;
        window.location.reload();
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col">
                {/* Toolbar */}
                <div className="flex justify-between items-center mb-3 flex-shrink-0">
                    <p className="text-white font-bold text-sm opacity-70">
                        {cohort ? 'Vista Previa · Flyer de Cohorte' : 'Vista Previa · Flyer del Curso'}
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={handlePrint}
                            className="flex items-center gap-2 bg-white text-slate-800 px-4 py-2 rounded-lg font-bold hover:bg-slate-100 transition text-sm shadow-lg"
                        >
                            <Printer size={16} /> Imprimir / PDF
                        </button>
                        <button
                            onClick={onClose}
                            className="flex items-center gap-2 bg-white/10 text-white border border-white/20 px-4 py-2 rounded-lg font-bold hover:bg-white/20 transition text-sm"
                        >
                            <X size={16} /> Cerrar
                        </button>
                    </div>
                </div>

                {/* Flyer scrollable */}
                <div className="overflow-y-auto rounded-2xl shadow-2xl">
                    <FlyerContent course={course} cohort={cohort} teacher={teacher} />
                </div>
            </div>
        </div>
    );
};

export default CourseFlyer;
