import React, { useState } from 'react';

const RiddleModal = ({ obstacle, onClose, onAnswer }) => {
    const [selectedAnswer, setSelectedAnswer] = useState('');
    const [showResult, setShowResult] = useState(false);
    const [isCorrect, setIsCorrect] = useState(false);


    const handleSubmit = () => {
        // Hantera både index (nummer) och sträng som correctAnswer
        let correct = false;
        if (typeof obstacle.correctAnswer === 'number') {
            // correctAnswer är index i options-arrayen
            correct = selectedAnswer === obstacle.options[obstacle.correctAnswer];
        } else {
            // correctAnswer är en sträng
            correct = selectedAnswer === obstacle.correctAnswer;
        }


        setIsCorrect(correct);
        setShowResult(true);

        // Stäng modal efter 2 sekunder och returnera resultat
        setTimeout(() => {
            onAnswer(correct);
            onClose();
        }, 2000);
    };

    if (!obstacle) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
            <div className="bg-gray-800 rounded-lg max-w-md w-full p-6 border border-gray-700">
                <h3 className="text-xl font-bold text-white mb-4">Hinder</h3>

                {!showResult ? (
                    <>
                        <p className="text-gray-300 mb-6">{obstacle.question}</p>

                        <div className="space-y-3 mb-6">
                            {obstacle.options.map((option, index) => (
                                <label key={index} className="flex items-center space-x-3 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="answer"
                                        value={option}
                                        checked={selectedAnswer === option}
                                        onChange={(e) => setSelectedAnswer(e.target.value)}
                                        className="text-accent-cyan focus:ring-accent-cyan"
                                    />
                                    <span className="text-gray-300">{option}</span>
                                </label>
                            ))}
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={handleSubmit}
                                disabled={!selectedAnswer}
                                className="sc-button sc-button-green flex-1"
                            >
                                Svara
                            </button>
                            <button
                                onClick={onClose}
                                className="sc-button sc-button-red"
                            >
                                Avbryt
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="text-center">
                        <div className={`text-6xl mb-4 ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                            {isCorrect ? '✓' : '✗'}
                        </div>
                        <p className={`text-xl font-bold ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                            {isCorrect ? 'Rätt svar!' : 'Fel svar!'}
                        </p>
                        {!isCorrect && (
                            <p className="text-gray-300 mt-2">
                                Rätt svar: {typeof obstacle.correctAnswer === 'number'
                                    ? obstacle.options[obstacle.correctAnswer]
                                    : obstacle.correctAnswer}
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default RiddleModal;