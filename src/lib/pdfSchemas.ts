import type { Schema } from '@pdfme/common';

export const productNameSchema: Schema = {
  name: 'productName',
  type: 'text',
  position: { x: 25, y: 50 },
  width: 150,
  height: 15,
  fontSize: 18,
};

export const skuSchema: Schema = {
  name: 'sku',
  type: 'text',
  position: { x: 25, y: 70 },
  width: 150,
  height: 15,
  fontSize: 12,
};

export const seriesImageSchema: Schema = {
  name: 'seriesImage',
  type: 'image',
  position: { x: 100, y: 100 }, // Example position, adjust as needed
  width: 80,
  height: 40,
};

export const descriptionSchema: Schema = {
  name: 'description',
  type: 'text',
  position: { x: 25, y: 150 }, // Example position, adjust as needed
  width: 160,
  height: 30,
  fontSize: 10,
};

export const standardFeaturesSchema: Schema = {
  name: 'standardFeatures',
  type: 'text',
  position: { x: 25, y: 190 }, // Example position, adjust as needed
  width: 160,
  height: 40,
  fontSize: 10,
};

export const specificationsTableSchema: Schema = {
  name: 'specificationsTable',
  type: 'table',
  position: { x: 25, y: 240 }, // Example position, adjust as needed
  width: 160,
  height: 50, // Example height, adjust as needed
  // Table specific properties (adjust as needed based on pdfme table schema options)
  columnManagement: {
    columns: [
      { header: 'Header 1', minWidth: 50 }, // Default column 1
      { header: 'Header 2', minWidth: 50 }, // Default column 2
      // You can add more default columns here if needed
    ],
  },
  // You might need to define data structure for rows if providing initial data
};

export const compliancesSchema: Schema = {
  name: 'compliances',
  type: 'text', // Can be text for listing compliances
  position: { x: 25, y: 300 }, // Example position, adjust as needed
  width: 160,
  height: 30,
  fontSize: 10,
  // If you need to include images related to compliances, you might need separate image schemas
};

export const complianceImageSchema: Schema = {
  name: 'complianceImage',
  type: 'image',
  position: { x: 100, y: 340 }, // Example position, adjust as needed
  width: 50,
  height: 20,
};

export const drawing2dImageSchema: Schema = {
  name: 'drawing2dImage',
  type: 'image',
  position: { x: 25, y: 370 }, // Example position, adjust as needed
  width: 100,
  height: 100,
};

export const revisionSchema: Schema = {
  name: 'revision',
  type: 'text',
  position: { x: 150, y: 10 }, // Example position, adjust as needed, possibly in a header/footer area
  width: 40,
  height: 10,
  fontSize: 8,
};
