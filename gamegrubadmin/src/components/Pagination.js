function buildPageTokens(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const sortedPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);

  const tokens = [];

  sortedPages.forEach((page, index) => {
    const previous = sortedPages[index - 1];

    if (previous && page - previous > 1) {
      tokens.push(`ellipsis-${previous}`);
    }

    tokens.push(page);
  });

  return tokens;
}

function Pagination({
  currentPage,
  totalPages,
  totalItems,
  startItem,
  endItem,
  label = "records",
  onPageChange,
}) {
  if (totalItems === 0 || totalPages <= 1) {
    return null;
  }

  const tokens = buildPageTokens(currentPage, totalPages);

  return (
    <div className="admin-pagination">
      <div className="admin-pagination__summary">
        Showing {startItem}-{endItem} of {totalItems} {label}
      </div>

      <div className="admin-pagination__controls">
        <button
          type="button"
          className="admin-pagination__button admin-pagination__button--ghost"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          Prev
        </button>

        {tokens.map((token) =>
          typeof token === "number" ? (
            <button
              key={token}
              type="button"
              className={
                token === currentPage
                  ? "admin-pagination__button admin-pagination__button--active"
                  : "admin-pagination__button"
              }
              onClick={() => onPageChange(token)}
            >
              {token}
            </button>
          ) : (
            <span key={token} className="admin-pagination__ellipsis">
              ...
            </span>
          )
        )}

        <button
          type="button"
          className="admin-pagination__button admin-pagination__button--ghost"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default Pagination;
