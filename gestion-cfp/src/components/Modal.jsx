import React from 'react';
import { X } from 'lucide-react';

const Modal = ({ title, children, onClose }) => (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center flex-shrink-0">
                <h3 className="font-bold text-lg text-slate-800">{title}</h3>
                <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-slate-600" /></button>
            </div>
            <div className="p-6 overflow-y-auto">{children}</div>
        </div>
    </div>
);

export default Modal;
