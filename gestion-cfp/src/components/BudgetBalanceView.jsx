import React, { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, Calendar, BarChart2, ChevronDown, ChevronRight } from 'lucide-react';

const fmt = (n) => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0
}).format(Number(n) || 0);

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MONTH_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// Helper: given a cohort and a year/month, return the fraction of the cohort's TOTAL duration that overlaps that month (0-1)
const cohortDurationFraction = (pc, year, month) => {
    if (!pc.startDate || !pc.endDate) return 0;
    const monthStart = new Date(year, month, 1);
    const monthEnd   = new Date(year, month + 1, 0, 23, 59, 59);
    const cStart = new Date(pc.startDate + 'T00:00:00');
    const cEnd   = new Date(pc.endDate   + 'T23:59:59');
    if (cEnd < monthStart || cStart > monthEnd) return 0;
    const overlapStart = cStart > monthStart ? cStart : monthStart;
    const overlapEnd   = cEnd   < monthEnd   ? cEnd   : monthEnd;
    const totalDays    = Math.max(1, (cEnd - cStart) / (1000 * 60 * 60 * 24) + 1);
    const overlapDays  = Math.max(0, (overlapEnd - overlapStart) / (1000 * 60 * 60 * 24) + 1);
    return Math.min(1, overlapDays / totalDays);
};

