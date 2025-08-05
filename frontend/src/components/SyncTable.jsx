import React, { useEffect, useState } from "react";
import axios from "axios";

const SyncTable = () => {
  const [skus, setSkus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    axios.get("/api/products/skus")
      .then(res => {
        setSkus(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to load SKUs:", err);
        setError("Failed to load SKUs");
        setLoading(false);
      });
  }, []);

  if (loading) return <p>Loading SKUs...</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div>
      <h2>Product SKUs</h2>
      <table>
        <thead>
          <tr>
            <th>SKU</th>
          </tr>
        </thead>
        <tbody>
          {skus.map((sku, idx) => (
            <tr key={idx}>
              <td>{sku}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default SyncTable;