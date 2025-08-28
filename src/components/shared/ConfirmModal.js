import React from 'react';

const ConfirmModal = ({ title, message, onConfirm, onCancel }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[1003] p-4">
            <div className="sc-card w-full max-w-md">
                <h2 className="text-2xl font-bold mb-4 uppercase text-accent-cyan">{title}</h2>
                <p className="text-text-primary mb-6">{message}</p>
                <div className="flex justify-end space-x-4">
                    <button onClick={onCancel} className="sc-button">
                        Avbryt
                    </button>
                    <button onClick={onConfirm} className="sc-button sc-button-red">
                        Bekräfta
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;
