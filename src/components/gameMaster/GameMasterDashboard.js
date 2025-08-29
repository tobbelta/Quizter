// src/components/gameMaster/GameMasterDashboard.js
import React, { useState } from 'react';
import CourseCreator from './CourseCreator';
import CourseManagement from './CourseManagement';
import UserManagement from './UserManagement';
import LiveMonitor from './LiveMonitor';
import TeamManagement from './TeamManagement';
import VersionHistory from './VersionHistory';
import ObstacleBank from './ObstacleBank';
import Header from '../shared/Header';

const GameMasterDashboard = ({ user, userData }) => {
  const [activeTab, setActiveTab] = useState('monitor');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleTabClick = (tabName) => {
    setActiveTab(tabName);
    setIsMenuOpen(false);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'monitor': return <LiveMonitor />;
      case 'courses': return <CourseManagement />;
      case 'teams': return <TeamManagement />;
      case 'users': return <UserManagement />;
      case 'obstacles': return <ObstacleBank />;
      case 'versions': return <VersionHistory />;
      case 'creator':
      default: return <CourseCreator />;
    }
  };

  const getTabClass = (tabName) => {
    const isActive = activeTab === tabName;
    return `px-4 py-2 font-semibold rounded-lg transition-all duration-200 capitalize text-sm
            ${isActive ? 'sc-button-blue' : 'sc-button'}`;
  };

  const tabs = ['monitor', 'creator', 'courses', 'obstacles', 'teams', 'users', 'versions'];

  return (
    <div className="min-h-screen">
      <Header title="Game Master Panel" user={user} userData={userData} />
      
      <main className="container mx-auto p-4">
        <div className="mb-6">
          <nav className="hidden sm:flex flex-wrap gap-2">
            {tabs.map(tab => (
                 <button key={tab} onClick={() => handleTabClick(tab)} className={getTabClass(tab)}>
                    {tab.replace('-', ' ')}
                 </button>
            ))}
          </nav>

          <div className="sm:hidden relative">
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="sc-button w-full flex justify-between items-center">
                <span className="capitalize">{activeTab.replace('-', ' ')}</span>
                <svg className={`w-5 h-5 transition-transform ${isMenuOpen ? 'transform rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            {isMenuOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 sc-card z-20 p-2 space-y-2">
                    {tabs.map(tab => (
                        <button key={tab} onClick={() => handleTabClick(tab)} className="sc-button w-full text-left">
                            {tab.replace('-', ' ')}
                        </button>
                    ))}
                </div>
            )}
          </div>
        </div>
        
        <div className="sc-card">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default GameMasterDashboard;
