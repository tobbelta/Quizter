import React, { useState } from 'react';

const RiddleEditorModal = ({ onSave, onCancel }) => {
    const [question, setQuestion] = useState('');
    const [options, setOptions] = useState(['', '', '', '']);
    const [correctAnswer, setCorrectAnswer] = useState(0);
    const [error, setError] = useState('');

    const handleOptionChange = (index, value) => {
        const newOptions = [...options];
        newOptions[index] = value;
        setOptions(newOptions);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');
        if (!question.trim() || options.some(opt => !opt.trim())) {
            setError('Alla fält måste fyllas i.');
            return;
        }
        onSave({ question, options, correctAnswer });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[1001] p-4">
            <div className="neu-card w-full max-w-lg">
                <h2 className="text-2xl font-bold mb-4 uppercase">Skapa/Redigera Gåta</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold mb-2 uppercase">Fråga:</label>
                        <textarea
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            className="neu-input"
                            rows="3"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-2 uppercase">Svarsalternativ (markera det rätta):</label>
                        {options.map((option, index) => (
                            <div key={index} className="flex items-center mt-2">
                                <input
                                    type="radio"
                                    name="correctAnswer"
                                    checked={correctAnswer === index}
                                    onChange={() => setCorrectAnswer(index)}
                                    className="h-5 w-5 text-yellow-300 bg-gray-700 border-gray-500 focus:ring-yellow-400"
                                />
                                <input
                                    type="text"
                                    value={option}
                                    onChange={(e) => handleOptionChange(index, e.target.value)}
                                    className="neu-input ml-3"
                                    placeholder={`Alternativ ${index + 1}`}
                                    required
                                />
                            </div>
                        ))}
                    </div>
                    {error && <p className="text-red-500 text-sm">{error}</p>}
                    <div className="flex justify-end space-x-4 pt-4">
                        <button type="button" onClick={onCancel} className="neu-button neu-button-secondary">
                            Avbryt
                        </button>
                        <button type="submit" className="neu-button neu-button-green">
                            Spara Hinder
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default RiddleEditorModal;
