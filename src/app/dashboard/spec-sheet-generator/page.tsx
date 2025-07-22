import { useState } from 'react';

export default function SpecSheetGenerator() {
  const [sku, setSku] = useState('');

  const handleGenerateSpecSheet = () => {
    // Here you would typically call an API or a function to generate the spec sheet based on the SKU
    console.log(`Generating spec sheet for SKU: ${sku}`);
    // Add your logic to generate and potentially download or display the spec sheet
  };

  return (
    <div>
      <h1>Generate Spec Sheet</h1>
      <div>
        <label htmlFor="skuInput">Enter SKU:</label>
        <input
          id="skuInput"
          type="text"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
        />
      </div>
      <button onClick={handleGenerateSpecSheet} disabled={!sku}>
        Generate Spec Sheet
      </button>
    </div>
  );
}