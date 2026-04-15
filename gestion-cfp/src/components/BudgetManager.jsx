import React, { useState, useEffect, useMemo } from 'react';
import { updateDoc, addDoc, deleteDoc, doc, collection } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db, appId } from '../services/firebase';
import { eachDayOfInterval, format, parseISO } from 'date-fns';
import { DAYS_OF_WEEK } from '../constants';
import {
    PlusCircle, Trash2, ChevronDown, ChevronUp, Edit, X, Check,
    DollarSign, TrendingUp, TrendingDown, AlertCircle, BarChart2,
    Calendar, Users, Percent, RefreshCw, FileDown
} from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0
}).format(Number(n) || 0);

const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

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

const getDurationMonths = (startDate, endDate) => {
    if (!startDate || !endDate) return 0;
    const s = new Date(startDate + 'T12:00:00');
    const e = new Date(endDate + 'T12:00:00');
    return Math.max(1, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1);
};

const calcCenterCostAnnual = (cost) => {
    const amt = Number(cost.amount) || 0;
    return cost.frequency === 'monthly' ? amt * 12 : amt;
};

const calcCourseCostItem = (cost, durationMonths) => {
    const amt = Number(cost.amount) || 0;
    if (cost.frequency === 'monthly') return amt * durationMonths;
    if (cost.frequency === 'annual') return amt * (durationMonths / 12);
    return amt; // 'once'
};

// Calcula fecha de fin a partir de horas totales del curso, hs/encuentro y días de la semana
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
        if (sessionCount < sessions) date.setDate(date.getDate() + 1);
        iterations++;
    }
    return date.toISOString().split('T')[0];
};

