import React from 'react';

const InstructionsModal = ({ onClose }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[1002] p-4">
            <div className="sc-card w-full max-w-2xl max-h-[90vh] flex flex-col">
                <h1 className="text-3xl font-bold text-center uppercase mb-6 text-accent-cyan">Instruktioner</h1>
                
                <div className="space-y-6 overflow-y-auto pr-2">
                    <div className="mb-4">
                        <h2 className="text-xl font-bold text-accent-yellow mb-2">Målet med spelet</h2>
                        <p className="text-gray-300 leading-relaxed">
                            Målet med GeoQuest är att som ett lag navigera genom en bana med hjälp av en karta på er mobiltelefon. Ni måste hitta och lösa en serie av hinder (gåtor) för att till slut nå målflaggan. Samarbete och snabbhet är nyckeln till framgång!
                        </p>
                    </div>

                    <div className="mb-4">
                        <h2 className="text-xl font-bold text-accent-yellow mb-2">Så här spelar du</h2>
                        <ol className="list-decimal list-inside space-y-2 text-gray-300 leading-relaxed">
                            <li><b>Skapa/Gå med i lag:</b> Från "Mina Lag"-sidan, skapa ett nytt lag eller gå med i ett befintligt med en anslutningskod.</li>
                            <li><b>Skapa Spel:</b> Lagledaren väljer en bana och skapar ett spel.</li>
                            <li><b>Starta Spel:</b> Lagledaren startar spelet från "Mina Lag"-sidan.</li>
                            <li><b>Hitta Start:</b> När spelet startar, gå till den gröna start-ikonen på kartan. Tidtagningen börjar när du är tillräckligt nära.</li>
                            <li><b>Lös Hinder:</b> Hitta och lös gåtorna vid de gula varnings-ikonerna.</li>
                            <li><b>Nå Målet:</b> När alla hinder är lösta, måste **alla** spelare samlas vid den rutiga målflaggan för att vinna.</li>
                        </ol>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-accent-yellow mb-2">Viktigt att veta</h2>
                        <ul className="list-disc list-inside space-y-2 text-gray-300 leading-relaxed">
                            <li><b>GPS-åtkomst:</b> Spelet kräver tillgång till din telefons GPS för att fungera.</li>
                            <li><b>Samarbete:</b> Endast en spelare behöver lösa varje gåta, men alla måste nå målet.</li>
                            <li><b>Testläge:</b> Om spelet startas i "testläge" räcker det att en spelare når målet för att vinna.</li>
                        </ul>
                    </div>
                </div>

                <div className="text-center mt-6 pt-4 border-t border-gray-700">
                    <button onClick={onClose} className="sc-button">
                        Stäng
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InstructionsModal;