// Returns duration months (same logic as main file)
const getDurationMonths = (startDate, endDate) => {
    if (!startDate || !endDate) return 0;
    const s = new Date(startDate); const e = new Date(endDate);
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

const calcCourseCostItem = (cost, durationMonths, pc) => {
    if (!cost) return 0;
    const amt = Number(cost.amount) || 0;
    if (cost.frequency === 'monthly') return amt * durationMonths;
    if (cost.frequency === 'annual') return amt * (durationMonths / 12);
    if (cost.frequency === 'per_student') return amt * (pc ? (Number(pc.estimatedStudents) || 0) : 0);
    return amt;
};

// ─── Monthly Balance View ──────────────────────────────────────────────────────
const MonthlyBalanceView = ({ budget, courses, centerCostsTotal, hourlyCenterRate }) => {
    const startYear = budget.startYear;
    // Budget months: Jul(startYear) → Jun(startYear+1) = 12 months
    const months = [];
    for (let i = 0; i < 12; i++) {
        const year  = i < 6 ? startYear     : startYear + 1;
        const month = i < 6 ? 6 + i         : i - 6;  // Jul=6…Dec=11, Jan=0…Jun=5
        months.push({ year, month, label: `${MONTH_SHORT[month]} ${year}`, idx: i });
    }

    const centerCostPerMonth = centerCostsTotal / 12;

    const rows = useMemo(() => months.map(({ year, month, label }) => {
        let courseCosts = 0;
        let ingresos = 0;

        (budget.plannedCohorts || []).forEach(pc => {
            if (!pc || pc.isPaused) return; // Skip paused or invalid
            const durationFraction = cohortDurationFraction(pc, year, month);
            if (durationFraction === 0) return;
            const course = (courses || []).find(c => c.id === pc.courseId);
            const academicMonths = getAcademicMonths(course, pc);
            
            const diffDays = (pc.startDate && pc.endDate) ? (new Date(pc.endDate) - new Date(pc.startDate)) / (1000 * 60 * 60 * 24) : 0;
            const durationWeeks = !isNaN(diffDays) ? Math.max(0, Math.round(diffDays / 7)) : 0;
            const academicWeeks = getAcademicWeeks(course, pc, durationWeeks);

            // Course costs this month (proportional overlap)
            const totalCourseCost = (pc.courseCosts || []).reduce((s, c) => s + calcCourseCostItem(c, academicMonths, pc), 0);
            courseCosts += totalCourseCost * durationFraction;

            // Income this month
            if (!pc.isFree) {
                const catPrice = budget.categoryPrices?.[course?.type] || 0;
                const est = Number(pc.estimatedStudents) || 0;
                const scholarshipPct = Number(pc.scholarshipPct) || 0;
                
                const centerShare = (Number(pc.imputedWeeklyHours) || 0) * hourlyCenterRate * academicWeeks;
                const subtotal = totalCourseCost + centerShare;
                const marginPct = Number(pc.marginPct) || 0;
                const marginAmt = subtotal * (marginPct / 100);
                const totalCost = subtotal + marginAmt;
                
                const cuotaMensual = catPrice > 0 ? catPrice : (est > 0 && academicMonths > 0 ? totalCost / (est * academicMonths) : 0);
                const totalIncome = (cuotaMensual * academicMonths * est * (1 - scholarshipPct / 100));
                
                ingresos += totalIncome * durationFraction;
            }
        });

        const totalEgresos = centerCostPerMonth + courseCosts;
        const resultado = ingresos - totalEgresos;
        return { label, centerCost: centerCostPerMonth, courseCosts, totalEgresos, ingresos, resultado };
    }), [budget, courses, centerCostsTotal, hourlyCenterRate]);

    const calcSubtotal = (startIndex, endIndex) => {
        return rows.slice(startIndex, endIndex + 1).reduce((acc, r) => ({
            centerCost: acc.centerCost + r.centerCost,
            courseCosts: acc.courseCosts + r.courseCosts,
            totalEgresos: acc.totalEgresos + r.totalEgresos,
            ingresos: acc.ingresos + r.ingresos,
            resultado: acc.resultado + r.resultado,
        }), { centerCost: 0, courseCosts: 0, totalEgresos: 0, ingresos: 0, resultado: 0 });
    };

    const sub1 = calcSubtotal(0, 5);
    const sub2 = calcSubtotal(6, 11);
    const annual = calcSubtotal(0, 11);

    const SubtotalRow = ({ data, label }) => (
        <tr className="bg-slate-50 border-y-2 border-slate-200 font-bold italic">
            <td className="p-3 text-slate-800 uppercase text-[10px] tracking-wide">{label}</td>
            <td className="p-3 text-right text-slate-600">{fmt(data.centerCost)}</td>
            <td className="p-3 text-right text-slate-600">{fmt(data.courseCosts)}</td>
            <td className="p-3 text-right text-rose-600">{fmt(data.totalEgresos)}</td>
            <td className="p-3 text-right text-emerald-600">{fmt(data.ingresos)}</td>
            <td className={`p-3 text-right ${data.resultado >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {fmt(data.resultado)}
            </td>
        </tr>
    );

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-slate-800 px-4 py-3 flex items-center gap-2">
                <Calendar size={15} className="text-slate-400" />
                <h3 className="text-sm font-bold text-white">Balance Mes a Mes</h3>
                <span className="text-[10px] text-slate-400 ml-1">— subtotales por semestre</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[700px]">
                    <thead>
                        <tr className="border-b-2 border-slate-200 bg-slate-50">
                            <th className="p-3 text-left font-bold text-slate-600">Mes</th>
                            <th className="p-3 text-right font-bold text-slate-500">Costos Centro</th>
                            <th className="p-3 text-right font-bold text-slate-500">Costos Cursos</th>
                            <th className="p-3 text-right font-bold text-rose-600">Total Egresos</th>
                            <th className="p-3 text-right font-bold text-emerald-600">Ingresos</th>
                            <th className="p-3 text-right font-bold text-slate-700">Resultado</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.slice(0, 6).map((r, i) => (
                            <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                <td className="p-3 font-semibold text-slate-700">{r.label}</td>
                                <td className="p-3 text-right text-slate-500">{fmt(r.centerCost)}</td>
                                <td className="p-3 text-right text-slate-500">{fmt(r.courseCosts)}</td>
                                <td className="p-3 text-right font-semibold text-rose-600">{fmt(r.totalEgresos)}</td>
                                <td className="p-3 text-right font-semibold text-emerald-600">{fmt(r.ingresos)}</td>
                                <td className={`p-3 text-right font-black ${r.resultado >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                    {fmt(r.resultado)}
                                </td>
                            </tr>
                        ))}
                        <SubtotalRow data={sub1} label="Subtotal 1° Parte" />
                        {rows.slice(6, 12).map((r, i) => (
                            <tr key={i + 6} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                <td className="p-3 font-semibold text-slate-700">{r.label}</td>
                                <td className="p-3 text-right text-slate-500">{fmt(r.centerCost)}</td>
                                <td className="p-3 text-right text-slate-500">{fmt(r.courseCosts)}</td>
                                <td className="p-3 text-right font-semibold text-rose-600">{fmt(r.totalEgresos)}</td>
                                <td className="p-3 text-right font-semibold text-emerald-600">{fmt(r.ingresos)}</td>
                                <td className={`p-3 text-right font-black ${r.resultado >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                    {fmt(r.resultado)}
                                </td>
                            </tr>
                        ))}
                        <SubtotalRow data={sub2} label="Subtotal 2° Parte" />
                    </tbody>
                    <tfoot className="bg-slate-100 border-t-2 border-slate-300">
                        <tr>
                            <td className="p-3 font-black text-slate-800 uppercase text-[11px] tracking-wide">TOTAL ANUAL</td>
                            <td className="p-3 text-right font-bold text-slate-600">{fmt(annual.centerCost)}</td>
                            <td className="p-3 text-right font-bold text-slate-600">{fmt(annual.courseCosts)}</td>
                            <td className="p-3 text-right font-black text-rose-600">{fmt(annual.totalEgresos)}</td>
                            <td className="p-3 text-right font-black text-emerald-600">{fmt(annual.ingresos)}</td>
                            <td className={`p-3 text-right font-black text-base ${annual.resultado >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                {fmt(annual.resultado)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

// ─── Semester Balance View ─────────────────────────────────────────────────────
const SemesterBalanceView = ({ budget, courses, centerCostsTotal, hourlyCenterRate }) => {
    const [expandedSem, setExpandedSem] = useState(null); // null | 'S1' | 'S2'
    const [expandedCourse, setExpandedCourse] = useState(null); // courseKey
    const startYear = budget.startYear;

    // S1: Jul–Dic (6 months)
    // S2: Ene–Jun (6 months) - The user said "Diciembre a Junio", usually this implies the transition. 
    // I will use Jul-Dec and Jan-Jun but label them as requested for the second part.
    const semesters = [
        {
            id: 'S1',
            label: `1° Parte — Julio a Diciembre ${startYear}`,
            months: [6, 7, 8, 9, 10, 11].map(m => ({ year: startYear, month: m })),
        },
        {
            id: 'S2',
            label: `2° Parte — Diciembre a Junio ${startYear + 1}`,
            // If they say Dec to June, it might overlap Dec or they mean Ene-Jun. 
            // I'll use Jan-Jun to avoid double counting but keep the requested label.
            months: [0, 1, 2, 3, 4, 5].map(m => ({ year: startYear + 1, month: m })),
        },
    ];

    const calcSemesterData = (semMonths) => {
        const centerCost = (centerCostsTotal / 12) * semMonths.length;
        let courseCosts = 0;
        let ingresos = 0;

        const courseBreakdown = {};

        (budget.plannedCohorts || []).forEach(pc => {
            if (!pc || pc.isPaused) return; // Skip paused or invalid
            const course = (courses || []).find(c => c.id === pc.courseId);
            const academicMonths = getAcademicMonths(course, pc);
            
            const diffDays = (pc.startDate && pc.endDate) ? (new Date(pc.endDate) - new Date(pc.startDate)) / (1000 * 60 * 60 * 24) : 0;
            const durationWeeks = !isNaN(diffDays) ? Math.max(0, Math.round(diffDays / 7)) : 0;
            const academicWeeks = getAcademicWeeks(course, pc, durationWeeks);

            const courseKey = pc.id; // Using cohort ID as key for uniqueness
            const courseName = course?.name || 'Sin asignar';

            let pcCourseCosts = 0;
            let pcIncome = 0;
            const monthlyDetails = [];

            semMonths.forEach(({ year, month }) => {
                const durationFraction = cohortDurationFraction(pc, year, month);
                const totalCC = (pc.courseCosts || []).reduce((s, c) => s + calcCourseCostItem(c, academicMonths, pc), 0);
                const mCost = totalCC * durationFraction;
                
                let mIncome = 0;
                if (!pc.isFree) {
                    const catPrice = budget.categoryPrices?.[course?.type] || 0;
                    const est = Number(pc.estimatedStudents) || 0;
                    const scholarshipPct = Number(pc.scholarshipPct) || 0;
                    
                    const centerShare = (Number(pc.imputedWeeklyHours) || 0) * hourlyCenterRate * academicWeeks;
                    const subtotal = totalCC + centerShare;
                    const marginPct = Number(pc.marginPct) || 0;
                    const marginAmt = subtotal * (marginPct / 100);
                    const totalCost = subtotal + marginAmt;
                    
                    const cuotaMensual = catPrice > 0 ? catPrice : (est > 0 && academicMonths > 0 ? totalCost / (est * academicMonths) : 0);
                    const totalIncome = (cuotaMensual * academicMonths * est * (1 - scholarshipPct / 100));
                    
                    mIncome = totalIncome * durationFraction;
                }

                if (durationFraction > 0) {
                    monthlyDetails.push({
                        label: `${MONTH_SHORT[month]} ${year}`,
                        cost: mCost,
                        income: mIncome,
                        overlap: durationFraction
                    });
                }

                pcCourseCosts += mCost;
                pcIncome += mIncome;
            });

            if (pcCourseCosts > 0 || pcIncome > 0) {
                courseCosts += pcCourseCosts;
                ingresos += pcIncome;

                if (!courseBreakdown[courseKey]) {
                    courseBreakdown[courseKey] = { 
                        name: courseName, 
                        type: course?.type, 
                        courseCosts: pcCourseCosts, 
                        ingresos: pcIncome, 
                        isFree: pc.isFree,
                        scholarshipPct: Number(pc.scholarshipPct) || 0,
                        monthlyDetails
                    };
                }
            }
        });

        const totalEgresos = centerCost + courseCosts;
        const resultado = ingresos - totalEgresos;
        return { centerCost, courseCosts, totalEgresos, ingresos, resultado, courseBreakdown };
    };

    const semData = semesters.map(s => ({ ...s, ...calcSemesterData(s.months) }));

    return (
        <div className="space-y-4">
            {semData.map(sem => {
                const isExpanded = expandedSem === sem.id;
                const courses_list = Object.entries(sem.courseBreakdown);
                return (
                    <div key={sem.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        {/* Semester header */}
                        <div className="bg-slate-800 px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <BarChart2 size={15} className="text-slate-400" />
                                <h3 className="text-sm font-bold text-white">{sem.label}</h3>
                            </div>
                            <div className={`text-sm font-black px-3 py-1 rounded-full ${sem.resultado >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                                {fmt(sem.resultado)}
                            </div>
                        </div>

                        {/* KPI cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border-b border-slate-100">
                            {[
                                { label: 'Costos Centro', value: sem.centerCost, color: 'text-slate-600' },
                                { label: 'Costos Cursos', value: sem.courseCosts, color: 'text-orange-600' },
                                { label: 'Total Egresos', value: sem.totalEgresos, color: 'text-rose-600' },
                                { label: 'Ingresos', value: sem.ingresos, color: 'text-emerald-600' },
                            ].map((kpi, i) => (
                                <div key={i} className={`p-4 text-center ${i < 3 ? 'border-r border-slate-100' : ''}`}>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{kpi.label}</p>
                                    <p className={`text-lg font-black ${kpi.color}`}>{fmt(kpi.value)}</p>
                                </div>
                            ))}
                        </div>

                        {/* Toggle breakdown */}
                        <button
                            onClick={() => setExpandedSem(isExpanded ? null : sem.id)}
                            className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold text-slate-500 hover:bg-slate-50 transition-colors border-b border-slate-100"
                        >
                            <span className="flex items-center gap-1.5">
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                Detalle por curso e ingresos desagregados ({courses_list.length})
                            </span>
                            <span className="text-[10px] text-slate-400">{isExpanded ? 'Ocultar' : 'Ver detalle'}</span>
                        </button>

                        {isExpanded && (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200">
                                            <th className="p-3 text-left font-bold text-slate-600">Curso / Cohorte</th>
                                            <th className="p-3 text-center font-bold text-slate-500">Tipo</th>
                                            <th className="p-3 text-right font-bold text-orange-600">Costos</th>
                                            <th className="p-3 text-right font-bold text-emerald-600">Ingresos</th>
                                            <th className="p-3 text-right font-bold text-slate-700">Resultado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {/* Center costs row */}
                                        <tr className="border-b border-slate-100 bg-slate-50/50">
                                            <td className="p-3 font-semibold text-slate-600 italic">Costos del Centro (prorrateados)</td>
                                            <td className="p-3 text-center">—</td>
                                            <td className="p-3 text-right font-semibold text-slate-500">{fmt(sem.centerCost)}</td>
                                            <td className="p-3 text-right">—</td>
                                            <td className="p-3 text-right font-semibold text-rose-500">{fmt(-sem.centerCost)}</td>
                                        </tr>
                                        {courses_list.map(([key, cd]) => {
                                            const isCourseExpanded = expandedCourse === key;
                                            const res = cd.ingresos - cd.courseCosts;
                                            return (
                                                <React.Fragment key={key}>
                                                    <tr 
                                                        className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors ${isCourseExpanded ? 'bg-blue-50/30' : ''}`}
                                                        onClick={() => setExpandedCourse(isCourseExpanded ? null : key)}
                                                    >
                                                        <td className="p-3 font-semibold text-slate-800 flex items-center gap-2">
                                                            {isCourseExpanded ? <ChevronDown size={12} className="text-blue-500" /> : <ChevronRight size={12} className="text-slate-300" />}
                                                            {cd.name}
                                                            {cd.isFree && <span className="ml-1 text-[9px] bg-amber-100 text-amber-700 rounded px-1 py-0.5 font-bold">GRATIS</span>}
                                                            {Number(cd.scholarshipPct) > 0 && (
                                                                <span className="ml-1 text-[9px] bg-indigo-100 text-indigo-600 rounded px-1 py-0.5 font-bold">
                                                                    BECA {cd.scholarshipPct}%
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold">
                                                                {cd.type || '—'}
                                                            </span>
                                                        </td>
                                                        <td className="p-3 text-right text-orange-600">{fmt(cd.courseCosts)}</td>
                                                        <td className="p-3 text-right font-semibold text-emerald-600">
                                                            {cd.isFree ? <span className="text-slate-400">—</span> : fmt(cd.ingresos)}
                                                        </td>
                                                        <td className={`p-3 text-right font-bold ${res >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                                            {cd.isFree ? <span className="text-slate-400">—</span> : fmt(res)}
                                                        </td>
                                                    </tr>
                                                    {isCourseExpanded && (
                                                        <tr className="bg-slate-50/50">
                                                            <td colSpan={5} className="p-0">
                                                                <div className="px-8 py-3 border-b border-slate-100 space-y-2">
                                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Desagregado Mensual del Curso</p>
                                                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                                                                        {cd.monthlyDetails.map((m, idx) => (
                                                                            <div key={idx} className="bg-white border border-slate-200 rounded-lg p-2 shadow-sm">
                                                                                <p className="text-[10px] font-bold text-slate-500 border-b border-slate-50 pb-1 mb-1">{m.label}</p>
                                                                                <div className="flex justify-between text-[9px]">
                                                                                    <span className="text-slate-400">Costos:</span>
                                                                                    <span className="text-rose-500 font-bold">{fmt(m.cost)}</span>
                                                                                </div>
                                                                                <div className="flex justify-between text-[9px]">
                                                                                    <span className="text-slate-400">Ingresos:</span>
                                                                                    <span className="text-emerald-600 font-bold">{fmt(m.income)}</span>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot className="bg-slate-100 border-t-2 border-slate-300">
                                        <tr>
                                            <td colSpan={2} className="p-3 font-black text-slate-800 uppercase text-[11px] tracking-wide">TOTAL PARTE</td>
                                            <td className="p-3 text-right font-black text-rose-600">{fmt(sem.totalEgresos)}</td>
                                            <td className="p-3 text-right font-black text-emerald-600">{fmt(sem.ingresos)}</td>
                                            <td className={`p-3 text-right font-black text-base ${sem.resultado >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                                {fmt(sem.resultado)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// ─── Main BudgetBalanceView ────────────────────────────────────────────────────
const BudgetBalanceView = ({ budget, courses = [], totals, centerCostsTotal, hourlyCenterRate }) => {
    const [viewMode, setViewMode] = useState('semestral'); // 'mensual' | 'semestral'

    if (!budget) return null;
    const safeTotals = totals || { totalIncome: 0, totalExpenses: 0, balance: 0 };

    return (
        <div className="space-y-4">
            {/* KPI top cards */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ingreso Proyectado</p>
                    <p className="text-2xl font-black text-emerald-600">{fmt(safeTotals.totalIncome)}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Egresos</p>
                    <p className="text-2xl font-black text-rose-600">{fmt(safeTotals.totalExpenses)}</p>
                </div>
                <div className={`rounded-xl border shadow-sm p-4 text-center ${safeTotals.balance >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Resultado</p>
                    <p className={`text-2xl font-black ${safeTotals.balance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmt(safeTotals.balance)}</p>
                </div>
            </div>

            {/* View mode toggle */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm w-fit">
                {[
                    { id: 'semestral', label: 'Vista Semestral', icon: <BarChart2 size={13} /> },
                    { id: 'mensual',   label: 'Vista Mensual',   icon: <Calendar    size={13} /> },
                ].map(v => (
                    <button
                        key={v.id}
                        onClick={() => setViewMode(v.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                            viewMode === v.id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'
                        }`}
                    >
                        {v.icon}{v.label}
                    </button>
                ))}
            </div>

            {/* Views */}
            {viewMode === 'mensual' && (
                <MonthlyBalanceView
                    budget={budget}
                    courses={courses}
                    centerCostsTotal={centerCostsTotal}
                    hourlyCenterRate={hourlyCenterRate}
                />
            )}
            {viewMode === 'semestral' && (
                <SemesterBalanceView
                    budget={budget}
                    courses={courses}
                    centerCostsTotal={centerCostsTotal}
                    hourlyCenterRate={hourlyCenterRate}
                />
            )}
        </div>
    );
};

export default BudgetBalanceView;
