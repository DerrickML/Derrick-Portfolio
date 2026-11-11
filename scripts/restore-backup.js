const { restoreBackup } = require('../lib/admin-storage');

const [file, destination] = process.argv.slice(2);
if (!file || !destination) {
    console.error('Usage: npm run restore:backup -- backup.json new-restore-directory');
    process.exitCode = 1;
} else {
    restoreBackup(file, destination).then(result => {
        console.log(`Content restored to ${result.dataDir}`);
        console.log(`Images restored to ${result.uploadsDir}`);
        console.log('Credentials are not included. Configure DATA_DIR and UPLOADS_DIR after reviewing the restored files.');
    }).catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
