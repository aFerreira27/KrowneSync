#!/usr/bin/env python3
"""
Mapped Data Comparator - Compares product data using ProductDataMapper categories
"""

import logging
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from datetime import datetime

from .product_data_mapper import ProductDataMapper, ProductMapping
from .pimly_client import PimlyClient
from .krowne_scraper import KrowneScraper

logger = logging.getLogger(__name__)


@dataclass
class FieldComparison:
    """Individual field comparison result"""
    field_name: str
    display_name: str
    category: str
    pimly_value: Any
    krowne_value: Any
    is_match: bool
    is_mismatch: bool
    has_partial_data: bool
    field_type: str
    confidence_score: float = 1.0
    notes: Optional[str] = None
    description: Optional[str] = None


@dataclass
class ComparisonSummary:
    """Summary of comparison results"""
    sku: str
    total_fields_compared: int
    matches: int
    mismatches: int
    partial_data: int
    pimly_only_fields: int
    krowne_only_fields: int
    overall_match_percentage: float
    comparison_timestamp: str
    categories_compared: List[str]


@dataclass
class ProductComparison:
    """Complete product comparison result"""
    sku: str
    pimly_mapping: Optional[ProductMapping]
    krowne_mapping: Optional[ProductMapping]
    field_comparisons: List[FieldComparison]
    summary: ComparisonSummary
    status: str  # 'complete', 'partial_pimly', 'partial_krowne', 'no_data'
    errors: List[str]


