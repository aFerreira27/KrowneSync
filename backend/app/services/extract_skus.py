# backend/app/services/extract_skus.py
import csv
import os
import logging

logger = logging.getLogger(__name__)

def extract_known_ids_from_csv(csv_path: str) -> list:
    """
    Extract SKUs/IDs from the first column of a CSV file.
    
    Args:
        csv_path: Path to the CSV file
    
    Returns:
        List of SKU/ID strings from the first column
    """
    ids = []
    
    try:
        # Handle both absolute and relative paths
        if not os.path.isabs(csv_path):
            # If relative path, try to find it relative to the backend folder
            possible_paths = [
                csv_path,
                os.path.join('uploads', os.path.basename(csv_path)),
                os.path.join('backend', 'uploads', os.path.basename(csv_path)),
                os.path.join('..', 'uploads', os.path.basename(csv_path))
            ]
            
            for path in possible_paths:
                if os.path.exists(path):
                    csv_path = path
                    break
        
        if not os.path.exists(csv_path):
            logger.warning(f"CSV file not found: {csv_path}")
            return ids
        
        with open(csv_path, 'r', encoding='utf-8', errors='ignore') as file:
            reader = csv.reader(file)
            
            # Skip header row if it looks like a header
            first_row = next(reader, None)
            if first_row and first_row[0] and not first_row[0].startswith('#'):
                # Check if first row looks like a header
                if any(keyword in first_row[0].lower() for keyword in ['sku', 'id', 'product', 'item', 'code']):
                    # It's likely a header, skip it
                    pass
                else:
                    # It's likely data, include it
                    if first_row[0].strip():
                        ids.append(first_row[0].strip())
            
            # Process remaining rows
            for row in reader:
                if row and row[0]:  # Check if row exists and has first column
                    value = row[0].strip()
                    if value and not value.startswith('#'):  # Skip empty and comment lines
                        ids.append(value)
        
        logger.info(f"Extracted {len(ids)} IDs from {csv_path}")
        
    except Exception as e:
        logger.error(f"Error reading CSV file {csv_path}: {str(e)}")
    
    return ids

def save_skus_to_csv(skus: list, csv_path: str, header: str = 'SKU'):
    """
    Save a list of SKUs to a CSV file.
    
    Args:
        skus: List of SKU strings
        csv_path: Path where to save the CSV file
        header: Header for the SKU column (default: 'SKU')
    """
    try:
        os.makedirs(os.path.dirname(csv_path), exist_ok=True)
        
        with open(csv_path, 'w', newline='', encoding='utf-8') as file:
            writer = csv.writer(file)
            writer.writerow([header])  # Write header
            for sku in skus:
                writer.writerow([sku])
        
        logger.info(f"Saved {len(skus)} SKUs to {csv_path}")
        
    except Exception as e:
        logger.error(f"Error saving SKUs to CSV: {str(e)}")
        raise