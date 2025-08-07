# backend/app/services/krowne_property_extractor.py

import re
from typing import Dict, List, Any, Optional
import logging

logger = logging.getLogger(__name__)

class KrownePropertyExtractor:
    """
    Extracts and disperses properties from Krowne's consolidated properties list
    into individual, properly mapped fields based on actual Krowne website and Pimly fields
    """
    
    def __init__(self):
        # Property name mapping patterns based on your actual field data
        # Maps Krowne website property names to Pimly field names
        self.property_mappings = {
            # Core Product Information
            'series': [
                'Series', 'series_value', 'Series (Detail)', 'series_detail_value'
            ],
            'features': [
                'Features', 'features_value'
            ],
            'finish': [
                'Finish', 'finish_value', 'External Finish', 'Interior Finish', 
                'interior_finish_value', 'Door Finish', 'door_finish'
            ],
            
            # Mounting and Installation
            'mounting_style': [
                'Mounting Style', 'mounting_style_value'
            ],
            'centers': [
                'Centers', 'centers_value'
            ],
            'mounting_kit': [
                'Mounting Kit', 'mounting_kit_value'
            ],
            'wall_bracket': [
                'Wall Bracket', 'wall_bracket_value'
            ],
            
            # Spout and Flow Characteristics
            'spout_style': [
                'Spout Style', 'spout_style_value'
            ],
            'spout_size': [
                'Spout Size', 'spout_size_value'
            ],
            'flow_rate': [
                'Flow Rate', 'flow_rate_value'
            ],
            'outlet_type': [
                'Outlet Type', 'outlet_type_value', 'Overflow Outlet', 'overflow_outlet_value'
            ],
            
            # Connections and Plumbing
            'inlet': [
                'Inlet', 'inlet_value'
            ],
            'valves': [
                'Valves', 'valves_value'
            ],
            'thread': [
                'Thread', 'thread_value'
            ],
            'drain_size': [
                'Drain Size', 'drain_size_value'
            ],
            'supply_connection': [
                'Supply Connection'
            ],
            
            # Physical Dimensions
            'bowl_size': [
                'Bowl Size', 'bowl_size_value'
            ],
            'overall_height': [
                'Height', 'overall_height_value'
            ],
            'length_inches': [
                'Length', 'length_inches_value', 'Length (Detail)', 'length_inches_detail_value'
            ],
            'depth_front_to_back': [
                'Depth', 'depth_front_to_back_value'
            ],
            'top_diameter': [
                'Top Diameter', 'top_diameter_value'
            ],
            'flange_diameter': [
                'Flange Side', 'flange_diameter_value'
            ],
            'interior_size': [
                'Interior Size', 'interior_size_value'
            ],
            'overall_diameter': [
                'Overall Diameter'
            ],
            'plate_size': [
                'Plate Size', 'plate_size_value'
            ],
            'wheel_diameter': [
                'Wheels', 'wheel_diameter_value'
            ],
            
            # Handles and Controls
            'handles': [
                'Handles', 'handles_value'
            ],
            'settings': [
                'Settings', 'settings_value'
            ],
            'brakes': [
                'Brakes', 'brakes_value'
            ],
            
            # Electrical and Power
            'power_source': [
                'Power Source', 'power_source_value'
            ],
            'batteries': [
                'Batteries', 'batteries_value'
            ],
            'amps': [
                'Amps', 'amps_value'
            ],
            'electrical': [
                'Electrical', 'electrical_value'
            ],
            
            # Sensors and Technology
            'sensor': [
                'Sensor', 'sensor_value'
            ],
            'quick_ship': [
                'Quick Ship'
            ],
            
            # Spray and Hose Features
            'spray_head': [
                'Spray Head', 'spray_head_value'
            ],
            'hose_length': [
                'Hose Length', 'hose_length_value'
            ],
            
            # Faucet Features
            'faucet': [
                'Faucet', 'faucet_value'
            ],
            
            # Size and Capacity Features
            'hole_size': [
                'Hole Size', 'hole_size_value'
            ],
            'hole_patterns': [
                'Hole Patterns', 'hole_patterns_value'
            ],
            'weight': [
                'Weight', 'weight_value'
            ],
            'weight_capacity': [
                'Load Capacity', 'weight_capacity_value'
            ],
            'size': [
                'Size'
            ],
            
            # Construction Features
            'open_enclosed': [
                'Open Or Enclosed', 'open_enclosed_value'
            ],
            'rotational_ends': [
                'Rotational Ends', 'rotational_ends_value'
            ],
            'welded_construction': [
                'Welded Construction', 'welded_construction_value'
            ],
            'corrugated_tubing': [
                'Corrugated Tubing', 'corrugated_tubing_value'
            ],
            'radial_wrap': [
                'Radial Wrap', 'radial_wrap_value'
            ],
            'pvc_protective_coating': [
                'PVC Protective Coating', 'pvc_protective_coating_value'
            ],
            
            # HVAC and Cooling
            'btu': [
                'BTU/Hr', 'btu_value'
            ],
            'operating_range': [
                'Operating Range', 'operating_range_value'
            ],
            'temperature_range': [
                'Temp Range'
            ],
            'compressor_location': [
                'Compressor', 'compressor_location_value'
            ],
            'compressor_hp': [
                'Compressor (HP)'
            ],
            'refrigerant': [
                'Refrigerant'
            ],
            'pumps': [
                'Pumps'
            ],
            
            # Bar and Restaurant Equipment
            'chase': [
                'Chase', 'chase_value'
            ],
            'top_surface': [
                'Top Surface', 'top_surface_value'
            ],
            'bowl_location': [
                'Bowl Location', 'bowl_location_value'
            ],
            'includes': [
                'Includes', 'includes_value'
            ],
            'dipperwell': [
                'Dipperwell', 'dipperwell_value'
            ],
            'speed_rinser': [
                'Speed Rinser', 'speed_rinser_value'
            ],
            'ice_bin_dividers': [
                'Ice Bin Dividers', 'ice_bin_dividers_value'
            ],
            'case_capacity': [
                'Case Capacity', 'case_capacity_value'
            ],
            'liquor_bottles': [
                'Liquor Bottles', 'liquor_bottles_value'
            ],
            'elixir_bottles': [
                'Elixir Bottles', 'elixir_bottles_value'
            ],
            'garnish_cups': [
                'Garnish Cups', 'garnish_cups_value'
            ],
            'insulated_bin': [
                'Insulated Bin', 'insulated_bin_value'
            ],
            'liquor_display': [
                'Liquor Display', 'liquor_display_value'
            ],
            'blender_dump_sink': [
                'Blender Dump Sink', 'blender_dump_sink_value'
            ],
            'drainboard': [
                'Drainboard', 'drainboard_value'
            ],
            'ice_capacity': [
                'Ice Capacity', 'ice_capacity_value'
            ],
            'ice_bin_location': [
                'Ice Bin Location', 'ice_bin_location_value'
            ],
            'ice_bin_size': [
                'Ice Bin Size', 'ice_bin_size_value'
            ],
            'cold_plate': [
                'Cold Plate', 'cold_plate_value'
            ],
            
            # Beverage System Features
            'number_of_taps': [
                '# of Taps'
            ],
            'beer_lines': [
                'Beer Lines'
            ],
            'glycol_lines': [
                'Glycol Lines'
            ],
            'sliding_drawers': [
                'Sliding Drawers'
            ]
        }
        
        # Map Krowne properties to Pimly field names
        self.krowne_to_pimly_mapping = {
            'series': 'Series',
            'features': 'Features',
            'finish': 'Finish',
            'mounting_style': 'Mounting_Style',
            'centers': 'Centers',
            'spout_style': 'Spout_Style',
            'spout_size': 'Spout_Size_(in.)',
            'flow_rate': 'Flow_Rate_(GPM)',
            'inlet': 'Inlet',
            'valves': 'Valve_Type',
            'handles': 'Handle_Type',
            'overall_height': 'Product_Height_(in.)',
            'length_inches': 'Product_Length_(in.)',
            'depth_front_to_back': 'Product_Depth_(in.)',
            'weight': 'Product_Weight_(lbs.)',
            'power_source': 'Power_Source',
            'amps': 'Amps',
            'operating_range': 'Operating_Range',
            'temperature_range': 'Temperature_Range',
            'drain_size': 'Drain_Size',
            'outlet_type': 'Outlet',
            'ice_capacity': 'Ice_Capacity_(lbs.)',
            'btu': 'BTUhr_(K)',
            'number_of_taps': 'Number_of_Taps',
            'glycol_lines': 'Glycol_Lines',
            'beer_lines': 'Beverage_Lines',
            'compressor_hp': 'HP',
            'refrigerant': 'Refrigerant',
            'brakes': 'Brakes',
            'wheel_diameter': 'Wheel_Diameter_(in.)',
            'plate_size': 'Plate_Size_(in.)',
            'weight_capacity': 'Load_Capacity_(lbs._per_caster)',
            'hose_length': 'Hose_Length_(ft.)',
            'spray_head': 'Spray_Head_Pattern'
        }
    
    def extract_and_disperse_properties(self, krowne_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Main method to extract properties from the properties array and disperse them
        into individual fields while maintaining the properties array for remaining items
        """
        if not krowne_data or not isinstance(krowne_data, dict):
            return krowne_data
        
        # Get the properties array
        properties = krowne_data.get('properties', [])
        if not isinstance(properties, list):
            logger.warning("Properties field is not a list, skipping dispersal")
            return krowne_data
        
        # Create a copy to work with
        enhanced_data = krowne_data.copy()
        remaining_properties = []
        dispersed_fields = {}
        
        logger.info(f"Starting property dispersal for {len(properties)} properties")
        
        # Process each property in the array
        for prop in properties:
            if not isinstance(prop, dict):
                remaining_properties.append(prop)
                continue
                
            prop_name = prop.get('propertyName', '')
            prop_admin_name = prop.get('propertyAdminName', '')
            prop_value = prop.get('value', '')
            
            # Skip empty properties
            if not prop_value or prop_value in ['N/A', 'None', '', 'null']:
                continue
            
            # Try to find a matching canonical field
            canonical_field = self._find_canonical_field(prop_name, prop_admin_name)
            
            if canonical_field:
                # Process the value based on field type
                processed_value = self._process_property_value(canonical_field, prop_value)
                
                # Store in dispersed fields using both canonical name and Pimly field name
                dispersed_fields[canonical_field] = processed_value
                
                # Also map to Pimly field name if available
                pimly_field_name = self.krowne_to_pimly_mapping.get(canonical_field)
                if pimly_field_name:
                    dispersed_fields[pimly_field_name] = processed_value
                
                logger.debug(f"Dispersed property: {prop_name} -> {canonical_field} = {processed_value}")
            else:
                # Keep unrecognized properties in the array
                remaining_properties.append(prop)
                logger.debug(f"Keeping unrecognized property: {prop_name}")
        
        # Update the enhanced data
        enhanced_data.update(dispersed_fields)
        enhanced_data['properties'] = remaining_properties
        
        # Log results
        logger.info(f"Property dispersal complete: {len(dispersed_fields)} fields dispersed, "
                   f"{len(remaining_properties)} properties remaining")
        
        return enhanced_data
    
    def _find_canonical_field(self, prop_name: str, prop_admin_name: str) -> Optional[str]:
        """
        Find the canonical field name for a given property name or admin name
        """
        # Normalize the input names
        names_to_check = [prop_name, prop_admin_name]
        
        for canonical_field, patterns in self.property_mappings.items():
            for pattern in patterns:
                for name in names_to_check:
                    if self._property_matches(name, pattern):
                        return canonical_field
        
        return None
    
    def _property_matches(self, prop_name: str, pattern: str) -> bool:
        """
        Check if a property name matches a pattern with various normalization techniques
        """
        if not prop_name or not pattern:
            return False
        
        # Exact match
        if prop_name == pattern:
            return True
        
        # Case insensitive match
        if prop_name.lower() == pattern.lower():
            return True
        
        # Normalize both names
        normalized_prop = self._normalize_property_name(prop_name)
        normalized_pattern = self._normalize_property_name(pattern)
        
        return normalized_prop == normalized_pattern
    
    def _normalize_property_name(self, name: str) -> str:
        """
        Normalize property names for better matching
        """
        if not name:
            return ""
        
        # Convert to lowercase
        normalized = name.lower()
        
        # Remove common punctuation and spacing
        normalized = re.sub(r'[_\-\s]+', ' ', normalized)
        normalized = re.sub(r'[^\w\s]', '', normalized)
        normalized = normalized.strip()
        
        # Remove common suffixes that don't affect meaning
        normalized = re.sub(r'\s+(in|inches|ft|feet|lbs|pounds|gpm|hp|value)$', '', normalized)
        
        return normalized
    
    def _process_property_value(self, canonical_field: str, raw_value: str) -> Any:
        """
        Process property values based on their expected types
        """
        if not raw_value:
            return raw_value
        
        # Handle boolean fields
        boolean_fields = ['quick_ship', 'welded_construction', 'corrugated_tubing', 
                         'radial_wrap', 'pvc_protective_coating', 'brakes']
        if canonical_field in boolean_fields:
            return self._parse_boolean(raw_value)
        
        # Handle numeric fields
        numeric_fields = ['flow_rate', 'spout_size', 'centers', 'overall_height', 
                         'length_inches', 'depth_front_to_back', 'weight', 'weight_capacity',
                         'btu', 'amps', 'ice_capacity', 'number_of_taps', 'compressor_hp',
                         'wheel_diameter', 'plate_size', 'hose_length', 'top_diameter',
                         'flange_diameter']
        if canonical_field in numeric_fields:
            return self._parse_numeric(raw_value)
        
        # Handle list fields (comma or semicolon separated)
        list_fields = ['features', 'includes']
        if canonical_field in list_fields:
            return self._parse_list(raw_value)
        
        # Default: return cleaned string
        return str(raw_value).strip()
    
    def _parse_boolean(self, value: str) -> bool:
        """Parse boolean values from various string formats"""
        if isinstance(value, bool):
            return value
        
        value_lower = str(value).lower().strip()
        return value_lower in ['true', 'yes', '1', 'on', 'enabled', 'included']
    
    def _parse_numeric(self, value: str) -> Optional[float]:
        """Parse numeric values, extracting numbers from strings"""
        if isinstance(value, (int, float)):
            return float(value)
        
        # Extract number from string (e.g., "6"" -> 6.0, "1.8 GPM" -> 1.8)
        numeric_match = re.search(r'[\d,]*\.?\d+', str(value).replace(',', ''))
        if numeric_match:
            try:
                return float(numeric_match.group())
            except ValueError:
                pass
        
        return None
    
    def _parse_list(self, value: str) -> List[str]:
        """Parse list values from comma or semicolon separated strings"""
        if isinstance(value, list):
            return value
        
        # Split on common separators and clean up
        items = re.split(r'[,;•]', str(value))
        cleaned_items = []
        for item in items:
            cleaned_item = item.strip()
            if cleaned_item and cleaned_item not in ['', 'N/A', 'None']:
                # Remove bullet point indicators
                cleaned_item = re.sub(r'^[*\-•]\s*', '', cleaned_item)
                cleaned_items.append(cleaned_item)
        return cleaned_items

    def get_dispersal_report(self, original_data: Dict[str, Any], enhanced_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate a detailed report of what was dispersed
        """
        original_props = original_data.get('properties', [])
        remaining_props = enhanced_data.get('properties', [])
        
        dispersed_fields = []
        for key, value in enhanced_data.items():
            if key not in original_data or enhanced_data[key] != original_data.get(key):
                if key != 'properties':  # Don't include the properties array itself
                    pimly_field = self.krowne_to_pimly_mapping.get(key, key)
                    dispersed_fields.append({
                        'canonical_field': key,
                        'pimly_field': pimly_field,
                        'value': value,
                        'value_type': type(value).__name__
                    })
        
        return {
            'original_properties_count': len(original_props),
            'remaining_properties_count': len(remaining_props),
            'dispersed_fields_count': len(dispersed_fields),
            'dispersed_fields': dispersed_fields,
            'properties_dispersed': len(original_props) - len(remaining_props)
        }