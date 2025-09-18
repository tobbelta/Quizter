import React from 'react';

const SkeletonCard = () => (
    <div className="sc-card animate-pulse">
        <div className="flex items-center gap-3">
            <div className="w-5 h-5 bg-gray-700 rounded"></div>
            <div className="flex-grow">
                <div className="h-5 bg-gray-700 rounded mb-2 w-3/4"></div>
                <div className="h-4 bg-gray-600 rounded mb-1 w-1/2"></div>
                <div className="h-4 bg-gray-600 rounded w-2/3"></div>
            </div>
            <div className="flex gap-2">
                <div className="w-20 h-10 bg-gray-700 rounded"></div>
                <div className="w-20 h-10 bg-gray-700 rounded"></div>
            </div>
        </div>
    </div>
);

const SkeletonTable = ({ rows = 5 }) => (
    <div className="space-y-2 animate-pulse">
        {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="flex items-center gap-4 py-3 border-b border-gray-700">
                <div className="w-5 h-5 bg-gray-700 rounded"></div>
                <div className="flex-1 h-4 bg-gray-700 rounded"></div>
                <div className="flex-1 h-4 bg-gray-600 rounded"></div>
                <div className="flex-1 h-4 bg-gray-600 rounded"></div>
                <div className="w-20 h-8 bg-gray-700 rounded"></div>
            </div>
        ))}
    </div>
);

const SkeletonGameList = ({ games = 3 }) => (
    <div className="space-y-4">
        <div className="flex justify-between items-center mb-3">
            <div className="h-6 bg-gray-700 rounded w-32 animate-pulse"></div>
            <div className="h-4 bg-gray-600 rounded w-24 animate-pulse"></div>
        </div>
        {Array.from({ length: games }).map((_, index) => (
            <SkeletonCard key={index} />
        ))}
    </div>
);

const SkeletonMap = () => (
    <div className="w-full h-64 bg-gray-800 rounded-lg animate-pulse flex items-center justify-center">
        <div className="text-gray-600">
            <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
        </div>
    </div>
);

const SkeletonModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[1001] p-4">
        <div className="sc-card w-full max-w-md animate-pulse">
            <div className="h-6 bg-gray-700 rounded mb-4 w-2/3"></div>
            <div className="space-y-4">
                <div>
                    <div className="h-4 bg-gray-600 rounded mb-2 w-1/4"></div>
                    <div className="h-10 bg-gray-700 rounded"></div>
                </div>
                <div>
                    <div className="h-4 bg-gray-600 rounded mb-2 w-1/3"></div>
                    <div className="h-10 bg-gray-700 rounded"></div>
                </div>
            </div>
            <div className="flex justify-end space-x-4 pt-4">
                <div className="w-20 h-10 bg-gray-700 rounded"></div>
                <div className="w-24 h-10 bg-gray-700 rounded"></div>
            </div>
        </div>
    </div>
);

const SkeletonLoader = ({ type, count = 3, className = "" }) => {
    const skeletonComponents = {
        card: <SkeletonCard />,
        table: <SkeletonTable rows={count} />,
        gameList: <SkeletonGameList games={count} />,
        map: <SkeletonMap />,
        modal: <SkeletonModal />
    };

    const SkeletonComponent = skeletonComponents[type] || <SkeletonCard />;

    if (type === 'multiple') {
        return (
            <div className={`space-y-4 ${className}`}>
                {Array.from({ length: count }).map((_, index) => (
                    <SkeletonCard key={index} />
                ))}
            </div>
        );
    }

    return <div className={className}>{SkeletonComponent}</div>;
};

export default SkeletonLoader;

// Individual exports for specific use cases
export { SkeletonCard, SkeletonTable, SkeletonGameList, SkeletonMap, SkeletonModal };