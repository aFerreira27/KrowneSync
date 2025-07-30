import logging
from typing import List, Dict, Any
from difflib import SequenceMatcher
import re

logger = logging.getLogger(__name__)

class DataComparator:
    def __init__(self):
        self.similarity_threshold = 0.8  # Threshold for name matching
        self.price_tolerance = 0.05  # 5% price difference tolerance
    
    def compare(self, source_products: List[Dict], krowne_products: List[Dict]) -> List[Dict]:
        """Compare source products with Krowne.com products"""
        comparison_results = []
        
        # Create lookup dictionaries for efficient matching
        krowne_by_id = {str(p['product_id']).lower(): p for p in krowne_products}
        krowne_by_name = {self._normalize_name(p['name']): p for p in krowne_products}
        
        for source_product in source_products:
            result = self._compare_single_product(source_product, krowne_by_id, krowne_by_name)
            comparison_results.append(result)
        
        # Check for products that exist on Krowne but not in source
        self._find_krowne_only_products(source_products, krowne_products, comparison_results)
        
        logger.info(f"Completed comparison of {len(source_products)} source products with {len(krowne_products)} Krowne products")
        return comparison_results
    
    def _compare_single_product(self, source_product: Dict, krowne_by_id: Dict, krowne_by_name: Dict) -> Dict:
        """Compare a single source product with Krowne products"""
        source_id = str(source_product.get('product_id', '')).lower()
        source_name = self._normalize_name(source_product.get('name', ''))
        
        # Try to find match by ID first
        krowne_product = krowne_by_id.get(source_id)
        match_method = 'id'
        
        # If no ID match, try name matching
        if not krowne_product:
            krowne_product = krowne_by_name.get(source_name)
            match_method = 'exact_name'
            
            # If no exact name match, try fuzzy matching
            if not krowne_product:
                krowne_product, similarity = self._find_best_name_match(source_name, krowne_by_name)
                match_method = f'fuzzy_name_{similarity:.2f}'
        
        if not krowne_product:
            return {
                'product_id': source_product.get('product_id'),
                'name': source_product.get('name'),
                'status': 'missing_from_krowne',
                'match_method': 'none',
                'differences': ['Product not found on Krowne.com'],
                'source_data': source_product,
                'krowne_data': None,
                'krowne_url': None
            }
        
        # Compare product details
        differences = self._identify_differences(source_product, krowne_product)
        
        status = 'match' if not differences else 'mismatch'
        
        return {
            'product_id': source_product.get('product_id'),
            'name': source_product.get('name'),
            'status': status,
            'match_method': match_method,
            'differences': differences,
            'source_data': source_product,
            'krowne_data': krowne_product,
            'krowne_url': krowne_product.get('url')
        }
    
    def _normalize_name(self, name: str) -> str:
        """Normalize product name for comparison"""
        if not name:
            return ''
        
        # Convert to lowercase and remove extra whitespace
        normalized = re.sub(r'\s+', ' ', name.lower().strip())
        
        # Remove common words that might cause mismatches
        stop_words = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']
        words = normalized.split()
        filtered_words = [word for word in words if word not in stop_words]
        
        return ' '.join(filtered_words)
    
    def _find_best_name_match(self, source_name: str, krowne_by_name: Dict) -> tuple:
        """Find the best fuzzy match for a product name"""
        best_match = None
        best_similarity = 0
        
        for krowne_name, krowne_product in krowne_by_name.items():
            similarity = SequenceMatcher(None, source_name, krowne_name).ratio()
            
            if similarity > best_similarity and similarity >= self.similarity_threshold:
                best_similarity = similarity
                best_match = krowne_product
        
        return best_match, best_similarity
    
    def _identify_differences(self, source_product: Dict, krowne_product: Dict) -> List[str]:
        """Identify differences between source and Krowne product"""
        differences = []
        
        # Compare name
        source_name = self._normalize_name(source_product.get('name', ''))
        krowne_name = self._normalize_name(krowne_product.get('name', ''))
        
        if source_name != krowne_name:
            name_similarity = SequenceMatcher(None, source_name, krowne_name).ratio()
            if name_similarity < 0.9:  # Allow some variation in names
                differences.append(f"Name differs: '{source_product.get('name')}' vs '{krowne_product.get('name')}'")
        
        # Compare price
        source_price = float(source_product.get('price', 0))
        krowne_price = float(krowne_product.get('price', 0))
        
        if source_price > 0 and krowne_price > 0:
            price_diff = abs(source_price - krowne_price) / max(source_price, krowne_price)
            if price_diff > self.price_tolerance:
                differences.append(f"Price differs: ${source_price:.2f} vs ${krowne_price:.2f}")
        elif source_price != krowne_price:
            differences.append(f"Price differs: ${source_price:.2f} vs ${krowne_price:.2f}")
        
        # Compare description
        source_desc = source_product.get('description', '').strip()
        krowne_desc = krowne_product.get('description', '').strip()
        
        if source_desc and krowne_desc:
            desc_similarity = SequenceMatcher(None, source_desc.lower(), krowne_desc.lower()).ratio()
            if desc_similarity < 0.7:  # Allow significant variation in descriptions
                differences.append("Description differs significantly")
        elif source_desc != krowne_desc:
            if source_desc and not krowne_desc:
                differences.append("Description missing on Krowne.com")
            elif krowne_desc and not source_desc:
                differences.append("Description exists on Krowne.com but not in source")
        
        # Check availability
        krowne_availability = krowne_product.get('availability', '').lower()
        if 'out' in krowne_availability or 'unavailable' in krowne_availability:
            differences.append("Product appears unavailable on Krowne.com")
        
        return differences
    
    def _find_krowne_only_products(self, source_products: List[Dict], krowne_products: List[Dict], comparison_results: List[Dict]):
        """Find products that exist on Krowne but not in source data"""
        source_ids = {str(p.get('product_id', '')).lower() for p in source_products}
        source_names = {self._normalize_name(p.get('name', '')) for p in source_products}
        
        for krowne_product in krowne_products:
            krowne_id = str(krowne_product.get('product_id', '')).lower()
            krowne_name = self._normalize_name(krowne_product.get('name', ''))
            
            # Check if this Krowne product was matched with any source product
            found_in_results = any(
                result.get('krowne_data') and 
                result['krowne_data'].get('product_id') == krowne_product.get('product_id')
                for result in comparison_results
            )
            
            if not found_in_results and krowne_id not in source_ids and krowne_name not in source_names:
                comparison_results.append({
                    'product_id': krowne_product.get('product_id'),
                    'name': krowne_product.get('name'),
                    'status': 'krowne_only',
                    'match_method': 'none',
                    'differences': ['Product exists on Krowne.com but not in source data'],
                    'source_data': None,
                    'krowne_data': krowne_product,
                    'krowne_url': krowne_product.get('url')
                })
    
    def generate_summary_report(self, comparison_results: List[Dict]) -> Dict:
        """Generate a summary report of the comparison"""
        total_products = len(comparison_results)
        matches = len([r for r in comparison_results if r['status'] == 'match'])
        mismatches = len([r for r in comparison_results if r['status'] == 'mismatch'])
        missing_from_krowne = len([r for r in comparison_results if r['status'] == 'missing_from_krowne'])
        krowne_only = len([r for r in comparison_results if r['status'] == 'krowne_only'])
        
        # Analyze common differences
        all_differences = []
        for result in comparison_results:
            all_differences.extend(result.get('differences', []))
        
        difference_counts = {}
        for diff in all_differences:
            # Categorize differences
            if 'name' in diff.lower():
                category = 'Name differences'
            elif 'price' in diff.lower():
                category = 'Price differences'
            elif 'description' in diff.lower():
                category = 'Description differences'
            elif 'unavailable' in diff.lower():
                category = 'Availability issues'
            else:
                category = 'Other differences'
            
            difference_counts[category] = difference_counts.get(category, 0) + 1
        
        return {
            'total_products': total_products,
            'matches': matches,
            'mismatches': mismatches,
            'missing_from_krowne': missing_from_krowne,
            'krowne_only': krowne_only,
            'match_rate': (matches / total_products * 100) if total_products > 0 else 0,
            'difference_breakdown': difference_counts,
            'recommendations': self._generate_recommendations(comparison_results)
        }
    
    def _generate_recommendations(self, comparison_results: List[Dict]) -> List[str]:
        """Generate recommendations based on comparison results"""
        recommendations = []
        
        missing_count = len([r for r in comparison_results if r['status'] == 'missing_from_krowne'])
        if missing_count > 0:
            recommendations.append(f"Consider adding {missing_count} missing products to Krowne.com")
        
        price_mismatches = len([r for r in comparison_results 
                               if any('price' in diff.lower() for diff in r.get('differences', []))])
        if price_mismatches > 0:
            recommendations.append(f"Review pricing for {price_mismatches} products with price discrepancies")
        
        unavailable_products = len([r for r in comparison_results 
                                   if any('unavailable' in diff.lower() for diff in r.get('differences', []))])
        if unavailable_products > 0:
            recommendations.append(f"Update availability status for {unavailable_products} products")
        
        return recommendations