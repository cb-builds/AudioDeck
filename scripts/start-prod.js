#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting AudioDeck Production Environment...');
console.log('🛡️  Processes will auto-restart on crashes');
console.log('🛑 Press Ctrl+C to stop all processes\n');

let backendProcess = null;
let frontendProcess = null;
let restartCount = { backend: 0, frontend: 0 };
const MAX_RESTARTS = 5;

function startBackend() {
  console.log('🔧 Starting backend server...');
  backendProcess = spawn('npm', ['start'], {
    cwd: path.join(__dirname, '../backend'),
    stdio: 'inherit',
    shell: true
  });

  backendProcess.on('error', (err) => {
    console.error('❌ Backend process error:', err);
  });

  backendProcess.on('close', (code) => {
    console.log(`🔴 Backend process exited with code ${code}`);
    if (restartCount.backend < MAX_RESTARTS) {
      restartCount.backend++;
      console.log(`🔄 Restarting backend (attempt ${restartCount.backend}/${MAX_RESTARTS})...`);
      setTimeout(startBackend, 2000);
    } else {
      console.error('❌ Backend failed too many times, stopping...');
      process.exit(1);
    }
  });
}

function startFrontend() {
  console.log('⚡ Starting frontend server...');
  frontendProcess = spawn('npm', ['run', 'dev'], {
    cwd: path.join(__dirname, '../frontend'),
    stdio: 'inherit',
    shell: true
  });

  frontendProcess.on('error', (err) => {
    console.error('❌ Frontend process error:', err);
  });

  frontendProcess.on('close', (code) => {
    console.log(`🔴 Frontend process exited with code ${code}`);
    if (restartCount.frontend < MAX_RESTARTS) {
      restartCount.frontend++;
      console.log(`🔄 Restarting frontend (attempt ${restartCount.frontend}/${MAX_RESTARTS})...`);
      setTimeout(startFrontend, 2000);
    } else {
      console.error('❌ Frontend failed too many times, stopping...');
      process.exit(1);
    }
  });
}

// Handle process termination
const cleanup = () => {
  console.log('\n🛑 Shutting down processes...');
  if (backendProcess) backendProcess.kill('SIGTERM');
  if (frontendProcess) frontendProcess.kill('SIGTERM');
  process.exit(0);
};

// Handle Ctrl+C
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Start both processes
startBackend();
setTimeout(startFrontend, 1000); // Start frontend after a short delay

console.log('✅ Process manager started successfully!');
console.log('🌐 Frontend: http://localhost:5173');
console.log('🔧 Backend: http://localhost:3000'); 