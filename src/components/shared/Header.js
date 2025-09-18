import React from 'react';
import Logo from './Logo';
import HamburgerMenu from './HamburgerMenu';

const Header = ({ title, user, userData, children }) => {
    // Klona barnen för att lägga till klasser för mobilmenyn
    const mobileMenuChildren = React.Children.map(children, child =>
        React.cloneElement(child, {
            className: `${child.props.className} w-full text-left`
        })
    );

    return (
        // **KORRIGERING:** All container-logik (som "container" och "mx-auto") är borttagen.
        // Headern är nu en enkel flex-rad som fyller den plats den ges av sin förälder.
        <header className="w-full flex flex-col sm:flex-row justify-between items-center mb-8 gap-4 p-4">
            <div className="flex items-center gap-4">
                <Logo size={60} />
                <h1 className="text-2xl sm:text-4xl font-bold text-text-primary">{title}</h1>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <p className="hidden md:block text-text-secondary mr-4">
                    Välkommen, <span className="font-bold text-text-primary">{userData?.displayName || user?.email || 'Användare'}</span>!
                </p>
                {/* Meny för stora skärmar */}
                <div className="hidden sm:flex items-center gap-2">
                    {children}
                </div>
                {/* Hamburgermeny för små skärmar */}
                <HamburgerMenu>
                    {mobileMenuChildren}
                </HamburgerMenu>
            </div>
        </header>
    );
};

export default Header;

