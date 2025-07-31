from flask import Flask
from flask_cors import CORS
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

def create_app():
    
    load_env_file()
    
    app = Flask(__name__)
    
    # Configure Flask with environment variables
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-key-change-in-production')
    app.config['UPLOAD_FOLDER'] = os.environ.get('UPLOAD_FOLDER', 'uploads')
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
    
    # Salesforce OAuth configuration
    app.config['SALESFORCE_CLIENT_ID'] = os.environ.get('SALESFORCE_CLIENT_ID')
    app.config['SALESFORCE_CLIENT_SECRET'] = os.environ.get('SALESFORCE_CLIENT_SECRET')
    app.config['SALESFORCE_REDIRECT_URI'] = os.environ.get('SALESFORCE_REDIRECT_URI', 'http://localhost:3000/api/auth/callback/salesforce')
    app.config['SALESFORCE_SANDBOX'] = os.environ.get('SALESFORCE_SANDBOX', 'false').lower() == 'true'
    
    # Enable CORS for React frontend
    CORS(app, origins=["http://localhost:3000", "http://frontend:3000"])
    
    # Ensure upload directory exists
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    
    # Configure session for OAuth state management
    app.config['SESSION_COOKIE_SECURE'] = False  # Set to True in production with HTTPS
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    
    # Register blueprints
    from app.routes import main
    app.register_blueprint(main)
    
    # Check environment configuration on startup
    with app.app_context():
        check_environment_config()
    
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
    redirect_uri = os.environ.get('SALESFORCE_REDIRECT_URI', 'http://localhost:3000/api/auth/callback/salesforce')
    sandbox = os.environ.get('SALESFORCE_SANDBOX', 'false').lower() == 'true'
    
    print(f"\n📍 Redirect URI: {redirect_uri}")
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