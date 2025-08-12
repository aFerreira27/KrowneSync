// fieldMappings.js - Configuration file for aligning fields between Pimly and Krowne

export const FIELD_MAPPINGS = {
  // Specifications field mappings
  specifications: {
    // Basic Product Information
    "case_quantity": {
      pimly: ["Case_Quantity", "Case Quantity"],
      krowne: ["case_quantity", "caseQuantity", "case_qty"]
    },
    
    "flow_rate": {
      pimly: ["Flow_Rate_(GPM)", "Flow Rate (GPM)"],
      krowne: ["flow_rate", "flowRate", "gpm", "flow_rate_gpm"]
    },
    
    "finish": {
      pimly: ["Finish", "Front_Finish", "Top_Finish_Options"],
      krowne: ["finish", "surface_finish", "front_finish"]
    },
    
    "handle_type": {
      pimly: ["Handle_Type", "Handle Type"],
      krowne: ["handle_type", "handleType", "handles"]
    },
    
    "inlet": {
      pimly: ["Inlet"],
      krowne: ["inlet", "inlet_type"]
    },
    
    "mounting_style": {
      pimly: ["Mounting_Style", "Mounting Style"],
      krowne: ["mounting_style", "mountingStyle", "mount_style"]
    },
    
    "spout_style": {
      pimly: ["Spout_Style", "Spout Style"],
      krowne: ["spout_style", "spoutStyle"]
    },
    
    "spout_size": {
      pimly: ["Spout_Size_(in.)", "Spout Size (in.)"],
      krowne: ["spout_size", "spoutSize", "spout_size_in"]
    },
    
    "centers": {
      pimly: ["Centers"],
      krowne: ["centers", "center_count"]
    },
    
    "outlet": {
      pimly: ["Outlet", "Drain_Outlet"],
      krowne: ["outlet", "drain_outlet"]
    },
    
    "valves": {
      pimly: ["Valve_Type"],
      krowne: ["valves", "valve_type", "valve"]
    },
    
    // Dimensions
    "product_length": {
      pimly: ["Product_Length_(in.)", "Product Length (in.)"],
      krowne: ["product_length", "length", "length_in"]
    },
    
    "product_width": {
      pimly: ["Product_Width_(in.)", "Product Width (in.)"],
      krowne: ["product_width", "width", "width_in"]
    },
    
    "product_height": {
      pimly: ["Product_Height_(in.)", "Product Height (in.)"],
      krowne: ["product_height", "height", "height_in"]
    },
    
    "product_depth": {
      pimly: ["Product_Depth_(in.)", "Product Depth (in.)"],
      krowne: ["product_depth", "depth", "depth_in"]
    },
    
    "product_weight": {
      pimly: ["Product_Weight_(lbs.)", "Product Weight (lbs.)", "Product_Weight"],
      krowne: ["product_weight", "weight", "weight_lbs"]
    },
    
    "shipping_weight": {
      pimly: ["Shipping_Weight_(lbs.)", "Shipping Weight (lbs.)"],
      krowne: ["shipping_weight", "shippingWeight", "ship_weight"]
    },
    
    "case_weight": {
      pimly: ["Case_Weight_(lbs.)", "Case Weight (lbs.)"],
      krowne: ["case_weight", "caseWeight"]
    },
    
    // Capacity & Performance
    "ice_capacity": {
      pimly: ["Ice_Capacity_(lbs.)", "Ice Capacity (lbs.)"],
      krowne: ["ice_capacity", "iceCapacity"]
    },
    
    "gallon_capacity": {
      pimly: ["Gallon_Capacity", "Gallon Capacity"],
      krowne: ["gallon_capacity", "gallonCapacity", "capacity"]
    },
    
    "bottle_capacity": {
      pimly: ["Bottle_Capacity", "Bottle Capacity"],
      krowne: ["bottle_capacity", "bottleCapacity"]
    },
    
    "keg_capacity": {
      pimly: ["Keg_Capacity", "Keg Capacity"],
      krowne: ["keg_capacity", "kegCapacity"]
    },
    
    "mug_capacity": {
      pimly: ["Mug_Capacity", "Mug Capacity"],
      krowne: ["mug_capacity", "mugCapacity"]
    },
    
    "load_capacity": {
      pimly: ["Load_Capacity_(lbs._per_caster)", "Load Capacity"],
      krowne: ["load_capacity", "loadCapacity", "weight_capacity"]
    },
    
    // Technical Specifications
    "operating_range": {
      pimly: ["Operating_Range", "Operating Range"],
      krowne: ["operating_range", "operatingRange", "temp_range"]
    },
    
    "temperature_range": {
      pimly: ["Temperature_Range", "Temperature Range"],
      krowne: ["temperature_range", "temperatureRange", "temp_range"]
    },
    
    "voltage": {
      pimly: ["Voltage"],
      krowne: ["voltage", "volts"]
    },
    
    "phase": {
      pimly: ["Phase"],
      krowne: ["phase", "electrical_phase"]
    },
    
    "amps": {
      pimly: ["Amps"],
      krowne: ["amps", "amperage", "current"]
    },
    
    "hertz": {
      pimly: ["Hertz_(Hz.)", "Hertz"],
      krowne: ["hertz", "hz", "frequency"]
    },
    
    "hp": {
      pimly: ["HP"],
      krowne: ["hp", "horsepower", "motor_hp"]
    },
    
    "btu": {
      pimly: ["BTUhr_(K)", "BTU"],
      krowne: ["btu", "btu_hr", "btuh"]
    },
    
    "psi_range": {
      pimly: ["PSI_Range", "PSI Range"],
      krowne: ["psi_range", "psiRange", "pressure"]
    },
    
    // Materials & Construction
    "materials": {
      pimly: ["Materials"],
      krowne: ["materials", "material", "construction"]
    },
    
    "refrigerant": {
      pimly: ["Refrigerant"],
      krowne: ["refrigerant", "refrigerant_type"]
    },
    
    "compressor_size": {
      pimly: ["Compressor_Size_(in.)", "Compressor Size"],
      krowne: ["compressor_size", "compressorSize"]
    },
    
    "compressor_location": {
      pimly: ["Compressor_Location", "Compressor Location"],
      krowne: ["compressor_location", "compressorLocation"]
    },
    
    // Hardware & Accessories
    "caster_quantity": {
      pimly: ["Caster_Quantity", "Caster Quantity"],
      krowne: ["caster_quantity", "casterQuantity", "casters"]
    },
    
    "wheel_diameter": {
      pimly: ["Wheel_Diameter_(in.)", "Wheel Diameter"],
      krowne: ["wheel_diameter", "wheelDiameter"]
    },
    
    "brakes": {
      pimly: ["Brakes"],
      krowne: ["brakes", "brake_system"]
    },
    
    "doors": {
      pimly: ["Door", "Drawer_Style"],
      krowne: ["doors", "door_style", "door_type"]
    },
    
    "drain_size": {
      pimly: ["Drain_Size", "Drain Size"],
      krowne: ["drain_size", "drainSize"]
    },
    
    "drain_location": {
      pimly: ["Drain_Location", "Drain Location"],
      krowne: ["drain_location", "drainLocation"]
    }
  },
  
  // Certifications field mappings
  certifications: {
    "nsf": {
      pimly: ["NSF_Certification", "NSF Certification"],
      krowne: ["nsf", "nsf_certified", "nsf_certification", "nsf_q", "nsfq", "nsf-q"]
    },
    
    "ul": {
      pimly: ["UL_Certification", "UL Certification"],
      krowne: ["ul", "ul_listed", "ul_certification"]
    },
    
    "etl": {
      pimly: ["ETL_Certification", "ETL Certification"],
      krowne: ["etl", "etl_listed", "etl_certification"]
    },
    
    "csa": {
      pimly: ["CSA_Certification", "CSA Certification"],
      krowne: ["csa", "csa_certified", "csa_certification"]
    },
    
    "ada_compliance": {
      pimly: ["ADA_Compliance", "ADA Compliance"],
      krowne: ["ada", "ada_compliant", "ada_compliance"]
    },
    
    "asse": {
      pimly: ["ASSE_Certification", "ASSE Certification"],
      krowne: ["asse", "asse_certified"]
    },
    
    "iampo": {
      pimly: ["IAMPO_Certification", "IAMPO Certification"],
      krowne: ["iampo", "iampo_certified"]
    },
    
    "cec_listed": {
      pimly: ["CEC_Listed_Certification", "CEC Listed"],
      krowne: ["cec", "cec_listed", "california_energy"]
    },
    
    "massachusetts_listed": {
      pimly: ["Massachusetts_Listed_Certification", "Massachusetts Listed"],
      krowne: ["massachusetts", "mass_listed"]
    }
  },
  
  // Files & Links field mappings
  links: {
    "spec_sheet": {
      pimly: ["Spec_Sheet", "Spec Sheet"],
      krowne: ["spec_sheet", "specifications", "specs"]
    },
    
    "manual": {
      pimly: ["Manuals", "Manual"],
      krowne: ["manual", "user_manual", "instructions"]
    },
    
    "sell_sheet": {
      pimly: ["Sell_Sheet", "Sell Sheet"],
      krowne: ["sell_sheet", "sellSheet", "product_sheet"]
    },
    
    "brochure": {
      pimly: ["Brochure"],
      krowne: ["brochure", "product_brochure"]
    },
    
    "images": {
      pimly: ["Images", "Image"],
      krowne: ["images", "photos", "pictures"]
    },
    
    "videos": {
      pimly: ["Videos", "Video"],
      krowne: ["videos", "product_videos"]
    },
    
    "website_link": {
      pimly: ["Website_Link", "Website Link"],
      krowne: ["website", "product_url", "link"]
    }
  }
};

