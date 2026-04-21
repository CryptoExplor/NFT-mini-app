const fs = require('fs');
const path = require('path');

function fixImportsInDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            fixImportsInDir(fullPath);
        } else if (fullPath.endsWith('.js')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes('../_lib/')) {
                content = content.replace(/\.\.\/_lib\//g, '../');
                fs.writeFileSync(fullPath, content);
                console.log('Fixed imports in', fullPath);
            }
            if (content.includes('../../src/')) {
                content = content.replace(/\.\.\/\.\.\/src\//g, '../../../src/');
                fs.writeFileSync(fullPath, content);
                console.log('Fixed src imports in', fullPath);
            }
        }
    }
}

fixImportsInDir(path.join(__dirname, 'api', '_lib'));
