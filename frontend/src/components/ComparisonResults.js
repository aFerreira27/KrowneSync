import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts';

const ComparisonResults = ({ results, onExport }) => {
  const [filter, setFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const filteredResults = results.results.filter(result => {
    if (filter === 'all') return true;
    return result.status === filter;
  });

  const paginatedResults = filteredResults.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredResults.length / itemsPerPage);

  // Data for charts
  const statusData = [
    { name: 'Matches', value: results.summary.matches, color: '#22c55e' },
    { name: 'Mismatches', value: results.summary.mismatches, color: '#ef4444' },
    { name: 'Missing from Krowne', value: results.summary.missing_from_krowne, color: '#f59e0b' },
  ];

  const getStatusColor = (status) => {
    switch (status) {
      case 'match': return '#22c55e';
      case 'mismatch': return '#ef4444';
      case 'missing_from_krowne': return '#f59e0b';
      case 'krowne_only': return '#8b5cf6';
      default: return '#6b7280';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'match': return 'Match';
      case 'mismatch': return 'Mismatch';
      case 'missing_from_krowne': return 'Missing from Krowne';
      case 'krowne_only': return 'Krowne Only';
      default: return 'Unknown';
    }
  };

  return (
    <div className="comparison-results">
      <div className="results-header">
        <h2>Comparison Results</h2>
        <button onClick={onExport} className="btn btn-outline">
          Export Results
        </button>
      </div>

      {/* Summary Section */}
      <div className="results-summary">
        <div className="summary-cards">
          <div className="summary-card">
            <h3>Total Products</h3>
            <div className="summary-value">{results.summary.total_source_products}</div>
          </div>
          <div className="summary-card match">
            <h3>Matches</h3>
            <div className="summary-value">{results.summary.matches}</div>
          </div>
          <div className="summary-card mismatch">
            <h3>Mismatches</h3>
            <div className="summary-value">{results.summary.mismatches}</div>
          </div>
          <div className="summary-card missing">
            <h3>Missing</h3>
            <div className="summary-value">{results.summary.missing_from_krowne}</div>
          </div>
        </div>

        {/* Charts */}
        <div className="charts-container">
          <div className="chart-section">
            <h3>Status Distribution</h3>
            <PieChart width={300} height={200}>
              <Pie
                data={statusData}
                cx={150}
                cy={100}
                innerRadius={40}
                outerRadius={80}
                dataKey="value"
              >
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="results-filters">
        <div className="filter-buttons">
          <button 
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            All ({results.results.length})
          </button>
          <button 
            className={filter === 'match' ? 'active' : ''}
            onClick={() => setFilter('match')}
          >
            Matches ({results.summary.matches})
          </button>
          <button 
            className={filter === 'mismatch' ? 'active' : ''}
            onClick={() => setFilter('mismatch')}
          >
            Mismatches ({results.summary.mismatches})
          </button>
          <button 
            className={filter === 'missing_from_krowne' ? 'active' : ''}
            onClick={() => setFilter('missing_from_krowne')}
          >
            Missing ({results.summary.missing_from_krowne})
          </button>
        </div>
      </div>

      {/* Results Table */}
      <div className="results-table">
        <table>
          <thead>
            <tr>
              <th>Product ID</th>
              <th>Name</th>
              <th>Status</th>
              <th>Differences</th>
              <th>Krowne URL</th>
            </tr>
          </thead>
          <tbody>
            {paginatedResults.map((result, index) => (
              <tr key={index}>
                <td>{result.product_id}</td>
                <td>{result.name}</td>
                <td>
                  <span 
                    className="status-badge"
                    style={{ backgroundColor: getStatusColor(result.status) }}
                  >
                    {getStatusText(result.status)}
                  </span>
                </td>
                <td>
                  {result.differences.length > 0 ? (
                    <ul className="differences-list">
                      {result.differences.map((diff, i) => (
                        <li key={i}>{diff}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="no-differences">No differences</span>
                  )}
                </td>
                <td>
                  {result.krowne_url ? (
                    <a href={result.krowne_url} target="_blank" rel="noopener noreferrer">
                      View on Krowne
                    </a>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button 
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
          >
            Previous
          </button>
          <span>Page {currentPage} of {totalPages}</span>
          <button 
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default ComparisonResults;