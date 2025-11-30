import React from 'react';
import { School, BookOpen, Calendar, Users, LogOut } from 'lucide-react';
import { ROLES } from '../constants';

const StatCard = ({ icon, label, value, color }) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center gap-6 w-full">
        <div className={`p-5 rounded-full text-white shadow-md ${color}`}>{React.cloneElement(icon, { size: 32 })}</div>
        <div><h4 className="text-slate-500 text-sm font-bold uppercase tracking-wide">{label}</h4><p className="text-4xl font-extrabold text-slate-800 mt-1">{value}</p></div>
    </div>
);

const Dashboard = ({ switchTab, role, stats }) => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full no-print">
        <div className="md:col-span-3 bg-gradient-to-r from-blue-600 to-blue-800 rounded-xl p-10 text-white shadow-lg relative overflow-hidden">
            <div className="relative z-10">
                <h1 className="text-4xl font-bold mb-4">Bienvenido al Campus Virtual</h1>
                <p className="opacity-90 text-lg max-w-2xl">Gestión integral del Centro de Formación Profesional Roberto Rocca. Tienes perfil de <span className="font-bold text-orange-300">{role}</span>.</p>
                <div className="mt-8 flex gap-4">
                    {role === ROLES.ADMIN && (
                        <>
                            <button onClick={() => switchTab('courses')} className="bg-white text-blue-800 px-6 py-3 rounded-lg font-bold shadow-lg hover:bg-blue-50 transition transform hover:-translate-y-1">Gestionar Cursos</button>
                            <button onClick={() => switchTab('users')} className="bg-blue-700 text-white border border-blue-400 px-6 py-3 rounded-lg font-bold shadow-lg hover:bg-blue-600 transition transform hover:-translate-y-1">Crear Usuarios</button>
                        </>
                    )}
                    {role === ROLES.TEACHER && <button onClick={() => switchTab('attendance')} className="bg-orange-500 text-white px-6 py-3 rounded-lg font-bold shadow-lg hover:bg-orange-600 transition transform hover:-translate-y-1">Tomar Asistencia</button>}
                    {role === ROLES.STAFF && <button onClick={() => switchTab('payments')} className="bg-white text-blue-800 px-6 py-3 rounded-lg font-bold shadow-lg hover:bg-blue-50 transition transform hover:-translate-y-1">Ver Morosos</button>}
                </div>
            </div>
            <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none"><School size={300} /></div>
        </div>
        <StatCard icon={<BookOpen />} label="Cursos Definidos" value={stats.courses.length} color="bg-emerald-500" />
        <StatCard icon={<Calendar />} label="Cohortes Activas" value={stats.cohorts.length} color="bg-orange-500" />
        <StatCard icon={<Users />} label="Alumnos Registrados" value={stats.students.length} color="bg-purple-500" />
    </div>
);

export default Dashboard;