// ─── Excel Export ─────────────────────────────────────────────────────────────
const exportBudgetToExcel = (budget, courses, centerCostPerPaying, totals) => {
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
        [`Prorrateo por curso (÷ ${payingCount} arancelados)`, '', '', '', centerCostPerPaying],
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
    const headers = ['Curso', 'Inicio', 'Fin', 'Meses', 'Alumnos Est.', 'Costos Curso USD', 'Prorrateo Centro USD', 'Margen %', 'Margen USD', 'Costo Total USD', 'Cuota USD', 'Ingreso Proy. USD', 'GRATUITO'];
    const cohortRows = (budget.plannedCohorts || []).map(pc => {
        const course = courses.find(c => c.id === pc.courseId);
        const dm = getDurationMonths(pc.startDate, pc.endDate);
        const courseCost = (pc.courseCosts || []).reduce((s, c) => s + calcCourseCostItem(c, dm), 0);
        const share = pc.isFree ? 0 : centerCostPerPaying;
        const sub = courseCost + share;
        const marginPct = Number(pc.marginPct) || 0;
        const marginAmt = sub * (marginPct / 100);
        const total = sub + marginAmt;
        const est = Number(pc.estimatedStudents) || 0;
        const cuota = est > 0 && !pc.isFree ? total / est : 0;
        const income = pc.isFree ? 0 : total;
        return [course?.name || 'Sin asignar', pc.startDate || '', pc.endDate || '', dm, est || '', courseCost, share, marginPct, marginAmt, total, cuota || '', income, pc.isFree ? 'SÍ' : 'NO'];
    });
    const ws2 = XLSX.utils.aoa_to_sheet([headers, ...cohortRows]);
    ws2['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 10 }];
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

// ─── Budget Timeline (Gantt) ──────────────────────────────────────────────────
const BudgetGanttView = ({ plannedCohorts, courses, startYear }) => {
    // Rango base: Julio (Año Inicio) -> Junio (Año Siguiente)
    const baseStart = new Date(startYear, 6, 1);
    const baseEnd = new Date(startYear + 1, 5, 30);

    const validCohorts = (plannedCohorts || []).filter(pc => pc.startDate);
    if (validCohorts.length === 0) return null;

    // Calcular rango real (base + extremos de las cohortes)
    const allStarts = validCohorts.map(c => new Date(c.startDate + 'T12:00:00'));
    const allEnds = validCohorts.map(c => new Date((c.endDate || c.startDate) + 'T12:00:00'));

    const minDate = new Date(Math.min(baseStart, ...allStarts));
    const maxDate = new Date(Math.max(baseEnd, ...allEnds));

    // Columnas por mes
    const startCursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    const endLimit = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);

    const timelineColumns = [];
    const cursor = new Date(startCursor);
    while (cursor <= endLimit) {
        timelineColumns.push({ year: cursor.getFullYear(), month: cursor.getMonth() });
        cursor.setMonth(cursor.getMonth() + 1);
    }
    const totalCols = timelineColumns.length;

    const dateToColPct = (date) => {
        const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        const colIndex = (date.getFullYear() - startCursor.getFullYear()) * 12 + (date.getMonth() - startCursor.getMonth());
        return ((colIndex + (date.getDate() - 1) / daysInMonth) / totalCols) * 100;
    };

    const yearGroups = [];
    timelineColumns.forEach(col => {
        const last = yearGroups[yearGroups.length - 1];
        if (last && last.year === col.year) { last.count++; }
        else yearGroups.push({ year: col.year, count: 1 });
    });

    const colorPalette = ['bg-blue-500', 'bg-emerald-500', 'bg-orange-400', 'bg-violet-500', 'bg-rose-500', 'bg-cyan-600', 'bg-amber-500', 'bg-teal-500', 'bg-indigo-500', 'bg-pink-500'];
    const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const colWidth = 60;

    return (
        <div className="mt-10 space-y-4">
            <div className="flex items-center gap-2 px-1">
                <div className="bg-slate-100 p-1.5 rounded-lg">
                    <Calendar className="text-slate-600" size={18} />
                </div>
                <div>
                    <h3 className="font-bold text-slate-800 text-sm">Cronograma Proyectado</h3>
                    <p className="text-[10px] text-slate-400 italic">Visualización temporal de las cohortes planificadas para este budget</p>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-auto">
                <div style={{ minWidth: `${200 + totalCols * colWidth}px` }}>
                    {/* Header: Years */}
                    <div className="flex border-b border-slate-200 bg-slate-800 sticky top-0 z-20">
                        <div className="flex-none w-[200px] p-2 text-[10px] font-bold text-slate-400 uppercase border-r border-slate-700 flex items-center">Cohorte</div>
                        {yearGroups.map((yg, i) => (
                            <div key={i} className="text-center font-black text-white text-xs py-2 border-l border-slate-700 flex-shrink-0" style={{ width: `${yg.count * colWidth}px` }}>
                                {yg.year}
                            </div>
                        ))}
                    </div>

                    {/* Header: Months */}
                    <div className="flex border-b border-slate-100 bg-slate-50 sticky top-[33px] z-10">
                        <div className="flex-none w-[200px] border-r border-slate-200" />
                        {timelineColumns.map((col, i) => (
                            <div key={i} className="text-center text-[9px] font-bold text-slate-400 uppercase py-1.5 border-l border-slate-100 flex-shrink-0" style={{ width: `${colWidth}px` }}>
                                {MONTH_SHORT[col.month]}
                            </div>
                        ))}
                    </div>

                    {/* Rows */}
                    {validCohorts.map((pc, idx) => {
                        const course = courses.find(c => c.id === pc.courseId);
                        const start = new Date(pc.startDate + 'T12:00:00');
                        const end = new Date((pc.endDate || pc.startDate) + 'T12:00:00');
                        const leftPct = dateToColPct(start);
                        const rightPct = 100 - dateToColPct(end);
                        const color = colorPalette[idx % colorPalette.length];
                        const duration = getDurationMonths(pc.startDate, pc.endDate);

                        return (
                            <div key={pc.id} className="flex border-b border-slate-50 hover:bg-slate-50/80 group" style={{ minHeight: '40px' }}>
                                <div className="flex-none w-[200px] p-2 border-r border-slate-100 flex flex-col justify-center">
                                    <div className="font-bold text-[11px] text-slate-700 truncate">{course?.name || 'Sin curso'}</div>
                                    <div className="text-[9px] text-slate-400">{duration} meses {pc.isFree ? '· GRATIS' : ''}</div>
                                </div>
                                <div className="flex-1 relative">
                                    {/* Grid */}
                                    <div className="absolute inset-0 flex pointer-events-none">
                                        {timelineColumns.map((_, i) => (
                                            <div key={i} className="border-l border-slate-50 h-full flex-shrink-0" style={{ width: `${colWidth}px` }} />
                                        ))}
                                    </div>
                                    {/* Bar */}
                                    <div
                                        className={`absolute top-1/2 -translate-y-1/2 ${color} opacity-90 group-hover:opacity-100 flex items-center shadow-sm transition-all`}
                                        style={{
                                            left: `calc(${leftPct}% + 2px)`,
                                            right: `calc(${Math.max(0, rightPct)}% + 2px)`,
                                            height: '22px',
                                            borderRadius: '4px',
                                        }}
                                    >
                                        <span className="px-2 text-white text-[9px] font-bold truncate select-none">
                                            {course?.name} · {duration}m
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
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
const CourseCostRow = ({ cost, durationMonths, onChange, onDelete }) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState({ ...cost });
    const total = calcCourseCostItem(cost, durationMonths);
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
                    {fmt(Number(cost.amount))} {cost.frequency === 'monthly' ? `× ${durationMonths} meses` : cost.frequency === 'annual' ? `× prop. anual` : '(único)'}
                </p>
            </div>
            <p className="text-[11px] font-semibold text-slate-700 mr-1">{fmt(total)}</p>
            <button onClick={() => { setDraft({ ...cost }); setEditing(true); }} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-500"><Edit size={12} /></button>
            <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500"><Trash2 size={12} /></button>
        </div>
    );
};

// ─── Planned Cohort Card ──────────────────────────────────────────────────────
const PlannedCohortCard = ({ pc, courses, centerCostShare, onChange, onDelete }) => {
    const [expanded, setExpanded] = useState(true);
    const course = courses.find(c => c.id === pc.courseId);
    const durationMonths = getDurationMonths(pc.startDate, pc.endDate);

    const courseCostTotal = (pc.courseCosts || []).reduce((sum, c) => sum + calcCourseCostItem(c, durationMonths), 0);
    const centerShare = pc.isFree ? 0 : centerCostShare;
    const subtotal = courseCostTotal + centerShare;
    const marginPct = Number(pc.marginPct) || 0;
    const marginAmt = subtotal * (marginPct / 100);
    const totalCost = subtotal + marginAmt;
    const estimatedStudents = Number(pc.estimatedStudents) || 0;
    const cuota = estimatedStudents > 0 && !pc.isFree ? totalCost / estimatedStudents : 0;
    const projectedIncome = pc.isFree ? 0 : totalCost;

    const addCourseCost = () => onChange({
        ...pc, courseCosts: [...(pc.courseCosts || []), { id: generateId(), name: 'Nuevo Costo', amount: 0, frequency: 'monthly' }]
    });
    const updateCourseCost = (id, updated) => onChange({ ...pc, courseCosts: pc.courseCosts.map(c => c.id === id ? { ...c, ...updated } : c) });
    const deleteCourseCost = (id) => onChange({ ...pc, courseCosts: pc.courseCosts.filter(c => c.id !== id) });

    const daysLabel = pc.days?.length > 0 ? pc.days.map(d => ['', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'][d]).join('·') : null;
    const selectedCourse = courses.find(c => c.id === pc.courseId);

    const TEACHER_COST_ID = '__teacher__';

    // Helper: recalc teacher cost item when rate or course changes
    const applyTeacherCost = (updated) => {
        const c = courses.find(x => x.id === updated.courseId);
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
        const c = courses.find(x => x.id === updated.courseId);
        if (updated.startDate && updated.days?.length > 0 && updated.hoursPerMeeting && c?.totalHours) {
            updated.endDate = calculateEndDate(updated.startDate, c.totalHours, updated.hoursPerMeeting, updated.days, holidayDates);
        }
        updated = applyTeacherCost(updated);
        onChange(updated);
    };


    return (
        <div className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${pc.isFree ? 'border-amber-300' : 'border-slate-200'}`}>
            {/* Header */}
            <div className={`flex items-center gap-3 p-4 cursor-pointer ${pc.isFree ? 'bg-amber-50/50' : ''}`} onClick={() => setExpanded(!expanded)}>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-800 text-sm">{course?.name || <span className="text-slate-400 italic">Sin curso asignado</span>}</h3>
                        {pc.isFree && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full">GRATUITO</span>}
                    </div>
                    <div className="flex flex-wrap gap-3 text-[10px] text-slate-400 mt-0.5">
                        {pc.startDate && <span>📅 {pc.startDate} → {pc.endDate || '?'}</span>}
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
                    <div>
                        <p className="text-[10px] text-slate-400">Cuota</p>
                        <p className={`text-sm font-bold ${pc.isFree ? 'text-amber-500' : 'text-blue-700'}`}>{pc.isFree ? 'GRATIS' : (estimatedStudents > 0 ? fmt(cuota) : '—')}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-400">Ingreso Proy.</p>
                        <p className={`text-sm font-bold ${pc.isFree ? 'text-slate-300' : 'text-emerald-600'}`}>{pc.isFree ? '—' : fmt(projectedIncome)}</p>
                    </div>
                </div>
                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                    <button onClick={e => { e.stopPropagation(); if (confirm('¿Eliminar esta cohorte planificada?')) onDelete(); }}
                        className="text-slate-300 hover:text-red-500 p-1 transition"><Trash2 size={14} /></button>
                    {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </div>
            </div>

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
                            <input type="date" value={pc.startDate || ''} onChange={e => handleScheduleChange({ startDate: e.target.value })}
                                className="w-full mt-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-800" />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Fecha Fin <span className="text-blue-400 normal-case font-normal">(auto)</span></label>
                            <input type="date" value={pc.endDate || ''} onChange={e => onChange({ ...pc, endDate: e.target.value })}
                                className="w-full mt-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-800" />
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
                        <div className="flex items-end md:col-span-2">
                            <label className="flex items-center gap-2 cursor-pointer bg-white border border-amber-200 rounded-lg px-3 py-2 w-full">
                                <input type="checkbox" checked={!!pc.isFree} onChange={e => onChange({ ...pc, isFree: e.target.checked })} className="accent-amber-500 w-4 h-4" />
                                <span className="text-xs text-slate-600 font-medium">Curso Gratuito — no genera ingreso ni absorbe costos del centro</span>
                            </label>
                        </div>
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
                            <CourseCostRow key={cost.id} cost={cost} durationMonths={durationMonths}
                                onChange={updated => updateCourseCost(cost.id, updated)}
                                onDelete={() => deleteCourseCost(cost.id)} />
                        ))}

                        {/* Summary box */}
                        <div className="mt-4 bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-4 border border-slate-200 space-y-1.5">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Resumen del Curso</div>
                            <div className="flex justify-between text-xs text-slate-600">
                                <span>Costos del curso</span>
                                <span className="font-semibold">{fmt(courseCostTotal)}</span>
                            </div>
                            {!pc.isFree && (
                                <div className="flex justify-between text-xs text-slate-600">
                                    <span>Prorrateo costos del centro</span>
                                    <span className="font-semibold">{fmt(centerShare)}</span>
                                </div>
                            )}
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
                            {!pc.isFree && estimatedStudents > 0 && (
                                <div className="flex justify-between text-sm font-black text-blue-700 bg-blue-100 rounded-lg px-3 py-2 mt-2">
                                    <span>Cuota por alumno ({estimatedStudents} alumnos)</span>
                                    <span>{fmt(cuota)}</span>
                                </div>
                            )}
                            {!pc.isFree && (
                                <div className="flex justify-between text-xs font-bold text-emerald-600">
                                    <span>Ingreso proyectado</span>
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

// ─── Main Budget Manager ──────────────────────────────────────────────────────
const BudgetManager = ({ budgets, courses }) => {
    const [selectedBudgetId, setSelectedBudgetId] = useState(budgets[0]?.id || null);
    const [localBudget, setLocalBudget] = useState(null);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteInput, setDeleteInput] = useState('');

    // Sync local state from Firestore budget
    useEffect(() => {
        const found = budgets.find(b => b.id === selectedBudgetId);
        if (found) { setLocalBudget({ ...found, centerCosts: found.centerCosts || [], plannedCohorts: found.plannedCohorts || [] }); }
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
            centerCosts: [
                { id: generateId(), name: 'Sueldo Coordinador', amount: 0, frequency: 'monthly' },
                { id: generateId(), name: 'Sueldo Preceptor', amount: 0, frequency: 'monthly' },
                { id: generateId(), name: 'Staff / Administrativo', amount: 0, frequency: 'monthly' },
                { id: generateId(), name: 'Servicios / Mantenimiento', amount: 0, frequency: 'monthly' },
                { id: generateId(), name: 'Gastos de Comunicaci\u00f3n', amount: 0, frequency: 'monthly' },
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
    const { centerCostsTotal, centerCostPerPaying, payingCohortCount, totals } = useMemo(() => {
        if (!localBudget) return { centerCostsTotal: 0, centerCostPerPaying: 0, payingCohortCount: 0, totals: {} };

        const centerCostsTotal = (localBudget.centerCosts || []).reduce((s, c) => s + calcCenterCostAnnual(c), 0);
        const payingCohorts = (localBudget.plannedCohorts || []).filter(pc => !pc.isFree);
        const payingCohortCount = payingCohorts.length;
        const centerCostPerPaying = payingCohortCount > 0 ? centerCostsTotal / payingCohortCount : 0;

        let totalIncome = 0;
        let totalCourseExpenses = 0;

        (localBudget.plannedCohorts || []).forEach(pc => {
            const dm = getDurationMonths(pc.startDate, pc.endDate);
            const courseCostTotal = (pc.courseCosts || []).reduce((s, c) => s + calcCourseCostItem(c, dm), 0);
            totalCourseExpenses += courseCostTotal;
            if (!pc.isFree) {
                const subtotal = courseCostTotal + centerCostPerPaying;
                const marginAmt = subtotal * ((Number(pc.marginPct) || 0) / 100);
                totalIncome += subtotal + marginAmt;
            }
        });

        const totalExpenses = centerCostsTotal + totalCourseExpenses;
        const balance = totalIncome - totalExpenses;

        return { centerCostsTotal, centerCostPerPaying, payingCohortCount, totals: { totalIncome, totalExpenses, balance } };
    }, [localBudget]);

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
            teacherHourlyRate: '', isFree: false,
            courseCosts: [
                { id: TEACHER_COST_ID, name: 'Honorarios Docente', amount: 0, frequency: 'once', isTeacherCost: true }
            ]
        }]
    });
    const updatePlannedCohort = (id, updated) => updateBudget({
        plannedCohorts: localBudget.plannedCohorts.map(pc => pc.id === id ? { ...pc, ...updated } : pc)
    });
    const deletePlannedCohort = (id) => updateBudget({
        plannedCohorts: localBudget.plannedCohorts.filter(pc => pc.id !== id)
    });

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
            <div className="flex justify-between items-center flex-wrap gap-3">
                <BudgetSelector budgets={budgets} selectedId={selectedBudgetId} onSelect={setSelectedBudgetId} onCreate={createBudget} />
                <div className="flex items-center gap-3">
                    {dirty && <span className="text-xs text-amber-600 flex items-center gap-1"><RefreshCw size={12} className="animate-spin" /> Guardando...</span>}
                    {!dirty && saving === false && localBudget && <span className="text-xs text-emerald-600 flex items-center gap-1"><Check size={12} /> Guardado</span>}
                    {localBudget && (
                        <>
                            <button
                                onClick={() => exportBudgetToExcel(localBudget, courses, centerCostPerPaying, totals)}
                                className="flex items-center gap-2 bg-emerald-600 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-emerald-700 transition shadow-sm"
                            >
                                <FileDown size={14} /> Exportar Excel
                            </button>
                            <button
                                onClick={() => { setShowDeleteConfirm(true); setDeleteInput(''); }}
                                className="flex items-center gap-2 bg-red-50 text-red-600 border border-red-200 px-3 py-2 rounded-lg text-xs font-bold hover:bg-red-100 transition"
                            >
                                <Trash2 size={14} /> Eliminar Budget
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
                <div className="flex gap-6 items-start">
                    {/* ── LEFT: Center Costs ──────────────────────────────── */}
                    <div className="flex-none w-72 space-y-4">
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="bg-slate-800 px-4 py-3 flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-bold text-white">Costos del Centro</h3>
                                    <p className="text-[10px] text-slate-400">Prorrateados entre los cursos arancelados</p>
                                </div>
                                <button onClick={addCenterCost} className="text-slate-400 hover:text-white transition"><PlusCircle size={18} /></button>
                            </div>
                            <div className="p-4">
                                {(localBudget.centerCosts || []).map(cost => (
                                    <CenterCostRow key={cost.id} cost={cost}
                                        onChange={updated => updateCenterCost(cost.id, updated)}
                                        onDelete={() => deleteCenterCost(cost.id)} />
                                ))}
                                {localBudget.centerCosts?.length === 0 && (
                                    <p className="text-xs text-slate-400 italic py-2">Sin costos del centro.</p>
                                )}
                            </div>
                            <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-2">
                                <div className="flex justify-between text-sm font-bold text-slate-800">
                                    <span>Total Anual Centro</span>
                                    <span>{fmt(centerCostsTotal)}</span>
                                </div>
                                <div className="flex justify-between text-xs text-slate-500">
                                    <span>÷ {payingCohortCount} curso{payingCohortCount !== 1 ? 's' : ''} arancelado{payingCohortCount !== 1 ? 's' : ''}</span>
                                    <span className="font-semibold text-orange-600">{fmt(centerCostPerPaying)} / curso</span>
                                </div>
                            </div>
                        </div>

                        {/* Balance Card */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Balance del Budget</h3>
                            <div className="flex justify-between text-sm">
                                <span className="flex items-center gap-1 text-emerald-600"><TrendingUp size={14} /> Ingreso Proyectado</span>
                                <span className="font-bold text-emerald-600">{fmt(totals.totalIncome)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="flex items-center gap-1 text-rose-600"><TrendingDown size={14} /> Total Egresos</span>
                                <span className="font-bold text-rose-600">{fmt(totals.totalExpenses)}</span>
                            </div>
                            <div className={`flex justify-between text-base font-black border-t pt-3 ${totals.balance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                <span>Resultado</span>
                                <span>{fmt(totals.balance)}</span>
                            </div>
                            {totals.balance < 0 && (
                                <div className="flex items-center gap-2 text-[11px] text-red-600 bg-red-50 rounded-lg px-3 py-2">
                                    <AlertCircle size={14} />
                                    El presupuesto está en déficit. Revisá cuotas o reducí costos.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── RIGHT: Planned Cohorts ───────────────────────── */}
                    <div className="flex-1 min-w-0 space-y-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-slate-800">{localBudget.name}</h3>
                                <p className="text-xs text-slate-500">{(localBudget.plannedCohorts || []).length} cohortes planificadas · {payingCohortCount} aranceladas</p>
                            </div>
                            <button onClick={addPlannedCohort}
                                className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 shadow-sm transition text-sm font-bold">
                                <PlusCircle size={16} /> Agregar Cohorte
                            </button>
                        </div>

                        {(localBudget.plannedCohorts || []).length === 0 && (
                            <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
                                <Calendar size={36} className="text-slate-300 mx-auto mb-3" />
                                <p className="text-slate-500 font-medium mb-1">Sin cohortes planificadas</p>
                                <p className="text-slate-400 text-xs">Agregá las cohortes que pensás dictar en este período y calculá su presupuesto.</p>
                            </div>
                        )}

                        {(localBudget.plannedCohorts || []).map(pc => (
                            <PlannedCohortCard
                                key={pc.id}
                                pc={pc}
                                courses={courses}
                                holidays={holidays}
                                centerCostShare={centerCostPerPaying}
                                onChange={updated => updatePlannedCohort(pc.id, updated)}
                                onDelete={() => deletePlannedCohort(pc.id)}
                            />
                        ))}

                        {/* Global summary table */}
                        {(localBudget.plannedCohorts || []).length > 0 && (
                            <>
                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-800 text-slate-300">
                                        <tr>
                                            <th className="p-3 text-left font-bold">Curso</th>
                                            <th className="p-3 text-center font-bold">Alumnos</th>
                                            <th className="p-3 text-right font-bold">Costo Curso</th>
                                            <th className="p-3 text-right font-bold">Prorrateo</th>
                                            <th className="p-3 text-right font-bold">Margen</th>
                                            <th className="p-3 text-right font-bold">Costo Total</th>
                                            <th className="p-3 text-right font-bold">Cuota</th>
                                            <th className="p-3 text-right font-bold text-emerald-400">Ingreso</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(localBudget.plannedCohorts || []).map(pc => {
                                            const course = courses.find(c => c.id === pc.courseId);
                                            const dm = getDurationMonths(pc.startDate, pc.endDate);
                                            const courseCost = (pc.courseCosts || []).reduce((s, c) => s + calcCourseCostItem(c, dm), 0);
                                            const share = pc.isFree ? 0 : centerCostPerPaying;
                                            const sub = courseCost + share;
                                            const margin = sub * ((Number(pc.marginPct) || 0) / 100);
                                            const total = sub + margin;
                                            const est = Number(pc.estimatedStudents) || 0;
                                            const cuota = est > 0 && !pc.isFree ? total / est : 0;
                                            const income = pc.isFree ? 0 : total;
                                            return (
                                                <tr key={pc.id} className="border-b border-slate-100 hover:bg-slate-50">
                                                    <td className="p-3 font-semibold text-slate-800">
                                                        {course?.name || <span className="text-slate-400 italic">Sin asignar</span>}
                                                        {pc.isFree && <span className="ml-1 text-[9px] bg-amber-100 text-amber-600 rounded px-1 py-0.5 font-bold">GRATIS</span>}
                                                    </td>
                                                    <td className="p-3 text-center text-slate-600">{est || '—'}</td>
                                                    <td className="p-3 text-right text-slate-600">{fmt(courseCost)}</td>
                                                    <td className="p-3 text-right text-slate-600">{pc.isFree ? '—' : fmt(share)}</td>
                                                    <td className="p-3 text-right text-slate-600">{pc.marginPct ? `${pc.marginPct}%` : '—'}</td>
                                                    <td className="p-3 text-right font-bold text-slate-800">{fmt(total)}</td>
                                                    <td className="p-3 text-right font-bold text-blue-700">{pc.isFree ? 'GRATIS' : (est > 0 ? fmt(cuota) : '—')}</td>
                                                    <td className="p-3 text-right font-bold text-emerald-600">{pc.isFree ? '—' : fmt(income)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                                        <tr>
                                            <td colSpan={6} className="p-3 font-black text-slate-700 text-right">TOTALES</td>
                                            <td className="p-3" />
                                            <td className="p-3 text-right font-black text-emerald-600 text-sm">{fmt(totals.totalIncome)}</td>
                                        </tr>
                                        <tr>
                                            <td colSpan={6} className="px-3 pb-3 text-right text-xs text-slate-500">
                                                Total Egresos (centro + cursos): <span className="font-bold text-rose-600">{fmt(totals.totalExpenses)}</span>
                                                &nbsp;&nbsp;·&nbsp;&nbsp;
                                                Resultado: <span className={`font-bold ${totals.balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(totals.balance)}</span>
                                            </td>
                                            <td colSpan={2} />
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            <BudgetGanttView
                                plannedCohorts={localBudget.plannedCohorts}
                                courses={courses}
                                startYear={localBudget.startYear}
                            />
                        </>
                    )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default BudgetManager;
