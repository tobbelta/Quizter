import React, { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase';
import { useNavigate } from 'react-router-dom';
import CourseCreator from './CourseCreator';
import CourseManagement from './CourseManagement';
import UserManagement from './UserManagement';
import LiveMonitor from './LiveMonitor';
import TeamManagement from './TeamManagement'; 
import ProfileModal from '../shared/ProfileModal';
import VersionHistory from './VersionHistory';
import ObstacleBank from './ObstacleBank';
import Header from '../shared/Header';
import HamburgerMenu from '../shared/HamburgerMenu';

const GameMasterDashboard = ({ user, userData }) => {
  const [activeTab, setActiveTab] = useState('monitor');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => signOut(auth).then(() => navigate('/login'));

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
  
  const handleTabClick = (tabName) => {
    setActiveTab(tabName);
    setIsMenuOpen(false);
  };

  const getTabClass = (tabName) => {
      return `px-4 py-2 font-semibold transition-colors duration-200 capitalize ${
          activeTab === tabName 
          ? 'sc-button sc-button-blue' 
          : 'sc-button'
      }`;
  };

  const tabs = ['monitor', 'creator', 'courses', 'obstacles', 'teams', 'users', 'versions'];

  return (
    <>
    {isProfileOpen && <ProfileModal user={user} userData={userData} onClose={() => setIsProfileOpen(false)} />}
    <div className="min-h-screen p-4">
      <Header title="GM Panel" user={user} userData={userData}>
        <button onClick={() => setIsProfileOpen(true)} className="sc-button">Profil</button>
        <button onClick={handleLogout} className="sc-button sc-button-red">Logga ut</button>
      </Header>
      
      <main className="container mx-auto">
        <div className="mb-4">
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
                <div className="absolute top-full left-0 right-0 mt-2 sc-card z-20 p-2">
                    <nav className="flex flex-col gap-2">
                        {tabs.map(tab => (
                            <button key={tab} onClick={() => handleTabClick(tab)} className={getTabClass(tab)}>
                                {tab.replace('-', ' ')}
                            </button>
                        ))}
                    </nav>
                </div>
            )}
          </div>
        </div>
        
        <div className="sc-card">
          {renderContent()}
        </div>
      </main>
    </div>
    </>
  );
};

export default GameMasterDashboard;
