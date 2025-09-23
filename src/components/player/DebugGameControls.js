import React, { useState } from 'react';
import { useDebug } from '../../context/DebugContext';

const DebugGameControls = ({ onAdvanceSimulation, simulationState, onCompleteObstacle, game, team, gameId, teamMembers }) => {
  const { simulationSpeed, setSimulationSpeed, minimalControls, setMinimalControlsMode } = useDebug();
  const [showActiveUsers, setShowActiveUsers] = useState(false);

  // Kontrollera om alla AKTIVA lagmedlemmar är i mål
  // eslint-disable-next-line no-unused-vars
  const allActivePlayersAtFinish = () => {
    if (!teamMembers || !game?.playersAtFinish) {
      return false;
    }

    // Räkna endast aktiva spelare
    const activeMembers = teamMembers.filter(member => member.isActive === true);
    const activeMembersAtFinish = game.playersAtFinish.filter(playerId =>
      activeMembers.some(member => member.uid === playerId)
    );


    return activeMembers.length > 0 && activeMembersAtFinish.length >= activeMembers.length;
  };

  const getSpeedButtonClass = (speed) => {
    return simulationSpeed === speed 
      ? "sc-button sc-button-blue text-xs px-2 py-1" 
      : "sc-button text-xs px-2 py-1";
  };
  
  const isMoving = simulationState.stage.startsWith('MOVING');
  const isAtFinishWaiting = simulationState.stage === 'AT_FINISH_WAITING';
  // allFinished baseras på om alla AKTIVA spelare faktiskt är i mål
  const allFinished = game?.allPlayersFinished === true;

  // Räkna aktiva spelare för visning
  const activeMembers = teamMembers?.filter(member => member.isActive === true) || [];
  const activeMembersAtFinish = game?.playersAtFinish?.filter(playerId =>
    activeMembers.some(member => member.uid === playerId)
  ) || [];

  // Visa "Gå i mål" när alla hinder är lösta men inte alla aktiva spelare är i mål än
  const shouldShowGoToFinish = simulationState.stage === 'AT_FINISH' && !allFinished;



  if (minimalControls) {
    return (
      <>
        <div className="bg-black bg-opacity-70 text-white p-2 rounded-lg w-auto flex gap-2">
          {/* Visa antingen normal simuleringsknapp ELLER målgångsknapp */}
          {shouldShowGoToFinish ? (
            <button
              onClick={() => {
                try {
                  onCompleteObstacle('finish');
                } catch (error) {
                  console.error('Fel vid Gå i mål (minimal):', error);
                }
              }}
              className="sc-button sc-button-blue text-xs px-2 py-1"
            >
              Gå i mål
            </button>
          ) : (
            <button
              onClick={onAdvanceSimulation}
              disabled={isMoving || simulationState.description.startsWith('Vid ') || isAtFinishWaiting}
              className={`text-xs px-2 py-1 ${
                isAtFinishWaiting ? 'sc-button opacity-50 cursor-not-allowed' : 'sc-button sc-button-blue'
              }`}
            >
              {isMoving ? 'Reser...' : simulationState.description}
            </button>
          )}
          {game.activeObstacleId && simulationState.stage === 'AT_OBSTACLE' &&
           !game.completedObstacles?.includes(game.activeObstacleId) && (
            <button
              onClick={onCompleteObstacle}
              className="sc-button sc-button-green text-xs px-2 py-1"
            >
              Gåta
            </button>
          )}
          {allFinished && (
            <button
              onClick={() => {
                // Navigera till rapporten
                window.location.href = `/report/${gameId}`;
              }}
              className="sc-button sc-button-green text-xs px-2 py-1"
            >
              Visa rapport
            </button>
          )}
          <button
            onClick={() => setMinimalControlsMode(!minimalControls)}
            className="sc-button text-xs px-2 py-1"
            title="Växla till fullständiga kontroller"
          >
            ⚙️
          </button>
          <button
            onClick={() => setShowActiveUsers(!showActiveUsers)}
            className="sc-button text-xs px-2 py-1"
            title="Visa aktiva användare"
          >
            👥
          </button>
        </div>
        {showActiveUsers && (
          <div className="bg-black bg-opacity-70 text-white p-2 rounded-lg w-auto mt-2">
            <div className="text-xs text-gray-300 mb-1">Lagmedlemmar:</div>
            {teamMembers && teamMembers.length > 0 ? (
              <div className="space-y-1">
                {teamMembers.map((member, index) => (
                  <div key={member.uid || index} className="flex justify-between items-center text-xs">
                    <span className="text-white truncate mr-2">
                      {member.displayName || member.email || `Spelare ${index + 1}`}
                    </span>
                    <span className={`px-1 py-0.5 rounded text-xs font-bold ${
                      member.isActive ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                    }`}>
                      {member.isActive ? 'AKTIV' : 'INAKTIV'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-500">Inga lagmedlemmar hittades</div>
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="bg-black bg-opacity-70 text-white p-4 rounded-lg w-full flex flex-col gap-2">
            {/* Visa antingen normal simuleringsknapp ELLER målgångsknapp */}
            {shouldShowGoToFinish ? (
              <button
                onClick={() => {
                  // Simulera att man når målet
                  if (typeof onCompleteObstacle === 'function') {
                    try {
                      onCompleteObstacle('finish');
                    } catch (error) {
                      console.error('Fel vid Gå i mål (full):', error);
                    }
                  }
                }}
                className="sc-button sc-button-blue w-full text-sm"
              >
                Gå i mål ({activeMembersAtFinish.length}/{activeMembers.length} aktiva)
              </button>
            ) : (
              <button
                onClick={onAdvanceSimulation}
                disabled={isMoving || simulationState.description.startsWith('Vid ') || isAtFinishWaiting}
                className={`w-full text-sm ${
                  isAtFinishWaiting ? 'sc-button opacity-50 cursor-not-allowed' : 'sc-button sc-button-blue'
                }`}
              >
                {isMoving ? 'Reser...' : simulationState.description}
              </button>
            )}
            {game.activeObstacleId && simulationState.stage === 'AT_OBSTACLE' &&
             !game.completedObstacles?.includes(game.activeObstacleId) && (
              <button
                onClick={onCompleteObstacle}
                className="sc-button sc-button-green w-full text-sm"
              >
                Visa Gåta
              </button>
            )}
            {allFinished && (
              <button
                onClick={() => {
                  // Navigera till rapporten
                  window.location.href = `/report/${gameId}`;
                }}
                className="sc-button sc-button-green w-full text-sm"
              >
                Visa rapport
              </button>
            )}

      <div className="flex justify-around">
          <button onClick={() => setSimulationSpeed('slow')} className={getSpeedButtonClass('slow')}>Långsam</button>
          <button onClick={() => setSimulationSpeed('normal')} className={getSpeedButtonClass('normal')}>Normal</button>
          <button onClick={() => setSimulationSpeed('fast')} className={getSpeedButtonClass('fast')}>Snabb</button>
        </div>

        <div className="flex justify-around gap-2">
          <button
            onClick={() => setMinimalControlsMode(!minimalControls)}
            className="sc-button text-xs px-2 py-1 flex-1"
          >
            ⚙️ Minimala kontroller
          </button>
          <button
            onClick={() => setShowActiveUsers(!showActiveUsers)}
            className="sc-button text-xs px-2 py-1 flex-1"
          >
            👥 Visa användare
          </button>
        </div>

        {showActiveUsers && (
          <div className="border-t border-gray-600 pt-2 mt-2">
            <div className="text-xs text-gray-300 mb-1">Lagmedlemmar:</div>
            {teamMembers && teamMembers.length > 0 ? (
              <div className="space-y-1">
                {teamMembers.map((member, index) => (
                  <div key={member.uid || index} className="flex justify-between items-center text-xs">
                    <span className="text-white truncate flex-1">
                      {member.displayName || member.email || `Spelare ${index + 1}`}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      member.isActive ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                    }`}>
                      {member.isActive ? 'AKTIV' : 'INAKTIV'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-500">Inga lagmedlemmar hittades</div>
            )}
          </div>
        )}
    </div>
  );
};

export default DebugGameControls;

