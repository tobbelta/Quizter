import React from 'react';
import Logo from './Logo';
import HamburgerMenu from './HamburgerMenu';

const Header = ({ title, user, userData, children, gpsStatus }) => {
    // Klona barnen för att lägga till klasser för mobilmenyn
    const mobileMenuChildren = React.Children.map(children, child =>
        React.cloneElement(child, {
            className: `${child.props.className} w-full text-left`
        })
    );

    // Bestäm om logon ska snurra baserat på GPS-status
    const shouldSpin = gpsStatus && (gpsStatus.isLoading || !gpsStatus.isReady);

    return (
        // **KORRIGERING:** All container-logik (som "container" och "mx-auto") är borttagen.
        // Headern är nu en enkel flex-rad som fyller den plats den ges av sin förälder.
        <header className="w-full flex flex-row justify-between items-center mb-8 gap-1 sm:gap-4 pl-1 pr-2 py-2 sm:p-4">
            <div className="flex items-center gap-1 sm:gap-4 flex-1 min-w-0 max-w-[calc(100vw-80px)]">
                <div className={shouldSpin ? 'animate-spin' : ''}>
                    <Logo size={40} className="sm:w-[50px] sm:h-[50px] md:w-[60px] md:h-[60px] flex-shrink-0" />
                </div>
                <h1 className="text-xs sm:text-lg md:text-xl lg:text-2xl xl:text-4xl font-bold text-text-primary whitespace-nowrap overflow-hidden text-ellipsis">{title}</h1>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 justify-end w-auto">
                {/* Hamburgermeny för alla skärmar */}
                <HamburgerMenu>
                    {mobileMenuChildren}
                </HamburgerMenu>
            </div>
        </header>
    );
};

export default Header;

