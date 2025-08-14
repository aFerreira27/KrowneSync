from flask import Flask
from flask_cors import CORS
from flask_session import Session

import os
# Create logs directory
os.makedirs('logs', exist_ok=True)

def load_env_file():
    """Load environment variables from .env file manually (fallback if dotenv not available)"""
    env_file = '.env'
    if os.path.exists(env_file):
        print("📄 Loading environment variables from .env file")
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")  # Remove quotes
                    os.environ[key] = value
    else:
        print("ℹ️  No .env file found, using system environment variables")

def initialize_sync_history_on_startup():
    """Initialize sync history system during app startup"""
    try:
        print("🔄 Initializing sync history system...")
        
        from app.services.sync_history import SyncHistoryService
        
        # Initialize the sync history service
        sync_service = SyncHistoryService()
        print("✅ Sync history service initialized")
        
        # Try to load known products from CSV
        csv_path = os.path.join("uploads", "Initial_Import.csv")
        
        if os.path.exists(csv_path):
            print(f"📄 Loading known products from {csv_path}")
            products_data = sync_service.load_products_from_csv(csv_path)
            
            if products_data:
                print(f"📊 Found {len(products_data)} products with categories")
                
                # Show some examples
                for i, product in enumerate(products_data[:3]):
                    print(f"  📦 Example {i+1}: SKU={product['sku']}, Name={product.get('name', 'N/A')}, Category={product.get('category', 'Unsorted')}")
                
                # Initialize sync records for all known products
                success = sync_service.bulk_init_skus(products_data)
                
                if success:
                    print("✅ Successfully initialized sync records for all known products")
                    
                    # Get and display statistics
                    stats = sync_service.get_sync_stats()
                    print(f"📈 Sync history stats: Total SKUs: {stats.get('total_skus', 0)}")
                    
                    # Show category breakdown
                    categories = {}
                    for product in products_data:
                        cat = product.get('category', 'Unsorted')
                        categories[cat] = categories.get(cat, 0) + 1
                    
                    print("📂 Category breakdown:")
                    for category, count in sorted(categories.items())[:5]:  # Show top 5
                        print(f"   {category}: {count} products")
                    
                    if len(categories) > 5:
                        print(f"   ... and {len(categories) - 5} more categories")
                    
                else:
                    print("❌ Failed to initialize sync records")
                    return False
            else:
                print("⚠️ No products found in CSV file")
        else:
            print(f"⚠️ CSV file not found at {csv_path}")
            print("📝 Creating empty sync history system - products will be added as they are encountered")
        
        print("🎉 Sync history setup completed successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Failed to setup sync history: {e}")
        import traceback
        traceback.print_exc()
        return False

