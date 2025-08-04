#!/usr/bin/env python3
"""
Test script for Pimly integration via Salesforce
Run this script to test your Pimly endpoints
"""

import requests
import json
import sys

BASE_URL = "http://localhost:5000"

def test_endpoint(endpoint, method="GET", data=None, description=""):
    """Test a single endpoint"""
    print(f"\n{'='*60}")
    print(f"Testing: {description}")
    print(f"Endpoint: {method} {endpoint}")
    print(f"{'='*60}")
    
    try:
        if method == "GET":
            response = requests.get(f"{BASE_URL}{endpoint}")
        elif method == "POST":
            response = requests.post(f"{BASE_URL}{endpoint}", json=data)
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ SUCCESS")
            
            # Print key information based on endpoint
            if 'pimly/status' in endpoint:
                print(f"Connected: {result.get('connected', False)}")
                print(f"Objects found: {len(result.get('pimly_objects', []))}")
                for obj in result.get('pimly_objects', [])[:3]:  # Show first 3
                    print(f"  - {obj.get('name')} ({obj.get('label')})")
                    
            elif 'pimly/products' in endpoint:
                print(f"Products count: {result.get('count', 0)}")
                products = result.get('products', [])
                for product in products[:3]:  # Show first 3
                    print(f"  - {product.get('Name')} (SKU: {product.get('SKU')})")
                    
            elif 'pimly/categories' in endpoint:
                print(f"Categories count: {result.get('count', 0)}")
                categories = result.get('categories', [])
                for cat in categories[:3]:  # Show first 3
                    print(f"  - {cat.get('Name')}")
                    
            elif 'pimly/objects' in endpoint:
                print(f"Objects found: {result.get('count', 0)}")
                for obj in result.get('objects', [])[:5]:  # Show first 5
                    print(f"  - {obj.get('name')} ({obj.get('label')})")
                    
            elif 'pimly/search' in endpoint:
                print(f"Search results: {result.get('count', 0)}")
                print(f"Search term: {result.get('search_term')}")
                products = result.get('products', [])
                for product in products[:3]:  # Show first 3
                    print(f"  - {product.get('Name')} (SKU: {product.get('SKU')})")
                    
            elif 'describe' in endpoint:
                print(f"Object: {result.get('object_name')}")
                print(f"Label: {result.get('label')}")
                print(f"Total fields: {result.get('total_fields', 0)}")
                fields = result.get('fields', [])
                for field in fields[:5]:  # Show first 5 fields
                    print(f"  - {field.get('name')} ({field.get('type')})")
            
        else:
            print("❌ ERROR")
            try:
                error_data = response.json()
                print(f"Error: {error_data.get('error', 'Unknown error')}")
            except:
                print(f"Raw response: {response.text}")
                
    except requests.exceptions.ConnectionError:
        print("❌ CONNECTION ERROR")
        print("Make sure your Flask app is running on http://localhost:5000")
    except Exception as e:
        print(f"❌ EXCEPTION: {str(e)}")

def main():
    print("🔧 Pimly Integration Test Suite")
    print("Make sure you're authenticated with Salesforce first!")
    
    # Test 1: Check Pimly status and discover objects
    test_endpoint(
        "/api/pimly/status",
        description="Check Pimly connection status"
    )
    
    # Test 2: Discover Pimly objects
    test_endpoint(
        "/api/pimly/objects",
        description="Discover Pimly objects in Salesforce"
    )
    
    # Test 3: Get Pimly products
    test_endpoint(
        "/api/pimly/products?limit=10",
        description="Get Pimly products (limited to 10)"
    )
    
    # Test 4: Get Pimly categories
    test_endpoint(
        "/api/pimly/categories",
        description="Get Pimly categories/families"
    )
    
    # Test 5: Describe Pimly Product object
    test_endpoint(
        "/api/pimly/describe/Pimly__Product__c",
        description="Describe Pimly Product object"
    )
    
    # Test 6: Search Pimly products
    test_endpoint(
        "/api/pimly/search",
        method="POST",
        data={"search": "pump", "limit": 5},
        description="Search Pimly products for 'pump'"
    )
    
    # Test 7: Test comparison with Pimly
    test_endpoint(
        "/api/compare",
        method="POST",
        data={"source_type": "pimly", "limit": 50},
        description="Compare Pimly products with Krowne.com"
    )
    
    print(f"\n{'='*60}")
    print("🎯 Test Suite Complete!")
    print("If all tests passed, your Pimly integration is working correctly.")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()