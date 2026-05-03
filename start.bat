@echo off
echo =========================================
echo Starting WealthTracker
echo =========================================

cd server
if not exist node_modules (
  echo Installing backend dependencies...
  call npm install
)
echo Starting Backend Server on port 3001...
start "WealthTracker Backend" cmd /k "npm start"

cd ..
if not exist node_modules (
  echo Installing frontend dependencies...
  call npm install
)
echo Starting Frontend Server...
start "WealthTracker Frontend" cmd /c "npm run dev -- --open"

echo.
echo Servers are starting up! A browser window should open automatically.
echo (Keep the two black terminal windows open while using the app)
echo =========================================
pause
