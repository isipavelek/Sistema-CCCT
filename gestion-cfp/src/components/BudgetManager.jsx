import React, { useState, useEffect, useMemo } from 'react';
import { updateDoc, addDoc, deleteDoc, doc, collection } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db, appId } from '../services/firebase';
import { eachDayOfInterval, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import DatePicker, { registerLocale } from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { DAYS_OF_WEEK, fmtDate } from '../constants';
import {
    PlusCircle, Trash2, ChevronDown, ChevronUp, Edit, X, Check,
    DollarSign, TrendingUp, TrendingDown, AlertCircle, BarChart2,
    Calendar, Users, Percent, RefreshCw, FileDown, Play, Pause
} from 'lucide-react';
import BudgetBalanceView from './BudgetBalanceView';

registerLocale('es', es);

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0
}).format(Number(n) || 0);

const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

// Convierte definiciones de feriados/recesos en un Set de strings 'YYYY-MM-DD'
// Se proyectan las fechas para el año actual, +1 y +2 años para cálculos de Budget
const getFlatHolidayDates = (holidays) => {
    const dates = new Set();
    if (!holidays) return dates;
    holidays.forEach(h => {
        try {
            if (!h.startDate) return;
            const start = parseISO(h.startDate);
            const end = parseISO(h.endDate || h.startDate);
            if (isNaN(start) || isNaN(end)) return;
            // Range check to avoid memory issues with huge intervals
            if (end < start) return; 
            
            for (let offset = 0; offset <= 2; offset++) {
                const s = new Date(start);
                s.setFullYear(s.getFullYear() + offset);
                const e = new Date(end);
                e.setFullYear(e.getFullYear() + offset);
                
                const range = eachDayOfInterval({ start: s, end: e });
                range.forEach(d => dates.add(format(d, 'yyyy-MM-dd')));
            }
        } catch (e) {
            console.warn("Feriado inválido ignorado:", h, e);
        }
    });
    return dates;
};

const getDurationMonths = (startDate, endDate) => {
    if (!startDate || !endDate) return 0;
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (isNaN(s) || isNaN(e)) return 0;
    return Math.max(1, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1);
};

const getAcademicWeeks = (course, pc, fallbackDurationWeeks) => {
    if (course?.totalHours > 0) {
        let weeklyHours = Number(pc?.imputedWeeklyHours) || 0;
        if (weeklyHours === 0 && pc?.days?.length > 0 && pc?.hoursPerMeeting > 0) {
            weeklyHours = pc.days.length * Number(pc.hoursPerMeeting);
        }
        if (weeklyHours > 0) {
            return Number(course.totalHours) / weeklyHours;
        }
    }
    return fallbackDurationWeeks;
};

const getAcademicMonths = (course, pc) => {
    if (course?.totalHours > 0) {
        let weeklyHours = Number(pc?.imputedWeeklyHours) || 0;
        if (weeklyHours === 0 && pc?.days?.length > 0 && pc?.hoursPerMeeting > 0) {
            weeklyHours = pc.days.length * Number(pc.hoursPerMeeting);
        }
        if (weeklyHours > 0) {
            return Number(course.totalHours) / (weeklyHours * 4);
        }
    }
    return getDurationMonths(pc.startDate, pc.endDate);
};

const calcCenterCostAnnual = (cost) => {
    if (!cost) return 0;
    const amt = Number(cost.amount) || 0;
    return cost.frequency === 'monthly' ? amt * 12 : amt;
};

const calcCourseCostItem = (cost, durationMonths, pc) => {
    if (!cost) return 0;
    const amt = Number(cost.amount) || 0;
    if (cost.frequency === 'monthly') return amt * durationMonths;
    if (cost.frequency === 'annual') return amt * (durationMonths / 12);
    if (cost.frequency === 'per_student') return amt * (pc ? (Number(pc.estimatedStudents) || 0) : 0);
    return amt; // 'once'
};

// Calcula fecha de fin a partir de horas totales del curso, hs/encuentro y días de la semana
const calculateEndDate = (startDateStr, totalHours, hoursPerMeeting, selectedDays, holidayDates = new Set()) => {
    if (!startDateStr || !totalHours || !hoursPerMeeting || !selectedDays || selectedDays.length === 0) return '';
    const sessions = Math.ceil(Number(totalHours) / Number(hoursPerMeeting));
    let date = new Date(startDateStr + 'T12:00:00');
    if (isNaN(date)) return '';
    let sessionCount = 0;
    let iterations = 0;
    while (sessionCount < sessions && iterations < 1000) {
        try {
            const dateStr = date.toISOString().split('T')[0];
            const isHoliday = holidayDates.has(dateStr);
            if (selectedDays.includes(date.getDay()) && !isHoliday) {
                sessionCount++;
            }
            if (sessionCount < sessions) date.setDate(date.getDate() + 1);
        } catch (e) { break; }
        iterations++;
    }
    try {
        return date.toISOString().split('T')[0];
    } catch (e) { return ''; }
};

