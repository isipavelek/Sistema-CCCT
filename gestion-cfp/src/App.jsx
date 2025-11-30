import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { onSnapshot, doc, collection } from 'firebase/firestore';
import { Loader, LogOut } from 'lucide-react';

import { auth, db, appId } from './services/firebase';
import { ROLES } from './constants';

import AuthScreen from './components/AuthScreen';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import CoursesManager from './components/CoursesManager';
import CohortsManager from './components/CohortsManager';
import PeopleManager from './components/PeopleManager';
import AttendanceManager from './components/AttendanceManager';
import PaymentsManager from './components/PaymentsManager';
import UserAccessManager from './components/UserAccessManager';

export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');

  // Data State
  const [courses, setCourses] = useState([]);
  const [cohorts, setCohorts] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [payments, setPayments] = useState([]);

  // --- Auth & Profile Listener ---
  useEffect(() => {
    let profileUnsub = () => { };
    const authUnsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        profileUnsub = onSnapshot(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'profile', 'data'), (docSnap) => {
          if (docSnap.exists()) {
            setUserData(docSnap.data());
          }
          setLoading(false);
        }, (error) => {
          console.error("Error fetching profile:", error);
          setLoading(false);
        });
      } else {
        setUserData(null);
        if (profileUnsub) profileUnsub();
        setLoading(false);
      }
    });
    return () => { authUnsub(); profileUnsub(); };
  }, []);

  // --- Data Fetching ---
  useEffect(() => {
    if (!user || !userData) return;
    const unsub = (colName, setter) => {
      const q = collection(db, 'artifacts', appId, 'public', 'data', colName);
      return onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setter(data);
      }, (err) => console.error(`Error fetching ${colName}:`, err));
    };
    const unsubs = [
      unsub('courses', setCourses),
      unsub('cohorts', setCohorts),
      unsub('students', setStudents),
      unsub('teachers', setTeachers),
      unsub('attendance', setAttendanceLogs),
      unsub('payments', setPayments)
    ];
    return () => unsubs.forEach(u => u());
  }, [user, userData]);

  const handleLogout = async () => {
    try { await signOut(auth); setUserData(null); setActiveTab('dashboard'); } catch (e) { console.error(e); }
  };

  if (loading) return (
    <div className="fixed inset-0 flex h-screen w-screen items-center justify-center bg-slate-100 gap-3 z-50">
      <Loader className="animate-spin text-blue-600" size={40} />
      <span className="text-slate-500 font-medium">Cargando sistema...</span>
    </div>
  );

  if (!user) return <AuthScreen />;

  if (!userData) return (
    <div className="fixed inset-0 flex flex-col h-screen w-screen items-center justify-center bg-white text-slate-800 p-6 z-50">
      <div className="bg-slate-50 p-8 rounded-xl max-w-md w-full text-center border border-slate-200 shadow-xl">
        <div className="bg-blue-100 text-blue-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><Loader className="animate-spin" size={32} /></div>
        <h2 className="text-xl font-bold mb-2">Configurando tu Perfil</h2>
        <p className="text-slate-600 mb-6 text-sm">Estamos terminando de preparar tu cuenta. Si esto demora, intenta recargar o volver a entrar.</p>
        <button onClick={handleLogout} className="w-full bg-white border border-slate-300 hover:bg-slate-50 text-slate-600 font-bold py-3 rounded-lg transition flex items-center justify-center gap-2"><LogOut size={18} /> Cancelar y Salir</button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 w-screen h-screen flex bg-slate-50 font-sans text-slate-800 overflow-hidden print:bg-white">
      <style>{`
        @media print {
          @page { margin: 1cm; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white; font-size: 12pt; }
          .print-container { width: 100%; max-width: none; padding: 0; margin: 0; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; color: black; }
        }
      `}</style>

      <Sidebar userData={userData} activeTab={activeTab} setActiveTab={setActiveTab} handleLogout={handleLogout} />

      {/* Main Content */}
      <main className="flex-1 w-full min-w-0 overflow-y-auto bg-slate-100 relative h-full print:bg-white print:w-full print:overflow-visible">
        <header className="bg-white shadow-sm px-8 py-5 flex justify-between items-center sticky top-0 z-10 w-full no-print">
          <h2 className="text-2xl font-bold text-slate-800">
            {activeTab === 'dashboard' ? 'Panel de Control' :
              activeTab === 'courses' ? 'Catálogo de Cursos' :
                activeTab === 'cohorts' ? 'Cohortes Activas' :
                  activeTab === 'students' ? 'Directorio de Alumnos' :
                    activeTab === 'teachers' ? 'Directorio de Docentes' :
                      activeTab === 'attendance' ? 'Registro de Asistencia' :
                        activeTab === 'users' ? 'Gestión de Usuarios (Admin)' :
                          'Estado de Pagos'}
          </h2>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold shadow-sm border border-blue-200">{userData.firstName ? userData.firstName[0] : 'U'}</div>
            <span className="text-sm font-medium text-slate-600">{userData.role}</span>
          </div>
        </header>

        <div className="p-8 w-full min-h-full box-border print:p-0 print:w-full">
          {activeTab === 'dashboard' && <Dashboard switchTab={setActiveTab} role={userData.role} stats={{ courses, cohorts, students }} />}
          {activeTab === 'courses' && <CoursesManager courses={courses} cohorts={cohorts} />}
          {activeTab === 'cohorts' && <CohortsManager cohorts={cohorts} courses={courses} teachers={teachers} students={students} attendanceLogs={attendanceLogs} />}
          {activeTab === 'students' && <PeopleManager type="student" people={students} cohorts={cohorts} />}
          {activeTab === 'teachers' && <PeopleManager type="teacher" people={teachers} cohorts={cohorts} />}
          {activeTab === 'attendance' && <AttendanceManager teacherId={user.uid} cohorts={cohorts} students={students} attendanceLogs={attendanceLogs} />}
          {activeTab === 'payments' && <PaymentsManager cohorts={cohorts} students={students} payments={payments} courses={courses} />}
          {activeTab === 'users' && <UserAccessManager teachers={teachers} />}
        </div>
      </main>
    </div>
  );
}