class MappedDataComparator:
    """Compares product data using ProductDataMapper categorization"""
    
    def __init__(self):
        self.mapper = ProductDataMapper()
        self.field_type_weights = {
            'exact_match': 1.0,
            'normalized_match': 0.9,
            'partial_match': 0.7,
            'fuzzy_match': 0.5,
            'no_match': 0.0
        }
    
    def compare_products(self, 
                        pimly_data: Optional[Dict[str, Any]] = None,
                        krowne_data: Optional[Dict[str, Any]] = None,
                        sku: Optional[str] = None) -> ProductComparison:
        """
        Compare product data from Pimly and Krowne using mapped categories
        
        Args:
            pimly_data: Raw Pimly product data
            krowne_data: Raw Krowne product data  
            sku: Product SKU for identification
            
        Returns:
            ProductComparison object with detailed field-by-field analysis
        """
        errors = []
        pimly_mapping = None
        krowne_mapping = None
        
        # Map Pimly data if available
        if pimly_data:
            try:
                pimly_mapping = self.mapper.map_pimly_data(pimly_data)
                logger.info(f"Successfully mapped Pimly data for SKU: {sku}")
            except Exception as e:
                error_msg = f"Failed to map Pimly data: {str(e)}"
                errors.append(error_msg)
                logger.error(error_msg)
        
        # Map Krowne data if available
        if krowne_data:
            try:
                krowne_mapping = self.mapper.map_krowne_data(krowne_data)
                logger.info(f"Successfully mapped Krowne data for SKU: {sku}")
            except Exception as e:
                error_msg = f"Failed to map Krowne data: {str(e)}"
                errors.append(error_msg)
                logger.error(error_msg)
        
        # Determine comparison SKU
        comparison_sku = sku or (pimly_mapping.sku if pimly_mapping else None) or (krowne_mapping.sku if krowne_mapping else "unknown")
        
        # Perform field-by-field comparison
        field_comparisons = self._compare_mapped_data(pimly_mapping, krowne_mapping)
        
        # Generate summary
        summary = self._generate_summary(comparison_sku, field_comparisons, pimly_mapping, krowne_mapping)
        
        # Determine overall status
        status = self._determine_status(pimly_mapping, krowne_mapping, errors)
        
        return ProductComparison(
            sku=comparison_sku,
            pimly_mapping=pimly_mapping,
            krowne_mapping=krowne_mapping,
            field_comparisons=field_comparisons,
            summary=summary,
            status=status,
            errors=errors
        )
    
    def _compare_mapped_data(self, 
                           pimly_mapping: Optional[ProductMapping],
                           krowne_mapping: Optional[ProductMapping]) -> List[FieldComparison]:
        """Compare mapped data field by field"""
        comparisons = []
        
        if not pimly_mapping and not krowne_mapping:
            return comparisons
        
        # Compare basic fields
        basic_fields = [
            ('name', 'Product Name', 'basic_info'),
            ('sku', 'SKU', 'basic_info'),
            ('series', 'Series', 'basic_info')
        ]
        
        for field_name, display_name, category in basic_fields:
            comparison = self._compare_field(
                field_name, display_name, category,
                getattr(pimly_mapping, field_name, None) if pimly_mapping else None,
                getattr(krowne_mapping, field_name, None) if krowne_mapping else None,
                'text'
            )
            if comparison:
                comparisons.append(comparison)
        
        # Compare features
        features_comparison = self._compare_features(pimly_mapping, krowne_mapping)
        if features_comparison:
            comparisons.append(features_comparison)
        
        # Compare specifications
        spec_comparisons = self._compare_specifications(pimly_mapping, krowne_mapping)
        comparisons.extend(spec_comparisons)
        
        # Compare certifications
        cert_comparisons = self._compare_certifications(pimly_mapping, krowne_mapping)
        comparisons.extend(cert_comparisons)
        
        # Compare images
        images_comparison = self._compare_images(pimly_mapping, krowne_mapping)
        if images_comparison:
            comparisons.append(images_comparison)
        
        # Compare files
        files_comparisons = self._compare_files(pimly_mapping, krowne_mapping)
        comparisons.extend(files_comparisons)
        
        # Compare related items
        related_comparisons = self._compare_related_items(pimly_mapping, krowne_mapping)
        comparisons.extend(related_comparisons)
        
        return comparisons
    
    def _compare_field(self, field_name: str, display_name: str, category: str,
                      pimly_value: Any, krowne_value: Any, field_type: str,
                      notes: Optional[str] = None) -> Optional[FieldComparison]:
        """Compare individual field values"""
        
        # Skip if both values are empty
        if self._is_empty_value(pimly_value) and self._is_empty_value(krowne_value):
            return None
        
        # Determine comparison result
        is_match = False
        is_mismatch = False
        has_partial_data = False
        confidence_score = 1.0
        
        if self._is_empty_value(pimly_value) or self._is_empty_value(krowne_value):
            has_partial_data = True
            confidence_score = 0.5
        else:
            # Both have values - compare them
            match_result = self._compare_values(pimly_value, krowne_value, field_type)
            is_match = match_result['is_match']
            is_mismatch = not match_result['is_match']
            confidence_score = match_result['confidence']
        
        return FieldComparison(
            field_name=field_name,
            display_name=display_name,
            category=category,
            pimly_value=pimly_value,
            krowne_value=krowne_value,
            is_match=is_match,
            is_mismatch=is_mismatch,
            has_partial_data=has_partial_data,
            field_type=field_type,
            confidence_score=confidence_score,
            notes=notes,
            description=f"Comparison of {display_name} between Pimly and Krowne data"
        )
    
    def _compare_features(self, pimly_mapping: Optional[ProductMapping],
                         krowne_mapping: Optional[ProductMapping]) -> Optional[FieldComparison]:
        """Compare product features"""
        pimly_features = pimly_mapping.features if pimly_mapping else []
        krowne_features = krowne_mapping.features if krowne_mapping else []
        
        if not pimly_features and not krowne_features:
            return None
        
        # Convert to sets for comparison
        pimly_set = set(f.lower().strip() for f in pimly_features)
        krowne_set = set(f.lower().strip() for f in krowne_features)
        
        # Calculate match percentage
        if pimly_set and krowne_set:
            intersection = pimly_set.intersection(krowne_set)
            union = pimly_set.union(krowne_set)
            match_percentage = len(intersection) / len(union) if union else 0
            is_match = match_percentage >= 0.8
        else:
            match_percentage = 0.5 if pimly_features or krowne_features else 1.0
            is_match = False
        
        return FieldComparison(
            field_name='features',
            display_name='Features',
            category='features',
            pimly_value=pimly_features,
            krowne_value=krowne_features,
            is_match=is_match,
            is_mismatch=not is_match and pimly_features and krowne_features,
            has_partial_data=bool(pimly_features) != bool(krowne_features),
            field_type='list',
            confidence_score=match_percentage,
            notes=f"Feature match: {match_percentage:.1%}"
        )
    
    def _compare_specifications(self, pimly_mapping: Optional[ProductMapping],
                              krowne_mapping: Optional[ProductMapping]) -> List[FieldComparison]:
        """Compare product specifications"""
        comparisons = []
        
        pimly_specs = pimly_mapping.specifications if pimly_mapping else {}
        krowne_specs = krowne_mapping.specifications if krowne_mapping else {}
        
        # Get all specification keys
        all_spec_keys = set(pimly_specs.keys()) | set(krowne_specs.keys())
        
        for spec_key in all_spec_keys:
            pimly_value = pimly_specs.get(spec_key)
            krowne_value = krowne_specs.get(spec_key)
            
            # Determine field type based on key and value
            field_type = self._infer_field_type(spec_key, pimly_value or krowne_value)
            
            display_name = spec_key.replace('_', ' ').title()
            
            comparison = self._compare_field(
                f"spec_{spec_key}",
                display_name,
                'specifications',
                pimly_value,
                krowne_value,
                field_type
            )
            
            if comparison:
                comparisons.append(comparison)
        
        return comparisons
    
    def _compare_certifications(self, pimly_mapping: Optional[ProductMapping],
                              krowne_mapping: Optional[ProductMapping]) -> List[FieldComparison]:
        """Compare product certifications"""
        comparisons = []
        
        pimly_certs = pimly_mapping.certifications if pimly_mapping else {}
        krowne_certs = krowne_mapping.certifications if krowne_mapping else {}
        
        # Get all certification keys
        all_cert_keys = set(pimly_certs.keys()) | set(krowne_certs.keys())
        
        for cert_key in all_cert_keys:
            pimly_value = pimly_certs.get(cert_key)
            krowne_value = krowne_certs.get(cert_key)
            
            display_name = f"{cert_key} Certification"
            
            comparison = self._compare_field(
                f"cert_{cert_key}",
                display_name,
                'certifications',
                pimly_value,
                krowne_value,
                'boolean'
            )
            
            if comparison:
                comparisons.append(comparison)
        
        return comparisons
    
    def _compare_images(self, pimly_mapping: Optional[ProductMapping],
                       krowne_mapping: Optional[ProductMapping]) -> Optional[FieldComparison]:
        """Compare product images"""
        pimly_images = pimly_mapping.images if pimly_mapping else []
        krowne_images = krowne_mapping.images if krowne_mapping else []
        
        if not pimly_images and not krowne_images:
            return None
        
        # Simple count comparison for now
        is_match = len(pimly_images) > 0 and len(krowne_images) > 0
        has_partial_data = bool(pimly_images) != bool(krowne_images)
        
        return FieldComparison(
            field_name='images',
            display_name='Product Images',
            category='media',
            pimly_value=pimly_images,
            krowne_value=krowne_images,
            is_match=is_match,
            is_mismatch=False,  # Images rarely "mismatch", they're just different
            has_partial_data=has_partial_data,
            field_type='list',
            confidence_score=0.8 if is_match else 0.5,
            notes=f"Pimly: {len(pimly_images)} images, Krowne: {len(krowne_images)} images"
        )
    
    def _compare_files(self, pimly_mapping: Optional[ProductMapping],
                      krowne_mapping: Optional[ProductMapping]) -> List[FieldComparison]:
        """Compare product files and downloads"""
        comparisons = []
        
        pimly_files = pimly_mapping.files if pimly_mapping else {}
        krowne_files = krowne_mapping.files if krowne_mapping else {}
        
        # Compare each file type
        file_types = set(pimly_files.keys()) | set(krowne_files.keys())
        
        for file_type in file_types:
            pimly_file_list = pimly_files.get(file_type, [])
            krowne_file_list = krowne_files.get(file_type, [])
            
            display_name = f"{file_type.replace('_', ' ').title()} Files"
            
            # Simple availability comparison
            has_pimly = len(pimly_file_list) > 0
            has_krowne = len(krowne_file_list) > 0
            
            comparison = FieldComparison(
                field_name=f"files_{file_type}",
                display_name=display_name,
                category='files',
                pimly_value=pimly_file_list,
                krowne_value=krowne_file_list,
                is_match=has_pimly and has_krowne,
                is_mismatch=False,
                has_partial_data=has_pimly != has_krowne,
                field_type='list',
                confidence_score=0.8 if has_pimly and has_krowne else 0.5,
                notes=f"Pimly: {len(pimly_file_list)} files, Krowne: {len(krowne_file_list)} files"
            )
            
            comparisons.append(comparison)
        
        return comparisons
    
    def _compare_related_items(self, pimly_mapping: Optional[ProductMapping],
                             krowne_mapping: Optional[ProductMapping]) -> List[FieldComparison]:
        """Compare related items and accessories"""
        comparisons = []
        
        pimly_related = pimly_mapping.related_items if pimly_mapping else {}
        krowne_related = krowne_mapping.related_items if krowne_mapping else {}
        
        # Compare each related item type
        related_types = set(pimly_related.keys()) | set(krowne_related.keys())
        
        for related_type in related_types:
            pimly_items = pimly_related.get(related_type, [])
            krowne_items = krowne_related.get(related_type, [])
            
            display_name = f"{related_type.replace('_', ' ').title()}"
            
            # Simple count comparison
            has_pimly = len(pimly_items) > 0
            has_krowne = len(krowne_items) > 0
            
            comparison = FieldComparison(
                field_name=f"related_{related_type}",
                display_name=display_name,
                category='related_items',
                pimly_value=pimly_items,
                krowne_value=krowne_items,
                is_match=has_pimly and has_krowne,
                is_mismatch=False,
                has_partial_data=has_pimly != has_krowne,
                field_type='list',
                confidence_score=0.7 if has_pimly and has_krowne else 0.5,
                notes=f"Pimly: {len(pimly_items)} items, Krowne: {len(krowne_items)} items"
            )
            
            comparisons.append(comparison)
        
        return comparisons
    
    def _compare_values(self, value1: Any, value2: Any, field_type: str) -> Dict[str, Any]:
        """Compare two values based on field type"""
        
        if field_type == 'price':
            return self._compare_prices(value1, value2)
        elif field_type == 'number':
            return self._compare_numbers(value1, value2)
        elif field_type == 'boolean':
            return self._compare_booleans(value1, value2)
        elif field_type == 'list':
            return self._compare_lists(value1, value2)
        else:  # text and others
            return self._compare_text(value1, value2)
    
    def _compare_prices(self, price1: Any, price2: Any) -> Dict[str, Any]:
        """Compare price values with tolerance"""
        try:
            # Normalize price values
            p1 = self._normalize_price(price1)
            p2 = self._normalize_price(price2)
            
            if p1 is None or p2 is None:
                return {'is_match': False, 'confidence': 0.5}
            
            # Allow small differences (e.g., $0.01)
            diff = abs(p1 - p2)
            tolerance = max(0.01, min(p1, p2) * 0.001)  # 0.1% tolerance or $0.01
            
            if diff <= tolerance:
                return {'is_match': True, 'confidence': 1.0}
            elif diff <= tolerance * 10:
                return {'is_match': False, 'confidence': 0.8}
            else:
                return {'is_match': False, 'confidence': 0.3}
                
        except Exception:
            return {'is_match': False, 'confidence': 0.1}
    
    def _compare_numbers(self, num1: Any, num2: Any) -> Dict[str, Any]:
        """Compare numeric values with tolerance"""
        try:
            n1 = float(str(num1).replace(',', ''))
            n2 = float(str(num2).replace(',', ''))
            
            # Allow 1% tolerance for measurements
            tolerance = max(abs(n1), abs(n2)) * 0.01
            diff = abs(n1 - n2)
            
            if diff <= tolerance:
                return {'is_match': True, 'confidence': 1.0}
            elif diff <= tolerance * 5:
                return {'is_match': False, 'confidence': 0.7}
            else:
                return {'is_match': False, 'confidence': 0.3}
                
        except Exception:
            return {'is_match': False, 'confidence': 0.1}
    
    def _compare_booleans(self, bool1: Any, bool2: Any) -> Dict[str, Any]:
        """Compare boolean values"""
        try:
            b1 = self._normalize_boolean(bool1)
            b2 = self._normalize_boolean(bool2)
            
            is_match = b1 == b2
            return {'is_match': is_match, 'confidence': 1.0 if is_match else 0.0}
            
        except Exception:
            return {'is_match': False, 'confidence': 0.1}
    
    def _compare_lists(self, list1: Any, list2: Any) -> Dict[str, Any]:
        """Compare list values"""
        try:
            l1 = list1 if isinstance(list1, list) else [list1] if list1 else []
            l2 = list2 if isinstance(list2, list) else [list2] if list2 else []
            
            # Normalize to lowercase for comparison
            set1 = set(str(item).lower().strip() for item in l1)
            set2 = set(str(item).lower().strip() for item in l2)
            
            if not set1 and not set2:
                return {'is_match': True, 'confidence': 1.0}
            
            intersection = set1.intersection(set2)
            union = set1.union(set2)
            
            if not union:
                return {'is_match': True, 'confidence': 1.0}
            
            similarity = len(intersection) / len(union)
            
            if similarity >= 0.9:
                return {'is_match': True, 'confidence': similarity}
            elif similarity >= 0.7:
                return {'is_match': False, 'confidence': similarity}
            else:
                return {'is_match': False, 'confidence': similarity * 0.5}
                
        except Exception:
            return {'is_match': False, 'confidence': 0.1}
    
    def _compare_text(self, text1: Any, text2: Any) -> Dict[str, Any]:
        """Compare text values with fuzzy matching"""
        try:
            t1 = str(text1).lower().strip() if text1 else ""
            t2 = str(text2).lower().strip() if text2 else ""
            
            if t1 == t2:
                return {'is_match': True, 'confidence': 1.0}
            
            # Simple fuzzy matching
            if t1 in t2 or t2 in t1:
                longer = max(len(t1), len(t2))
                shorter = min(len(t1), len(t2))
                confidence = shorter / longer if longer > 0 else 0
                return {'is_match': confidence > 0.8, 'confidence': confidence}
            
            # Character-level similarity
            common_chars = sum(1 for c in t1 if c in t2)
            total_chars = max(len(t1), len(t2))
            similarity = common_chars / total_chars if total_chars > 0 else 0
            
            return {'is_match': similarity > 0.9, 'confidence': similarity}
            
        except Exception:
            return {'is_match': False, 'confidence': 0.1}
    
    def _normalize_price(self, price: Any) -> Optional[float]:
        """Normalize price to float"""
        if price is None:
            return None
        
        try:
            if isinstance(price, (int, float)):
                return float(price)
            
            # Remove currency symbols and commas
            price_str = str(price).replace('$', '').replace(',', '').strip()
            return float(price_str) if price_str else None
        except Exception:
            return None
    
    def _normalize_boolean(self, value: Any) -> bool:
        """Normalize value to boolean"""
        if isinstance(value, bool):
            return value
        
        if isinstance(value, str):
            return value.lower() in ('true', '1', 'yes', 'y', 'on', 'enabled')
        
        return bool(value)
    
    def _is_empty_value(self, value: Any) -> bool:
        """Check if value is considered empty"""
        if value is None:
            return True
        
        if isinstance(value, str):
            return not value.strip()
        
        if isinstance(value, (list, dict)):
            return len(value) == 0
        
        return False
    
    def _infer_field_type(self, field_name: str, value: Any) -> str:
        """Infer field type from name and value"""
        field_lower = field_name.lower()
        
        # Price fields
        if 'price' in field_lower or 'cost' in field_lower:
            return 'price'
        
        # Number fields
        number_indicators = ['weight', 'height', 'width', 'length', 'diameter', 
                           'capacity', 'flow', 'btu', 'amps', 'voltage', 'hp']
        if any(indicator in field_lower for indicator in number_indicators):
            return 'number'
        
        # Boolean fields
        if isinstance(value, bool):
            return 'boolean'
        
        # List fields
        if isinstance(value, list):
            return 'list'
        
        # URL fields
        if isinstance(value, str) and value.startswith('http'):
            return 'url'
        
        return 'text'
    
    def _generate_summary(self, sku: str, field_comparisons: List[FieldComparison],
                         pimly_mapping: Optional[ProductMapping],
                         krowne_mapping: Optional[ProductMapping]) -> ComparisonSummary:
        """Generate comparison summary"""
        
        total_fields = len(field_comparisons)
        matches = sum(1 for fc in field_comparisons if fc.is_match)
        mismatches = sum(1 for fc in field_comparisons if fc.is_mismatch)
        partial_data = sum(1 for fc in field_comparisons if fc.has_partial_data)
        
        # Count Pimly-only and Krowne-only fields
        pimly_only = 0
        krowne_only = 0
        
        if pimly_mapping and pimly_mapping.pimly_only:
            pimly_only = len(pimly_mapping.pimly_only)
        
        # Calculate overall match percentage
        if total_fields > 0:
            overall_match = (matches + (partial_data * 0.5)) / total_fields
        else:
            overall_match = 0.0
        
        # Get categories that were compared
        categories = list(set(fc.category for fc in field_comparisons))
        
        return ComparisonSummary(
            sku=sku,
            total_fields_compared=total_fields,
            matches=matches,
            mismatches=mismatches,
            partial_data=partial_data,
            pimly_only_fields=pimly_only,
            krowne_only_fields=krowne_only,
            overall_match_percentage=overall_match,
            comparison_timestamp=datetime.utcnow().isoformat(),
            categories_compared=categories
        )
    
    def _determine_status(self, pimly_mapping: Optional[ProductMapping],
                         krowne_mapping: Optional[ProductMapping],
                         errors: List[str]) -> str:
        """Determine overall comparison status"""
        
        if errors:
            return 'error'
        
        if pimly_mapping and krowne_mapping:
            return 'complete'
        elif pimly_mapping and not krowne_mapping:
            return 'partial_pimly'
        elif not pimly_mapping and krowne_mapping:
            return 'partial_krowne'
        else:
            return 'no_data'
    
    def compare_batch(self, product_list: List[Dict[str, Any]]) -> List[ProductComparison]:
        """Compare multiple products in batch"""
        results = []
        
        for product_data in product_list:
            sku = product_data.get('sku')
            pimly_data = product_data.get('pimly_data')
            krowne_data = product_data.get('krowne_data')
            
            comparison = self.compare_products(
                pimly_data=pimly_data,
                krowne_data=krowne_data,
                sku=sku
            )
            results.append(comparison)
        
        return results
    
    def export_comparison(self, comparison: ProductComparison, format: str = 'dict') -> Any:
        """Export comparison in various formats"""
        if format == 'dict':
            return asdict(comparison)
        elif format == 'json':
            import json
            return json.dumps(asdict(comparison), indent=2, default=str)
        else:
            raise ValueError("format must be 'dict' or 'json'")
