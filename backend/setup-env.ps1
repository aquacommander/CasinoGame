# PowerShell script to create .env file for backend

$envContent = @"
# Server Configuration
PORT=3001
NODE_ENV=development

# SQLite Database Configuration
DB_PATH=data/casino.db

# Qubic Blockchain Configuration
CASINO_ADDRESS=MPCAGMRSEMPCARPOPOMBEGSNBJZ9ZYPJMBVJQBFYGSCL9VTARUOOYHO
QUBIC_NODE_URL=https://qubic.li/node

# CORS Configuration
FRONTEND_URL=http://localhost:3000

# JWT Secret (if using JWT auth)
JWT_SECRET=your_jwt_secret_key_here_change_this_in_production

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
"@

$envContent | Out-File -FilePath ".env" -Encoding utf8
Write-Host "✅ .env file created successfully!" -ForegroundColor Green

