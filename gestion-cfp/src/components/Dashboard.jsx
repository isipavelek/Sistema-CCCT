import React, { useMemo } from 'react';
import { School, BookOpen, Calendar, Users, TrendingUp, DollarSign, Target, PieChart as PieIcon, BarChart as BarIcon } from 'lucide-react';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
    PieChart, Pie, Cell 
} from 'recharts';
import { ROLES } from '../constants';

const fmt = (num) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num || 0);

const StatCard = ({ icon, label, value, color, subtitle }) => (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between hover:shadow-md transition-shadow h-full">
        <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl text-white shadow-sm ${color}`}>{React.cloneElement(icon, { size: 24 })}</div>
            <div>
                <h4 className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{label}</h4>
                <p className="text-2xl font-black text-slate-800">{value}</p>
            </div>
        </div>
        {subtitle && <p className="text-[10px] text-slate-400 mt-2 font-medium">{subtitle}</p>}
    </div>
);

const Dashboard = ({ switchTab, role, stats, budgets, courses }) => {
    const analytics = useMemo(() => {
        if (!budgets?.length) return null;

        // 1. Get Latest Budget
        const activeBudget = [...budgets].sort((a, b) => (b.startYear || 0) - (a.startYear || 0))[0];
        
        // 2. Calculations (Same as BudgetManager logic)
        const centerCostsAnnual = (activeBudget.centerCosts || []).reduce((s, c) => {
            const amt = Number(c.amount) || 0;
            return s + (c.frequency === 'monthly' ? amt * 12 : amt);
        }, 0);

        const opDaysCount = (activeBudget.operatingDays || [1,2,3,4,5]).length;
        const annualHours = opDaysCount * 4 * 52;
        const hrRate = annualHours > 0 ? centerCostsAnnual / annualHours : 0;

        let totalIncome = 0;
        let totalDirectCosts = 0;
        let totalImputedCenter = 0;
        
        const categoryData = { CFP: 0, ACCFP: 0, AC: 0 };
        const courseMargins = [];

        (activeBudget.plannedCohorts || []).forEach(pc => {
            const course = courses.find(c => c.id === pc.courseId);
            const start = pc.startDate ? new Date(pc.startDate) : null;
            const end = pc.endDate ? new Date(pc.endDate) : null;
            
            const isValidDates = start && end && !isNaN(start) && !isNaN(end);
            
            // Calc months and weeks only if dates are valid
            const dm = isValidDates 
                ? Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()))
                : 0;
            const dw = isValidDates 
                ? Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24 * 7)))
                : 0;

            const direct = (pc.courseCosts || []).reduce((s, c) => {
                const amt = Number(c.amount) || 0;
                return s + (c.frequency === 'monthly' ? amt * dm : amt);
            }, 0);

            const imputed = (Number(pc.imputedWeeklyHours) || 0) * hrRate * dw;
            const est = Number(pc.estimatedStudents) || 0;
            const catPrice = activeBudget.categoryPrices?.[course?.type] || 0;
            const income = pc.isFree ? 0 : catPrice * dm * est;

            totalIncome += income;
            totalDirectCosts += direct;
            totalImputedCenter += imputed;

            if (course?.type && categoryData.hasOwnProperty(course.type)) {
                categoryData[course.type] += est;
            }

            if (course) {
                courseMargins.push({
                    name: course.name,
                    margin: income - (direct + imputed),
                    income: income,
                    expenses: direct + imputed
                });
            }
        });

        const totalExpenses = centerCostsAnnual + totalDirectCosts;
        
        return {
            name: activeBudget.name,
            totalIncome,
            totalExpenses,
            netMargin: totalIncome - totalExpenses,
            centerCoverage: (totalImputedCenter / (centerCostsAnnual || 1)) * 100,
            barData: [
                { name: 'Ingresos', valor: totalIncome, fill: '#10b981' },
                { name: 'Gastos Directos', valor: totalDirectCosts, fill: '#3b82f6' },
                { name: 'Gastos Centro', valor: centerCostsAnnual, fill: '#6366f1' }
            ],
            pieData: Object.entries(categoryData).map(([name, value]) => ({ name, value })),
            topCourses: courseMargins.sort((a,b) => b.margin - a.margin).slice(0, 5)
        };
    }, [budgets, courses]);

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#6366f1', '#ec4899'];

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12">
            {/* Header / Hero */}
            <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="text-center md:text-left">
                        <h1 className="text-4xl font-black mb-2 tracking-tight">Análisis Operativo</h1>
                        <p className="opacity-80 text-blue-100 font-medium">Gestión estratégica del Centro Roberto Rocca</p>
                        <div className="flex flex-wrap gap-3 mt-6 justify-center md:justify-start">
                            {role === ROLES.ADMIN && (
                                <>
                                    <button onClick={() => switchTab('budget')} className="bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border border-white/20 px-6 py-2.5 rounded-xl font-bold transition flex items-center gap-2">
                                        <TrendingUp size={18} /> Planificar Budget
                                    </button>
                                    <button onClick={() => switchTab('courses')} className="bg-white text-blue-700 px-6 py-2.5 rounded-xl font-bold shadow-lg hover:shadow-xl transition transform hover:-translate-y-0.5">
                                        Ver Catálogo
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                    {analytics && (
                        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6 flex items-center gap-6">
                            <div className="text-center">
                                <p className="text-[10px] font-black uppercase opacity-60 tracking-widest mb-1">Balance Proyectado</p>
                                <p className={`text-3xl font-black ${analytics.netMargin >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                                    {fmt(analytics.netMargin)}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
                <div className="absolute right-0 top-0 opacity-10 pointer-events-none -translate-y-1/4 translate-x-1/4"><School size={400} /></div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard icon={<TrendingUp />} label="Ingresos Proyectados" value={analytics ? fmt(analytics.totalIncome) : '—'} color="bg-emerald-500" subtitle={analytics?.name} />
                <StatCard icon={<DollarSign />} label="Egresos Totales" value={analytics ? fmt(analytics.totalExpenses) : '—'} color="bg-blue-500" />
                <StatCard icon={<Target />} label="Cobertura de Centro" value={analytics ? `${Math.round(analytics.centerCoverage)}%` : '—'} color="bg-indigo-500" />
                <StatCard icon={<Users />} label="Alumnos Activos" value={stats.students.length} color="bg-purple-500" />
            </div>

            {/* Charts Section */}
            {analytics ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Financial Balance Chart */}
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col h-[400px]">
                        <div className="flex items-center gap-2 mb-6">
                            <BarIcon size={20} className="text-blue-600" />
                            <h3 className="font-black text-slate-800 uppercase tracking-tight text-sm">Estructura de Capital</h3>
                        </div>
                        <div className="flex-1">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={analytics.barData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" fontSize={10} fontWeight="bold" axisLine={false} tickLine={false} />
                                    <YAxis fontSize={10} axisLine={false} tickLine={false} tickFormatter={fmt} />
                                    <Tooltip 
                                        cursor={{fill: '#f8fafc'}}
                                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }}
                                        formatter={(val) => fmt(val)}
                                    />
                                    <Bar dataKey="valor" radius={[10, 10, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Category Mix Chart */}
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col h-[400px]">
                        <div className="flex items-center gap-2 mb-6">
                            <PieIcon size={20} className="text-indigo-600" />
                            <h3 className="font-black text-slate-800 uppercase tracking-tight text-sm">Distribución de Alumnos</h3>
                        </div>
                        <div className="flex-1">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={analytics.pieData}
                                        innerRadius={60}
                                        outerRadius={100}
                                        paddingAngle={8}
                                        dataKey="value"
                                    >
                                        {analytics.pieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                    <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Top Profitable Courses */}
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm lg:col-span-2">
                        <div className="flex items-center gap-2 mb-4">
                            <TrendingUp size={20} className="text-emerald-600" />
                            <h3 className="font-black text-slate-800 uppercase tracking-tight text-sm">Cursos de Mayor Impacto (Neto)</h3>
                        </div>
                        <div className="space-y-3">
                            {analytics.topCourses.map((c, i) => (
                                <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
                                    <div className="flex items-center gap-4">
                                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-black text-xs text-slate-400">#{i+1}</div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-800">{c.name}</p>
                                            <p className="text-[10px] text-slate-400">Ingresos: {fmt(c.income)} · Gastos: {fmt(c.expenses)}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`font-black ${c.margin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                            {fmt(c.margin)}
                                        </p>
                                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Margen Neto</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-3xl p-20 text-center border border-slate-200">
                    <TrendingUp size={48} className="text-slate-200 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-slate-700">Sin datos analíticos</h3>
                    <p className="text-sm text-slate-400">Debes crear al menos un período en la sección Budget para ver las proyecciones.</p>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