def create_app():
    
    load_env_file()
    
    app = Flask(__name__)

    database_url = os.environ.get('DATABASE_URL')
    if database_url:
        # Railway provides DATABASE_URL
        if database_url.startswith('postgres://'):
            database_url = database_url.replace('postgres://', 'postgresql://')
        app.config['SQLALCHEMY_DATABASE_URI'] = database_url
    else:
        # Fallback for local development
        app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get(
            'SQLALCHEMY_DATABASE_URI',
            'postgresql://localhost/krownesync_dev'
        )
    
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
        'pool_pre_ping': True,
        'pool_recycle': 300,
    }
    
    # Initialize database
    from app.models import db
    db.init_app(app)
    
    # Create tables on first run
    with app.app_context():
        try:
            from app.services.database_service import DatabaseService
            DatabaseService.init_database()
        except Exception as e:
            app.logger.error(f"Database initialization failed: {e}")

    # 🔧 FIXED: Configure Flask with proper session security for cross-domain
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-key-change-in-production')
    app.config['SESSION_TYPE'] = 'filesystem'
    app.config['SESSION_FILE_DIR'] = os.path.join(os.getcwd(), 'flask_session')
    app.config['SESSION_PERMANENT'] = False
    app.config['SESSION_USE_SIGNER'] = True

    app.config['UPLOAD_FOLDER'] = os.environ.get('UPLOAD_FOLDER', 'uploads')
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
    
    # Salesforce OAuth configuration
    app.config['SALESFORCE_CLIENT_ID'] = os.environ.get('SALESFORCE_CLIENT_ID')
    app.config['SALESFORCE_CLIENT_SECRET'] = os.environ.get('SALESFORCE_CLIENT_SECRET')
    
    # 🔧 FIXED: Determine redirect URI based on environment
    backend_url = os.environ.get('BACKEND_URL', 'http://localhost:5000')
    app.config['SALESFORCE_REDIRECT_URI'] = os.environ.get(
        'SALESFORCE_REDIRECT_URI', 
        f'{backend_url}/api/auth/callback/salesforce'
    )
    app.config['SALESFORCE_SANDBOX'] = os.environ.get('SALESFORCE_SANDBOX', 'false').lower() == 'true'
    
    # Frontend URL for redirects
    app.config['FRONTEND_URL'] = os.environ.get('FRONTEND_URL', 'http://localhost:3000')

    # Ensure upload directory exists
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    
    # Ensure session directory exists
    os.makedirs(app.config['SESSION_FILE_DIR'], exist_ok=True)
    
    # 🔧 FIXED: Configure session cookies for cross-domain OAuth
    is_production = os.environ.get('FLASK_ENV', 'development') == 'production'
    
    app.config['SESSION_COOKIE_SECURE'] = is_production  # True in production with HTTPS
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'None' if is_production else 'Lax'  # None for cross-domain HTTPS
    
    # If using cross-domain in production, we need to set domain explicitly
    if is_production:
        # Extract domain from backend URL for session cookies
        from urllib.parse import urlparse
        backend_domain = urlparse(backend_url).netloc
        # Set to None to allow cross-domain cookies, or set specific domain
        app.config['SESSION_COOKIE_DOMAIN'] = None
    
    # Register blueprints
    from app.routes import main
    app.register_blueprint(main)

    # 🔧 FIXED: Enable CORS with proper credentials and origins
    frontend_origins = [
        "http://localhost:3000",  # Local development
        "https://krownebase.art",  # Your custom domain
        "https://www.krownebase.art",  # WWW subdomain
        os.environ.get('FRONTEND_URL', 'https://krownebase.art'),  # Dynamic frontend URL
    ]
    
    # Add Railway frontend URL if exists
    railway_frontend = os.environ.get('RAILWAY_FRONTEND_URL')
    if railway_frontend:
        frontend_origins.append(railway_frontend)
    
    CORS(app,
         resources={r"/api/*": {"origins": frontend_origins}},
         supports_credentials=True,
         allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
         methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
    
    # Check environment configuration on startup
    with app.app_context():
        check_environment_config()
        initialize_sync_history_on_startup()
    
    Session(app)

    return app

def check_environment_config():
    """Check if required environment variables are set"""
    required_vars = {
        'SALESFORCE_CLIENT_ID': 'Salesforce Consumer Key',
        'SALESFORCE_CLIENT_SECRET': 'Salesforce Consumer Secret'
    }
    
    missing_vars = []
    configured_vars = []
    
    for var, description in required_vars.items():
        value = os.environ.get(var)
        if not value:
            missing_vars.append(f"   - {var} ({description})")
        else:
            # Show first/last few characters for confirmation
            masked_value = f"{value[:8]}...{value[-4:]}" if len(value) > 12 else f"{value[:4]}..."
            configured_vars.append(f"   ✅ {var}: {masked_value}")
    
    print("\n" + "="*50)
    print("🔧 SALESFORCE OAUTH CONFIGURATION")
    print("="*50)
    
    if configured_vars:
        print("Configured variables:")
        for var in configured_vars:
            print(var)
    
    if missing_vars:
        print("\n⚠️  MISSING REQUIRED VARIABLES:")
        for var in missing_vars:
            print(var)
        print("\n📝 TO FIX:")
        print("   1. Create a .env file in the backend directory")
        print("   2. Add the missing variables:")
        print("      SALESFORCE_CLIENT_ID=your_consumer_key_here")
        print("      SALESFORCE_CLIENT_SECRET=your_consumer_secret_here")
        print("   3. Get these values from Angelo or your Salesforce External Client App")
        print("   4. Restart the Flask application")
    else:
        print("✅ All required Salesforce OAuth variables are configured!")
    
    # Show additional config
    backend_url = os.environ.get('BACKEND_URL', 'http://localhost:5000')
    redirect_uri = os.environ.get('SALESFORCE_REDIRECT_URI', f'{backend_url}/api/auth/callback/salesforce')
    frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
    sandbox = os.environ.get('SALESFORCE_SANDBOX', 'false').lower() == 'true'
    
    print(f"\n📍 Backend URL: {backend_url}")
    print(f"📍 Redirect URI: {redirect_uri}")
    print(f"📍 Frontend URL: {frontend_url}")
    print(f"🌍 Environment: {'Sandbox' if sandbox else 'Production'}")
    print("="*50 + "\n")

if __name__ == '__main__':
    app = create_app()
    
    # Get Flask configuration from environment
    host = os.environ.get('FLASK_HOST', '127.0.0.1')
    port = int(os.environ.get('FLASK_PORT', 5000))
    debug = os.environ.get('FLASK_ENV', 'development') == 'development'
    
    print(f"🚀 Starting KrowneSync backend on {host}:{port}")
    if debug:
        print("🐛 Debug mode enabled")
    
    app.run(host=host, port=port, debug=debug)