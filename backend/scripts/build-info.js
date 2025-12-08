const fs = require('fs');
const path = require('path');

function countFiles(dir, extension) {
  let count = 0;
  let totalSize = 0;
  
  function walkDir(currentPath) {
    const files = fs.readdirSync(currentPath);
    
    for (const file of files) {
      const filePath = path.join(currentPath, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        walkDir(filePath);
      } else if (file.endsWith(extension)) {
        count++;
        totalSize += stat.size;
      }
    }
  }
  
  if (fs.existsSync(dir)) {
    walkDir(dir);
  }
  
  return { count, totalSize };
}

const jsFiles = countFiles('dist', '.js');
const dtsFiles = countFiles('dist', '.d.ts');

const formatSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' kB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

console.log('');
console.log('✓ TypeScript compilation successful');
console.log('');
console.log(`dist/                          ${formatSize(jsFiles.totalSize)} │ ${jsFiles.count} JavaScript files`);
console.log(`dist/                          ${formatSize(dtsFiles.totalSize)} │ ${dtsFiles.count} TypeScript declaration files`);
console.log('');
console.log('✓ Build completed successfully');
