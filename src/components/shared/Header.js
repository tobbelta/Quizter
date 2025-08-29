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
        <header className="container mx-auto flex flex-row justify-between items-center mb-8 gap-4 p-4">
            <div className="flex items-center gap-4">
                <Logo size={60} />
                <h1 className="text-2xl sm:text-4xl font-bold text-text-primary">{title}</h1>
            </div>
            <div className="flex items-center gap-2 sm:w-auto justify-end">
                <p className="hidden md:block text-text-secondary mr-4">
                    Välkommen, <span className="font-bold text-text-primary">{userData?.displayName || user.email}</span>!
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

