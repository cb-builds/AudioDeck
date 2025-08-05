#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting AudioDeck Development Environment...');
console.log('📡 Backend will auto-restart on file changes');
console.log('⚡ Frontend will auto-reload on file changes');
console.log('🛑 Press Ctrl+C to stop all processes\n');

// Start backend with nodemon
const backend = spawn('npm', ['run', 'dev:backend'], {
  cwd: path.join(__dirname, '../backend'),
  stdio: 'inherit',
  shell: true
});

// Start frontend
const frontend = spawn('npm', ['run', 'dev'], {
  cwd: path.join(__dirname, '../frontend'),
  stdio: 'inherit',
  shell: true
});

// Handle process termination
const cleanup = () => {
  console.log('\n🛑 Shutting down processes...');
  backend.kill('SIGTERM');
  frontend.kill('SIGTERM');
  process.exit(0);
};

// Handle Ctrl+C
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Handle process crashes
backend.on('error', (err) => {
  console.error('❌ Backend process error:', err);
});

frontend.on('error', (err) => {
  console.error('❌ Frontend process error:', err);
});

// Log when processes exit
backend.on('close', (code) => {
  console.log(`🔴 Backend process exited with code ${code}`);
});

frontend.on('close', (code) => {
  console.log(`🔴 Frontend process exited with code ${code}`);
});

console.log('✅ Both processes started successfully!');
console.log('🌐 Frontend: http://localhost:5173');
console.log('🔧 Backend: http://localhost:3000'); 