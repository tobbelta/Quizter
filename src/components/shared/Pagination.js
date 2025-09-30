import React from 'react';

const Pagination = ({ currentPage, totalItems, itemsPerPage, onPageChange }) => {
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  if (totalPages <= 1) {
    return null;
  }

  const handlePageClick = (page) => {
    if (page >= 1 && page <= totalPages) {
      onPageChange(page);
    }
  };

  const renderPageNumbers = () => {
    const pageNumbers = [];
    for (let i = 1; i <= totalPages; i++) {
      pageNumbers.push(
        <button
          key={i}
          onClick={() => handlePageClick(i)}
          className={`px-3 py-1 rounded-md text-sm font-medium ${
            currentPage === i
              ? 'bg-cyan-500 text-black'
              : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
          }`}
        >
          {i}
        </button>
      );
    }
    return pageNumbers;
  };

  return (
    <div className="flex items-center justify-center gap-2 mt-8">
      <button onClick={() => handlePageClick(currentPage - 1)} disabled={currentPage === 1} className="px-3 py-1 rounded-md text-sm font-medium bg-slate-700 text-gray-300 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed">
        Föregående
      </button>
      {renderPageNumbers()}
      <button onClick={() => handlePageClick(currentPage + 1)} disabled={currentPage === totalPages} className="px-3 py-1 rounded-md text-sm font-medium bg-slate-700 text-gray-300 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed">
        Nästa
      </button>
    </div>
  );
};

export default Pagination;