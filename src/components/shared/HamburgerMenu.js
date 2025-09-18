import React, { useState, useRef, useEffect } from 'react';

const HamburgerMenu = ({ children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const node = useRef();

    // Stäng menyn om man klickar utanför den
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (node.current && !node.current.contains(e.target)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        } else {
            document.removeEventListener("mousedown", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isOpen]);

    return (
        <div ref={node} className="relative z-[1001]">
            <button onClick={() => setIsOpen(!isOpen)} className="soft-ui-button p-3 relative z-[1001]">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7"></path>
                </svg>
            </button>

            {isOpen && (
                <div
                    className="absolute top-full right-0 mt-2 w-48 soft-ui-card z-[1001] p-2 transition-all duration-300 ease-in-out"
                    style={{ transformOrigin: 'top right' }}
                >
                    <div className="flex flex-col gap-2">
                        {children}
                    </div>
                </div>
            )}
        </div>
    );
};

export default HamburgerMenu;