// ─── Excel Export ─────────────────────────────────────────────────────────────
const exportBudgetToExcel = (budget, courses, hourlyCenterRate, totals) => {
    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Resumen ────────────────────────────────────────────────────
    const centerCostsTotal = (budget.centerCosts || []).reduce((s, c) => s + calcCenterCostAnnual(c), 0);
    const payingCount = (budget.plannedCohorts || []).filter(p => !p.isFree).length;

    const summaryRows = [
        [budget.name],
        [],
        ['COSTOS DEL CENTRO', '', 'Monto Unitario', 'Frecuencia', 'Total Anual USD'],
        ...(budget.centerCosts || []).map(c => [
            c.name, '', Number(c.amount), c.frequency === 'monthly' ? 'Mensual (×12)' : 'Anual', calcCenterCostAnnual(c)
        ]),
        [],
        ['Total Costos Centro (anual)', '', '', '', centerCostsTotal],
        [`Valor Hora Centro`], ['', '', '', '', hourlyCenterRate],
        [],
        ['BALANCE GENERAL', '', '', '', ''],
        ['Ingreso Total Proyectado', '', '', '', totals.totalIncome || 0],
        ['Total Egresos', '', '', '', totals.totalExpenses || 0],
        ['Resultado', '', '', '', totals.balance || 0],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);
    ws1['!cols'] = [{ wch: 36 }, { wch: 5 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen');

    // ── Sheet 2: Cohortes Planificadas ─────────────────────────────────────
    const headers = ['Curso', 'Tipo', 'Inicio', 'Fin', 'Semanas', 'Alumnos Est.', 'Hs/Sem Centro', 'Costo Curso USD', 'Uso Centro USD', 'Costo Total USD', 'Sugerencia USD/mes', 'Cuota Cat USD/mes', 'Ingreso Proy. USD', 'GRATUITO'];
    const cohortRows = (budget.plannedCohorts || []).map(pc => {
        const course = courses.find(c => c.id === pc.courseId);
        const dm = getDurationMonths(pc.startDate, pc.endDate);
        const diffDays = pc.startDate && pc.endDate ? (new Date(pc.endDate) - new Date(pc.startDate)) / (1000 * 60 * 60 * 24) : 0;
        const durationWeeks = Math.round(diffDays / 7);
        const academicMonths = getAcademicMonths(course, pc);
        const academicWeeks = getAcademicWeeks(course, pc, durationWeeks);

        const courseCost = (pc.courseCosts || []).reduce((s, c) => s + calcCourseCostItem(c, academicMonths, pc), 0);
        const share = pc.isFree ? 0 : (Number(pc.imputedWeeklyHours) || 0) * hourlyCenterRate * academicWeeks;
        const totalCost = courseCost + share;
        const est = Number(pc.estimatedStudents) || 0;
        
        const catPrice = budget.categoryPrices?.[course?.type] || 0;
        const suggested = (est > 0 && academicMonths > 0) ? totalCost / (est * academicMonths) : 0;
        const income = pc.isFree ? 0 : (catPrice > 0 ? catPrice * academicMonths * est * (1 - (Number(pc.scholarshipPct)||0)/100) : totalCost);

        return [
            course?.name || 'Sin asignar', 
            course?.type || '—',
            pc.startDate || '', 
            pc.endDate || '', 
            durationWeeks,
            est || '', 
            pc.imputedWeeklyHours || 0,
            courseCost, 
            share, 
            totalCost,
            suggested,
            catPrice || '—',
            income, 
            pc.isFree ? 'SÍ' : 'NO'
        ];
    });
    const ws2 = XLSX.utils.aoa_to_sheet([headers, ...cohortRows]);
    ws2['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Cohortes');

    // ── Sheet 3: Detalle de Costos por Curso ───────────────────────────────
    const detailRows = ['Curso', 'Costo', 'Monto USD', 'Frecuencia', 'Meses', 'Total USD'].map((h, i, arr) => i === 0 ? arr : null).filter(Boolean)[0];
    const detailData = [];
    (budget.plannedCohorts || []).forEach(pc => {
        const course = courses.find(c => c.id === pc.courseId);
        const dm = getDurationMonths(pc.startDate, pc.endDate);
        (pc.courseCosts || []).forEach(cost => {
            detailData.push([course?.name || 'Sin asignar', cost.name, Number(cost.amount), cost.frequency === 'monthly' ? 'Mensual' : cost.frequency === 'annual' ? 'Anual prop.' : 'Único', dm, calcCourseCostItem(cost, dm)]);
        });
    });
    const ws3 = XLSX.utils.aoa_to_sheet([['Curso', 'Descripción Costo', 'Monto USD', 'Frecuencia', 'Meses', 'Total USD'], ...detailData]);
    ws3['!cols'] = [{ wch: 28 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Detalle Costos');

    const filename = `${budget.name.replace(/[^a-zA-Z0-9 ]/g, '_')}.xlsx`;
    XLSX.writeFile(wb, filename);
};




// ─── Budget Period Selector ───────────────────────────────────────────────────
const BudgetSelector = ({ budgets, selectedId, onSelect, onCreate }) => {
    const [showNew, setShowNew] = useState(false);
    const [newYear, setNewYear] = useState(new Date().getFullYear());

    const handleCreate = async () => {
        await onCreate(newYear);
        setShowNew(false);
    };

    return (
        <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase">Período:</span>
                <select
                    className="text-sm font-bold border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-800 shadow-sm"
                    value={selectedId || ''}
                    onChange={e => onSelect(e.target.value)}
                >
                    <option value="">— Seleccionar —</option>
                    {budgets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
            </div>
            {showNew ? (
                <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-1.5 shadow-sm">
                    <span className="text-xs text-slate-600">Año inicio (Julio):</span>
                    <input type="number" value={newYear} onChange={e => setNewYear(Number(e.target.value))} style={{ colorScheme: 'light' }}
                        className="w-20 text-sm border border-slate-200 rounded px-2 py-1 text-slate-800" />
                    <button onClick={handleCreate} className="flex items-center gap-1 px-2 py-1 bg-emerald-500 text-white rounded text-xs font-bold">
                        <Check size={12} /> Crear
                    </button>
                    <button onClick={() => setShowNew(false)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
                </div>
            ) : (
                <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 shadow-sm transition">
                    <PlusCircle size={15} /> Nuevo Budget
                </button>
            )}
        </div>
    );
};

// ─── Center Cost Row ──────────────────────────────────────────────────────────
const CenterCostRow = ({ cost, onChange, onDelete }) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState({ ...cost });
    const annual = calcCenterCostAnnual(cost);

    const save = () => { onChange(draft); setEditing(false); };

    if (editing) return (
        <div className="py-2 border-b border-slate-100 space-y-2">
            <input className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 text-slate-800 bg-white"
                value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Nombre del costo" />
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                    <input type="number" className="w-full text-xs border border-slate-300 rounded pl-5 pr-2 py-1.5 text-slate-800 bg-white"
                        value={draft.amount} onChange={e => setDraft({ ...draft, amount: e.target.value })} placeholder="Monto USD" />
                </div>
                <select className="text-xs border border-slate-300 rounded px-2 py-1.5 bg-white text-slate-800"
                    value={draft.frequency} onChange={e => setDraft({ ...draft, frequency: e.target.value })}>
                    <option value="monthly">Por mes (×12)</option>
                    <option value="annual">Anual</option>
                </select>
            </div>
            <div className="flex gap-2">
                <button onClick={save} className="flex items-center gap-1 px-2 py-1 bg-emerald-500 text-white rounded text-xs font-bold"><Check size={12} /> Guardar</button>
                <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
            </div>
        </div>
    );

    return (
        <div className="group flex items-center gap-2 py-2 border-b border-slate-100 last:border-0">
            <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">{cost.name || 'Sin nombre'}</p>
                <p className="text-[10px] text-slate-400">{fmt(Number(cost.amount))} / {cost.frequency === 'monthly' ? 'mes' : 'año'}</p>
            </div>
            <p className="text-xs font-bold text-slate-700 mr-1">{fmt(annual)}</p>
            <button onClick={() => { setDraft({ ...cost }); setEditing(true); }} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-500"><Edit size={13} /></button>
            <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500"><Trash2 size={13} /></button>
        </div>
    );
};

// ─── Course Cost Row ──────────────────────────────────────────────────────────
const CourseCostRow = ({ cost, durationMonths, pc, onChange, onDelete }) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState({ ...cost });
    const total = calcCourseCostItem(cost, durationMonths, pc);
    const save = () => { onChange(draft); setEditing(false); };

    if (editing) return (
        <div className="py-2 border-b border-slate-50 space-y-1.5">
            <input className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 text-slate-800 bg-white"
                value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Descripción" />
            <div className="flex gap-2">
                <div className="relative w-28">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                    <input type="number" className="w-full text-xs border border-slate-300 rounded pl-5 pr-2 py-1.5 text-slate-800 bg-white"
                        value={draft.amount} onChange={e => setDraft({ ...draft, amount: e.target.value })} />
                </div>
                <select className="flex-1 text-xs border border-slate-300 rounded px-2 py-1.5 bg-white text-slate-800"
                    value={draft.frequency} onChange={e => setDraft({ ...draft, frequency: e.target.value })}>
                    <option value="per_student">Por alumno (×{pc?.estimatedStudents || 0})</option>
                    <option value="monthly">Por mes (×{durationMonths} meses)</option>
                    <option value="annual">Proporción anual</option>
                    <option value="once">Monto único</option>
                </select>
            </div>
            <div className="flex gap-2">
                <button onClick={save} className="flex items-center gap-1 px-2 py-1 bg-emerald-500 text-white rounded text-xs font-bold"><Check size={12} /> OK</button>
                <button onClick={() => setEditing(false)} className="text-slate-400"><X size={14} /></button>
            </div>
        </div>
    );

    return (
        <div className="group flex items-center gap-2 py-1.5 border-b border-slate-50 last:border-0">
            <div className="flex-1 min-w-0">
                <p className="text-[11px] text-slate-700 truncate">{cost.name}</p>
                <p className="text-[10px] text-slate-400">
                    {fmt(Number(cost.amount))} {cost.frequency === 'per_student' ? `× ${pc?.estimatedStudents || 0} alum.` : cost.frequency === 'monthly' ? `× ${durationMonths} meses` : cost.frequency === 'annual' ? `× prop. anual` : '(único)'}
                </p>
            </div>
            <p className="text-[11px] font-semibold text-slate-700 mr-1">{fmt(total)}</p>
            <button onClick={() => { setDraft({ ...cost }); setEditing(true); }} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-500"><Edit size={12} /></button>
            <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500"><Trash2 size={12} /></button>
        </div>
    );
};

// ─── Planned Cohort Card ──────────────────────────────────────────────────────
const PlannedCohortCard = ({ pc, courses = [], hourlyCenterRate, categoryPrices, holidayDates, onChange, onDelete, onRepeatToEnd, onApplyScholarshipToAll }) => {
    const [expanded, setExpanded] = useState(false);
    const course = (courses || []).find(c => c.id === pc.courseId);
    
    // Duration Logic
    const durationMonths = getDurationMonths(pc.startDate, pc.endDate);
    const diffDays = (pc.startDate && pc.endDate) ? (new Date(pc.endDate) - new Date(pc.startDate)) / (1000 * 60 * 60 * 24) : 0;
    const durationWeeks = !isNaN(diffDays) ? Math.max(0, Math.round(diffDays / 7)) : 0;
    
    const academicMonths = getAcademicMonths(course, pc);
    const academicWeeks = getAcademicWeeks(course, pc, durationWeeks);

    // Costs
    const courseDirectCosts = (pc.courseCosts || []).reduce((sum, c) => sum + calcCourseCostItem(c, academicMonths, pc), 0);
    // Free courses still consume center hours — cost is absorbed by center (subsidized)
    const centerShare = (Number(pc.imputedWeeklyHours) || 0) * hourlyCenterRate * academicWeeks;
    
    const subtotal = courseDirectCosts + centerShare;
    const marginPct = Number(pc.marginPct) || 0;
    // Free courses: no margin applied
    const marginAmt = pc.isFree ? 0 : subtotal * (marginPct / 100);
    const totalCost = subtotal + marginAmt;
    const estimatedStudents = Number(pc.estimatedStudents) || 0;

    // --- Financial Science ---
    const catPrice = pc.isFree ? 0 : (categoryPrices?.[course?.type] || 0);
    const totalPotentialIncomePerStudent = catPrice * academicMonths;
    const breakEvenStudents = totalPotentialIncomePerStudent > 0 ? Math.ceil(totalCost / totalPotentialIncomePerStudent) : 0;
    const suggestedMonthlyPrice = (estimatedStudents > 0 && academicMonths > 0) ? totalCost / (estimatedStudents * academicMonths) : 0;
    
    const cuotaMensual = catPrice > 0 ? catPrice : (estimatedStudents > 0 && academicMonths > 0 && !pc.isFree ? totalCost / (estimatedStudents * academicMonths) : 0);
    const scholarshipPct = Number(pc.scholarshipPct) || 0;
    const projectedIncome = pc.isFree ? 0 : (cuotaMensual * academicMonths * estimatedStudents * (1 - scholarshipPct / 100));
    
    // Safety check for renderer
    if (isNaN(totalCost) || isNaN(projectedIncome)) {
       console.warn("NaN detected in Cohort Card", pc.id);
    }

    const addCourseCost = () => onChange({
        ...pc, courseCosts: [...(pc.courseCosts || []), { id: generateId(), name: 'Nuevo Costo', amount: 0, frequency: 'monthly' }]
    });
    const updateCourseCost = (id, updated) => onChange({ ...pc, courseCosts: pc.courseCosts.map(c => c.id === id ? { ...c, ...updated } : c) });
    const deleteCourseCost = (id) => onChange({ ...pc, courseCosts: pc.courseCosts.filter(c => c.id !== id) });

    const daysLabel = pc.days?.length > 0 ? pc.days.map(d => ['', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'][d]).join('·') : null;
    const selectedCourse = (courses || []).find(c => c.id === pc.courseId);

    const TEACHER_COST_ID = '__teacher__';

    // Helper: recalc teacher cost item when rate or course changes
    const applyTeacherCost = (updated) => {
        const c = (courses || []).find(x => x.id === updated.courseId);
        const rate = Number(updated.teacherHourlyRate);
        if (!c?.totalHours || !rate) return updated;
        const teacherTotal = c.totalHours * rate;
        const costs = (updated.courseCosts || []);
        const hasTeacher = costs.some(x => x.id === TEACHER_COST_ID || x.isTeacherCost);
        if (hasTeacher) {
            return {
                ...updated,
                courseCosts: costs.map(x =>
                    (x.id === TEACHER_COST_ID || x.isTeacherCost)
                        ? { ...x, amount: teacherTotal, name: `Honorarios Docente (${c.totalHours}hs × $${rate})` }
                        : x
                )
            };
        }
        return {
            ...updated,
            courseCosts: [{ id: TEACHER_COST_ID, name: `Honorarios Docente (${c.totalHours}hs × $${rate})`, amount: teacherTotal, frequency: 'once', isTeacherCost: true }, ...costs]
        };
    };

    // Recalculate endDate whenever scheduling fields change
    const handleScheduleChange = (patch) => {
        let updated = { ...pc, ...patch };
        const c = (courses || []).find(x => x.id === updated.courseId);
        if (updated.startDate && updated.days?.length > 0 && updated.hoursPerMeeting && c?.totalHours) {
            updated.endDate = calculateEndDate(updated.startDate, c.totalHours, updated.hoursPerMeeting, updated.days, holidayDates);
        }
        updated = applyTeacherCost(updated);
        
        if (patch.courseId !== undefined && patch.courseId !== pc.courseId) {
            const newCourse = (courses || []).find(x => x.id === patch.courseId);
            if (newCourse && newCourse.defaultCosts) {
                const teacherCost = (updated.courseCosts || []).find(x => x.isTeacherCost || x.id === TEACHER_COST_ID);
                const customCosts = (updated.courseCosts || []).filter(x => !x.isTeacherCost && x.id !== TEACHER_COST_ID && !x.isDefault);
                const newDefaults = newCourse.defaultCosts.map(dc => ({ ...dc, id: generateId(), isDefault: true }));
                const baseCosts = teacherCost ? [teacherCost] : [];
                updated.courseCosts = [...baseCosts, ...newDefaults, ...customCosts];
            }
        }
        onChange(updated);
    };

    const isPaused = !!pc.isPaused;


    return (
        <div id={`cohort-card-${pc.id}`} data-expanded={expanded} className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${isPaused ? 'opacity-60 grayscale-[0.5] border-slate-200' : (pc.isFree ? 'border-amber-300' : (pc.hasScholarship ? 'border-indigo-300' : 'border-slate-200'))}`}>
            {/* Header */}
            <div className={`flex items-center gap-3 p-4 cursor-pointer ${isPaused ? 'bg-slate-50' : (pc.isFree ? 'bg-amber-50/50' : (pc.hasScholarship ? 'bg-indigo-50/30' : ''))}`} onClick={() => setExpanded(!expanded)}>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-800 text-sm">{course?.name || <span className="text-slate-400 italic">Sin curso asignado</span>}</h3>
                        {pc.isFree && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full">GRATUITO</span>}
                        {pc.hasScholarship && Number(pc.scholarshipPct) > 0 && (
                            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-full">
                                BECA {pc.scholarshipPct}%
                            </span>
                        )}
                        {isPaused && <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-[10px] font-bold rounded-full flex items-center gap-1"><Pause size={10} /> PAUSADO</span>}
                    </div>
                    <div className="flex flex-wrap gap-3 text-[10px] text-slate-400 mt-0.5">
                        {pc.startDate && <span>📅 {fmtDate(pc.startDate)} → {fmtDate(pc.endDate, '?')}</span>}
                        <span>⏱ {durationMonths} {durationMonths === 1 ? 'mes' : 'meses'}</span>
                        {daysLabel && <span>{daysLabel}</span>}
                        {estimatedStudents > 0 && <span>👥 ~{estimatedStudents} alumnos est.</span>}
                    </div>
                </div>
                {/* KPIs */}
                <div className="hidden sm:flex gap-4 text-center">
                    <div>
                        <p className="text-[10px] text-slate-400">Costo Total</p>
                        <p className="text-sm font-bold text-slate-700">{fmt(totalCost)}</p>
                    </div>
                    {catPrice > 0 ? (
                        <div>
                            <p className="text-[10px] text-slate-400">Punto Equilibrio</p>
                            <p className={`text-sm font-bold ${estimatedStudents >= breakEvenStudents ? 'text-emerald-600' : 'text-red-500'}`}>
                                {breakEvenStudents} <span className="text-[10px] font-normal">alum.</span>
                            </p>
                        </div>
                    ) : (
                        <div>
                            <p className="text-[10px] text-slate-400">Margen</p>
                            <p className="text-sm font-bold text-slate-700">{marginPct}%</p>
                        </div>
                    )}
                    <div>
                        <p className="text-[10px] text-slate-400">Ingreso Proy.</p>
                        <p className={`text-sm font-bold ${pc.isFree ? 'text-slate-300' : 'text-emerald-600'}`}>{pc.isFree ? '—' : fmt(projectedIncome)}</p>
                    </div>
                </div>
                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                    <button onClick={e => { e.stopPropagation(); onChange({...pc, isPaused: !isPaused}); }}
                        title={isPaused ? "Reactivar Imputación" : "Pausar Imputación"}
                        className={`p-1 rounded-lg transition ${isPaused ? 'text-emerald-500 bg-emerald-50' : 'text-slate-400 hover:text-orange-500'}`}>
                        {isPaused ? <Play size={14} /> : <Pause size={14} />}
                    </button>
                    {onRepeatToEnd && (
                        <button onClick={e => { e.stopPropagation(); onRepeatToEnd(pc); }}
                            title="Repetir ciclo hasta fin de Budget"
                            className="text-slate-400 hover:text-blue-500 p-1 transition"><RefreshCw size={14} /></button>
                    )}
                    <button onClick={e => { e.stopPropagation(); if (confirm('¿Eliminar esta cohorte planificada?')) onDelete(); }}
                        className="text-slate-300 hover:text-red-500 p-1 transition"><Trash2 size={14} /></button>
                    {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </div>
            </div>

            {isPaused && (
                <div className="bg-slate-100 px-4 py-1.5 text-[9px] font-bold text-slate-500 border-t border-b border-slate-200 flex items-center gap-2">
                    <AlertCircle size={12} /> ESTA COHORTE ESTÁ PAUSADA. NO SE INCLUYE EN LOS TOTALES.
                </div>
            )}

            {expanded && (
                <div className="border-t border-slate-100">
                    {/* Edit Fields */}
                    <div className="p-4 bg-slate-50/70 grid grid-cols-2 md:grid-cols-4 gap-3 border-b border-slate-100">
                        <div className="md:col-span-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Curso</label>
                            <select className="w-full mt-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-800"
                                value={pc.courseId || ''} onChange={e => handleScheduleChange({ courseId: e.target.value })}>
                                <option value="">Seleccionar...</option>
                                {courses.filter(c => !c.archived).map(c => (
                                    <option key={c.id} value={c.id}>{c.name}{c.totalHours ? ` (${c.totalHours}hs)` : ''}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Fecha Inicio</label>
                            <DatePicker 
                                selected={pc.startDate ? parseISO(pc.startDate) : null} 
                                onChange={date => handleScheduleChange({ startDate: date ? format(date, 'yyyy-MM-dd') : '' })} 
                                dateFormat="dd/MM/yyyy" isClearable placeholderText="dd/mm/aaaa"
                                className="w-full mt-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-800" 
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Fecha Fin <span className="text-blue-400 normal-case font-normal">(auto)</span></label>
                            <DatePicker 
                                selected={pc.endDate ? parseISO(pc.endDate) : null} 
                                onChange={date => onChange({ ...pc, endDate: date ? format(date, 'yyyy-MM-dd') : '' })} 
                                dateFormat="dd/MM/yyyy" isClearable placeholderText="dd/mm/aaaa"
                                className="w-full mt-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-800" 
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Alumnos Estimados</label>
                            <input type="number" min="0" value={pc.estimatedStudents || ''} onChange={e => onChange({ ...pc, estimatedStudents: Number(e.target.value) })}
                                className="w-full mt-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-800" placeholder="ej. 15" />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Margen / Utilidad (%)</label>
                            <div className="relative mt-1">
                                <input type="number" min="0" max="100" value={pc.marginPct || ''} onChange={e => onChange({ ...pc, marginPct: Number(e.target.value) })}
                                    className="w-full text-xs border border-slate-200 rounded-lg pl-2 pr-7 py-1.5 bg-white text-slate-800" placeholder="ej. 20" />
                                <Percent size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Hs por Encuentro</label>
                            <input type="number" min="1" value={pc.hoursPerMeeting || ''} onChange={e => handleScheduleChange({ hoursPerMeeting: e.target.value })}
                                className="w-full mt-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-800" placeholder="ej. 4" />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase">
                                Valor Hora Docente (USD)
                            </label>
                            <div className="relative mt-1">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                                <input type="number" min="0" value={pc.teacherHourlyRate || ''}
                                    onChange={e => handleScheduleChange({ teacherHourlyRate: e.target.value })}
                                    className="w-full text-xs border border-slate-200 rounded-lg pl-5 pr-2 py-1.5 bg-white text-slate-800" placeholder="ej. 50" />
                            </div>
                            {pc.teacherHourlyRate && selectedCourse?.totalHours && (
                                <p className="text-[10px] text-blue-500 mt-0.5">
                                    {selectedCourse.totalHours}hs × ${pc.teacherHourlyRate} = <strong>{fmt(selectedCourse.totalHours * Number(pc.teacherHourlyRate))}</strong>
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Días de Dictado</label>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                                {DAYS_OF_WEEK.map(day => (
                                    <button key={day.value} type="button"
                                        onClick={() => { const cur = pc.days || []; handleScheduleChange({ days: cur.includes(day.value) ? cur.filter(d => d !== day.value) : [...cur, day.value] }); }}
                                        className={`px-1.5 py-1 rounded text-[10px] font-bold border transition ${(pc.days || []).includes(day.value) ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-400 border-slate-200 hover:border-orange-300'}`}>
                                        {day.label.slice(0, 2)}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Horas Semanales en Centro</label>
                            <div className="relative mt-1">
                                <input type="number" min="0" max="24" value={pc.imputedWeeklyHours || ''} 
                                    onChange={e => onChange({ ...pc, imputedWeeklyHours: Number(e.target.value) })}
                                    className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-800" placeholder="ej. 4" />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">hs</span>
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-transparent uppercase select-none hidden md:block">Acción</label>
                            <div className="flex gap-2 mt-1">
                                <label className="flex items-center justify-center gap-2 cursor-pointer bg-amber-50 hover:bg-amber-100 transition border border-amber-200 rounded-lg px-2 py-1.5 flex-1">
                                    <input type="checkbox" checked={!!pc.isFree} onChange={e => onChange({ ...pc, isFree: e.target.checked })} className="accent-amber-600 w-3.5 h-3.5" />
                                    <span className="text-[10px] text-amber-700 font-bold uppercase tracking-wide">Gratuito</span>
                                </label>
                                <label className={`flex items-center justify-center gap-2 cursor-pointer transition border rounded-lg px-2 py-1.5 flex-1 ${pc.hasScholarship ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}>
                                    <input type="checkbox" checked={!!pc.hasScholarship} onChange={e => onChange({ ...pc, hasScholarship: e.target.checked, scholarshipPct: e.target.checked ? (pc.scholarshipPct || 50) : 0 })} className="accent-indigo-600 w-3.5 h-3.5" />
                                    <span className={`text-[10px] font-bold uppercase tracking-wide ${pc.hasScholarship ? 'text-indigo-700' : 'text-slate-500'}`}>Beca</span>
                                </label>
                            </div>
                        </div>

                        {pc.hasScholarship && (
                            <div className="col-span-2 md:col-span-4 bg-indigo-50/50 p-3 rounded-lg border border-indigo-100 flex items-center gap-4">
                                <div className="flex-1">
                                    <label className="text-[10px] font-bold text-indigo-400 uppercase">Porcentaje de Beca / Bonificación</label>
                                    <div className="flex items-center gap-2 mt-1">
                                        <div className="relative flex-1 max-w-[120px]">
                                            <input type="number" min="0" max="100" value={pc.scholarshipPct || ''} 
                                                onChange={e => onChange({ ...pc, scholarshipPct: Number(e.target.value) })}
                                                className="w-full text-xs border border-indigo-200 rounded-lg pl-3 pr-7 py-1.5 bg-white text-indigo-900 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="50" />
                                            <Percent size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-indigo-400" />
                                        </div>
                                        <p className="text-[11px] text-indigo-600 font-medium">
                                            Aplica a todos los alumnos proyectados de esta cohorte.
                                        </p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => onApplyScholarshipToAll(pc.courseId, pc.scholarshipPct)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700 transition shadow-sm h-fit"
                                >
                                    <RefreshCw size={12} /> Aplicar a todo el curso
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Course Costs */}
                    <div className="p-4">
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Costos Específicos del Curso</h4>
                            <button onClick={addCourseCost} className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 transition">
                                <PlusCircle size={12} /> Agregar costo
                            </button>
                        </div>

                        {(pc.courseCosts || []).length === 0 && (
                            <p className="text-[11px] text-slate-400 italic py-2">Sin costos específicos. Agregá honorarios del docente, materiales, etc.</p>
                        )}
                        {(pc.courseCosts || []).map(cost => (
                            <CourseCostRow key={cost.id} cost={cost} durationMonths={academicMonths} pc={pc}
                                onChange={updated => updateCourseCost(cost.id, updated)}
                                onDelete={() => deleteCourseCost(cost.id)} />
                        ))}

                        {/* Summary box */}
                        <div className="mt-4 bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-4 border border-slate-200 space-y-1.5">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Resumen del Curso</div>
                            <div className="flex justify-between text-xs text-slate-600">
                                <span>Costos directos del curso</span>
                                <span className="font-semibold">{fmt(courseDirectCosts)}</span>
                            </div>
                            <div className="flex justify-between text-[11px] text-slate-500 italic bg-white/50 px-2 py-1 rounded">
                                <span>Uso del Centro ({pc.imputedWeeklyHours}hs/sem × {academicWeeks} sem){pc.isFree ? ' — subsidiado' : ''}</span>
                                <span className="font-semibold">{fmt(centerShare)}</span>
                            </div>
                            {marginPct > 0 && (
                                <div className="flex justify-between text-xs text-slate-600">
                                    <span>Margen {marginPct}%</span>
                                    <span className="font-semibold">{fmt(marginAmt)}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-xs font-bold text-slate-800 border-t border-slate-200 pt-2 mt-1">
                                <span>Costo Total del Curso</span>
                                <span>{fmt(totalCost)}</span>
                            </div>
                            
                            {!pc.isFree && (
                                <div className="mt-3 p-3 bg-white border border-slate-200 rounded-lg space-y-2 shadow-sm">
                                    <div className="flex justify-between items-center">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Cuota Mensual Categoría ({course?.type})</span>
                                            <span className="text-sm font-black text-slate-800">{fmt(catPrice)}/mes</span>
                                            <span className="text-[9px] text-slate-400">Total curso: {fmt(catPrice * durationMonths)}</span>
                                        </div>
                                        <div className="text-right flex flex-col">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Punto de Equilibrio</span>
                                            <span className={`text-sm font-black ${estimatedStudents >= breakEvenStudents ? 'text-emerald-600' : 'text-red-500'}`}>
                                                {breakEvenStudents} alumnos
                                            </span>
                                        </div>
                                    </div>
                                    
                                    {estimatedStudents > 0 && (
                                        <div className="pt-2 border-t border-slate-50 flex justify-between items-center">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-tight">Sugerencia Equilibrium</span>
                                                <span className="text-xs font-bold text-blue-700">Cobrar {fmt(suggestedMonthlyPrice)}/mes</span>
                                            </div>
                                            <div className="text-right">
                                                {catPrice < suggestedMonthlyPrice ? (
                                                    <span className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-bold">Déficit: {fmt((suggestedMonthlyPrice - catPrice) * durationMonths * estimatedStudents)}</span>
                                                ) : (
                                                    <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-bold">Superávit: {fmt((catPrice - suggestedMonthlyPrice) * durationMonths * estimatedStudents)}</span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {!pc.isFree && (
                                <div className="flex justify-between text-xs font-bold text-emerald-600 pt-2">
                                    <span>Ingreso proyectado total</span>
                                    <span>{fmt(projectedIncome)}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Bulk Cohort Editor ──────────────────────────────────────────────────────
const BulkCohortEditor = ({ onApply }) => {
    const [values, setValues] = useState({ teacherHourlyRate: '', marginPct: '', estimatedStudents: '', imputedWeeklyHours: '', scholarshipPctOnly: '' });
    const [show, setShow] = useState(false);

    const handleApply = () => {
        const patch = {};
        if (values.teacherHourlyRate !== '') patch.teacherHourlyRate = Number(values.teacherHourlyRate);
        if (values.marginPct !== '') patch.marginPct = Number(values.marginPct);
        if (values.estimatedStudents !== '') patch.estimatedStudents = Number(values.estimatedStudents);
        if (values.imputedWeeklyHours !== '') patch.imputedWeeklyHours = Number(values.imputedWeeklyHours);
        
        if (Object.keys(patch).length === 0) return;
        if (confirm('¿Estás seguro de aplicar estos valores a TODAS las cohortes del budget actual? Esta acción no se puede deshacer de forma masiva.')) {
            onApply(patch);
            setValues({ teacherHourlyRate: '', marginPct: '', estimatedStudents: '', imputedWeeklyHours: '' });
            setShow(false);
        }
    };

    if (!show) {
        return (
            <button onClick={() => setShow(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition text-xs font-bold shadow-sm">
                <RefreshCw size={14} /> Acciones Masivas (Edición por Lote)
            </button>
        );
    }

    return (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
                <h4 className="text-xs font-black text-blue-700 uppercase tracking-widest">Edición por Lote (Afecta a todas las cohortes)</h4>
                <button onClick={() => setShow(false)} className="text-blue-400 hover:text-blue-600 transition"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                    <label className="text-[10px] font-bold text-blue-400 uppercase">Valor Hora Docente</label>
                    <div className="relative mt-1">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-blue-400 text-xs">$</span>
                        <input type="number" value={values.teacherHourlyRate} onChange={e => setValues({...values, teacherHourlyRate: e.target.value})}
                            className="w-full text-xs border border-blue-200 rounded-lg pl-5 pr-2 py-1.5 bg-white text-slate-800" placeholder="ej. 50" />
                    </div>
                </div>
                <div>
                    <label className="text-[10px] font-bold text-blue-400 uppercase">Margen (%)</label>
                    <div className="relative mt-1">
                        <input type="number" value={values.marginPct} onChange={e => setValues({...values, marginPct: e.target.value})}
                            className="w-full text-xs border border-blue-200 rounded-lg pl-2 pr-7 py-1.5 bg-white text-slate-800" placeholder="ej. 20" />
                        <Percent size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-400" />
                    </div>
                </div>
                <div>
                    <label className="text-[10px] font-bold text-blue-400 uppercase">Alumnos Est.</label>
                    <input type="number" value={values.estimatedStudents} onChange={e => setValues({...values, estimatedStudents: e.target.value})}
                        className="w-full mt-1 text-xs border border-blue-200 rounded-lg px-2 py-1.5 bg-white text-slate-800" placeholder="ej. 15" />
                </div>
                <div>
                    <label className="text-[10px] font-bold text-blue-400 uppercase">Horas Centro / Sem</label>
                    <div className="relative mt-1">
                        <input type="number" value={values.imputedWeeklyHours} onChange={e => setValues({...values, imputedWeeklyHours: e.target.value})}
                            className="w-full text-xs border border-blue-200 rounded-lg px-2 py-1.5 bg-white text-slate-800" placeholder="ej. 4" />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-blue-400">hs</span>
                    </div>
                </div>
                <div className="flex items-end">
                    <button onClick={handleApply} className="w-full py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition shadow-md flex items-center justify-center gap-2">
                        <Check size={14} /> Aplicar a Todo
                    </button>
                </div>
            </div>

            <div className="pt-4 border-t border-blue-100 flex flex-col md:flex-row md:items-end gap-4">
                <div className="flex-1 max-w-xs">
                    <label className="text-[10px] font-bold text-indigo-400 uppercase">Actualizar solo Becas Existentes (%)</label>
                    <div className="relative mt-1">
                        <input type="number" value={values.scholarshipPctOnly} onChange={e => setValues({...values, scholarshipPctOnly: e.target.value})}
                            className="w-full text-xs border border-indigo-200 rounded-lg pl-2 pr-7 py-1.5 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="ej. 75" />
                        <Percent size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-indigo-400" />
                    </div>
                </div>
                <button 
                    onClick={() => {
                        if (values.scholarshipPctOnly === '') return;
                        if (confirm(`¿Actualizar el porcentaje de beca a ${values.scholarshipPctOnly}% solo para los cursos que ya tienen beca?`)) {
                            onApply({ scholarshipPct: Number(values.scholarshipPctOnly) }, true);
                            setValues({ ...values, scholarshipPctOnly: '' });
                            setShow(false);
                        }
                    }}
                    className="py-1.5 px-4 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition shadow-md flex items-center justify-center gap-2"
                >
                    <RefreshCw size={14} /> Actualizar solo Becados
                </button>
                <p className="text-[10px] text-indigo-400 italic md:mb-1.5">Esta acción solo afectará a las cohortes que ya tienen marcada la opción "Beca".</p>
            </div>
            
            <p className="text-[10px] text-blue-500 italic">Sólo se aplicarán los campos que tengan un valor ingresado. Esto sobrescribirá los valores actuales de las cohortes seleccionadas.</p>
        </div>
    );
};

const DAYS_SHORT_NAMES = ['', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];

// ─── Budget Gantt View ────────────────────────────────────────────────────────
const BudgetGanttView = ({ plannedCohorts, courses = [], startYear, onAddCohort, onUpdateCohort }) => {
    const [sortBy, setSortBy] = useState('type');
    const [tooltip, setTooltip] = useState(null);
    const [quickAddModal, setQuickAddModal] = useState(null);
    const [courseSearch, setCourseSearch] = useState('');
    const [editModal, setEditModal] = useState(null); // { pc, draft }

    if (!startYear) return null;
    const validCohorts = (plannedCohorts || []).filter(c => c && c.startDate && c.endDate);
    
    // Budget cycle starts in July (Month 6) of startYear and ends June (Month 5) of next year
    const minDate = new Date(startYear, 6, 1);
    const maxDate = new Date(startYear + 1, 5, 30);

    const timelineColumns = [];
    const cursor = new Date(minDate);
    while (cursor <= maxDate) {
        timelineColumns.push({ year: cursor.getFullYear(), month: cursor.getMonth() });
        cursor.setMonth(cursor.getMonth() + 1);
    }
    const totalCols = timelineColumns.length;

    const dateToColPct = (dateStr) => {
        try {
            const date = new Date(dateStr + 'T12:00:00');
            const monthsDiff = (date.getFullYear() - minDate.getFullYear()) * 12 + (date.getMonth() - minDate.getMonth());
            const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
            const pct = ((monthsDiff + (date.getDate() - 1) / daysInMonth) / totalCols) * 100;
            return Math.max(0, Math.min(100, pct));
        } catch (e) { return 0; }
    };

    const colPctToDate = (pct) => {
        const targetMonths = (pct / 100) * totalCols;
        const completeMonths = Math.floor(targetMonths);
        const fraction = targetMonths - completeMonths;
        
        const targetYear = minDate.getFullYear() + Math.floor((minDate.getMonth() + completeMonths) / 12);
        const targetMonth = (minDate.getMonth() + completeMonths) % 12;
        
        const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
        const day = Math.max(1, Math.min(daysInMonth, Math.round(fraction * daysInMonth) + 1));
        
        const y = targetYear;
        const m = String(targetMonth + 1).padStart(2, '0');
        const d = String(day).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const handleTrackClick = (e, courseId = '', days = []) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = (x / rect.width) * 100;
        const dateStr = colPctToDate(pct);
        
        setQuickAddModal({
            courseId,
            days,
            startDate: dateStr,
            hoursPerMeeting: 4,
            estimatedStudents: 15
        });
    };

    const colorPalette = [
        'bg-blue-500', 'bg-emerald-500', 'bg-orange-400',
        'bg-violet-500', 'bg-rose-500', 'bg-cyan-600',
        'bg-amber-500', 'bg-teal-500', 'bg-indigo-500', 'bg-pink-500'
    ];
    const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    // Agrupar por curso y dias
    const groups = {};
    validCohorts.forEach(pc => {
        const cId = pc.courseId || 'unassigned';
        const daysKey = (pc.days || []).slice().sort().join(',');
        const groupKey = `${cId}_${daysKey}`;
        
        if (!groups[groupKey]) {
            groups[groupKey] = {
                courseId: cId,
                days: pc.days || [],
                cohorts: []
            };
        }
        groups[groupKey].cohorts.push(pc);
    });

    const DAYS_SHORT_NAMES = ['', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];

    const groupedArray = Object.keys(groups).map(gKey => {
        const g = groups[gKey];
        const course = courses.find(c => c.id === g.courseId);
        
        let daysLabel = '';
        if (g.days && g.days.length > 0) {
            daysLabel = g.days.slice().sort().map(d => DAYS_SHORT_NAMES[d]).join(' y ');
        }
        
        const displayName = course ? (daysLabel ? `${course.name} (${daysLabel})` : course.name) : 'Sin curso';

        return { 
            groupKey: gKey, 
            courseId: g.courseId, 
            course, 
            daysLabel,
            displayName,
            cohorts: g.cohorts 
        };
    });

    // Ordenar los grupos
    groupedArray.sort((a, b) => {
        if (sortBy === 'name') {
            return a.displayName.localeCompare(b.displayName);
        } else if (sortBy === 'type') {
            const typeCompare = (a.course?.type || '').localeCompare(b.course?.type || '');
            if (typeCompare !== 0) return typeCompare;
            return a.displayName.localeCompare(b.displayName);
        } else if (sortBy === 'start') {
            const minA = Math.min(...a.cohorts.map(c => new Date(c.startDate).getTime()));
            const minB = Math.min(...b.cohorts.map(c => new Date(c.startDate).getTime()));
            return minA - minB;
        }
        return 0;
    });

    return (
        <>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-8">
            <div className="bg-slate-800 px-4 py-2 border-b border-slate-700 flex justify-between items-center">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Cronograma de Ejecución</h3>
                <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400">Ordenar por:</span>
                    <select 
                        value={sortBy} 
                        onChange={e => setSortBy(e.target.value)}
                        className="bg-slate-700 text-white border border-slate-600 rounded px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="type">Tipo de Curso</option>
                        <option value="name">Nombre</option>
                        <option value="start">Fecha de Inicio</option>
                    </select>
                </div>
            </div>
            <div className="overflow-x-auto">
                <div style={{ minWidth: '800px' }} className="p-4">
                    {/* Year + Month Headers */}
                    <div className="border-b border-slate-200 mb-4">
                        {/* Row 1: Year bars */}
                        <div className="flex">
                            <div className="w-56 flex-shrink-0" />
                            <div className="flex-1 flex">
                                {(() => {
                                    // Group consecutive months by year
                                    const yearGroups = [];
                                    timelineColumns.forEach(col => {
                                        const last = yearGroups[yearGroups.length - 1];
                                        if (last && last.year === col.year) last.count++;
                                        else yearGroups.push({ year: col.year, count: 1 });
                                    });
                                    return yearGroups.map((yg, i) => (
                                        <div
                                            key={i}
                                            className="text-center text-sm font-black text-white bg-slate-700 border-l border-slate-600 py-1.5 flex items-center justify-center"
                                            style={{ flex: yg.count }}
                                        >
                                            {yg.year}
                                        </div>
                                    ));
                                })()}
                            </div>
                        </div>
                        {/* Row 2: Month labels */}
                        <div className="flex">
                            <div className="w-56 flex-shrink-0" />
                            <div className="flex-1 flex">
                                {timelineColumns.map((col, i) => (
                                    <div key={i} className="flex-1 text-center text-xs font-bold text-slate-500 border-l border-slate-100 py-1 bg-slate-50">
                                        {MONTH_SHORT[col.month]}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Bars */}
                    <div className="space-y-4">
                        {groupedArray.map((group, idx) => {
                            const course = group.course;
                            const color = colorPalette[idx % colorPalette.length];

                            return (
                                <div key={group.groupKey} className="flex items-center group relative hover:bg-slate-50 transition-colors py-1 rounded">
                                    <div className="w-56 flex-shrink-0 pr-4">
                                        <div className="text-sm font-bold text-slate-800 truncate leading-tight" title={group.displayName}>
                                            {group.displayName}
                                        </div>
                                        <div className="text-xs text-slate-500 font-medium mt-0.5">
                                            {course?.type || 'Sin tipo'} • {group.cohorts.length} {group.cohorts.length === 1 ? 'cohorte' : 'cohortes'}
                                        </div>
                                    </div>
                                    <div className="flex-1 h-6 relative bg-slate-100/50 rounded overflow-hidden cursor-crosshair hover:bg-blue-50/50 transition-colors" onClick={(e) => {
                                        if (e.target === e.currentTarget) {
                                            handleTrackClick(e, group.courseId, group.cohorts[0]?.days || []);
                                        }
                                    }}>
                                        {group.cohorts.map(pc => {
                                            const left = dateToColPct(pc.startDate);
                                            const right = 100 - dateToColPct(pc.endDate);
                                            // Formateo corto de fecha ej. 14/05
                                            const startStr = pc.startDate ? new Date(pc.startDate + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '';
                                            return (
                                                <div 
                                                    key={pc.id}
                                                    className={`absolute inset-y-1 ${pc.isPaused ? 'bg-slate-400' : color} rounded shadow-sm flex items-center justify-center px-1 min-w-[24px] opacity-90 hover:opacity-100 hover:z-10 cursor-pointer transition-all border-x-2 border-white text-[9px] text-white/90 font-bold overflow-hidden whitespace-nowrap`}
                                                    style={{ left: `${left}%`, right: `${right}%` }}
                                                    onMouseEnter={(e) => {
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        setTooltip({ pc, course, daysLabel: group.daysLabel || 'Sin definir', x: rect.left + rect.width / 2, y: rect.top });
                                                    }}
                                                    onMouseMove={(e) => setTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY - 10 } : null)}
                                                    onMouseLeave={() => setTooltip(null)}
                                                    onDoubleClick={(e) => {
                                                        e.stopPropagation();
                                                        setTooltip(null);
                                                        setEditModal({ pc, draft: { ...pc } });
                                                    }}
                                                >
                                                    {startStr}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                        {/* Generic Track */}
                        <div className="flex items-center group relative hover:bg-blue-50/30 transition-colors py-1 rounded mt-4 border border-dashed border-slate-300">
                            <div className="w-56 flex-shrink-0 pr-4 pl-2 text-xs font-bold text-slate-500 flex items-center gap-1 cursor-pointer">
                                <span>+ Crear Nueva Cohorte</span>
                            </div>
                            <div 
                                className="flex-1 h-6 relative bg-transparent rounded cursor-crosshair"
                                onClick={(e) => handleTrackClick(e, '', [])}
                                title="Hacé clic en cualquier fecha para ubicar una nueva cohorte"
                            >
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity text-[10px] text-blue-400 font-bold tracking-widest uppercase">
                                    Hacé clic en la línea de tiempo para agregar
                                </div>
                            </div>
                        </div>

                        {validCohorts.length === 0 && (
                            <div className="text-center py-8 text-slate-400 text-xs italic">
                                Definí fechas de inicio y fin para ver el cronograma.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Quick Add Modal */}
            {quickAddModal && (
                <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-black text-slate-800">Agregar Cohorte Visualmente</h3>
                            <button onClick={() => setQuickAddModal(null)} className="text-slate-400 hover:text-red-500">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Curso</label>
                                {quickAddModal.courseId ? (
                                    <div className="flex justify-between items-center p-2 bg-blue-50 border border-blue-200 rounded-lg">
                                        <span className="text-sm font-medium text-blue-800">
                                            {courses.find(c => c.id === quickAddModal.courseId)?.name}
                                        </span>
                                        <button type="button" onClick={() => { setQuickAddModal({...quickAddModal, courseId: ''}); setCourseSearch(''); }} className="text-blue-500 hover:text-blue-700"><X size={16} /></button>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50 p-2 focus-within:ring-2 focus-within:ring-blue-500">
                                            <svg className="w-4 h-4 text-slate-400 mr-2 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                                            <input
                                                type="text"
                                                placeholder="Buscar curso..."
                                                className="w-full outline-none text-sm bg-transparent text-slate-900"
                                                value={courseSearch}
                                                onChange={e => setCourseSearch(e.target.value)}
                                                autoFocus
                                            />
                                        </div>
                                        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 shadow-lg rounded-lg max-h-52 overflow-y-auto">
                                            {courses
                                                .filter(c => c.name.toLowerCase().includes(courseSearch.toLowerCase()))
                                                .map(c => (
                                                    <div
                                                        key={c.id}
                                                        onClick={() => { setQuickAddModal({...quickAddModal, courseId: c.id}); setCourseSearch(c.name); }}
                                                        className="p-2.5 hover:bg-blue-50 cursor-pointer text-sm border-b last:border-0 flex justify-between items-center"
                                                    >
                                                        <span className="font-medium text-slate-900">{c.name}</span>
                                                        {c.totalHours && <span className="text-xs text-slate-400 ml-2">{c.totalHours}hs</span>}
                                                    </div>
                                                ))
                                            }
                                            {courses.filter(c => c.name.toLowerCase().includes(courseSearch.toLowerCase())).length === 0 && (
                                                <div className="p-3 text-sm text-slate-400 text-center">Sin resultados</div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Fecha de Inicio</label>
                                    <DatePicker 
                                        selected={quickAddModal.startDate ? parseISO(quickAddModal.startDate) : null} 
                                        onChange={date => setQuickAddModal({...quickAddModal, startDate: date ? format(date, 'yyyy-MM-dd') : ''})} 
                                        dateFormat="dd/MM/yyyy" isClearable placeholderText="dd/mm/aaaa"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Alumnos Est.</label>
                                    <input 
                                        type="number" min="1"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={quickAddModal.estimatedStudents}
                                        onChange={e => setQuickAddModal({...quickAddModal, estimatedStudents: parseInt(e.target.value) || 15})}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Días de Dictado</label>
                                <div className="flex gap-2">
                                    {[1, 2, 3, 4, 5, 6].map(d => (
                                        <button
                                            key={d}
                                            onClick={() => {
                                                const newDays = quickAddModal.days.includes(d)
                                                    ? quickAddModal.days.filter(x => x !== d)
                                                    : [...quickAddModal.days, d];
                                                setQuickAddModal({...quickAddModal, days: newDays});
                                            }}
                                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                                quickAddModal.days.includes(d) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                            }`}
                                        >
                                            {DAYS_SHORT_NAMES[d]}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Horas por Encuentro</label>
                                <input 
                                    type="number" step="0.5" min="0.5"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={quickAddModal.hoursPerMeeting}
                                    onChange={e => setQuickAddModal({...quickAddModal, hoursPerMeeting: parseFloat(e.target.value) || 4})}
                                />
                            </div>
                        </div>

                        <div className="mt-6 flex gap-3 justify-end">
                            <button 
                                onClick={() => setQuickAddModal(null)}
                                className="px-4 py-2 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={() => {
                                    if (quickAddModal.courseId && quickAddModal.startDate && quickAddModal.days.length > 0) {
                                        onAddCohort(quickAddModal);
                                        setQuickAddModal(null);
                                    } else {
                                        alert("Por favor completá el curso, la fecha de inicio y seleccioná al menos un día.");
                                    }
                                }}
                                className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                            >
                                Agregar Cohorte
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Tooltip */}
            {tooltip && (
                <div 
                    className="fixed z-50 bg-slate-900 text-white rounded-xl shadow-2xl p-4 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-3 w-64 border border-slate-700 backdrop-blur-md bg-opacity-95"
                    style={{ left: tooltip.x, top: tooltip.y }}
                >
                    <div className="font-bold text-sm text-white mb-1 border-b border-slate-700 pb-2">
                        {tooltip.course?.name || 'Sin curso'}
                    </div>
                    <div className="flex justify-between items-center mb-3">
                        <div className="text-xs text-blue-300 font-bold uppercase tracking-wide">
                            Días: {tooltip.daysLabel}
                        </div>
                        {tooltip.pc.isPaused && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-rose-500/30 text-rose-300 text-[9px] font-black rounded border border-rose-500/50">
                                <Pause size={8} /> PAUSADO
                            </span>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-y-2 text-xs">
                        <div className="flex flex-col">
                            <span className="text-slate-400 text-[10px] uppercase">Inicio</span>
                            <span className="font-medium text-slate-100">{fmtDate(tooltip.pc.startDate)}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-slate-400 text-[10px] uppercase">Fin</span>
                            <span className="font-medium text-slate-100">{fmtDate(tooltip.pc.endDate)}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-slate-400 text-[10px] uppercase">Hs/Encuentro</span>
                            <span className="font-medium text-slate-100">{tooltip.pc.hoursPerMeeting} hs</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-slate-400 text-[10px] uppercase">Alumnos Est.</span>
                            <span className="font-medium text-slate-100">{tooltip.pc.estimatedStudents || '-'}</span>
                        </div>
                    </div>
                    <div className="mt-3 text-[10px] text-slate-500 italic text-center border-t border-slate-800 pt-2">
                        Doble clic para editar cohorte
                    </div>
                </div>
            )}
        </div>
            {/* ── Edit Cohort Modal ──────────────────────────────────────── */}
            {editModal && (
                <div className="fixed inset-0 z-[110] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-in fade-in zoom-in duration-200">
                        {/* Header */}
                        <div className="bg-slate-800 rounded-t-2xl px-6 py-4 flex justify-between items-center">
                            <div>
                                <h3 className="text-base font-black text-white">Editar Cohorte</h3>
                                <p className="text-xs text-slate-400 mt-0.5">{courses.find(c => c.id === editModal.draft.courseId)?.name || 'Sin curso asignado'}</p>
                            </div>
                            <button onClick={() => setEditModal(null)} className="text-slate-400 hover:text-white transition">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>

                        <div className="p-6 space-y-5">
                            {/* Dates */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Fecha de Inicio</label>
                                    <DatePicker
                                        selected={editModal.draft.startDate ? parseISO(editModal.draft.startDate) : null}
                                        onChange={d => setEditModal(m => ({ ...m, draft: { ...m.draft, startDate: d ? format(d, 'yyyy-MM-dd') : '' } }))}
                                        dateFormat="dd/MM/yyyy" isClearable placeholderText="dd/mm/aaaa"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Fecha de Fin</label>
                                    <DatePicker
                                        selected={editModal.draft.endDate ? parseISO(editModal.draft.endDate) : null}
                                        onChange={d => setEditModal(m => ({ ...m, draft: { ...m.draft, endDate: d ? format(d, 'yyyy-MM-dd') : '' } }))}
                                        dateFormat="dd/MM/yyyy" isClearable placeholderText="dd/mm/aaaa"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                            </div>

                            {/* Days */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Días de Dictado</label>
                                <div className="flex gap-2">
                                    {[{v:1,l:'Lu'},{v:2,l:'Ma'},{v:3,l:'Mi'},{v:4,l:'Ju'},{v:5,l:'Vi'},{v:6,l:'Sa'}].map(d => (
                                        <button key={d.v}
                                            onClick={() => {
                                                const days = editModal.draft.days || [];
                                                setEditModal(m => ({ ...m, draft: { ...m.draft, days: days.includes(d.v) ? days.filter(x => x !== d.v) : [...days, d.v] } }));
                                            }}
                                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${(editModal.draft.days||[]).includes(d.v) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                                        >{d.l}</button>
                                    ))}
                                </div>
                            </div>

                            {/* Hs/encuentro + Alumnos */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Horas / Encuentro</label>
                                    <input type="number" step="0.5" min="0.5"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={editModal.draft.hoursPerMeeting || ''}
                                        onChange={e => setEditModal(m => ({ ...m, draft: { ...m.draft, hoursPerMeeting: parseFloat(e.target.value) || 0 } }))}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Alumnos Estimados</label>
                                    <input type="number" min="0"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={editModal.draft.estimatedStudents || ''}
                                        onChange={e => setEditModal(m => ({ ...m, draft: { ...m.draft, estimatedStudents: parseInt(e.target.value) || 0 } }))}
                                    />
                                </div>
                            </div>

                            <div className="flex gap-6">
                                <label className="flex items-center gap-3 cursor-pointer select-none">
                                    <div className={`w-10 h-5 rounded-full transition-colors ${editModal.draft.isFree ? 'bg-amber-400' : 'bg-slate-200'} relative`}>
                                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${editModal.draft.isFree ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                    </div>
                                    <input type="checkbox" className="hidden" checked={!!editModal.draft.isFree}
                                        onChange={e => setEditModal(m => ({ ...m, draft: { ...m.draft, isFree: e.target.checked } }))} />
                                    <span className="text-sm font-semibold text-slate-700">Curso Gratuito</span>
                                </label>

                                <label className="flex items-center gap-3 cursor-pointer select-none">
                                    <div className={`w-10 h-5 rounded-full transition-colors ${editModal.draft.isPaused ? 'bg-rose-500' : 'bg-slate-200'} relative`}>
                                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${editModal.draft.isPaused ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                    </div>
                                    <input type="checkbox" className="hidden" checked={!!editModal.draft.isPaused}
                                        onChange={e => setEditModal(m => ({ ...m, draft: { ...m.draft, isPaused: e.target.checked } }))} />
                                    <span className="text-sm font-semibold text-slate-700">Pausar Imputación</span>
                                </label>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 pb-6 flex gap-3 justify-end">
                            <button onClick={() => setEditModal(null)}
                                className="px-4 py-2 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors">
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    if (onUpdateCohort) onUpdateCohort(editModal.draft);
                                    setEditModal(null);
                                }}
                                className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
                            >
                                Guardar Cambios
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

// ─── Main Budget Manager ──────────────────────────────────────────────────────
const BudgetManager = ({ budgets, courses, holidays }) => {
    const holidayDates = useMemo(() => getFlatHolidayDates(holidays), [holidays]);
    const [selectedBudgetId, setSelectedBudgetId] = useState(budgets[0]?.id || null);
    const [localBudget, setLocalBudget] = useState(null);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteInput, setDeleteInput] = useState('');
    const [activeTab, setActiveTab] = useState('cohortes'); // 'centro' | 'cohortes' | 'resumen' | 'cronograma'

    // Sync local state from Firestore budget
    useEffect(() => {
        const found = budgets.find(b => b.id === selectedBudgetId);
        if (found) { 
            setLocalBudget({ 
                ...found, 
                centerCosts: found.centerCosts || [], 
                plannedCohorts: found.plannedCohorts || [],
                categoryPrices: found.categoryPrices || { CFP: 0, ACCFP: 0, AC: 0 },
                operatingDays: found.operatingDays || [1, 2, 3, 4, 5]
            }); 
        }
        else { setLocalBudget(null); }
        setDirty(false);
    }, [selectedBudgetId, budgets.length]);  // eslint-disable-line

    // Auto-save 2s after last change
    useEffect(() => {
        if (!dirty || !localBudget?.id) return;
        const timer = setTimeout(async () => {
            setSaving(true);
            const { id, ...data } = localBudget;
            try {
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'budgets', id), data);
            } catch (e) { console.error('Error saving budget:', e); }
            setSaving(false);
            setDirty(false);
        }, 1800);
        return () => clearTimeout(timer);
    }, [localBudget, dirty]);

    const updateBudget = (changes) => {
        setLocalBudget(prev => ({ ...prev, ...changes }));
        setDirty(true);
    };

    const createBudget = async (year) => {
        const newBudget = {
            name: `Budget Jul ${year} — Jun ${year + 1}`,
            startYear: year,
            categoryPrices: { CFP: 0, ACCFP: 0, AC: 0 },
            operatingDays: [1, 2, 3, 4, 5],
            centerCosts: [
                { id: generateId(), name: 'Sueldo Coordinador', amount: 0, frequency: 'monthly' },
                { id: generateId(), name: 'Sueldo Preceptor', amount: 0, frequency: 'monthly' },
                { id: generateId(), name: 'Staff / Administrativo', amount: 0, frequency: 'monthly' },
                { id: generateId(), name: 'Servicios / Mantenimiento', amount: 0, frequency: 'monthly' },
                { id: generateId(), name: 'Gastos de Comunicación', amount: 0, frequency: 'monthly' },
                { id: generateId(), name: 'Insumos Varios', amount: 0, frequency: 'monthly' },
                { id: generateId(), name: 'Gastos Generales', amount: 0, frequency: 'monthly' },
                { id: generateId(), name: 'Capacitaciones', amount: 0, frequency: 'annual' },
            ],
            plannedCohorts: [],
        };
        try {
            const ref = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'budgets'), newBudget);
            setSelectedBudgetId(ref.id);
        } catch (e) {
            console.error('Error creating budget:', e);
            alert('Error al crear el budget: ' + e.message);
        }
    };

    const handleDeleteBudget = async () => {
        if (!localBudget) return;
        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'budgets', localBudget.id));
            setSelectedBudgetId(null);
            setLocalBudget(null);
            setShowDeleteConfirm(false);
            setDeleteInput('');
        } catch (e) {
            console.error('Error deleting budget:', e);
            alert('Error al eliminar: ' + e.message);
        }
    };

    // ── Calculations ──────────────────────────────────────────────────────────
    const { centerCostsTotal, hourlyCenterRate, totalOperatingHoursAnual, totalImputedCenterCost, payingCohortCount, totals } = useMemo(() => {
        const fallback = { 
            centerCostsTotal: 0, 
            hourlyCenterRate: 0, 
            totalOperatingHoursAnual: 0, 
            totalImputedCenterCost: 0, 
            payingCohortCount: 0,
            totals: { totalIncome: 0, totalExpenses: 0, balance: 0 } 
        };

        if (!localBudget) return fallback;

        try {
            const centerCostsTotal = (localBudget.centerCosts || []).filter(Boolean).reduce((s, c) => s + calcCenterCostAnnual(c), 0);
            const operatingDaysCount = (localBudget.operatingDays || []).length;
            const totalOperatingHoursAnual = operatingDaysCount * 4 * 52; 
            const hourlyCenterRate = totalOperatingHoursAnual > 0 ? centerCostsTotal / totalOperatingHoursAnual : 0;

            let totalIncome = 0;
            let totalCourseExpenses = 0;
            let totalImputedCenterCost = 0;

            const safeCohorts = (localBudget.plannedCohorts || []).filter(pc => pc && pc.id && !pc.isPaused);

            safeCohorts.forEach(pc => {
                const course = (courses || []).find(c => c.id === pc.courseId);
                const dm = getDurationMonths(pc.startDate, pc.endDate);
                const dStr = (pc.startDate && pc.endDate) ? (new Date(pc.endDate) - new Date(pc.startDate)) / (1000 * 60 * 60 * 24) : 0;
                const durationWeeks = !isNaN(dStr) ? Math.max(0, Math.round(dStr / 7)) : 0;

                const academicMonths = getAcademicMonths(course, pc);
                const academicWeeks = getAcademicWeeks(course, pc, durationWeeks);

                const pcCourseCosts = (pc.courseCosts || []).filter(Boolean).reduce((s, c) => s + calcCourseCostItem(c, academicMonths, pc), 0);
                totalCourseExpenses += pcCourseCosts;

                const currentImputedCenterCost = (Number(pc.imputedWeeklyHours) || 0) * hourlyCenterRate * academicWeeks;
                if (!pc.isFree) totalImputedCenterCost += currentImputedCenterCost;

                if (!pc.isFree) {
                    const catPrice = localBudget.categoryPrices?.[course?.type] || 0;
                    const estStudents = Number(pc.estimatedStudents) || 0;
                    const scholarshipPct = Number(pc.scholarshipPct) || 0;
                    const academicMonths = getAcademicMonths(course, pc);

                    if (catPrice > 0) {
                        const rawIncome = catPrice * academicMonths * estStudents;
                        totalIncome += rawIncome * (1 - scholarshipPct / 100);
                    } else {
                        const subtotal = pcCourseCosts + currentImputedCenterCost;
                        const marginAmt = subtotal * ((Number(pc.marginPct) || 0) / 100);
                        totalIncome += (subtotal + marginAmt) * (1 - scholarshipPct / 100);
                    }
                }
            });

            const totalExpenses = centerCostsTotal + totalCourseExpenses;
            const payingCohortCount = safeCohorts.filter(pc => !pc.isFree).length;
            const balance = totalIncome - totalExpenses;

            return { 
                centerCostsTotal, 
                hourlyCenterRate, 
                totalOperatingHoursAnual, 
                totalImputedCenterCost,
                payingCohortCount,
                totals: { totalIncome, totalExpenses, balance } 
            };
        } catch (err) {
            console.error("Error in financial calculations:", err);
            return fallback;
        }
    }, [localBudget, courses]);

    // ── Handlers ──────────────────────────────────────────────────────────────
    const addCenterCost = () => updateBudget({
        centerCosts: [...(localBudget.centerCosts || []), { id: generateId(), name: 'Nuevo Costo', amount: 0, frequency: 'monthly' }]
    });
    const updateCenterCost = (id, updated) => updateBudget({
        centerCosts: localBudget.centerCosts.map(c => c.id === id ? { ...c, ...updated } : c)
    });
    const deleteCenterCost = (id) => updateBudget({ centerCosts: localBudget.centerCosts.filter(c => c.id !== id) });

    const TEACHER_COST_ID = '__teacher__';

    const addPlannedCohort = () => updateBudget({
        plannedCohorts: [...(localBudget.plannedCohorts || []), {
            id: generateId(), courseId: '', startDate: '', endDate: '',
            days: [], hoursPerMeeting: '', estimatedStudents: '', marginPct: 20,
            teacherHourlyRate: '', imputedWeeklyHours: 4, isFree: false,
            courseCosts: [
                { id: TEACHER_COST_ID, name: 'Honorarios Docente', amount: 0, frequency: 'once', isTeacherCost: true }
            ]
        }]
    });

    const addPlannedCohortVisual = (data) => {
        const course = courses.find(c => c.id === data.courseId);
        const defaultCosts = course?.defaultCosts ? course.defaultCosts.map(dc => ({ ...dc, id: generateId(), isDefault: true })) : [];
        const newCohort = {
            id: generateId(), courseId: '', startDate: '', endDate: '',
            days: [], hoursPerMeeting: 4, estimatedStudents: 15, marginPct: 20,
            teacherHourlyRate: '', imputedWeeklyHours: 4, isFree: false,
            courseCosts: [
                { id: TEACHER_COST_ID, name: 'Honorarios Docente', amount: 0, frequency: 'once', isTeacherCost: true },
                ...defaultCosts
            ],
            ...data
        };
        // Auto-calculate endDate if we have enough info
        if (newCohort.startDate && newCohort.days?.length > 0 && newCohort.hoursPerMeeting) {
            const course = courses.find(c => c.id === newCohort.courseId);
            if (course?.totalHours) {
                const computed = calculateEndDate(newCohort.startDate, course.totalHours, newCohort.hoursPerMeeting, newCohort.days, holidayDates);
                if (computed) newCohort.endDate = computed;
            }
        }
        updateBudget({ plannedCohorts: [...(localBudget.plannedCohorts || []), newCohort] });
    };
    const updatePlannedCohort = (id, updated) => updateBudget({
        plannedCohorts: localBudget.plannedCohorts.map(pc => pc.id === id ? { ...pc, ...updated } : pc)
    });
    const deletePlannedCohort = (id) => updateBudget({
        plannedCohorts: localBudget.plannedCohorts.filter(pc => pc.id !== id)
    });

    const handleRepeatToEnd = (pc) => {
        if (!pc.startDate || !pc.endDate || !pc.days || pc.days.length === 0) {
            alert('Asegurate de que la cohorte tenga fecha de inicio, fin y días de dictado definidos.');
            return;
        }

        const maxDateStr = `${localBudget.startYear + 1}-06-30`;
        const course = courses.find(c => c.id === pc.courseId);
        if (!course || !course.totalHours || !pc.hoursPerMeeting) {
            alert('El curso debe tener horas totales definidas y las horas por encuentro.');
            return;
        }

        let newCohorts = [];
        let currentEndDateStr = pc.endDate;

        while (currentEndDateStr < maxDateStr && newCohorts.length < 15) {
            // Find next valid start date
            let nextStart = new Date(currentEndDateStr + 'T12:00:00');
            nextStart.setDate(nextStart.getDate() + 1);
            let iterations = 0;
            while (iterations < 60) {
                const dateStr = nextStart.toISOString().split('T')[0];
                if (pc.days.includes(nextStart.getDay()) && !holidayDates.has(dateStr)) {
                    break;
                }
                nextStart.setDate(nextStart.getDate() + 1);
                iterations++;
            }
            
            const nextStartDateStr = nextStart.toISOString().split('T')[0];
            const nextEndDateStr = calculateEndDate(nextStartDateStr, course.totalHours, pc.hoursPerMeeting, pc.days, holidayDates);
            
            if (!nextEndDateStr) break;

            const newCohort = {
                ...pc,
                id: generateId(),
                startDate: nextStartDateStr,
                endDate: nextEndDateStr,
                courseCosts: (pc.courseCosts || []).map(c => ({ ...c, id: c.id === TEACHER_COST_ID ? TEACHER_COST_ID : generateId() }))
            };
            
            newCohorts.push(newCohort);
            currentEndDateStr = nextEndDateStr;
        }

        if (newCohorts.length > 0) {
            updateBudget({
                plannedCohorts: [...(localBudget.plannedCohorts || []), ...newCohorts]
            });
        } else {
            alert('La cohorte ya cubre todo el budget o no entra otra cohorte en el tiempo restante.');
        }
    };

    const handleBulkUpdate = (patch, onlyScholarship = false) => {
        updateBudget({
            plannedCohorts: localBudget.plannedCohorts.map(pc => {
                if (onlyScholarship && !pc.hasScholarship) return pc;
                
                let updated = { ...pc, ...patch };
                // If teacher rate changed, we need to recalculate teacher cost item
                if (patch.teacherHourlyRate !== undefined) {
                    updated = applyTeacherCost(updated);
                }
                return updated;
            })
        });
    };

    const handleBulkPause = (paused) => {
        const count = (localBudget.plannedCohorts || []).filter(pc => !pc.isFree).length;
        if (!confirm(`¿${paused ? 'Pausar' : 'Reactivar'} la imputación de las ${count} cohortes aranceladas (AC)?`)) return;
        updateBudget({
            plannedCohorts: localBudget.plannedCohorts.map(pc => 
                !pc.isFree ? { ...pc, isPaused: paused } : pc
            )
        });
    };

    const handleApplyScholarshipToAll = (courseId, pct) => {
        if (!confirm(`¿Aplicar beca del ${pct}% a todas las cohortes de este curso en el budget actual?`)) return;
        updateBudget({
            plannedCohorts: localBudget.plannedCohorts.map(pc => 
                pc.courseId === courseId 
                ? { ...pc, hasScholarship: true, scholarshipPct: pct } 
                : pc
            )
        });
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="w-full space-y-6">
            {/* Delete confirmation modal */}
            {showDeleteConfirm && localBudget && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 border border-red-200">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                                <Trash2 size={20} className="text-red-600" />
                            </div>
                            <div>
                                <h3 className="font-black text-slate-800">Eliminar Budget</h3>
                                <p className="text-xs text-slate-500">Esta acción no se puede deshacer.</p>
                            </div>
                        </div>
                        <div className="bg-red-50 rounded-lg p-3 mb-4 border border-red-100">
                            <p className="text-sm text-slate-700 mb-1">Vas a eliminar permanentemente:</p>
                            <p className="font-bold text-red-700">{localBudget.name}</p>
                            <p className="text-xs text-slate-500 mt-1">{(localBudget.plannedCohorts || []).length} cohortes planificadas · {(localBudget.centerCosts || []).length} costos del centro</p>
                        </div>
                        <p className="text-sm text-slate-600 mb-2">Para confirmar, escribí <strong className="text-red-600">ELIMINAR</strong>:</p>
                        <input
                            autoFocus
                            value={deleteInput}
                            onChange={e => setDeleteInput(e.target.value)}
                            className="w-full border border-red-300 rounded-lg px-3 py-2 text-slate-800 bg-white mb-4 focus:ring-2 focus:ring-red-400 outline-none"
                            placeholder="Escribí ELIMINAR"
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={handleDeleteBudget}
                                disabled={deleteInput !== 'ELIMINAR'}
                                className="flex-1 bg-red-600 text-white py-2 rounded-lg font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-700 transition"
                            >
                                Eliminar definitivamente
                            </button>
                            <button onClick={() => { setShowDeleteConfirm(false); setDeleteInput(''); }}
                                className="flex-1 bg-slate-100 text-slate-700 py-2 rounded-lg font-bold hover:bg-slate-200 transition">
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Top bar */}
            <div className="flex justify-between items-center flex-wrap gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-2">
                <BudgetSelector budgets={budgets} selectedId={selectedBudgetId} onSelect={setSelectedBudgetId} onCreate={createBudget} />
                
                {localBudget && (
                    <div className="flex items-center gap-4 border-l border-slate-200 pl-4 ml-4 overflow-x-auto no-scrollbar">
                        <div className="flex flex-col">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Cuota Mensual (USD)</label>
                            <div className="flex gap-2">
                                {['CFP', 'ACCFP', 'AC'].map(cat => (
                                    <div key={cat} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                                        <span className="text-[10px] font-bold text-slate-500">{cat}</span>
                                        <div className="relative">
                                            <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">$</span>
                                            <input 
                                                type="number" 
                                                value={localBudget.categoryPrices?.[cat] || ''} 
                                                onChange={e => updateBudget({ categoryPrices: { ...localBudget.categoryPrices, [cat]: Number(e.target.value) } })}
                                                className="w-14 bg-transparent border-0 text-[11px] font-black text-slate-800 p-0 pl-3 shadow-none focus:ring-0" 
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-3 ml-auto">
                    {dirty && <span className="text-xs text-amber-600 flex items-center gap-1"><RefreshCw size={12} className="animate-spin" /> Guardando...</span>}
                    {!dirty && saving === false && localBudget && <span className="text-xs text-emerald-600 flex items-center gap-1"><Check size={12} /> Guardado</span>}
                    {localBudget && (
                        <>
                            <button
                                onClick={() => exportBudgetToExcel(localBudget, courses, hourlyCenterRate, totals)}
                                className="flex items-center gap-2 bg-emerald-600 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-emerald-700 transition shadow-sm"
                            >
                                <FileDown size={14} /> Exportar
                            </button>
                            <button
                                onClick={() => { setShowDeleteConfirm(true); setDeleteInput(''); }}
                                className="flex items-center gap-2 bg-red-50 text-red-600 border border-red-100 px-3 py-2 rounded-lg text-xs font-bold hover:bg-red-100 transition"
                            >
                                <Trash2 size={14} />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {!localBudget ? (
                <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm">
                    <BarChart2 size={48} className="text-slate-300 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-slate-700 mb-2">Seleccioná o creá un Budget</h2>
                    <p className="text-slate-400 text-sm">Cada período cubre de Julio a Junio del año siguiente.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* ── Tab Bar ─────────────────────────────────────────── */}
                    <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm w-fit">
                        {[
                            { id: 'centro',     label: 'Costos del Centro', icon: <DollarSign size={14} /> },
                            { id: 'cohortes',   label: 'Cohortes',          icon: <Calendar size={14} /> },
                            { id: 'resumen',    label: 'Resumen',           icon: <BarChart2 size={14} /> },
                            { id: 'cronograma', label: 'Cronograma',        icon: <TrendingUp size={14} /> },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                                    activeTab === tab.id
                                        ? 'bg-slate-800 text-white shadow-sm'
                                        : 'text-slate-500 hover:bg-slate-100'
                                }`}
                            >
                                {tab.icon}{tab.label}
                            </button>
                        ))}
                    </div>

                    {/* ── TAB: Costos del Centro ───────────────────────────── */}
                    {activeTab === 'centro' && (
                        <div className="flex gap-6 items-start">
                            <div className="flex-none w-80 space-y-4">
                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="bg-slate-800 px-4 py-3 flex items-center justify-between">
                                        <div>
                                            <h3 className="text-sm font-bold text-white">Costos del Centro</h3>
                                            <p className="text-[10px] text-slate-400">Distribución por uso horario</p>
                                        </div>
                                        <button onClick={addCenterCost} className="text-slate-400 hover:text-white transition"><PlusCircle size={18} /></button>
                                    </div>
                                    <div className="p-4 bg-slate-50 border-b border-slate-100">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Días de Operación (4hs/día)</label>
                                        <div className="flex flex-wrap gap-1">
                                            {[{ v:1,l:'Lu'},{v:2,l:'Ma'},{v:3,l:'Mi'},{v:4,l:'Ju'},{v:5,l:'Vi'},{v:6,l:'Sa'}].map(day => (
                                                <button key={day.v}
                                                    onClick={() => { const c=localBudget.operatingDays||[]; updateBudget({operatingDays: c.includes(day.v)?c.filter(d=>d!==day.v):[...c,day.v]}); }}
                                                    className={`w-8 h-8 rounded text-[10px] font-black border transition ${(localBudget.operatingDays||[]).includes(day.v)?'bg-slate-800 text-white border-slate-800':'bg-white text-slate-400 border-slate-200 hover:border-slate-400'}`}
                                                >{day.l}</button>
                                            ))}
                                        </div>
                                        <div className="mt-3 space-y-1">
                                            <div className="flex justify-between text-[10px]"><span className="text-slate-400">Horas Anuales:</span><span className="font-bold text-slate-600">{totalOperatingHoursAnual} hs</span></div>
                                            <div className="flex justify-between text-[10px]"><span className="text-slate-400">Valor Hora:</span><span className="font-black text-blue-600">{fmt(hourlyCenterRate)}/hr</span></div>
                                        </div>
                                    </div>
                                    <div className="p-4">
                                        {(localBudget.centerCosts || []).map(cost => (
                                            <CenterCostRow key={cost.id} cost={cost} onChange={updated => updateCenterCost(cost.id, updated)} onDelete={() => deleteCenterCost(cost.id)} />
                                        ))}
                                        {localBudget.centerCosts?.length === 0 && <p className="text-xs text-slate-400 italic py-2">Sin costos del centro.</p>}
                                    </div>
                                    <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-2">
                                        <div className="flex justify-between text-sm font-bold text-slate-800"><span>Gasto Real Anual</span><span>{fmt(centerCostsTotal)}</span></div>
                                        <div className="flex justify-between items-center text-[10px] text-slate-500 pt-1">
                                            <span>Absorbido por cursos:</span>
                                            <span className={`font-black ${totalImputedCenterCost >= centerCostsTotal ? 'text-emerald-600' : 'text-orange-600'}`}>
                                                {fmt(totalImputedCenterCost)} ({Math.round((totalImputedCenterCost/(centerCostsTotal||1))*100)}%)
                                            </span>
                                        </div>
                                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                            <div className={`h-full transition-all ${totalImputedCenterCost>=centerCostsTotal?'bg-emerald-500':'bg-orange-500'}`}
                                                style={{width:`${Math.min(100,(totalImputedCenterCost/(centerCostsTotal||1))*100)}%`}} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {/* Balance sidebar */}
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3 w-64">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Balance del Budget</h3>
                                <div className="flex justify-between text-sm"><span className="flex items-center gap-1 text-emerald-600"><TrendingUp size={14} /> Ingreso Proyectado</span><span className="font-bold text-emerald-600">{fmt(totals.totalIncome)}</span></div>
                                <div className="flex justify-between text-sm"><span className="flex items-center gap-1 text-rose-600"><TrendingDown size={14} /> Total Egresos</span><span className="font-bold text-rose-600">{fmt(totals.totalExpenses)}</span></div>
                                <div className={`flex justify-between text-base font-black border-t pt-3 ${totals.balance>=0?'text-emerald-700':'text-red-700'}`}><span>Resultado</span><span>{fmt(totals.balance)}</span></div>
                                {totals.balance < 0 && <div className="flex items-center gap-2 text-[11px] text-red-600 bg-red-50 rounded-lg px-3 py-2"><AlertCircle size={14} />El presupuesto está en déficit.</div>}
                            </div>
                        </div>
                    )}

                    {/* ── TAB: Cohortes ────────────────────────────────────── */}
                    {activeTab === 'cohortes' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h3 className="font-bold text-slate-800">{localBudget.name}</h3>
                                    <p className="text-xs text-slate-500">{(localBudget.plannedCohorts||[]).length} cohortes planificadas · {payingCohortCount} aranceladas</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="bg-slate-100 p-1 rounded-lg flex gap-1 mr-2">
                                        <button onClick={() => handleBulkPause(true)} className="flex items-center gap-1 px-3 py-1.5 bg-white text-slate-600 rounded-md hover:bg-rose-50 hover:text-rose-600 transition text-[10px] font-bold shadow-sm">
                                            <Pause size={12} /> Pausar AC
                                        </button>
                                        <button onClick={() => handleBulkPause(false)} className="flex items-center gap-1 px-3 py-1.5 bg-white text-slate-600 rounded-md hover:bg-emerald-50 hover:text-emerald-600 transition text-[10px] font-bold shadow-sm">
                                            <Play size={12} /> Activar AC
                                        </button>
                                    </div>
                                    <BulkCohortEditor onApply={handleBulkUpdate} />
                                    <button onClick={addPlannedCohort} className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 shadow-sm transition text-sm font-bold">
                                        <PlusCircle size={16} /> Agregar Cohorte
                                    </button>
                                </div>
                            </div>
                            {(localBudget.plannedCohorts||[]).length === 0 && (
                                <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
                                    <Calendar size={36} className="text-slate-300 mx-auto mb-3" />
                                    <p className="text-slate-500 font-medium mb-1">Sin cohortes planificadas</p>
                                    <p className="text-slate-400 text-xs">Agregá las cohortes que pensás dictar en este período y calculá su presupuesto.</p>
                                </div>
                            )}
                            {(localBudget.plannedCohorts||[]).filter(pc => pc && pc.id).map(pc => (
                                <PlannedCohortCard key={pc.id} pc={pc} courses={courses || []} holidayDates={holidayDates}
                                    hourlyCenterRate={hourlyCenterRate} categoryPrices={localBudget.categoryPrices}
                                    onChange={updated => updatePlannedCohort(pc.id, updated)}
                                    onDelete={() => deletePlannedCohort(pc.id)}
                                    onRepeatToEnd={handleRepeatToEnd}
                                    onApplyScholarshipToAll={handleApplyScholarshipToAll} />
                            ))}
                        </div>
                    )}

                    {/* ── TAB: Resumen ─────────────────────────────────────── */}
                    {activeTab === 'resumen' && (
                        <BudgetBalanceView
                            budget={localBudget}
                            courses={courses}
                            totals={totals}
                            centerCostsTotal={centerCostsTotal}
                            hourlyCenterRate={hourlyCenterRate}
                        />
                    )}

                    {/* ── TAB: Cronograma ──────────────────────────────────── */}
                    {activeTab === 'cronograma' && (
                        <BudgetGanttView
                            plannedCohorts={localBudget.plannedCohorts}
                            courses={courses}
                            startYear={localBudget.startYear}
                            onAddCohort={addPlannedCohortVisual}
                            onUpdateCohort={(updated) => updatePlannedCohort(updated.id, updated)}
                        />
                    )}
                </div>
            )}
        </div>
    );
};



// ─── Local Error Boundary for Budget ──────────────────────────────────────────
class BudgetErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) { return { hasError: true, error }; }
    render() {
        if (this.state.hasError) {
            return (
                <div className="bg-white rounded-2xl p-12 text-center border border-red-200 shadow-xl max-w-2xl mx-auto my-10">
                    <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle size={32} />
                    </div>
                    <h2 className="text-xl font-black text-slate-800 mb-2">Error en el Módulo de Presupuesto</h2>
                    <p className="text-slate-600 text-sm mb-6">Algo salió mal al calcular los datos financieros. Es posible que existan datos corruptos en el presupuesto seleccionado.</p>
                    <div className="text-left bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6 overflow-x-auto">
                        <code className="text-[10px] text-red-600 break-all">{this.state.error?.toString()}</code>
                    </div>
                    <button onClick={() => window.location.reload()} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 transition shadow-md">
                        Recargar Aplicación
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

const BudgetManagerWrapper = (props) => (
    <BudgetErrorBoundary>
        <BudgetManager {...props} />
    </BudgetErrorBoundary>
);

export default BudgetManagerWrapper;
