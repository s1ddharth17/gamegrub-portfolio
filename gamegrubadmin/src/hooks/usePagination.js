import { useEffect, useMemo, useState } from "react";

function usePagination(items, pageSize, resetKeys = []) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const resetSignature = JSON.stringify(resetKeys);

  useEffect(() => {
    setCurrentPage(1);
  }, [resetSignature]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pageItems = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return items.slice(startIndex, startIndex + pageSize);
  }, [currentPage, items, pageSize]);

  const startItem = items.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, items.length);

  return {
    currentPage,
    endItem,
    pageItems,
    setCurrentPage,
    startItem,
    totalItems: items.length,
    totalPages,
  };
}

export default usePagination;
