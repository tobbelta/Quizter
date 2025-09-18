import React from 'react';
import { useDebug } from '../../context/DebugContext';

const DebugGameControls = ({ onAdvanceSimulation, simulationState, onCompleteObstacle, game }) => {
  const { simulationSpeed, setSimulationSpeed, minimalControls } = useDebug();

  const getSpeedButtonClass = (speed) => {
    return simulationSpeed === speed 
      ? "sc-button sc-button-blue text-xs px-2 py-1" 
      : "sc-button text-xs px-2 py-1";
  };
  
  const isMoving = simulationState.stage.startsWith('MOVING');

  if (minimalControls) {
    return (
      <div className="bg-black bg-opacity-70 text-white p-2 rounded-lg w-auto flex gap-2">
        <button
          onClick={onAdvanceSimulation}
          disabled={isMoving || simulationState.stage === 'AT_FINISH' || simulationState.description.startsWith('Vid ')}
          className="sc-button sc-button-blue text-xs px-2 py-1"
        >
          {isMoving ? 'Reser...' : simulationState.description}
        </button>
        {game.activeObstacleId && simulationState.stage === 'AT_OBSTACLE' && (
          <button
            onClick={onCompleteObstacle}
            className="sc-button sc-button-green text-xs px-2 py-1"
          >
            Gåta
          </button>
        )}
        {simulationState.stage === 'AT_FINISH' && (
          <button
            onClick={() => onCompleteObstacle('finish')}
            className="sc-button sc-button-blue text-xs px-2 py-1"
          >
            Avsluta
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-black bg-opacity-70 text-white p-4 rounded-lg w-full flex flex-col gap-2">
            <button
              onClick={onAdvanceSimulation}
              disabled={isMoving || simulationState.stage === 'AT_FINISH' || simulationState.description.startsWith('Vid ')}
              className="sc-button sc-button-blue w-full text-sm"
            >
              {isMoving ? 'Reser...' : simulationState.description}
            </button>
            <button
              onClick={onCompleteObstacle}
              disabled={!game.activeObstacleId || simulationState.stage !== 'AT_OBSTACLE'}
              className="sc-button sc-button-green w-full text-sm"
            >
              Visa Gåta
            </button>
            {simulationState.stage === 'AT_FINISH' && (
              <button
                onClick={() => {
                  // Simulera att man når målet
                  if (typeof onCompleteObstacle === 'function') {
                    onCompleteObstacle('finish');
                  }
                }}
                className="sc-button sc-button-blue w-full text-sm"
              >
                Avsluta Spel
              </button>
            )}

      <div className="flex justify-around">
          <button onClick={() => setSimulationSpeed('slow')} className={getSpeedButtonClass('slow')}>Långsam</button>
          <button onClick={() => setSimulationSpeed('normal')} className={getSpeedButtonClass('normal')}>Normal</button>
          <button onClick={() => setSimulationSpeed('fast')} className={getSpeedButtonClass('fast')}>Snabb</button>
        </div>
    </div>
  );
};

export default DebugGameControls;

