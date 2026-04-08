const { execSync } = require('child_process');
try {
  console.log("Starting Firebase deployment via npx...");
  execSync('npx.cmd --yes firebase-tools@latest deploy --only hosting --non-interactive', { stdio: 'inherit' });
  console.log("Deployment successful!");
} catch (e) {
  console.error("Deployment failed:", e.message);
  process.exit(1);
}
