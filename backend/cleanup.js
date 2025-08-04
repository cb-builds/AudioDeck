const fs = require('fs');
const path = require('path');

const CLIPS_DIR = path.join(__dirname, "clips");
const ONE_HOUR_MS = 60 * 60 * 1000; // 1 hour in milliseconds
const MAX_STORAGE_MB = 500; // Maximum storage in MB before forced cleanup

function cleanupOldClips() {
  console.log('Starting cleanup of old clips...');
  
  if (!fs.existsSync(CLIPS_DIR)) {
    console.log('Clips directory does not exist, skipping cleanup');
    return;
  }

  try {
    const files = fs.readdirSync(CLIPS_DIR);
    const now = Date.now();
    let deletedCount = 0;
    let totalSize = 0;
    let currentStorageSize = 0;
    const fileStats = [];

    // First pass: collect file information
    files.forEach(file => {
      const filePath = path.join(CLIPS_DIR, file);
      const stats = fs.statSync(filePath);
      const fileAge = now - stats.mtime.getTime();
      
      currentStorageSize += stats.size;
      fileStats.push({
        name: file,
        path: filePath,
        size: stats.size,
        age: fileAge,
        mtime: stats.mtime
      });
    });

    // Sort files by age (oldest first)
    fileStats.sort((a, b) => a.age - b.age);

    // Delete files older than 1 hour
    fileStats.forEach(file => {
      if (file.age > ONE_HOUR_MS) {
        try {
          fs.unlinkSync(file.path);
          deletedCount++;
          totalSize += file.size;
          currentStorageSize -= file.size;
          console.log(`Deleted old clip: ${file.name} (${Math.round(file.size / 1024 / 1024 * 100) / 100}MB)`);
        } catch (err) {
          console.error(`Failed to delete ${file.name}:`, err.message);
        }
      }
    });

    // Emergency cleanup if storage is too high
    const currentStorageMB = Math.round(currentStorageSize / 1024 / 1024 * 100) / 100;
    if (currentStorageMB > MAX_STORAGE_MB) {
      console.log(`Storage usage high (${currentStorageMB}MB), performing emergency cleanup...`);
      
      // Delete oldest files until we're under the limit
      for (const file of fileStats) {
        if (currentStorageMB <= MAX_STORAGE_MB * 0.8) break; // Stop when we're at 80% of limit
        
        try {
          fs.unlinkSync(file.path);
          deletedCount++;
          totalSize += file.size;
          currentStorageSize -= file.size;
          console.log(`Emergency deleted: ${file.name} (${Math.round(file.size / 1024 / 1024 * 100) / 100}MB)`);
        } catch (err) {
          console.error(`Failed to emergency delete ${file.name}:`, err.message);
        }
      }
    }

    if (deletedCount > 0) {
      const totalSizeMB = Math.round(totalSize / 1024 / 1024 * 100) / 100;
      const remainingMB = Math.round(currentStorageSize / 1024 / 1024 * 100) / 100;
      console.log(`Cleanup complete: Deleted ${deletedCount} files, freed ${totalSizeMB}MB, remaining storage: ${remainingMB}MB`);
    } else {
      const remainingMB = Math.round(currentStorageSize / 1024 / 1024 * 100) / 100;
      console.log(`No old clips found to delete. Current storage: ${remainingMB}MB`);
    }
  } catch (err) {
    console.error('Error during cleanup:', err.message);
  }
}

// Run cleanup every 30 minutes
function startCleanupScheduler() {
  console.log('Starting automatic cleanup scheduler (runs every 30 minutes)');
  
  // Run initial cleanup
  cleanupOldClips();
  
  // Schedule cleanup every 30 minutes
  setInterval(cleanupOldClips, 30 * 60 * 1000);
}

module.exports = {
  cleanupOldClips,
  startCleanupScheduler
}; 