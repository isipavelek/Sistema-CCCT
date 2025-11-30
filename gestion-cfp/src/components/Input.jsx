import React from 'react';

const Input = ({ label, icon, onChange, value, ...props }) => (
    <div>
        {label && <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>}
        <div className="relative">
            {icon && <div className="absolute left-3 top-2.5 text-slate-400">{icon}</div>}
            <input
                className={`w-full bg-white text-slate-900 border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none transition ${icon ? 'pl-10' : ''}`}
                value={value}
                onChange={(e) => onChange && onChange(e.target.value)}
                {...props}
            />
        </div>
    </div>
);

export default Input;
