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

def initialize_sync_status_on_startup():
    """Initialize sync status system during app startup"""
    try:
        print("🔄 Initializing sync status system...")
        
        from app.services.sync_service import SyncService
        from app.models import SyncStatus
        
        # Check if we have any sync status records
        existing_count = SyncStatus.query.count()
        print(f"📊 Found {existing_count} existing sync status records")
        
        # If no records exist, try to initialize from CSV
        if existing_count == 0:
            csv_path = os.path.join("uploads", "Initial_Import.csv")
            
            if os.path.exists(csv_path):
                print(f"📄 Initializing sync status from {csv_path}")
                
                import csv
                initialized_count = 0
                
                try:
                    with open(csv_path, 'r', encoding='utf-8') as file:
                        reader = csv.reader(file)
                        
                        for row_num, row in enumerate(reader):
                            if row and row[0].strip():
                                sku = row[0].strip()
                                name = row[1].strip() if len(row) > 1 and row[1].strip() else None
                                category = row[2].strip() if len(row) > 2 and row[2].strip() else 'Unknown'
                                
                                # Create sync status record
                                sync_status = SyncStatus(
                                    sku=sku,
                                    name=name,
                                    category=category,
                                    sync_count=0,
                                    success_count=0,
                                    failed_count=0,
                                    status='never',
                                    sync_history=[]
                                )
                                
                                from app.models import db
                                db.session.add(sync_status)
                                initialized_count += 1
                                
                                # Commit in batches for better performance
                                if initialized_count % 100 == 0:
                                    db.session.commit()
                                    print(f"  📦 Initialized {initialized_count} SKUs...")
                    
                    # Final commit
                    db.session.commit()
                    print(f"✅ Successfully initialized {initialized_count} SKUs from CSV")
                    
                    # Show some statistics
                    stats = SyncService.get_sync_stats()
                    print(f"📈 Total sync status records: {stats.get('total_records', 0)}")
                    
                except Exception as e:
                    print(f"❌ Failed to initialize from CSV: {e}")
                    from app.models import db
                    db.session.rollback()
            else:
                print(f"⚠️ CSV file not found at {csv_path}")
                print("📝 Empty sync status system - SKUs will be added when first synced")
        else:
            print("✅ Sync status system already initialized")
            
            # Show statistics
            stats = SyncService.get_sync_stats()
            print(f"📈 Current stats: {stats}")
        
        print("🎉 Sync status setup completed successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Failed to setup sync status: {e}")
        import traceback
        traceback.print_exc()
        return False

def create_app():
    
    load_env_file()
    
    app = Flask(__name__)

    # Database configuration
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
            print("✅ Database initialized successfully")
        except Exception as e:
            app.logger.error(f"Database initialization failed: {e}")
            print(f"❌ Database initialization failed: {e}")

    # Flask configuration
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
    
    # Determine redirect URI based on environment
    backend_url = os.environ.get('BACKEND_URL', 'http://localhost:5000')
    app.config['SALESFORCE_REDIRECT_URI'] = os.environ.get(
        'SALESFORCE_REDIRECT_URI', 
        f'{backend_url}/api/auth/callback/salesforce'
    )
    app.config['SALESFORCE_SANDBOX'] = os.environ.get('SALESFORCE_SANDBOX', 'false').lower() == 'true'
    
    # Frontend URL for redirects
    app.config['FRONTEND_URL'] = os.environ.get('FRONTEND_URL', 'http://localhost:3000')

    # Ensure directories exist
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    os.makedirs(app.config['SESSION_FILE_DIR'], exist_ok=True)
    
    # Configure session cookies for cross-domain OAuth
    is_production = os.environ.get('FLASK_ENV', 'development') == 'production'
    
    app.config['SESSION_COOKIE_SECURE'] = is_production
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'None' if is_production else 'Lax'
    
    if is_production:
        app.config['SESSION_COOKIE_DOMAIN'] = None
    
    # Register blueprints
    from app.routes import main
    app.register_blueprint(main)

    # Configure CORS
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
    
    # Initialize session
    Session(app)
    
    # Check environment and initialize sync status on startup
    with app.app_context():
        check_environment_config()
        initialize_sync_status_on_startup()

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