// Helper function to find the canonical field name based on actual field name
export const findCanonicalField = (fieldCategory, actualFieldName) => {
  if (!FIELD_MAPPINGS[fieldCategory]) return null;
  
  // Normalize the actual field name for comparison
  const normalizedActual = actualFieldName.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
  
  // Find exact matches first (prioritize longer, more specific matches)
  const exactMatches = [];
  
  for (const [canonicalName, mapping] of Object.entries(FIELD_MAPPINGS[fieldCategory])) {
    const allVariations = [...(mapping.pimly || []), ...(mapping.krowne || [])];
    
    for (const variation of allVariations) {
      const normalizedVariation = variation.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
      
      // Check for exact match
      if (normalizedVariation === normalizedActual) {
        exactMatches.push({
          canonicalName,
          variation,
          length: variation.length
        });
      }
    }
  }
  
  // If we have exact matches, return the one with the longest variation (most specific)
  if (exactMatches.length > 0) {
    exactMatches.sort((a, b) => b.length - a.length);
    return exactMatches[0].canonicalName;
  }
  
  // If no exact matches, try partial matching (but be more careful)
  for (const [canonicalName, mapping] of Object.entries(FIELD_MAPPINGS[fieldCategory])) {
    const allVariations = [...(mapping.pimly || []), ...(mapping.krowne || [])];
    
    for (const variation of allVariations) {
      const normalizedVariation = variation.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
      
      // Only do partial matching if the actual field contains the variation as a complete word
      // This prevents "nsf" from matching "nsf_q"
      if (normalizedActual.includes(normalizedVariation) && 
          (normalizedActual === normalizedVariation || 
           normalizedActual.startsWith(normalizedVariation + '_') ||
           normalizedActual.endsWith('_' + normalizedVariation))) {
        return canonicalName;
      }
    }
  }
  
  return null;
};

// Helper function to get all possible field names for a canonical field
export const getFieldVariations = (fieldCategory, canonicalName) => {
  if (!FIELD_MAPPINGS[fieldCategory] || !FIELD_MAPPINGS[fieldCategory][canonicalName]) {
    return [];
  }
  
  const mapping = FIELD_MAPPINGS[fieldCategory][canonicalName];
  return [...(mapping.pimly || []), ...(mapping.krowne || [])];
};

export default FIELD_MAPPINGS;