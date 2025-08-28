import React from 'react';

const versionData = [
    { version: "5.0", date: "2025-08-28", changes: ["Implementerade ny 'Soft Cyber' UI-design.", "Fixade kontrastproblem och design-inkonsekvenser."] },
    { version: "4.x", date: "2025-08-27", changes: ["Lade till hamburgermeny för mobil.", "Implementerade repris-funktion."] },
];

const VersionHistory = () => {
    return (
        <div>
            <h2 className="text-2xl font-bold mb-4 text-accent-cyan">Versionshistorik</h2>
            <div className="space-y-4">
                {versionData.map(item => (
                    <div key={item.version} className="sc-card">
                        <h3 className="text-xl font-bold text-accent-blue">Version {item.version} <span className="text-sm font-normal text-text-secondary">- {item.date}</span></h3>
                        <ul className="list-disc list-inside mt-2 space-y-1 text-text-secondary">
                            {item.changes.map((change, index) => (
                                <li key={index}>{change}</li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default VersionHistory;
