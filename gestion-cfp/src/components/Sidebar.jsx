import React from 'react';
import { School, Briefcase, BookOpen, Calendar, Users, UserCheck, Shield, CheckSquare, DollarSign, BarChart2, LogOut } from 'lucide-react';
import { ROLES } from '../constants';

const NavItem = ({ icon, label, active, onClick }) => (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-6 py-3 text-sm transition-colors ${active ? 'bg-blue-600 text-white border-r-4 border-orange-400' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
        {icon} <span>{label}</span>
    </button>
);

const Sidebar = ({ userData, activeTab, setActiveTab, handleLogout }) => {
    // Helper to check if user has a specific role
    const hasRole = (role) => {
        // Master Key for main admin
        if (userData.email === 'ipavelek@gmail.com' && role === ROLES.ADMIN) return true;
        
        if (userData.role === role) return true;
        if (Array.isArray(userData.roles) && userData.roles.includes(role)) return true;
        return false;
    };

    const isAdmin = hasRole(ROLES.ADMIN);
    const isTeacher = hasRole(ROLES.TEACHER);
    const isStaff = hasRole(ROLES.STAFF);

    return (
        <aside className="w-64 bg-slate-900 text-white flex flex-col shadow-xl flex-shrink-0 z-20 h-full no-print">
            <div className="p-6 border-b border-slate-700">
                <div className="flex items-center gap-2 mb-1"><School className="text-orange-500" size={24} /><h1 className="font-bold text-lg tracking-tight">3CT Roberto Rocca</h1></div>
                <p className="text-xs text-slate-400">Sistema de Gestión Académica</p>
            </div>
            <nav className="flex-1 overflow-y-auto py-4">
                <div className="px-6 mb-2">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Usuario</div>
                    <div className="text-sm font-medium text-white truncate">{userData.firstName} {userData.lastName || userData.name || userData.email}</div>
                    <div className="text-xs text-orange-400">
                        {Array.isArray(userData.roles) ? userData.roles.join(', ') : userData.role}
                    </div>
                </div>
                <NavItem icon={<Briefcase size={20} />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
                {isAdmin && (
                    <>
                        <div className="px-6 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider mt-4">Académico</div>
                        <NavItem icon={<BookOpen size={20} />} label="Gestión Cursos" active={activeTab === 'courses'} onClick={() => setActiveTab('courses')} />
                        <NavItem icon={<Calendar size={20} />} label="Gestión Cohortes" active={activeTab === 'cohorts'} onClick={() => setActiveTab('cohorts')} />
                        <NavItem icon={<UserCheck size={20} />} label="Pre-inscripciones" active={activeTab === 'preenrollments'} onClick={() => setActiveTab('preenrollments')} />
                        <div className="px-6 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider mt-4">Personas</div>
                        <NavItem icon={<Users size={20} />} label="Alumnos" active={activeTab === 'students'} onClick={() => setActiveTab('students')} />
                        <NavItem icon={<UserCheck size={20} />} label="Docentes" active={activeTab === 'teachers'} onClick={() => setActiveTab('teachers')} />
                        <div className="px-6 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider mt-4">Sistema</div>
                        <NavItem icon={<Shield size={20} />} label="Gestión de Accesos" active={activeTab === 'users'} onClick={() => setActiveTab('users')} />
                    </>
                )}
                {(isTeacher || isAdmin) && (
                    <>
                        <div className="px-6 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider mt-4">Clases</div>
                        <NavItem icon={<CheckSquare size={20} />} label="Tomar Asistencia" active={activeTab === 'attendance'} onClick={() => setActiveTab('attendance')} />
                    </>
                )}
                {(isStaff || isAdmin) && (
                    <>
                        <div className="px-6 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider mt-4">Administración</div>
                        <NavItem icon={<DollarSign size={20} />} label="Pagos y Cuotas" active={activeTab === 'payments'} onClick={() => setActiveTab('payments')} />
                        <NavItem icon={<BarChart2 size={20} />} label="Budget" active={activeTab === 'budget'} onClick={() => setActiveTab('budget')} />
                        <NavItem icon={<Calendar size={20} />} label="Calendario / Feriados" active={activeTab === 'holidays'} onClick={() => setActiveTab('holidays')} />
                    </>
                )}
            </nav>
            <div className="p-4 bg-slate-800 border-t border-slate-700">
                <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700 py-2 rounded transition"><LogOut size={16} /> Cerrar Sesión</button>
            </div>
        </aside>
    );
};


export default Sidebar;
