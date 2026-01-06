# Casino Backend API

Backend API server for the Web3 Casino Game built with Node.js and Express.

## Features

- RESTful API endpoints for balance, games, transactions, and payments
- Socket.IO support for real-time games (Crash, Slide)
- PostgreSQL database for data persistence
- Transaction verification (ready for Qubic blockchain integration)
- Rate limiting and security middleware
- Comprehensive error handling and logging

## Prerequisites

- Node.js 18+ 
- npm or yarn

**Note:** SQLite is used as the database - no separate database server installation needed!

## Installation

1. **Install dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and configure:
   - Database connection details
   - Casino address
   - Frontend URL
   - Other settings

3. **Start the server:**
   ```bash
   # Development mode (with auto-reload)
   npm run dev
   
   # Production mode
   npm start
   ```

The server will start on `http://localhost:3001` (or the port specified in `.env`).

## API Endpoints

### Balance
- `GET /api/balance?publicKey=...` - Get user balance

### Games
- `POST /api/games/place-bet` - Place a bet
- `POST /api/games/cashout` - Cash out from a game

### Transactions
- `GET /api/transactions/history?publicKey=...` - Get transaction history
- `GET /api/transactions/statistics?publicKey=...` - Get statistics

### Payments
- `GET /api/payment/deposit-address` - Get deposit address
- `POST /api/payment/deposit` - Process deposit
- `POST /api/payment/withdraw` - Process withdrawal

### Socket.IO
- `/crashx` - Crash game namespace
- `/slide` - Slide game namespace

## Database

SQLite is used as the database. The database file is automatically created at `backend/data/casino.db` on first run. The schema is automatically created - no manual setup needed!

The database file location can be customized by setting `DB_PATH` in `.env`.

## Development

### Project Structure

```
backend/
├── src/
│   ├── config/          # Configuration files
│   │   └── database.js  # Database connection and migrations
│   ├── middleware/      # Express middleware
│   │   └── errorHandler.js
│   ├── routes/          # API routes
│   │   ├── balance.js
│   │   ├── games.js
│   │   ├── transactions.js
│   │   └── payment.js
│   ├── sockets/         # Socket.IO handlers
│   │   ├── crash.js
│   │   └── slide.js
│   ├── utils/           # Utility functions
│   │   └── logger.js
│   └── server.js        # Main server file
├── logs/                # Log files (created automatically)
├── .env.example         # Environment variables template
├── package.json
└── README.md
```

## Next Steps

1. **Implement Blockchain Verification:**
   - Set up Qubic node connection
   - Implement transaction verification in `place-bet` and `deposit` endpoints
   - Add transaction monitoring

2. **Complete Game Logic:**
   - Implement Crash game logic
   - Implement Slide game logic
   - Implement Mines game endpoints
   - Implement Video Poker endpoints

3. **Add Authentication:**
   - Implement JWT or session-based auth (optional)
   - Add API key authentication for admin endpoints

4. **Testing:**
   - Add unit tests
   - Add integration tests
   - Test with frontend

5. **Deployment:**
   - Set up production environment
   - Configure reverse proxy (nginx)
   - Set up SSL certificates
   - Configure monitoring

## Environment Variables

See `.env.example` for all available environment variables.

## License

ISC

